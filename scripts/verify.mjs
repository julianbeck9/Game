// Headless boot check: serves the built dist/, boots the game in Chromium for
// both renderers (webgl + canvas), and fails if the console logs errors or the
// arena scene leaks display objects across a played round.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'playwright';

const { chromium } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const PORT = 4196;
const LEAK_TOLERANCE = 40;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
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
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      res.end(data);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  return new Promise((resolve) => {
    server.listen(PORT, () => resolve(server));
  });
}

async function checkRenderer(browser, renderer) {
  const errors = [];
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });

  await page.goto(`http://localhost:${PORT}/index.html?renderer=${renderer}`);
  await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 20000 });
  // Let the menu scene's own preload (champion + map thumbnails) finish before
  // jumping straight into the arena, otherwise its in-flight image loads race
  // with the arena's own asset requests and Phaser logs bogus duplicate-key
  // texture errors that have nothing to do with the code under test.
  await page.waitForTimeout(1000);

  await page.evaluate(() => window.__CC.goto(1));
  await page.waitForTimeout(300);
  const start = await page.evaluate(() => window.__CC.arena().children.list.length);

  await page.waitForTimeout(2000);
  // let in-flight VFX (particles, tweened text, hit-flashes) finish clearing
  await page.waitForTimeout(1500);
  const end = await page.evaluate(() => window.__CC.arena().children.list.length);

  await page.close();

  const leaked = end > start + LEAK_TOLERANCE;
  return { renderer, errors, start, end, leaked, pass: errors.length === 0 && !leaked };
}

/**
 * B9 guard: no enemy may stall out of reach.
 *
 * Every enemy type's `preferredRange + rangeBand` tops out at 450 (see
 * entities/enemies.ts), so a foe further away than STANDOFF_DIST is, by its own
 * AI, obliged to close in. If it hasn't moved after the observation window it is
 * wedged against geometry — and since a round only ends when every enemy is
 * dead, that hangs the run forever. This used to happen in roughly half of all
 * rounds while the player simply stood still.
 *
 * The player is deliberately left idle, which provokes nothing and keeps the
 * only moving parts on the enemy side. Maps, squads and spawns are random per
 * goto(), hence several rounds per pass and a verdict on the aggregate.
 *
 * The player's HP is topped up throughout, because Enemy.update bails out on
 * `if (!t.alive) return` — a dead player freezes every enemy on the field, and
 * all of them then look wedged. That produced a false FAIL before it was
 * understood. Standing still against a live squad is otherwise fatal in most
 * rounds, so without the top-up most rounds would simply be unjudgeable.
 * Rounds that still end with a dead player are discarded rather than judged.
 */
const STANDOFF_DIST = 470;
const STANDOFF_MOVE = 25;
const STANDOFF_MS = 9000;
const STANDOFF_ROUNDS = [2, 3, 4, 5, 6, 7];

async function checkStandoff(browser) {
  const page = await browser.newPage();
  const stalled = [];
  let judged = 0;
  let skipped = 0;
  await page.goto(`http://localhost:${PORT}/index.html?renderer=canvas`);
  await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 20000 });
  await page.waitForTimeout(1000);

  const snap = () =>
    page.evaluate(() => {
      const a = window.__CC.arena();
      const p = a.player;
      return {
        alive: p.alive && p.hp > 0,
        foes: (a.units ?? [])
          .filter((u) => u.team !== p.team && u.alive)
          .map((u) => ({ x: u.x, y: u.y, d: Math.hypot(u.x - p.x, u.y - p.y) })),
      };
    });

  for (const round of STANDOFF_ROUNDS) {
    await page.evaluate((r) => {
      window.__CC.reset();
      window.__CC.goto(r);
    }, round);
    await page.waitForTimeout(1500);
    const before = await snap();
    // Observe in slices, topping the player up so it stays a valid enemy target.
    const topUp = () =>
      page.evaluate(() => {
        const p = window.__CC.arena().player;
        if (p && p.alive) p.hp = Math.max(p.hp, 100000);
      });
    for (let waited = 0; waited < STANDOFF_MS; waited += 1000) {
      await topUp();
      await page.waitForTimeout(1000);
    }
    const after = await snap();

    if (!before.alive || !after.alive) {
      skipped++; // player died — every foe freezes, nothing to conclude
      continue;
    }
    judged++;

    for (const f of after.foes) {
      if (f.d <= STANDOFF_DIST) continue;
      // Nearest start position, so this survives foes being added or removed.
      let moved = Infinity;
      for (const g of before.foes) moved = Math.min(moved, Math.hypot(f.x - g.x, f.y - g.y));
      if (moved < STANDOFF_MOVE) {
        stalled.push(`round ${round}: foe ${Math.round(f.d)}px away moved ${Math.round(moved)}px in ${STANDOFF_MS / 1000}s`);
      }
    }
  }
  await page.close();
  // No usable round means no evidence either way — don't call that a pass.
  return { stalled, judged, skipped, pass: stalled.length === 0 && judged > 0 };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  let allPass = true;
  try {
    for (const renderer of ['webgl', 'canvas']) {
      const result = await checkRenderer(browser, renderer);
      const status = result.pass ? 'PASS' : 'FAIL';
      console.log(`[verify] ${renderer}: ${status} (objects ${result.start} -> ${result.end})`);
      for (const e of result.errors) console.log(`  ${e}`);
      if (result.leaked) {
        console.log(`  [leak] ${result.end} > ${result.start} + ${LEAK_TOLERANCE}`);
      }
      if (!result.pass) allPass = false;
    }

    const so = await checkStandoff(browser);
    console.log(
      `[verify] enemy standoff (B9): ${so.pass ? 'PASS' : 'FAIL'} ` +
        `(${so.judged} rounds judged, ${so.skipped} skipped: player died)`,
    );
    for (const s of so.stalled) console.log(`  [standoff] ${s}`);
    if (!so.pass && so.judged === 0) console.log('  [standoff] no round was usable — cannot conclude');
    if (!so.pass) allPass = false;
  } finally {
    await browser.close();
    server.close();
  }

  if (allPass) {
    console.log('[verify] all renderers passed, 0 console errors, no leak');
    process.exit(0);
  } else {
    console.log('[verify] FAILED');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[verify] crashed:', err);
  process.exit(1);
});
