// S3-1: headless effect-assertion harness. Boots the game once, then for
// every augment in the pool grants it in isolation (fresh run) and checks
// whether it has the effect its capability metadata (statMods/ruleFlags/
// hooks) implies. Outputs a PASS/FAIL matrix as JSON + a console table.
//
// This does NOT fix anything (that's S3-2) — it only measures and reports.
//
// Assertion classes, chosen per augment from __CC.augIds() (priority order,
// one class per augment even if it qualifies for more than one):
//   1. ruleFlag  — augment has ruleFlags: after granting (fresh run), each
//      flag key must read back exactly the augment's declared value. Exact,
//      deterministic, no combat needed.
//   2. statMod   — augment has statMods, no ruleFlags: after granting +
//      entering a fight, `player.stats.get(stat)` must equal the pipeline
//      formula `(base + flat) * (1 + pct)` for every stat the augment
//      touches (StatBlock.get, core/stats.ts). Exact (within float
//      tolerance) since a fresh run has no other augment to interact with
//      (power() multiplier is 1).
//   3. hooks     — everything else (hooks/onUpdate/onCombatInit, no
//      statMods/ruleFlags): DPS-delta against the live (randomized) enemy
//      squad. `run.totalDamageDealt` after a fixed window, granted vs a
//      multi-run no-augment baseline (median). This is a NOISY signal —
//      round/map/enemy composition are randomized per `goto()` call (by
//      design, no seeding hook exists) and this class also covers plenty
//      of non-damage augments (shields, CC, utility) that a damage-delta
//      can't validate at all. Treat a hooks-class FAIL as "worth a manual
//      look in S3-2", not as proof of a broken augment; a PASS only means
//      "dealt at least as much damage as a typical no-augment run", not
//      "the exact described effect fired".
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'playwright';

const { chromium } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const PORT = 4202;

const ROUND = 8; // non-boss (7/14/20 are bosses), squad(3, s) — enough HP pool, moderate scaling
const WINDOW_MS = 3000;
const BASELINE_RUNS = 5;
const HOOKS_TOLERANCE = 0.85; // PASS if testDamage >= median(baseline) * this

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.join(distDir, urlPath === '/' ? 'index.html' : urlPath);
    let data;
    try {
      data = await readFile(filePath);
    } catch {
      filePath = path.join(distDir, 'index.html');
      data = await readFile(filePath);
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function runOne(page, augId, round, windowMs) {
  await page.evaluate(
    ({ id, r }) => {
      window.__CC.reset();
      if (id) window.__CC.grant(id);
      window.__CC.run.round = r;
      window.__CC.goto(r);
    },
    { id: augId, r: round },
  );
  await page.waitForTimeout(300);
  await page.waitForTimeout(windowMs);
  return page.evaluate(() => window.__CC.run.totalDamageDealt);
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(e.message));

  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 20000 });
  await page.waitForTimeout(1000);

  let augs = await page.evaluate(() => window.__CC.augIds());
  const limit = Number(process.env.MATRIX_LIMIT || 0);
  if (limit > 0) augs = augs.slice(0, limit);
  console.log(`[matrix] ${augs.length} augments loaded`);

  // ---- baseline (no augment) DPS samples, reused by every hooks-class row ----
  const baselineSamples = [];
  for (let i = 0; i < BASELINE_RUNS; i++) {
    baselineSamples.push(await runOne(page, null, ROUND, WINDOW_MS));
  }
  const baselineMedian = median(baselineSamples);
  console.log(`[matrix] baseline (${BASELINE_RUNS} runs): ${JSON.stringify(baselineSamples.map((n) => Math.round(n)))}, median=${Math.round(baselineMedian)}`);

  const rows = [];
  let i = 0;
  for (const a of augs) {
    i++;
    let cls, expected, measured, pass, reason;

    if (Object.keys(a.ruleFlagsObj).length > 0) {
      cls = 'ruleFlag';
      const result = await page.evaluate((id) => {
        window.__CC.reset();
        window.__CC.grant(id);
        return window.__CC.run.flags;
      }, a.id);
      const mismatches = [];
      for (const [k, v] of Object.entries(a.ruleFlagsObj)) {
        if (result[k] !== v) mismatches.push(`${k}: expected ${v}, got ${result[k]}`);
      }
      expected = JSON.stringify(a.ruleFlagsObj);
      measured = mismatches.length === 0 ? expected : mismatches.join('; ');
      pass = mismatches.length === 0;
      reason = pass ? '' : `ruleFlags mismatch: ${mismatches.join('; ')}`;
    } else if (a.statModsList.length > 0) {
      cls = 'statMod';
      await page.evaluate(
        ({ id, r }) => {
          window.__CC.reset();
          window.__CC.grant(id);
          window.__CC.run.round = r;
          window.__CC.goto(r);
        },
        { id: a.id, r: ROUND },
      );
      await page.waitForTimeout(400);
      const measuredByStat = await page.evaluate(() => {
        const p = window.__CC.arena().player;
        const stats = ['maxHP', 'moveSpeed', 'damage', 'abilityPower', 'armor', 'magicResist', 'critChance', 'abilityHaste', 'attackSpeed', 'attackRange', 'abilityDamage', 'cooldown', 'lifesteal', 'projSpeed'];
        const out = {};
        for (const s of stats) out[s] = { get: p.stats.get(s), base: p.stats.getBase(s) };
        return out;
      });
      const byStat = {};
      for (const m of a.statModsList) {
        byStat[m.stat] = byStat[m.stat] ?? { flat: 0, pct: 0 };
        byStat[m.stat].flat += m.flat ?? 0;
        byStat[m.stat].pct += m.pct ?? 0;
      }
      const mismatches = [];
      const expectedParts = [];
      const measuredParts = [];
      for (const [stat, { flat, pct }] of Object.entries(byStat)) {
        const info = measuredByStat[stat];
        const exp = (info.base + flat) * (1 + pct);
        const got = info.get;
        expectedParts.push(`${stat}=${exp.toFixed(2)}`);
        measuredParts.push(`${stat}=${got.toFixed(2)}`);
        if (Math.abs(exp - got) > Math.max(0.05, Math.abs(exp) * 0.01)) {
          mismatches.push(`${stat}: expected ${exp.toFixed(2)}, got ${got.toFixed(2)}`);
        }
      }
      expected = expectedParts.join(', ');
      measured = measuredParts.join(', ');
      pass = mismatches.length === 0;
      reason = pass ? '' : `statMod mismatch: ${mismatches.join('; ')}`;
    } else {
      cls = 'hooks';
      const testDamage = await runOne(page, a.id, ROUND, WINDOW_MS);
      expected = `>= ${Math.round(baselineMedian * HOOKS_TOLERANCE)} (${Math.round(HOOKS_TOLERANCE * 100)}% of baseline median ${Math.round(baselineMedian)})`;
      measured = `${Math.round(testDamage)} total damage dealt in ${WINDOW_MS}ms`;
      pass = testDamage >= baselineMedian * HOOKS_TOLERANCE;
      reason = pass ? '' : `no measurable damage increase over baseline (delta=${Math.round(testDamage - baselineMedian)}) — inconclusive for non-damage hooks, needs manual check`;
    }

    rows.push({ id: a.id, tier: a.tier, name: a.name, class: cls, expected, measured, pass, reason });
    if (i % 20 === 0) console.log(`[matrix] ${i}/${augs.length}...`);
  }

  await browser.close();
  server.close();

  const passCount = rows.filter((r) => r.pass).length;
  const failCount = rows.length - passCount;

  console.log('\nid | tier | class | PASS/FAIL | reason');
  console.log('---|------|-------|-----------|-------');
  for (const r of rows) {
    console.log(`${r.id} | ${r.tier} | ${r.class} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.reason}`);
  }
  console.log(`\n[matrix] ${passCount}/${rows.length} PASS, ${failCount} FAIL`);
  console.log(`[matrix] console/page errors during run: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    for (const e of consoleErrors.slice(0, 20)) console.log(`  [error] ${e}`);
  }

  const outPath = path.join(__dirname, '..', 'effect-matrix.json');
  await writeFile(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        round: ROUND,
        windowMs: WINDOW_MS,
        baselineRuns: BASELINE_RUNS,
        baselineSamples,
        baselineMedian,
        hooksTolerance: HOOKS_TOLERANCE,
        pass: passCount,
        fail: failCount,
        total: rows.length,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`[matrix] wrote ${outPath}`);
}

main().catch((err) => {
  console.error('[matrix] crashed:', err);
  process.exit(1);
});
