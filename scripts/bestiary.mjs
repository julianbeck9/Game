// One screenshot with every enemy archetype lined up, pinned and alive.
//
// Enemy readability was argued about from source for a long time — "they have
// different colours and an insignia" is true in the code and false on screen at
// 1.6x zoom with nine bodies overlapping. This renders the actual bestiary so
// the silhouettes can be judged as a player sees them, side by side.
//
//   node scripts/bestiary.mjs --out shots/bestiary.png
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pkg from 'playwright';

const { chromium } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const OUT = path.resolve(__dirname, '..', flag('out', 'shots/bestiary.png'));
const PORT = flag('port', '5173');
mkdirSync(path.dirname(OUT), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`http://localhost:${PORT}/index.html?renderer=canvas`);
await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 30000 });
await page.waitForTimeout(700);

const kinds = await page.evaluate(async () => {
  const CC = window.__CC;
  CC.reset();
  CC.autopilot(false);
  CC.run.champion = 'aeren';
  CC.forceMap('highland');
  CC.goto(19); // deepest non-boss round: the widest spread of archetypes
  await new Promise((r) => setTimeout(r, 1300));
  const a = CC.arena();
  a.player.hp = 9e9;

  const es = a.units.filter((u) => u.team === 'enemy' && u.alive);
  // Lay them out on a grid in front of the player, pinned and immortal, each
  // facing a different way so the silhouettes are judged from several angles.
  es.forEach((u, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    u.x = a.player.x - 260 + col * 130;
    u.y = a.player.y - 190 + row * 130;
    u.hp = u.maxHP = 1e6;
    const ang = (i / Math.max(1, es.length)) * Math.PI * 2;
    u.facing = { x: Math.cos(ang), y: Math.sin(ang) };
    u.stats.set({ id: 'pin', stat: 'moveSpeed', pct: -1, expiresAt: a.player.combat.now + 1e7 });
  });
  await new Promise((r) => setTimeout(r, 700));
  return es.map((u) => u.cfg.kind);
});

await page.screenshot({ path: OUT });
console.log(`[bestiary] ${OUT}`);
console.log(`[bestiary] ${kinds.length} enemies: ${kinds.join(', ')}`);
await browser.close();
