// Sim harness (M2): the scripted player (src/core/autopilot.ts) plays complete
// runs with random augment picks, and the KPIs in BENCHMARK.md are computed from
// the result.
//
// Speed comes from __CC.stepMs, which drives Phaser's own step function on a
// synthetic clock instead of waiting for real frames (~40x). That is the only
// way a few hundred runs fit in a coffee break — and it is also the part most
// likely to lie, so `--validate` plays the same rounds in real time and compares
// the two before any number here is worth quoting.
//
//   node scripts/sim.mjs                  # default run count
//   node scripts/sim.mjs --runs 200       # the M2 acceptance target
//   node scripts/sim.mjs --validate       # stepped vs real-time cross-check
//   node scripts/sim.mjs --champion sivir # pin one champion
//
// Output: sim-results.json in the repo root.
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'playwright';

const { chromium } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const OUT = path.join(__dirname, '..', 'sim-results.json');
const PORT = 4197;

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const RUNS = Number(flag('runs', 40));
const MAX_ROUND = Number(flag('maxRound', 20));
const ONLY_CHAMPION = flag('champion', null);
const VALIDATE = argv.includes('--validate');

/** Game-time budget per round before it is called a hang. */
const ROUND_BUDGET_MS = 90000;
const STEP_CHUNK_MS = 500;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let filePath = path.join(distDir, urlPath === '/' ? 'index.html' : urlPath);
      if (!filePath.startsWith(distDir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      let data;
      try {
        data = await readFile(filePath);
      } catch {
        filePath = path.join(distDir, 'index.html');
        data = await readFile(filePath);
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
      res.end(data);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

async function newPage(browser, errors) {
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  // Canvas renders far faster than software WebGL in headless.
  await page.goto(`http://localhost:${PORT}/index.html?renderer=canvas`);
  await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__CC.autopilot(true));
  return page;
}

const CHAMPS = [
  'sivir', 'lux', 'fizz', 'zac', 'blitzcrank', 'karthus', 'warwick', 'masteryi',
];

/** Read everything one probe needs, in one round-trip. */
const probe = (page) =>
  page.evaluate(() => {
    const scenes = window.__CC.scenes();
    const r = window.__CC.run;
    const out = {
      scenes,
      round: r.round,
      gold: r.gold,
      augs: (r.augments ?? []).map((a) => a.id),
      items: (r.items ?? []).map((i) => i.id),
    };
    if (scenes.includes('arena')) {
      const a = window.__CC.arena();
      const p = a.player;
      if (p) {
        out.now = a.now;
        out.hp = p.hp;
        out.alive = p.alive && p.hp > 0;
        out.foes = (a.units ?? []).filter((u) => u.team !== p.team && u.alive).length;
      }
    }
    return out;
  });

/**
 * Play one complete run. `advance` is injected so the identical script can be
 * driven by the fast stepper or by real time — that is what makes --validate a
 * comparison of the clock and nothing else.
 */
async function playRun(page, champion, advance) {
  await page.evaluate((c) => {
    window.__CC.reset();
    window.__CC.run.champion = c;
    window.__CC.goto(1);
  }, champion);
  await advance(600);

  const rounds = [];
  let picks = [];
  let guard = 0;

  while (guard++ < MAX_ROUND * 8) {
    const s = await probe(page);

    if (s.scenes.includes('end')) break;

    if (s.scenes.includes('pick')) {
      // Random pick through the scene's own pickSlot, so slot limits, sfx and
      // the shop-day routing all behave exactly as they do for a player. Pool
      // coverage is what is being measured, so no strategy is applied.
      const picked = await page.evaluate(() => {
        const sc = window.__CC.arena().scene.manager.getScene('pick');
        if (!sc || !sc.offers || sc.offers.length === 0) return null;
        const i = Math.floor(Math.random() * sc.offers.length);
        const id = sc.offers[i]?.def?.id ?? null;
        sc.pickSlot(i);
        return id;
      });
      if (picked) picks.push(picked);
      // pickSlot routes on after a 180ms delayedCall — let that timer land.
      await advance(600);
      // With 6/6 augments pickSlot returns without routing on, and the screen
      // waits for the player's Continue. Without this the loop would sit on the
      // pick scene re-picking forever — the first version of this harness
      // recorded 143 "picks" in a single run that way.
      const after = await probe(page);
      if (after.scenes.includes('pick')) {
        await page.evaluate(() => {
          const sc = window.__CC.arena().scene.manager.getScene('pick');
          const shopDay = (window.__CC.run.round - 1) % 2 === 0;
          if (sc) sc.scene.start(shopDay ? 'shop' : 'arena');
        });
        await advance(400);
      }
      continue;
    }

    if (s.scenes.includes('shop')) {
      // Buy nothing: item choice is its own axis and would confound pick data.
      await page.evaluate(() => {
        const sc = window.__CC.arena().scene.manager.getScene('shop');
        if (sc) sc.scene.start('arena');
      });
      await advance(400);
      continue;
    }

    if (!s.scenes.includes('arena') || s.now === undefined) {
      await advance(300);
      continue;
    }

    // Wait for the squad to exist before timing anything. Straight after the
    // scene starts the unit list holds only the player, and treating that as
    // "no foes left" scored rounds as 4-second wins that never happened.
    let ready = s;
    for (let w = 0; w < 12 && (ready.foes ?? 0) === 0; w++) {
      await advance(250);
      ready = await probe(page);
      if (!ready.scenes.includes('arena')) break;
    }
    if (!ready.scenes.includes('arena') || ready.now === undefined) continue;
    if ((ready.foes ?? 0) === 0) {
      // Genuinely nothing to fight — don't record a phantom round.
      await advance(400);
      continue;
    }

    // Fight the round out, in chunks, until it resolves or blows its budget.
    const startNow = ready.now;
    const startRound = ready.round;
    let last = ready;
    let hang = false;
    for (;;) {
      await advance(STEP_CHUNK_MS);
      last = await probe(page);
      if (!last.scenes.includes('arena')) break;
      if (last.now === undefined) break;
      if (!last.alive) break;
      if (last.foes === 0) break;
      if (last.now - startNow > ROUND_BUDGET_MS) {
        hang = true;
        break;
      }
    }
    rounds.push({
      round: startRound,
      gameMs: Math.round((last.now ?? startNow) - startNow),
      hpLeft: Math.round(last.hp ?? 0),
      survived: last.alive !== false,
      hang,
      untouched: false,
    });
    if (hang || last.alive === false) break;
    if (startRound >= MAX_ROUND) break;
    await advance(400);
  }

  const final = await probe(page);
  return {
    champion,
    reachedRound: rounds.length ? rounds[rounds.length - 1].round : 0,
    won: final.scenes.includes('end') && rounds.length > 0 && rounds[rounds.length - 1].survived,
    rounds,
    picks,
    augs: final.augs,
  };
}

const steppedAdvance = (page) => (ms) => page.evaluate((m) => window.__CC.stepMs(m), ms);
const realtimeAdvance = (page) => (ms) => page.waitForTimeout(ms);

// ---- KPIs -----------------------------------------------------------------

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function jaccardOverlap(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function computeKpis(results, poolSize) {
  const allRounds = results.flatMap((r) => r.rounds);
  const pickCounts = new Map();
  for (const r of results) for (const p of r.picks) pickCounts.set(p, (pickCounts.get(p) ?? 0) + 1);

  const counts = [...pickCounts.values()].sort((a, b) => b - a);
  const med = median(counts) || 1;
  const byChampion = {};
  for (const r of results) {
    const c = (byChampion[r.champion] ??= { runs: 0, wins: 0, roundsReached: [] });
    c.runs++;
    if (r.won) c.wins++;
    c.roundsReached.push(r.reachedRound);
  }
  for (const c of Object.values(byChampion)) {
    c.winPct = Math.round((c.wins / c.runs) * 100);
    c.medianRound = median(c.roundsReached);
  }

  // Build spread: fraction of run pairs sharing less than 30% of their augments.
  let pairs = 0;
  let distinct = 0;
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      pairs++;
      if (jaccardOverlap(results[i].augs, results[j].augs) < 0.3) distinct++;
    }
  }

  const winPcts = Object.values(byChampion).map((c) => c.winPct);
  return {
    runs: results.length,
    poolSize,
    pickDiversityPct: Math.round((pickCounts.size / poolSize) * 100),
    autoPickRate: Number((counts.length ? counts[0] / med : 0).toFixed(2)),
    buildSpreadPct: pairs ? Math.round((distinct / pairs) * 100) : null,
    winrateSpreadPp: winPcts.length ? Math.max(...winPcts) - Math.min(...winPcts) : null,
    roundSecondsMedian: allRounds.length ? Math.round(median(allRounds.map((r) => r.gameMs)) / 1000) : null,
    unusedAugments: poolSize - pickCounts.size,
    hangRounds: allRounds.filter((r) => r.hang).length,
    totalRounds: allRounds.length,
    byChampion,
    topPicks: [...pickCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
  };
}

// ---- validation -----------------------------------------------------------

async function validate(browser, errors) {
  const N = Number(flag('validateRuns', 5));
  console.log(`[sim] validating stepped vs real time on ${N} runs per mode (real time is slow)…`);
  const out = { stepped: [], realtime: [] };
  for (const mode of ['stepped', 'realtime']) {
    const page = await newPage(browser, errors);
    const advance = mode === 'stepped' ? steppedAdvance(page) : realtimeAdvance(page);
    for (let i = 0; i < N; i++) {
      const r = await playRun(page, 'sivir', advance);
      out[mode].push(r);
    }
    await page.close();
  }
  const summarise = (rs) => {
    const rounds = rs.flatMap((r) => r.rounds);
    return {
      runs: rs.length,
      medianRoundMs: median(rounds.map((r) => r.gameMs)),
      medianReachedRound: median(rs.map((r) => r.reachedRound)),
      survivalPct: rounds.length ? Math.round((rounds.filter((r) => r.survived).length / rounds.length) * 100) : null,
      hangs: rounds.filter((r) => r.hang).length,
    };
  };
  const a = summarise(out.stepped);
  const b = summarise(out.realtime);
  console.log('[sim] stepped :', JSON.stringify(a));
  console.log('[sim] realtime:', JSON.stringify(b));
  const drift =
    a.medianRoundMs && b.medianRoundMs
      ? Math.abs(a.medianRoundMs - b.medianRoundMs) / Math.max(a.medianRoundMs, b.medianRoundMs)
      : null;
  console.log(
    `[sim] median round-length drift: ${drift === null ? 'n/a' : (drift * 100).toFixed(0) + '%'} ` +
      `(sample is tiny — treat >25% as "do not trust the stepper")`,
  );
  return { stepped: a, realtime: b, driftPct: drift === null ? null : Math.round(drift * 100) };
}

// ---- main -----------------------------------------------------------------

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const errors = [];
  const started = Date.now();
  try {
    if (VALIDATE) {
      const v = await validate(browser, errors);
      await writeFile(OUT, JSON.stringify({ validation: v, errors }, null, 2));
      console.log(`[sim] wrote ${OUT}`);
      return;
    }

    const page = await newPage(browser, errors);
    const poolSize = await page.evaluate(() => window.__CC.augIds().length);
    const champions = ONLY_CHAMPION ? [ONLY_CHAMPION] : CHAMPS;
    const results = [];
    for (let i = 0; i < RUNS; i++) {
      const champion = champions[i % champions.length];
      results.push(await playRun(page, champion, steppedAdvance(page)));
      if ((i + 1) % 10 === 0 || i === RUNS - 1) {
        console.log(`[sim] ${i + 1}/${RUNS} runs (${Math.round((Date.now() - started) / 1000)}s)`);
      }
    }
    await page.close();

    const kpis = computeKpis(results, poolSize);
    console.log('\n=== KPIs ===');
    console.log(JSON.stringify(kpis, null, 2));
    await writeFile(
      OUT,
      JSON.stringify({ generatedAt: new Date().toISOString(), runs: RUNS, kpis, results, errors }, null, 2),
    );
    console.log(`\n[sim] wrote ${OUT}`);
    if (errors.length) console.log(`[sim] ${errors.length} console/page errors — see the JSON`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('[sim] crashed:', err);
  process.exit(1);
});
