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
//   3. role-routed — everything else (hooks/onUpdate/onCombatInit, no
//      statMods/ruleFlags). The augment's own wording picks the rig:
//        economy → run.gold rises · shield → player.shield goes above 0 ·
//        sustain → player regains HP · cc → an enemy is slowed or hard-CCd ·
//        damage → DPS delta vs a no-augment baseline · else unclassified.
//      Judging all of these on damage (the first version of this harness)
//      marked 43 working augments red: a shield, a slow, a heal or a gold
//      grant cannot raise DPS against a dummy by design.
//
// Verdicts are PASS / FAIL / INCONCLUSIVE, and the third is load-bearing:
//   * A conditional augment ("on kill", "below 30% HP", "when your shield
//     breaks") that never fired is INCONCLUSIVE — the harness never created
//     its trigger, which is not evidence of a defect.
//   * The damage rig is NOISY: map, squad and spawns are randomized per
//     goto() and no seeding hook exists. Re-running the same augment flipped
//     verdicts, so a first miss is retried, the best sample counts, and
//     anything inside the baseline's own observed spread is reported as noise.
// FAIL therefore means "measured, and it did not do what it says".
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'playwright';

const { chromium } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const PORT = 4211;

const ROUND = 8; // non-boss (7/14/20 are bosses), squad(3, s) — enough HP pool, moderate scaling
const WINDOW_MS = 3000;
const BASELINE_RUNS = 5;
const HOOKS_TOLERANCE = 0.85; // PASS if testDamage >= median(baseline) * this
// A stuck augment (e.g. a hook that spins the page's JS thread) must not sink
// the whole run: every row gets a hard wall-clock budget. On timeout the row
// is recorded FAIL with a harness-error reason and the page is torn down and
// recreated, so one bad augment can't wedge every row after it.
const ROW_TIMEOUT_MS = 20000;

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

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function freshPage(browser, consoleErrors) {
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 20000 });
  await page.waitForTimeout(1000);
  return page;
}

// No player input is simulated by the real game loop in a headless page (no
// joystick/keyboard events fire), and Player.tryAutoAttack only fires while
// `!isMoving` — so instead of faking WASD, we drive the player directly
// through its own API each tick: teleport next to the nearest enemy (never
// via `move()`, so `isMoving` stays false and auto-attacks proceed on their
// own), and opportunistically cast Q/E/Dash off cooldown. This exercises
// auto-attack-driven on-hit procs and ability-driven procs alike.
const TICK_MS = 400;

async function driveTick(page) {
  await page.evaluate(() => {
    const arena = window.__CC.arena();
    const p = arena?.player;
    if (!p || !p.alive) return;
    const t = p.combat.nearestEnemy(p, Infinity);
    if (t) {
      const range = Math.max(40, p.stats.get('attackRange') * 0.7);
      const dx = p.x - t.x, dy = p.y - t.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > range) {
        p.x = t.x + (dx / d) * range;
        p.y = t.y + (dy / d) * range;
      }
    }
    if (p.isReady('Q')) p.castQ();
    if (p.isReady('E')) p.castE();
    if (p.isReady('Dash')) p.dash();
  });
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
  await driveTick(page); // initial teleport into range before the first tick's wait
  let elapsed = 0;
  while (elapsed < windowMs) {
    await page.waitForTimeout(TICK_MS);
    elapsed += TICK_MS;
    await driveTick(page);
  }
  return page.evaluate(() => window.__CC.run.totalDamageDealt);
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const consoleErrors = [];
  let page = await freshPage(browser, consoleErrors);

  let augs = await page.evaluate(() => window.__CC.augIds());
  const limit = Number(process.env.MATRIX_LIMIT || 0);
  if (limit > 0) augs = augs.slice(0, limit);
  console.log(`[matrix] ${augs.length} augments loaded`);

  // ---- baseline (no augment) DPS samples, reused by every hooks-class row ----
  const baselineSamples = [];
  for (let i = 0; i < BASELINE_RUNS; i++) {
    baselineSamples.push(await runOne(page, null, ROUND, WINDOW_MS));
  }
  // A zero-damage baseline run means the harness never got into the fight (the
  // player died or never closed distance), not that a no-augment run deals no
  // damage. Keeping those would drag the noise floor to 0 and make the damage
  // assertion unable to fail anything.
  const validBaseline = baselineSamples.filter((n) => n > 0);
  const discarded = baselineSamples.length - validBaseline.length;
  if (validBaseline.length === 0) {
    throw new Error('every baseline run dealt 0 damage — the harness never engaged; aborting');
  }
  const baselineMedian = median(validBaseline);
  // The baseline's own spread is the noise floor: a result inside it says nothing.
  const baselineMin = Math.min(...validBaseline);
  const baselineMax = Math.max(...validBaseline);
  console.log(`[matrix] baseline (${BASELINE_RUNS} runs): ${JSON.stringify(baselineSamples.map((n) => Math.round(n)))}, median=${Math.round(baselineMedian)}, range=${Math.round(baselineMin)}-${Math.round(baselineMax)}${discarded ? `, discarded ${discarded} zero-damage run(s)` : ''}`);

  const rows = [];
  let i = 0;
  for (const a of augs) {
    i++;
    let row;
    try {
      row = await withTimeout(
        measureAugment(page, a, baselineMedian, baselineMin, baselineMax),
        ROW_TIMEOUT_MS,
        a.id,
      );
    } catch (err) {
      row = {
        class: 'harness-error',
        expected: '(assertion ran without hanging/throwing)',
        measured: '(did not complete)',
        pass: false,
        reason: `harness error: ${err.message}`,
      };
      // The page may be wedged (a hook spinning the JS thread hangs every
      // subsequent evaluate too) — replace it so later augments aren't
      // dragged down by this one's failure.
      try { await page.close(); } catch { /* already gone */ }
      page = await freshPage(browser, consoleErrors);
    }
    rows.push({ id: a.id, tier: a.tier, name: a.name, ...row });
    if (i % 20 === 0) console.log(`[matrix] ${i}/${augs.length}...`);
  }

  // Confirmation pass. A FAIL can be an artifact of state the previous row left
  // behind: newRun() resets the RunState, but module-level state inside augment
  // files survives it. gigantwuchs was reported as +35 damage over its declared
  // stat mod and measured exactly right when re-checked alone. So every failure
  // is re-measured once on a brand-new page before it is reported.
  const failing = rows.filter((r) => r.pass === false);
  if (failing.length > 0) {
    console.log(`\n[matrix] confirming ${failing.length} failure(s) on a fresh page...`);
    await page.close();
    page = await freshPage(browser, consoleErrors);
    for (const r of failing) {
      const a = augs.find((x) => x.id === r.id);
      if (!a) continue;
      try {
        const again = await withTimeout(
          measureAugment(page, a, baselineMedian, baselineMin, baselineMax),
          ROW_TIMEOUT_MS,
          a.id,
        );
        const wasFail = again.pass === false;
        Object.assign(r, again, {
          reason: wasFail ? `${again.reason} [confirmed on a fresh page]` : `${again.reason} [first run disagreed — state leaked from the previous row]`,
        });
      } catch {
        r.reason = `${r.reason} [confirmation run timed out]`;
      }
    }
  }

  await browser.close();
  server.close();

  // Three states: PASS, FAIL (proven not to do what it says) and INCONCLUSIVE
  // (no rig fits it yet). Collapsing the third into FAIL is what made working
  // defensive augments look broken.
  const verdict = (r) => (r.pass === null ? 'INCONCLUSIVE' : r.pass ? 'PASS' : 'FAIL');
  const passCount = rows.filter((r) => r.pass === true).length;
  const failCount = rows.filter((r) => r.pass === false).length;
  const inconclusiveCount = rows.filter((r) => r.pass === null).length;

  console.log('\nid | tier | class | verdict | reason');
  console.log('---|------|-------|---------|-------');
  for (const r of rows) {
    console.log(`${r.id} | ${r.tier} | ${r.class} | ${verdict(r)} | ${r.reason}`);
  }
  const byTier = {};
  for (const r of rows) {
    byTier[r.tier] = byTier[r.tier] ?? { PASS: 0, FAIL: 0, INCONCLUSIVE: 0 };
    byTier[r.tier][verdict(r)]++;
  }
  console.log(`\n[matrix] ${passCount} PASS, ${failCount} FAIL, ${inconclusiveCount} INCONCLUSIVE of ${rows.length}`);
  console.log(`[matrix] by tier: ${JSON.stringify(byTier)}`);
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
        inconclusive: inconclusiveCount,
        byTier,
        total: rows.length,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`[matrix] wrote ${outPath}`);
}

/** One augment's assertion, class chosen from its capability metadata. Never
 * catches — timeouts/exceptions are handled by the caller (row + page reset). */
async function measureAugment(page, a, baselineMedian, baselineMin, baselineMax) {
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
    // Role-routed, because "deals less damage than baseline" is not evidence
    // that a shield, a slow, a heal or a gold grant is broken — those cannot
    // raise DPS against a dummy by design. Judging them on damage marked 43
    // working augments red, which would have got them cut.
    const role = roleOf(a);
    cls = role;
    // "Never fired" only proves a defect for augments that should fire on their
    // own. A conditional one (on kill, below X HP, when your shield breaks) may
    // simply never have had its trigger met here — that is INCONCLUSIVE.
    const conditional = isConditional(a);
    const negative = (why) =>
      conditional
        ? [null, `${why} — trigger condition (${conditionHint(a)}) may not have occurred in the harness`]
        : [false, why];
    if (role === 'economy') {
      const gold = await measureGold(page, a.id);
      expected = 'run.gold rises';
      measured = `gold ${gold.before} -> ${gold.after}`;
      if (gold.after > gold.before) { pass = true; reason = ''; }
      else [pass, reason] = negative('granted no gold');
    } else if (role === 'shield') {
      const shield = await measureShield(page, a.id);
      expected = 'player.shield > 0 during the fight';
      measured = `peak shield ${Math.round(shield)}`;
      if (shield > 0) { pass = true; reason = ''; }
      else [pass, reason] = negative('never put any shield on the player');
    } else if (role === 'sustain') {
      const healed = await measureHealing(page, a.id);
      expected = 'player regains HP during the fight';
      measured = `${Math.round(healed)} HP regained`;
      if (healed > 0) { pass = true; reason = ''; }
      else [pass, reason] = negative('never restored any HP');
    } else if (role === 'cc') {
      const cc = await measureCrowdControl(page, a.id);
      expected = 'an enemy gets slowed or hard-CCd';
      measured = cc.hit ? `affected ${cc.hit} enem(y/ies)` : 'no enemy affected';
      if (cc.hit > 0) { pass = true; reason = ''; }
      else [pass, reason] = negative('no enemy was slowed or controlled');
    } else if (role === 'damage') {
      // One sample decides nothing here: map, squad and spawn positions are
      // randomized per goto(), and re-running the same augment flipped verdicts
      // between PASS and FAIL. So a first miss is retried, the best sample
      // counts, and anything inside the baseline's own observed spread is
      // reported as noise rather than as a defect.
      const samples = [await runOne(page, a.id, ROUND, WINDOW_MS)];
      const bar = baselineMedian * HOOKS_TOLERANCE;
      if (samples[0] < bar) samples.push(await runOne(page, a.id, ROUND, WINDOW_MS));
      const best = Math.max(...samples);
      if (best === 0) {
        expected = `>= ${Math.round(bar)}`;
        measured = `0 damage in ${samples.length} run(s)`;
        return {
          class: cls,
          expected,
          measured,
          pass: null,
          reason: 'harness never engaged (0 damage in every run) — same miss that is discarded from the baseline',
        };
      }
      expected = `>= ${Math.round(bar)} (${Math.round(HOOKS_TOLERANCE * 100)}% of baseline median ${Math.round(baselineMedian)})`;
      measured = `best ${Math.round(best)} of ${samples.length} run(s) [${samples.map((n) => Math.round(n)).join(', ')}] in ${WINDOW_MS}ms`;
      if (best >= bar) {
        pass = true;
        reason = '';
      } else if (best >= baselineMin * 0.9) {
        pass = null;
        reason = `within the no-augment spread (baseline runs ranged ${Math.round(baselineMin)}–${Math.round(baselineMax)}) — indistinguishable from noise`;
      } else {
        pass = false;
        reason = `clearly below every no-augment run (best ${Math.round(best)} < 90% of baseline min ${Math.round(baselineMin)})`;
      }
    } else {
      // No rig fits this augment yet. INCONCLUSIVE is not FAIL: it means the
      // harness cannot judge it, not that the augment is broken.
      const testDamage = await runOne(page, a.id, ROUND, WINDOW_MS);
      expected = 'no automated assertion for this role yet';
      measured = `${Math.round(testDamage)} damage in ${WINDOW_MS}ms (ran without crashing)`;
      pass = null;
      reason = 'inconclusive — needs a manual check or a new assertion class';
    }
  }

  return { class: cls, expected, measured, pass, reason };
}

/** Wording that means "only under some condition", so a no-show proves nothing. */
const CONDITION_WORDS = [
  'when ', 'whenever', 'after ', 'below ', 'above ', 'if ', 'on kill', 'takedown',
  'kill', 'first ', 'every ', 'each ', 'while ', 'breaks', 'drops', 'per ', 'once',
  // Riders on an effect the harness cannot produce on its own: a champion with
  // no slow in its kit never triggers "slowing an enemy grants ...", and a
  // player at full HP never triggers "healing you receive ...".
  'slowing', 'slowed', 'healing you', 'dealing damage', 'gather', 'stacks',
  'your e', 'your q', 'your dash', 'e unleashes', 'attacks:', 'refresh',
];

function isConditional(a) {
  const text = `${a.description}`.toLowerCase();
  return CONDITION_WORDS.some((w) => text.includes(w));
}

function conditionHint(a) {
  const text = `${a.description}`.toLowerCase();
  return CONDITION_WORDS.find((w) => text.includes(w))?.trim() ?? 'conditional';
}

/**
 * Which assertion fits this augment, read off its description and hooks.
 * Order matters: an augment that shields AND deals damage is judged on the
 * shield, because that is the part a damage rig would miss.
 */
function roleOf(a) {
  const text = `${a.name} ${a.description}`.toLowerCase();
  const has = (...words) => words.some((w) => text.includes(w));
  if (has('gold') && !/random .*augment|gold augment/.test(text)) return 'economy';
  if (has('shield', 'absorb', 'barrier')) return 'shield';
  if (has('heal', 'restore', 'regenerat', 'life steal', 'lifesteal', 'omnivamp')) return 'sustain';
  if (has('slow', 'root', 'stun', 'knock', 'freeze', 'immobil')) return 'cc';
  if (has('damage', 'hit', 'attack', 'crit', 'burn', 'explode', 'strike', 'pierce')) return 'damage';
  return 'unclassified';
}

async function measureGold(page, id) {
  return page.evaluate(
    ({ augId, r }) => {
      window.__CC.reset();
      const before = window.__CC.run.gold;
      window.__CC.grant(augId);
      window.__CC.run.round = r;
      window.__CC.goto(r);
      return { before, after: window.__CC.run.gold };
    },
    { augId: id, r: ROUND },
  );
}

/** Peak shield seen on the player over the fight window. */
async function measureShield(page, id) {
  await startRound(page, id);
  return page.evaluate(async (ms) => {
    const p = window.__CC.arena().player;
    let peak = p.shield ?? 0;
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      peak = Math.max(peak, window.__CC.arena().player.shield ?? 0);
      await new Promise((r) => setTimeout(r, 50));
    }
    return peak;
  }, WINDOW_MS);
}

/** Total HP regained by the player (sum of upward HP steps). */
async function measureHealing(page, id) {
  await startRound(page, id);
  // A player at full HP cannot visibly regain any, so every heal would read as
  // "never restored any HP". Open a wound first.
  await page.evaluate(() => {
    const p = window.__CC.arena().player;
    p.hp = Math.max(1, Math.floor(p.maxHP * 0.5));
  });
  return page.evaluate(async (ms) => {
    let last = window.__CC.arena().player.hp;
    let healed = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const hp = window.__CC.arena().player.hp;
      if (hp > last) healed += hp - last;
      last = hp;
      await new Promise((r) => setTimeout(r, 50));
    }
    return healed;
  }, WINDOW_MS);
}

/** Enemies seen slowed below their base speed or hard-CCd during the window. */
async function measureCrowdControl(page, id) {
  await startRound(page, id);
  return page.evaluate(async (ms) => {
    const affected = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const sc = window.__CC.arena();
      for (const u of sc.units) {
        if (u.team !== 'enemy' || !u.alive) continue;
        const slowed = u.stats.get('moveSpeed') < u.stats.getBase('moveSpeed') - 0.01;
        if (slowed || u.ctrlUntil > sc.now) affected.add(u);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return { hit: affected.size };
  }, WINDOW_MS);
}

async function startRound(page, id) {
  await page.evaluate(
    ({ augId, r }) => {
      window.__CC.reset();
      window.__CC.grant(augId);
      window.__CC.run.round = r;
      window.__CC.goto(r);
    },
    { augId: id, r: ROUND },
  );
  await page.waitForTimeout(300);
}

main().catch((err) => {
  console.error('[matrix] crashed:', err);
  process.exit(1);
});
