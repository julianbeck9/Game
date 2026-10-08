// Do the champion-pack mechanics actually exist?
//
// The pack describes a magazine, piercing shots, cleaving swings, dash
// invulnerability, a frontal block and kill-triggered rewards. For a while
// most of that existed only as description text: Tessaly's E cost 10 health
// and did nothing else, Nyth's mark was written and never read. Reading the
// kit file said "implemented" — this measures the running game instead.
//
// Every claim is paired with a control that must come out DIFFERENT, so a
// probe that measures nothing cannot pass.
//
//   node scripts/kitcheck.mjs
import pkg from 'playwright';

const { chromium } = pkg;
const PORT = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/index.html?renderer=canvas`);
await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 30000 });
await page.waitForTimeout(800);

// Shared setup, installed once: a clean fight with N pinned, harmless dummies.
await page.evaluate(() => {
  window.__setup = (champ, n, place) => {
    const CC = window.__CC;
    CC.reset();
    CC.autopilot(false);
    CC.run.champion = champ;
    CC.forceMap('highland');
    CC.goto(9); // enough bodies for every probe
    CC.stepMs(900, 16);
    const a = CC.arena();
    const p = a.player;
    p.hp = p.maxHP = 1e6;
    const es = a.units.filter((u) => u.team === 'enemy' && u.alive);
    es.forEach((u, i) => {
      u.cfg.abilities = []; u.cfg.melee = undefined; u.cfg.rangedAuto = undefined;
      u.telegraphing = null; u.lunge = null; u.cfg.elite = false;
      u.hp = u.maxHP = 1e6;
      u.stats.set({ id: 'pin', stat: 'moveSpeed', pct: -1, expiresAt: p.combat.now + 1e7 });
      u.x = 60 + i * 30; u.y = 60; // parked
    });
    for (const pr of a.projectiles) pr.alive = false;
    const used = es.slice(0, n);
    used.forEach((u, i) => { const q = place(i, p); u.x = q.x; u.y = q.y; });
    p.facing = { x: 1, y: 0 };
    return { a, p, es: used };
  };
});

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); };

// 1. Cleave: Brannoc's 180-degree swing hits three bodies in front; Nyth's
//    single-target swing (control) hits one.
for (const [champ, want] of [['brannoc', 'all'], ['nyth', 'one']]) {
  const r = await page.evaluate((champ) => {
    const { p, es } = window.__setup(champ, 3, (i, p) => ({ x: p.x + 70 + (i % 2) * 30, y: p.y + (i - 1) * 45 }));
    const hp0 = es.map((u) => u.hp);
    window.__CC.stepMs(1200, 16);
    return es.filter((u, i) => u.hp < hp0[i]).length;
  }, champ);
  check(`cleave ${champ}`, want === 'all' ? r === 3 : r === 1, `${r}/3 hit`);
}

// 2. Sunna's sweep stops at three targets (five stand in the arc).
{
  const r = await page.evaluate(() => {
    const { es } = window.__setup('sunna', 5, (i, p) => ({ x: p.x + 90, y: p.y + (i - 2) * 30 }));
    const hp0 = es.map((u) => u.hp);
    window.__CC.stepMs(500, 16);
    return es.filter((u, i) => u.hp < hp0[i]).length;
  });
  check('sweep caps at 3 (sunna)', r === 3, `${r}/5 hit`);
}

// 3. Kip's magazine: six shots, then a reload gap of ~1.4s. Control: Aeren's
//    autos never pause that long.
for (const champ of ['kip', 'aeren']) {
  const r = await page.evaluate((champ) => {
    const { a, es } = window.__setup(champ, 1, (i, p) => ({ x: p.x + 300, y: p.y }));
    const times = [];
    const off = a.bus.on('autoHit', ({ target }) => { if (target === es[0]) times.push(a.player.combat.now); });
    window.__CC.stepMs(5000, 16);
    off();
    let maxGap = 0;
    for (let i = 1; i < times.length; i++) maxGap = Math.max(maxGap, times[i] - times[i - 1]);
    return { shots: times.length, maxGap: Math.round(maxGap) };
  }, champ);
  check(`magazine ${champ}`, champ === 'kip' ? r.maxGap >= 1300 : r.maxGap < 1000, `${r.shots} shots, longest gap ${r.maxGap}ms`);
}

// 4. Aeren's autos pierce: three in a line all take damage. Control: Tessaly.
for (const [champ, want] of [['aeren', 3], ['tessaly', 1]]) {
  const r = await page.evaluate((champ) => {
    const { es } = window.__setup(champ, 3, (i, p) => ({ x: p.x + 220 + i * 70, y: p.y }));
    const hp0 = es.map((u) => u.hp);
    window.__CC.stepMs(1500, 16);
    return es.filter((u, i) => u.hp < hp0[i]).length;
  }, champ);
  check(`pierce ${champ}`, r === want, `${r}/3 hit`);
}

// 5. Skorrvald's Rime Wall: a frontal hit is cut to 20%, a hit from behind is
//    not. Measured against the same raw hit with the wall down.
{
  const r = await page.evaluate(() => {
    const { a, p, es } = window.__setup('skorrvald', 2, (i, p) => ({ x: p.x + (i ? -80 : 80), y: p.y }));
    const [front, back] = es;
    p.armor = 0;
    const hit = (src) => { p.shield = 0; const h = p.hp; a.dealDamage(src, p, 100, 'other', 'wahr'); return Math.round(h - p.hp); };
    const open = hit(front);
    p.castQ({ x: 1, y: 0 });
    p.facing = { x: 1, y: 0 };
    const blocked = hit(front);
    const behind = hit(back);
    return { open, blocked, behind, ward: Math.round(p.shield) };
  });
  check('rime wall blocks the front', r.blocked <= r.open * 0.25 && r.behind >= r.open * 0.9, `open ${r.open} / front ${r.blocked} / behind ${r.behind}`);
}

// 6. Dash i-frames: a hit right after dashing does nothing; the same hit with
//    no dash lands (control).
for (const dash of [true, false]) {
  const r = await page.evaluate((dash) => {
    const { a, p, es } = window.__setup('tessaly', 1, (i, p) => ({ x: p.x + 400, y: p.y }));
    if (dash) p.dash({ x: 0, y: 1 });
    window.__CC.stepMs(32, 16);
    const h = p.hp;
    a.dealDamage(es[0], p, 50, 'other', 'wahr');
    return Math.round(h - p.hp);
  }, dash);
  check(`dash i-frames (${dash ? 'dashing' : 'control'})`, dash ? r === 0 : r > 0, `took ${r}`);
}

// 7. Nyth: two dash charges back to back; Brannoc (control) has one.
for (const [champ, want] of [['nyth', 2], ['brannoc', 1]]) {
  const r = await page.evaluate((champ) => {
    const { p } = window.__setup(champ, 0, () => ({ x: 0, y: 0 }));
    let n = 0;
    if (p.dash({ x: 1, y: 0 })) n++;
    window.__CC.stepMs(400, 16);
    if (p.dash({ x: -1, y: 0 })) n++;
    return n;
  }, champ);
  check(`dash charges ${champ}`, r === want, `${r} dashes`);
}

// 8. Tessaly's Bloodtide: a kill on a bleeding enemy pays ward. Control: the
//    same kill without E pays nothing.
for (const withE of [true, false]) {
  const r = await page.evaluate((withE) => {
    const { a, p, es } = window.__setup('tessaly', 1, (i, p) => ({ x: p.x + 300, y: p.y }));
    const t = es[0];
    t.hp = t.maxHP = 1e6;
    // Wait for the first barbed shot to actually land rather than a fixed
    // time — the first version waited 400ms and the shot had not fired yet.
    for (let i = 0; i < 60 && !(t.bleedUntil > p.combat.now); i++) window.__CC.stepMs(50, 16);
    p.shield = 0;
    if (withE) p.castE();
    a.dealDamage(p, t, 1e7, 'other', 'wahr'); // a real kill: the dummy has 1e6
    window.__CC.stepMs(50, 16);
    return Math.round(p.shield);
  }, withE);
  check(`bloodtide ward (${withE ? 'E' : 'control'})`, withE ? r > 0 : r === 0, `ward ${r}`);
}

// 9. Nyth's mark: killing a lashed enemy refunds a dash charge. Control: an
//    unmarked kill does not.
for (const lash of [true, false]) {
  const r = await page.evaluate((lash) => {
    const { a, p, es } = window.__setup('nyth', 1, (i, p) => ({ x: p.x + 150, y: p.y }));
    const t = es[0];
    t.hp = t.maxHP = 1e6;
    // Sideways and back: the player spawns near the bottom edge, so a downward
    // dash got clamped and the lash then missed the dummy entirely.
    // A movement dash follows FACING, not the argument (only aimed dashes take
    // the pointer), so face each way explicitly.
    p.facing = { x: -1, y: 0 };
    p.dash({ x: -1, y: 0 });
    window.__CC.stepMs(300, 16);
    p.facing = { x: 1, y: 0 };
    p.dash({ x: 1, y: 0 });
    window.__CC.stepMs(300, 16);
    const before = p.dashChargesAvail;
    if (lash) { p.castQ({ x: 150, y: 0 }); window.__CC.stepMs(200, 16); }
    a.dealDamage(p, t, 1e7, 'other', 'wahr');
    window.__CC.stepMs(50, 16);
    return { before, after: p.dashChargesAvail };
  }, lash);
  check(`mark refund (${lash ? 'marked' : 'control'})`, lash ? r.after > r.before : r.after === r.before, `charges ${r.before} -> ${r.after}`);
}

await page.evaluate(() => window.__CC.resumeClock());
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`[kit] ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(30)} ${r.detail}`);
}
if (errors.length) console.log('[kit] console errors:', errors.slice(0, 4));
console.log(failed === 0 ? '[kit] every pack mechanic exists in the running game' : `[kit] ${failed} FAILED`);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
