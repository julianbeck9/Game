// Frame strip: several shots a fixed interval apart, so a motion arc can be
// judged. A still cannot show whether a swing has anticipation or whether a
// death collapses — those only exist across frames.
//
//   node scripts/frames.mjs --out shots/anim --every 90 --count 10
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pkg from 'playwright';

const { chromium } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? d : argv[i + 1];
};
const OUT = path.resolve(__dirname, '..', flag('out', 'shots/frames'));
const EVERY = Number(flag('every', 90));
const COUNT = Number(flag('count', 10));
const PORT = flag('port', '5173');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/`);
await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 30000 });
await page.waitForTimeout(1600);

// One enemy, one map, player parked next to it: the fight stays in frame.
await page.evaluate(() => {
  window.__CC.autopilot(true);
  window.__CC.forceMap('highland');
  window.__CC.reset();
  window.__CC.run.champion = 'masteryi';
  window.__CC.goto(1);
});
await page.waitForTimeout(2000);

// Weaken every enemy so a kill — and therefore the collapse — lands inside the
// strip instead of minutes later.
await page.evaluate(() => {
  const a = window.__CC.arena();
  for (const u of a.units) if (u.team === 'enemy') u.hp = 40;
});

// Crop tight to the player. A full-screen frame shows a 28px figure on a
// 900px backdrop, which is far too small to tell anticipation from sliding —
// the first attempt at this strip was unreadable for exactly that reason.
const VIEW = { w: 900, h: 620 };
const GAME = { w: 1920, h: 1080 };
const K = Math.min(VIEW.w / GAME.w, VIEW.h / GAME.h);
const CROP = 210;

for (let i = 0; i < COUNT; i++) {
  const at = await page.evaluate(() => {
    const p = window.__CC.arena().player;
    return { x: p.x, y: p.y };
  });
  const cx = at.x * K;
  const cy = at.y * K;
  const clip = {
    x: Math.max(0, Math.min(VIEW.w - CROP, cx - CROP / 2)),
    y: Math.max(0, Math.min(VIEW.h - CROP, cy - CROP / 2)),
    width: CROP,
    height: CROP,
  };
  await page.screenshot({ path: path.join(OUT, `f${String(i).padStart(2, '0')}.png`), clip });
  await page.waitForTimeout(EVERY);
}
console.log(`[frames] ${COUNT} frames every ${EVERY}ms -> ${OUT}`);
console.log('errors:', errors.slice(0, 3));
await browser.close();
