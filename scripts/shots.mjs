// Consistent screenshot set for the quality pass: same scenes, same champion,
// same rounds every time, so before/after comparisons are actually comparable.
//
//   node scripts/shots.mjs --out shots/baseline
//   node scripts/shots.mjs --out shots/lighting-v1 --port 5173
//
// Uses the dev server (default 5173) so it picks up source changes without a
// build. The player is kept alive during fight shots — a corpse is not a
// screenshot of combat.
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
const OUT = path.resolve(__dirname, '..', flag('out', 'shots/current'));
const PORT = flag('port', '5173');
const BASE = `http://localhost:${PORT}/`;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

const shot = async (name) => {
  const f = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: f });
  console.log(`[shot] ${name}`);
};

const keepAlive = () =>
  page.evaluate(() => {
    const a = window.__CC.arena?.();
    const p = a && a.player;
    if (p && p.alive) p.hp = Math.max(p.hp, 100000);
  }).catch(() => {});

await page.goto(BASE);
await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 30000 });
await page.waitForTimeout(1800);

// 1. Menu / champion select
await shot('01-menu');

// 2-5. Combat on four visually different maps, mid-fight with a real squad.
// The map is PINNED per scene. Without this `goto()` rolls a random map, so a
// "before" captured on Demacia gets compared against an "after" on Highland and
// the change of scenery reads as a change in the code. That mistake was made
// once in this pass and cost a wrong conclusion about the lighting.
// Four deliberately different palettes: dark teal, bright daylight, blood red,
// blinding sand — the cases a visual change has to survive.
const FIGHTS = [
  ['02-fight-early', 'masteryi', 2, 'shadow'],
  ['03-fight-mid', 'karthus', 5, 'highland'],
  ['04-fight-late', 'sivir', 9, 'noxus'],
  ['05-fight-crowd', 'zac', 12, 'shurima'],
];
for (const [name, champ, round, mapId] of FIGHTS) {
  await page.evaluate(([c, r, m]) => {
    window.__CC.autopilot(true);
    window.__CC.forceMap(m);
    window.__CC.reset();
    window.__CC.run.champion = c;
    ['kar_reiner_ton', 'kar_choral', 'siv_rueckhand', 'yi_zermalmen'].forEach((id) => window.__CC.grant(id));
    window.__CC.goto(r);
  }, [champ, round, mapId]);
  await page.waitForTimeout(2200);
  await keepAlive();
  await page.waitForTimeout(1600);
  await keepAlive();
  await page.waitForTimeout(900);
  await shot(name);
}

// 6. Augment pick screen
await page.evaluate(() => {
  const a = window.__CC.arena();
  a.scene.start('pick', { offers: [] });
});
await page.waitForTimeout(900);
await shot('06-pick');

// 7. Shop
await page.evaluate(() => {
  const a = window.__CC.arena();
  a.scene.manager.getScene('pick')?.scene.start('shop');
});
await page.waitForTimeout(1000);
await shot('07-shop');

console.log(`\n[shots] wrote to ${OUT}`);
if (errors.length) console.log(`[shots] ${errors.length} console errors:`, errors.slice(0, 5));
await browser.close();
