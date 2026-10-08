// One contact sheet per champion: Q, E and Dash photographed MID-ACTION.
//
// "Fähigkeiten sind Objekte in der Welt, keine Kreise" (SCHLACHTPLAN L2) can
// only be judged by looking. A still taken after an ability resolves shows the
// aftermath; this freezes the synthetic clock a fixed time after each cast, so
// a harpoon is caught in flight and a dash mid-slide, the same way every run.
//
//   node scripts/kitshots.mjs --out shots/kits            # all champions
//   node scripts/kitshots.mjs --out shots/kits --champion tessaly
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pkg from 'playwright';

const { chromium } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const OUT = path.resolve(__dirname, '..', flag('out', 'shots/kits'));
const PORT = flag('port', '5173');
const ONLY = flag('champion', null);
mkdirSync(OUT, { recursive: true });

// ms after the cast to freeze the frame — mid-flight for a ~1100px/s projectile
const FREEZE = { Q: 75, E: 160, Dash: 90 };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/index.html?renderer=canvas`);
await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 30000 });
await page.waitForTimeout(800);

const champs = ONLY ? [ONLY] : await page.evaluate(() => window.__CC.champIds());

for (const id of champs) {
  for (const key of ['Q', 'E', 'Dash']) {
    await page.evaluate(({ id, key, freeze }) => {
      const CC = window.__CC;
      CC.reset();
      CC.autopilot(false);
      CC.run.champion = id;
      CC.forceMap('highland');
      CC.goto(3);
      CC.stepMs(900, 16);
      const a = CC.arena();
      const p = a.player;
      p.hp = p.maxHP = 1e6;
      CC.run.flags.noAutoAttacks = true;
      // A row of pinned, immortal dummies to the right, so line and cone
      // abilities have something to pass through and pull.
      const es = a.units.filter((u) => u.team === 'enemy' && u.alive);
      es.forEach((u, i) => {
        u.x = p.x + 140 + i * 85;
        u.y = p.y + (i % 2 ? 22 : -22);
        u.hp = u.maxHP = 1e6;
        u.cfg.abilities = [];
        u.telegraphing = null;
        u.stats.set({ id: 'pin', stat: 'moveSpeed', pct: -1, expiresAt: p.combat.now + 1e7 });
      });
      for (const pr of a.projectiles) pr.alive = false;
      p.facing = { x: 1, y: 0 };
      const aim = { x: 260, y: 0 };
      if (key === 'Q') p.castQ(aim);
      else if (key === 'E') p.castE(aim);
      else p.dash({ x: 1, y: 0 });
      CC.stepMs(freeze, 16);
    }, { id, key, freeze: FREEZE[key] });
    await page.screenshot({ path: path.join(OUT, `${id}-${key}.png`) });
  }
  console.log(`[kitshots] ${id}`);
}

await page.evaluate(() => window.__CC.resumeClock());

// Contact sheet: every shot cropped to the action around the champion, one row
// per champion, so the whole roster can be judged in a single image.
// The camera sits the player at ~(740, 490) of the 1280x720 frame.
const CROP = { x: 640, y: 360, w: 600, h: 240 };
const cells = champs
  .map((id) => `<div class="row"><b>${id}</b>${['Q', 'E', 'Dash']
    .map((k) => `<div class="cell"><img src="${id}-${k}.png"><span>${k}</span></div>`)
    .join('')}</div>`)
  .join('');
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#111;color:#ddd;font:14px sans-serif}
.row{display:flex;align-items:center;gap:6px;padding:3px}
b{width:80px;text-align:right}
.cell{position:relative;width:${CROP.w / 2}px;height:${CROP.h / 2}px;overflow:hidden;border:1px solid #333}
.cell img{position:absolute;left:${-CROP.x / 2}px;top:${-CROP.y / 2}px;width:640px}
.cell span{position:absolute;left:4px;top:2px;background:#000a;padding:0 4px}
</style>${cells}`;
const { writeFileSync } = await import('node:fs');
const sheetHtml = path.join(OUT, 'sheet.html');
writeFileSync(sheetHtml, html);
const sheet = await browser.newPage({ viewport: { width: 80 + 3 * (CROP.w / 2 + 8), height: 40 } });
await sheet.goto(`file:///${sheetHtml.replace(/\\/g, '/')}`);
await sheet.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true });

if (errors.length) console.log('[kitshots] console errors:', errors.slice(0, 4));
console.log(`[kitshots] -> ${OUT} (contact sheet: sheet.png)`);
await browser.close();
