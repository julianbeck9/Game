// Do the path steps do what they say, in the running game?
//
// Each probe lights ONE path step with effect-free tag picks (CC.grantTag),
// then measures it against the same setup one tag short of the step — the
// control. A probe passes only when the two differ the way the step says.
//
//   node scripts/pathcheck.mjs [--port 5173]
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
    if (!opts.crit) p.stats.set({ id: 'nocrit', stat: 'critChance', pct: -1 });
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
    p.ammo = 0; p.nextAttackAt = opts.noAuto ? 1e15 : 0;
    return { a, p, es: used, step: (ms) => window.__CC.stepMs(ms, 16), now: () => p.combat.now };
  };
});

const results = [];
async function step(name, champ, tag, at, probe, verdict) {
  const run = (n) =>
    page.evaluate(
      ({ champ, tag, n, src }) => new Function('S', 'champ', 'tag', 'n', `return (${src})(S, champ, tag, n);`)(window.__setup, champ, tag, n),
      { champ, tag, n, src: probe.toString() },
    );
  try {
    const w = await run(at);
    const c = await run(at - 1);
    results.push({ name, ok: !!verdict(w, c), detail: `lit ${JSON.stringify(w)} / one short ${JSON.stringify(c)}` });
  } catch (e) {
    results.push({ name, ok: false, detail: 'threw: ' + String(e.message).split('\n')[0] });
  }
}

const statProbe = (stat) => `(S, champ, tag, n) => { const { p, step } = S(champ, tag, n, 0, () => ({}), { noAuto: true }); step(50); return Math.round(p.stats.get('${stat}') * 1000) / 1000; }`;
const fromSrc = (src) => ({ toString: () => src });

await step('Blut 2 Bloodied', 'brannoc', 'Blut', 2, fromSrc(statProbe('damage')), (w, c) => w >= c * 1.09);
await step('Blut 6 Blood Price', 'brannoc', 'Blut', 6,
  (S, champ, tag, n) => {
    const { p, step } = S(champ, tag, n, 0, () => ({}), { noAuto: true });
    p.hp = p.maxHP * 0.3;
    step(50);
    return Math.round(p.stats.get('damage') * 100) / 100;
  },
  (w, c) => w >= c * 1.3);

await step('Sturm 2 Tailwind', 'brannoc', 'Sturm', 2, fromSrc(statProbe('attackSpeed')), (w, c) => w >= c * 1.09);
await step('Sturm 4 Second Wind', 'brannoc', 'Sturm', 4,
  (S, champ, tag, n) => {
    const { p, step } = S(champ, tag, n, 0, () => ({}), { noAuto: true });
    let k = 0;
    for (const dx of [1, -1]) { p.facing = { x: dx, y: 0 }; if (p.dash({ x: dx, y: 0 })) k++; step(400); }
    return k;
  },
  (w, c) => w === 2 && c === 1);
await step('Sturm 6 Tempest', 'aeren', 'Sturm', 6,
  (S, champ, tag, n) => {
    const { a, p, step } = S(champ, tag, n, 1, (i, p) => ({ x: p.x + 300, y: p.y }));
    const move = p.move.bind(p);
    p.move = (dt) => move(dt, { x: 0, y: Math.sin(p.combat.now / 250) > 0 ? 1 : -1 });
    let k = 0;
    const off = a.bus.on('autoHit', () => k++);
    step(2500);
    off();
    return k;
  },
  (w, c) => w > 0 && c === 0);

await step('Arkan 2 Focus', 'brannoc', 'Arkan', 2, fromSrc(statProbe('cooldown')), (w, c) => w <= c * 0.91);
await step('Arkan 4 Recursion', 'nyth', 'Arkan', 4,
  (S, champ, tag, n) => {
    const { a, p, es, step } = S(champ, tag, n, 1, (i, p) => ({ x: p.x + 150, y: p.y }), { noAuto: true });
    p.castQ({ x: 150, y: 0 });
    step(250);
    a.dealDamage(p, es[0], 1e7, 'other', 'wahr');
    step(50);
    return p.isReady('Q');
  },
  (w, c) => w === true && c === false);
await step('Arkan 6 Echo', 'nyth', 'Arkan', 6,
  (S, champ, tag, n) => {
    const { a, p, es, step } = S(champ, tag, n, 1, (i, p) => ({ x: p.x + 150, y: p.y }), { noAuto: true });
    let k = 0;
    const off = a.bus.on('damageDealt', ({ target, type }) => { if (target === es[0] && type === 'ability') k++; });
    p.castQ({ x: 150, y: 0 });
    step(900);
    off();
    return k;
  },
  (w, c) => w === 2 && c === 1);

await step('Ward 2 Plated', 'brannoc', 'Ward', 2, fromSrc(statProbe('armor')), (w, c) => w >= c + 11);
await step('Ward 4 Aegis', 'brannoc', 'Ward', 4,
  (S, champ, tag, n) => { const { p } = S(champ, tag, n, 0, () => ({}), { noAuto: true }); return Math.round(p.shield); },
  (w, c) => w > 0 && c === 0);
await step('Ward 6 Bulwark', 'brannoc', 'Ward', 6,
  (S, champ, tag, n) => {
    const { a, p, es } = S(champ, tag, n, 1, (i, p) => ({ x: p.x + 300, y: p.y }), { noAuto: true });
    p.shield = 0; p.addShield(1000);
    const before = p.shield + p.hp;
    a.dealDamage(es[0], p, 100, 'other', 'wahr');
    return Math.round(before - p.shield - p.hp);
  },
  (w, c) => w === 75 && c === 100);

await step('Bruch 2 Keen', 'brannoc', 'Bruch', 2, fromSrc(statProbe('damage')), (w, c) => w >= c * 1.07);
await step('Bruch 4 Executioner', 'brannoc', 'Bruch', 4,
  (S, champ, tag, n) => {
    const { a, p, es } = S(champ, tag, n, 1, (i, p) => ({ x: p.x + 300, y: p.y }), { noAuto: true });
    const t = es[0];
    t.hp = t.maxHP * 0.12;
    a.dealDamage(p, t, t.maxHP * 0.03, 'other', 'wahr');
    return t.alive;
  },
  (w, c) => w === false && c === true);
await step('Bruch 6 Shatter', 'brannoc', 'Bruch', 6,
  (S, champ, tag, n) => {
    const { a, p, es, step } = S(champ, tag, n, 1, (i, p) => ({ x: p.x + 90, y: p.y }), { crit: true });
    p.stats.set({ id: 'allcrit', stat: 'critChance', flat: 5 });
    const crits = [];
    const off = a.bus.on('autoHit', ({ target, dmg }) => { if (target === es[0]) crits.push(dmg); });
    step(1500);
    off();
    // Per-hit damage over the attack damage stat: the crit multiplier.
    return Math.round((crits[0] / p.stats.get('damage')) * 100) / 100;
  },
  (w, c) => w >= c * 1.3);

await page.evaluate(() => window.__CC.resumeClock());
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`[path] ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(22)} ${r.detail}`);
}
if (errors.length) console.log('[path] console errors:', errors.slice(0, 4));
console.log(failed === 0 ? `[path] all ${results.length} path steps do what they say` : `[path] ${failed}/${results.length} FAILED`);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
