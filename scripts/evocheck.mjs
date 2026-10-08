// Do the evolutions fire, and only when their recipe holds?
//
// Each probe plays the champion with the recipe's path at 4 (CC.grantTag),
// then again one short at 3 — the control. A probe passes only when the
// evolved ability measurably does the new thing and the control does not.
//
//   node scripts/evocheck.mjs [--port 5173]
import pkg from 'playwright';

const { chromium } = pkg;
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const PORT = arg('--port', '5173');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/index.html?renderer=canvas`);
await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 30000 });
await page.waitForTimeout(800);

await page.evaluate(() => {
  window.__setup = (champ, tag, n, count, place, opts = {}) => {
    const CC = window.__CC;
    CC.reset();
    CC.autopilot(false);
    CC.run.champion = champ;
    CC.grantTag(tag, n);
    CC.forceMap('highland');
    CC.goto(9);
    CC.stepMs(900, 16);
    const a = CC.arena();
    const p = a.player;
    p.hp = 1e6;
    p.shield = 0;
    p.stats.set({ id: 'nocrit', stat: 'critChance', pct: -1 });
    const es = a.units.filter((u) => u.team === 'enemy' && u.alive);
    es.forEach((u, i) => {
      u.cfg.abilities = []; u.cfg.melee = undefined; u.cfg.rangedAuto = undefined;
      u.telegraphing = null; u.lunge = null; u.cfg.elite = false;
      u.hp = 1e6;
      u.stats.set({ id: 'pin', stat: 'moveSpeed', pct: -1, expiresAt: p.combat.now + 1e7 });
      u.x = 40 + (i % 6) * 26; u.y = 40 + Math.floor(i / 6) * 26;
    });
    for (const pr of a.projectiles) pr.alive = false;
    a.hazards.length = 0;
    p.x = 960; p.y = 540;
    p.facing = { x: 1, y: 0 };
    const used = es.slice(0, count);
    used.forEach((u, i) => { const q = place(i, p); u.x = q.x; u.y = q.y; });
    p.ammo = 0; p.nextAttackAt = opts.auto ? 0 : 1e15;
    return {
      a, p, es: used, now: () => p.combat.now,
      step: (ms) => window.__CC.stepMs(ms, 16),
      lost: (u) => Math.round(1e6 - u.hp),
    };
  };
});

const results = [];
async function evo(id, champ, tag, probe, verdict) {
  const run = (n) =>
    page.evaluate(
      ({ champ, tag, n, src }) => new Function('S', 'champ', 'tag', 'n', `return (${src})(S, champ, tag, n);`)(window.__setup, champ, tag, n),
      { champ, tag, n, src: probe.toString() },
    );
  try {
    const w = await run(4);
    const c = await run(3);
    results.push({ id, ok: !!verdict(w, c), detail: `recipe ${JSON.stringify(w)} / one short ${JSON.stringify(c)}` });
  } catch (e) {
    results.push({ id, ok: false, detail: 'threw: ' + String(e.message).split('\n')[0] });
  }
}

// ----------------------------------------------------------------- Brannoc
await evo('evo_meltdown', 'brannoc', 'Bruch', (S, c, t, n) => {
  const { a, p, step } = S(c, t, n, 0, () => ({}));
  p.castQ({ x: 200, y: 0 });
  step(500);
  return a.hazards.find((h) => h.color === 0xff7a3a)?.r ?? 0;
}, (w, c) => w === 220 && c === 140);

await evo('evo_hearth', 'brannoc', 'Ward', (S, c, t, n) => {
  const { p, step } = S(c, t, n, 0, () => ({}));
  const h = p.hp;
  p.castE();
  step(50);
  return { hpCost: Math.round(h - p.hp), ward: Math.round(p.shield) };
}, (w, c) => w.hpCost === 0 && w.ward > 0 && c.hpCost === 12);

// --------------------------------------------------------------- Skorrvald
await evo('evo_fortress', 'skorrvald', 'Ward', (S, c, t, n) => {
  const { a, p, es } = S(c, t, n, 1, (i, p) => ({ x: p.x - 80, y: p.y })); // behind
  p.castQ({ x: 1, y: 0 });
  p.facing = { x: 1, y: 0 };
  const h = p.hp;
  a.dealDamage(es[0], p, 100, 'other', 'wahr');
  return Math.round(h - p.hp + 0); // shield reset to 0 in setup; ward banked after the hit
}, (w, c) => w <= 25 && c >= 90);

await evo('evo_landslide', 'skorrvald', 'Bruch', (S, c, t, n) => {
  const { p, es, lost, step, now } = S(c, t, n, 1, (i, p) => ({ x: p.x + 280, y: p.y }));
  es[0].frostUntil = now() + 2000;
  p.castE();
  step(400);
  return { dmg: lost(es[0]), d: Math.round(Math.hypot(es[0].x - p.x, es[0].y - p.y)) };
}, (w, c) => w.dmg > 0 && w.d < 150 && c.dmg === 0);

// -------------------------------------------------------------------- Nyth
await evo('evo_riftlash', 'nyth', 'Sturm', (S, c, t, n) => {
  const { p, es, lost, step } = S(c, t, n, 1, (i, p) => ({ x: p.x + 400, y: p.y }));
  p.castQ({ x: 400, y: 0 });
  step(600);
  return lost(es[0]);
}, (w, c) => w > 0 && c === 0);

await evo('evo_veilnova', 'nyth', 'Arkan', (S, c, t, n) => {
  const { p, es, lost, step } = S(c, t, n, 1, (i, p) => ({ x: p.x + 150, y: p.y }));
  p.castE();
  step(50);
  return lost(es[0]);
}, (w, c) => w > 0 && c === 0);

// ------------------------------------------------------------------- Sunna
await evo('evo_twinsuns', 'sunna', 'Arkan', (S, c, t, n) => {
  const { a, p, step } = S(c, t, n, 0, () => ({}));
  p.castQ({ x: 250, y: 0 });
  step(700);
  return a.hazards.filter((h) => h.color === 0xffd24a).length;
}, (w, c) => w === 2 && c === 1);

await evo('evo_solarshell', 'sunna', 'Ward', (S, c, t, n) => {
  const { p, step } = S(c, t, n, 1, (i, p) => ({ x: p.x + 50, y: p.y }));
  p.shield = 0;
  p.castE();
  step(600);
  return Math.round(p.shield);
}, (w, c) => w > 0 && c === 0);

// ----------------------------------------------------------------- Mirelle
await evo('evo_sunken', 'mirelle', 'Ward', (S, c, t, n) => {
  const { p, es, step, now } = S(c, t, n, 1, (i, p) => ({ x: p.x + 300, y: p.y }));
  p.castQ({ x: 300, y: 0 });
  step(500);
  return es[0].ctrlUntil > now();
}, (w, c) => w === true && c === false);

await evo('evo_undertow', 'mirelle', 'Sturm', (S, c, t, n) => {
  const { p, es, step } = S(c, t, n, 1, (i, p) => ({ x: p.x + 250, y: p.y }));
  p.castE();
  step(1600);
  return Math.round(Math.hypot(es[0].x - p.x, es[0].y - p.y));
}, (w, c) => w <= c - 80);

// --------------------------------------------------------------------- Kip
await evo('evo_slug', 'kip', 'Bruch', (S, c, t, n) => {
  const { p, es, lost, step } = S(c, t, n, 2, (i, p) => ({ x: p.x + (i ? 340 : 150), y: p.y }));
  p.castQ({ x: 1, y: 0 });
  step(500);
  return es.filter((u) => lost(u) > 0).length;
}, (w, c) => w === 2 && c === 1);

await evo('evo_bunker', 'kip', 'Ward', (S, c, t, n) => {
  const { p, step } = S(c, t, n, 1, (i, p) => ({ x: p.x + 330, y: p.y }));
  p.shield = 0;
  p.castE({ x: 200, y: 0 });
  step(2000);
  return Math.round(p.shield);
}, (w, c) => w > 0 && c === 0);

// ----------------------------------------------------------------- Tessaly
await evo('evo_crimson', 'tessaly', 'Arkan', (S, c, t, n) => {
  // The neighbour stands off the harpoon's line but inside 120 of the target.
  const { p, es, lost, step, now } = S(c, t, n, 2, (i, p) => ({ x: p.x + 250, y: p.y + (i ? 90 : 0) }));
  es[0].bleed = 3; es[0].bleedUntil = now() + 3000;
  p.castQ({ x: 1, y: 0 });
  step(400);
  return lost(es[1]);
}, (w, c) => w > 0 && c === 0);

await evo('evo_grapple', 'tessaly', 'Sturm', (S, c, t, n) => {
  const { p, es, step } = S(c, t, n, 1, (i, p) => ({ x: p.x, y: p.y - 250 })); // off to the side
  const x0 = es[0].x;
  const y0 = es[0].y;
  p.facing = { x: 1, y: 0 };
  p.dash({ x: 1, y: 0 });
  step(500);
  return Math.round(Math.hypot(es[0].x - x0, es[0].y - y0));
}, (w, c) => w > 100 && c === 0);

// ------------------------------------------------------------------- Aeren
await evo('evo_stormwall', 'aeren', 'Arkan', (S, c, t, n) => {
  // Walk a dummy across the wall's line 250 from its centre: inside a 600
  // wall, outside a 300 one.
  const { p, es, lost, step } = S(c, t, n, 1, (i, p) => ({ x: p.x + 250, y: p.y + 250 }));
  p.castE({ x: 300, y: 0 });
  step(150);
  es[0].x = p.x + 350;
  step(150);
  return lost(es[0]);
}, (w, c) => w > 0 && c === 0);

await evo('evo_windshield', 'aeren', 'Ward', (S, c, t, n) => {
  const { p, step } = S(c, t, n, 0, () => ({}));
  p.shield = 0;
  p.dash({ x: 1, y: 0 });
  step(500);
  return Math.round(p.shield);
}, (w, c) => w > 0 && c === 0);

await page.evaluate(() => window.__CC.resumeClock());
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`[evo] ${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(16)} ${r.detail}`);
}
if (errors.length) console.log('[evo] console errors:', errors.slice(0, 4));
console.log(failed === 0 ? `[evo] all ${results.length} evolutions fire on their recipe` : `[evo] ${failed}/${results.length} FAILED`);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
