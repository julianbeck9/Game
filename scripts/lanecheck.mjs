// Do the champion lanes do what their cards say?
//
// Forty-eight lane augments (augments/lanes.ts), each a promise on a pick
// card. kitcheck.mjs taught that a kit file can read "implemented" while the
// running game does nothing, so every card here is measured in the game:
// once WITH the augment, once WITHOUT (the control), same setup. A probe only
// passes when the two come out the way the card says — so a probe that
// measures nothing fails instead of passing quietly.
//
// Capstones are measured with both enablers owned in BOTH runs, so the
// difference is the capstone alone.
//
//   node scripts/lanecheck.mjs [--port 5173] [--only bra_]
import pkg from 'playwright';

const { chromium } = pkg;
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const PORT = arg('--port', '5173');
const ONLY = arg('--only', '');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/index.html?renderer=canvas`);
await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 30000 });
await page.waitForTimeout(800);

await page.evaluate(() => {
  // A clean fight: `augs` owned, N pinned harmless 1e6-HP dummies placed by `place`.
  window.__setup = (champ, augs, n, place, opts = {}) => {
    const CC = window.__CC;
    CC.reset();
    CC.autopilot(false);
    CC.run.champion = champ;
    for (const id of augs) if (!CC.grant(id)) throw new Error('grant failed: ' + id);
    CC.forceMap('highland');
    CC.goto(9);
    CC.stepMs(900, 16);
    const a = CC.arena();
    const p = a.player;
    // maxHP is a derived stat (a getter): only hp can be set. Damage taken is
    // read as 1e6 - hp, never from maxHP.
    p.hp = opts.lowHp ? p.maxHP * opts.lowHp : 1e6;
    p.stats.set({ id: 'nocrit', stat: 'critChance', pct: -1 }); // no crit noise
    const es = a.units.filter((u) => u.team === 'enemy' && u.alive);
    es.forEach((u, i) => {
      u.cfg.abilities = []; u.cfg.melee = undefined; u.cfg.rangedAuto = undefined;
      u.telegraphing = null; u.lunge = null; u.cfg.elite = false;
      u.hp = 1e6;
      u.stats.set({ id: 'pin', stat: 'moveSpeed', pct: -1, expiresAt: p.combat.now + 1e7 });
      u.x = 40 + (i % 6) * 26; u.y = 40 + Math.floor(i / 6) * 26; // parked in a corner
    });
    for (const pr of a.projectiles) pr.alive = false;
    a.hazards.length = 0;
    // Middle of the arena, so a dash or a throw is never clamped by an edge.
    p.x = 960; p.y = 540;
    p.facing = { x: 1, y: 0 };
    const used = es.slice(0, n);
    used.forEach((u, i) => { const q = place(i, p); u.x = q.x; u.y = q.y; });
    // The 900ms warm-up may already have fired at the parked dummies.
    p.ammo = 0; p.nextAttackAt = 0; p.reloadingUntil = 0;
    if (opts.noAuto) p.nextAttackAt = 1e15;
    const lost = (u) => Math.round(1e6 - u.hp);
    const step = (ms) => window.__CC.stepMs(ms, 16);
    return { a, p, es: used, lost, step, now: () => p.combat.now };
  };
});

const results = [];
/**
 * One lane card. `probe(on)` runs in the page with `on` = augment owned; the
 * verdict compares the two runs.
 */
async function card(id, champ, base, probe, verdict, describe) {
  if (ONLY && !id.startsWith(ONLY)) return;
  const run = (on) =>
    page.evaluate(
      ({ champ, augs, src }) => {
        // eslint-disable-next-line no-new-func
        const fn = new Function('S', 'champ', 'augs', `return (${src})(S, champ, augs);`);
        return fn(window.__setup, champ, augs);
      },
      { champ, augs: on ? [...base, id] : base, src: probe.toString() },
    );
  let w, c;
  try {
    w = await run(true);
    c = await run(false);
  } catch (e) {
    results.push({ id, ok: false, detail: 'threw: ' + String(e.message).split('\n')[0] });
    return;
  }
  results.push({ id, ok: !!verdict(w, c), detail: describe ? describe(w, c) : `with ${JSON.stringify(w)} / without ${JSON.stringify(c)}` });
}

// ================================================================= Brannoc
await card('bra_banked', 'brannoc', [],
  (S, champ, augs) => {
    const { p, es, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 80, y: p.y }));
    step(6000);
    return es[0].ember ?? 0;
  },
  (w, c) => w === 8 && c === 5);

await card('bra_flashpoint', 'brannoc', [],
  (S, champ, augs) => {
    // The neighbour stands out of swing reach but inside 110 of the target.
    const { es, lost, step } = S(champ, augs, 2, (i, p) => ({ x: p.x + (i ? 250 : 150), y: p.y }));
    step(6000);
    return lost(es[1]);
  },
  (w, c) => w > 0 && c === 0);

await card('bra_furnace_heart', 'brannoc', ['bra_banked', 'bra_flashpoint'],
  (S, champ, augs) => {
    const { p, es, step, now } = S(champ, augs, 1, (i, p) => ({ x: p.x + 130, y: p.y }), { noAuto: true });
    const t = es[0];
    t.ember = 3; t.emberUntil = now() + 5000;
    p.facing = { x: 1, y: 0 };
    p.dash({ x: 1, y: 0 });
    step(500);
    return t.emberUntil > now() ? t.ember : 0;
  },
  (w, c) => w === 6 && c === 0);

await card('bra_candle', 'brannoc', [],
  (S, champ, augs) => {
    const { p, step } = S(champ, augs, 0, () => ({ x: 0, y: 0 }), { noAuto: true });
    const h = p.hp;
    p.castE();
    step(50);
    return Math.round(h - p.hp);
  },
  (w, c) => w === 25 && c === 12);

await card('bra_pyre', 'brannoc', [],
  (S, champ, augs) => {
    const { p, step } = S(champ, augs, 0, () => ({ x: 0, y: 0 }), { noAuto: true, lowHp: 0.4 });
    step(100);
    return Math.round(p.stats.get('damage') * 100) / 100;
  },
  (w, c) => w >= c * 1.3);

await card('bra_martyr', 'brannoc', ['bra_candle', 'bra_pyre'],
  (S, champ, augs) => {
    const { p, es, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 220, y: p.y }), { noAuto: true });
    step(50);
    p.hp -= 30;
    step(50);
    return es[0].ember ?? 0;
  },
  (w, c) => w >= 3 && c === 0);

// =============================================================== Skorrvald
await card('sko_mirror', 'skorrvald', [],
  (S, champ, augs) => {
    const { a, p, es, lost, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 80, y: p.y }), { noAuto: true });
    p.castQ({ x: 1, y: 0 });
    p.facing = { x: 1, y: 0 };
    a.dealDamage(es[0], p, 200, 'other', 'wahr');
    step(50);
    return lost(es[0]);
  },
  (w, c) => w > 0 && c === 0);

await card('sko_glacial', 'skorrvald', [],
  (S, champ, augs) => {
    const { p, step, now } = S(champ, augs, 0, () => ({ x: 0, y: 0 }), { noAuto: true });
    p.castQ({ x: 1, y: 0 });
    step(2200);
    return (p.memory.wallUntil ?? 0) >= now();
  },
  (w, c) => w === true && c === false);

await card('sko_bastion', 'skorrvald', ['sko_mirror', 'sko_glacial'],
  (S, champ, augs) => {
    // Never pressed Q: just stood still for a second, then took a frontal hit.
    const { a, p, es, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 300, y: p.y }), { noAuto: true });
    step(1000);
    p.facing = { x: 1, y: 0 };
    p.shield = 0;
    const h = p.hp;
    a.dealDamage(es[0], p, 100, 'other', 'wahr');
    return Math.round(h - p.hp);
  },
  (w, c) => w <= 25 && c >= 90);

await card('sko_blackice', 'skorrvald', [],
  (S, champ, augs) => {
    const { a, p, es, step, now } = S(champ, augs, 1, (i, p) => ({ x: p.x + 90, y: p.y }));
    let at = -1;
    const off = a.bus.on('autoHit', () => { if (at < 0) { at = now(); p.nextAttackAt = 1e15; } });
    for (let i = 0; i < 60 && at < 0; i++) step(50);
    off();
    return (es[0].frostUntil ?? 0) > now();
  },
  (w, c) => w === true && c === false);

await card('sko_shatter', 'skorrvald', [],
  (S, champ, augs) => {
    const { p, es, step, now } = S(champ, augs, 2, (i, p) => ({ x: p.x + (i ? 200 : 100), y: p.y }), { noAuto: true });
    es[0].frostUntil = now() + 2000; // chilled
    p.castE();
    step(30);
    return (es[1].frostUntil ?? 0) > now();
  },
  (w, c) => w === true && c === false);

await card('sko_deepfreeze', 'skorrvald', ['sko_blackice', 'sko_shatter'],
  (S, champ, augs) => {
    const { a, es, step, now } = S(champ, augs, 1, (i, p) => ({ x: p.x + 90, y: p.y }));
    let n = 0;
    const off = a.bus.on('autoHit', () => n++);
    for (let i = 0; i < 100 && n < 3; i++) step(50);
    off();
    return (es[0].frozenUntil ?? 0) > now();
  },
  (w, c) => w === true && c === false);

// ==================================================================== Nyth
await card('nyt_harvest', 'nyth', [],
  (S, champ, augs) => {
    const { a, p, es, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 150, y: p.y }), { noAuto: true });
    p.castQ({ x: 150, y: 0 });
    step(250);
    a.dealDamage(p, es[0], 1e7, 'other', 'wahr');
    step(50);
    return p.isReady('Q');
  },
  (w, c) => w === true && c === false);

await card('nyt_longshadow', 'nyth', [],
  (S, champ, augs) => {
    const { p, es, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 150, y: p.y }), { noAuto: true });
    const ar = es[0].stats.get('armor');
    p.castQ({ x: 150, y: 0 });
    step(250);
    return Math.round(ar - es[0].stats.get('armor'));
  },
  (w, c) => w === 30 && c === 0);

await card('nyt_ledger', 'nyth', ['nyt_harvest', 'nyt_longshadow'],
  (S, champ, augs) => {
    const { a, p, es, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 150, y: p.y }), { noAuto: true });
    let n = 0;
    const off = a.bus.on('damageDealt', ({ target, type }) => { if (target === es[0] && type === 'ability') n++; });
    p.castQ({ x: 150, y: 0 });
    step(700);
    off();
    return n;
  },
  (w, c) => w === 2 && c === 1);

await card('nyt_threesteps', 'nyth', [],
  (S, champ, augs) => {
    const { p, step } = S(champ, augs, 0, () => ({ x: 0, y: 0 }), { noAuto: true });
    let n = 0;
    for (const dx of [1, -1, 1]) {
      p.facing = { x: dx, y: 0 };
      if (p.dash({ x: dx, y: 0 })) n++;
      step(400);
    }
    return n;
  },
  (w, c) => w === 3 && c === 2);

await card('nyt_ambush', 'nyth', [],
  (S, champ, augs) => {
    // Dash away from the pair and back, then one strike on the near dummy.
    const { p, es, lost, step } = S(champ, augs, 2, (i, p) => ({ x: p.x + (i ? 250 : 120), y: p.y }), { noAuto: true });
    p.facing = { x: -1, y: 0 };
    p.dash({ x: -1, y: 0 });
    step(350);
    p.x = es[0].x - 100; p.y = es[0].y;
    p.nextAttackAt = 0;
    step(400);
    return lost(es[1]);
  },
  (w, c) => w > 0 && c === 0);

await card('nyt_veilwalk', 'nyth', ['nyt_threesteps', 'nyt_ambush'],
  (S, champ, augs) => {
    const { p, es, step, now } = S(champ, augs, 1, (i, p) => ({ x: p.x + 150, y: p.y }), { noAuto: true });
    p.facing = { x: 1, y: 0 };
    p.dash({ x: 1, y: 0 });
    step(400);
    return (es[0].nythMarkUntil ?? 0) > now();
  },
  (w, c) => w === true && c === false);

// =================================================================== Sunna
await card('sun_sunwell', 'sunna', [],
  (S, champ, augs) => {
    const { a, p, step } = S(champ, augs, 0, () => ({ x: 0, y: 0 }), { noAuto: true });
    p.castQ({ x: 250, y: 0 });
    step(600);
    const h = a.hazards.find((z) => z.color === 0xffd24a);
    return h ? h.r : 0;
  },
  (w, c) => w === 130 && c === 70);

await card('sun_tether', 'sunna', [],
  (S, champ, augs) => {
    // The glaive is pinned by hand (no burning zone), one dummy on it, one in reach.
    const { p, es, lost, step, now } = S(champ, augs, 2, (i, p) => ({ x: p.x + (i ? 400 : 100), y: p.y }));
    p.memory.glaiveX = es[1].x; p.memory.glaiveY = es[1].y; p.memory.glaiveUntil = now() + 6000;
    step(1500);
    return lost(es[1]);
  },
  (w, c) => w > 0 && c === 0);

await card('sun_return', 'sunna', ['sun_sunwell', 'sun_tether'],
  (S, champ, augs) => {
    const { p, es, lost, step, now } = S(champ, augs, 1, (i, p) => ({ x: p.x + 480, y: p.y }), { noAuto: true });
    p.memory.glaiveX = p.x + 240; p.memory.glaiveY = p.y; p.memory.glaiveUntil = now() + 6000;
    p.facing = { x: 1, y: 0 };
    p.dash({ x: 1, y: 0 });
    step(900);
    return lost(es[0]);
  },
  (w, c) => w > 0 && c === 0);

await card('sun_noon', 'sunna', [],
  (S, champ, augs) => {
    const { a, p, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 150, y: p.y }));
    p.castE();
    let n = 0;
    const off = a.bus.on('autoHit', () => n++);
    step(2000);
    off();
    return n;
  },
  (w, c) => w > 0 && c === 0);

await card('sun_corona', 'sunna', [],
  (S, champ, augs) => {
    const { p, es, lost, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 100, y: p.y }), { noAuto: true });
    p.castE();
    step(1000);
    return lost(es[0]);
  },
  (w, c) => w > 0 && c === 0);

await card('sun_dawnstep', 'sunna', ['sun_noon', 'sun_corona'],
  (S, champ, augs) => {
    const { p, step } = S(champ, augs, 0, () => ({ x: 0, y: 0 }), { noAuto: true });
    p.castE();
    step(50);
    let n = 0;
    for (const dx of [1, -1, 1]) {
      p.facing = { x: dx, y: 0 };
      if (p.dash({ x: dx, y: 0 })) n++;
      step(500);
    }
    return n;
  },
  (w, c) => w === 3 && c === 1);

// ================================================================= Mirelle
await card('mir_rising', 'mirelle', [],
  (S, champ, augs) => {
    const { a, p, step } = S(champ, augs, 0, () => ({ x: 0, y: 0 }), { noAuto: true });
    p.castQ({ x: 300, y: 0 });
    step(800);
    const h = a.hazards.find((z) => z.color === 0x66ddaa);
    return h ? h.r : 0;
  },
  (w, c) => w === 160 && c === 120);

await card('mir_swarm', 'mirelle', [],
  (S, champ, augs) => {
    // Wisp targets: both outside the bog, each within 400 of the other.
    const at = [[300, 0], [300, -230], [550, -230]];
    const { a, p, es, lost, step } = S(champ, augs, 3, (i, p) => ({ x: p.x + at[i][0], y: p.y + at[i][1] }), { noAuto: true });
    p.castQ({ x: 300, y: 0 });
    step(800);
    a.dealDamage(p, es[0], 1e7, 'other', 'wahr');
    step(1500);
    return [es[1], es[2]].filter((u) => lost(u) > 0).length;
  },
  (w, c) => w === 2 && c === 1);

await card('mir_spread', 'mirelle', ['mir_rising', 'mir_swarm'],
  (S, champ, augs) => {
    const { a, p, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 300, y: p.y }));
    p.castQ({ x: 300, y: 0 });
    step(2500);
    return a.hazards.filter((z) => z.color === 0x66ddaa && z.r === 60).length;
  },
  (w, c) => w > 0 && c === 0);

await card('mir_unbroken', 'mirelle', [],
  (S, champ, augs) => {
    const { p, es, lost, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 350, y: p.y }), { noAuto: true });
    p.castE();
    step(3000);
    return lost(es[0]);
  },
  (w, c) => w > 0 && c === 0);

await card('mir_siphon', 'mirelle', [],
  (S, champ, augs) => {
    const { p, es, lost, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 150, y: p.y }), { noAuto: true });
    p.castE();
    step(3200);
    return lost(es[0]);
  },
  (w, c) => w >= c * 1.4);

await card('mir_twin', 'mirelle', ['mir_unbroken', 'mir_siphon'],
  (S, champ, augs) => {
    const { p, es, lost, step } = S(champ, augs, 2, (i, p) => ({ x: p.x + 150, y: p.y + (i ? 150 : 0) }), { noAuto: true });
    p.castE();
    step(1200);
    return es.filter((u) => lost(u) > 0).length;
  },
  (w, c) => w === 2 && c === 1);

// ===================================================================== Kip
// Shots before the first reload gap, and that gap.
const magazineProbe = (S, champ, augs) => {
  const { a, p, es, step, now } = S(champ, augs, 1, (i, p) => ({ x: p.x + 300, y: p.y }));
  const times = [];
  const dmg = [];
  const off = a.bus.on('autoHit', ({ target, dmg: d }) => { if (target === es[0]) { times.push(now()); dmg.push(d); } });
  step(6000);
  off();
  let first = times.length;
  let gap = 0;
  for (let i = 1; i < times.length; i++) {
    const g = times[i] - times[i - 1];
    if (g > 450 && first === times.length) { first = i; gap = Math.round(g); }
  }
  return { mag: first, gap, ratio: dmg.length >= first ? Math.round((dmg[first - 1] / dmg[0]) * 10) / 10 : 0 };
};

await card('kip_extmag', 'kip', [], magazineProbe, (w, c) => w.mag === 10 && c.mag === 6);
await card('kip_lastround', 'kip', [], magazineProbe, (w, c) => w.ratio >= 2.2 && c.ratio < 1.6);
await card('kip_speedloader', 'kip', ['kip_extmag', 'kip_lastround'], magazineProbe,
  (w, c) => w.gap > 0 && w.gap < 800 && c.gap >= 1300);

await card('kip_twin', 'kip', [],
  (S, champ, augs) => {
    const { p, step } = S(champ, augs, 0, () => ({ x: 0, y: 0 }), { noAuto: true });
    p.castE({ x: 1, y: 0 });
    step(7600);
    return p.castE({ x: 1, y: 0 });
  },
  (w, c) => w === true && c === false);

await card('kip_overclock', 'kip', [],
  (S, champ, augs) => {
    const { a, p, es, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 330, y: p.y }), { noAuto: true });
    let n = 0;
    const off = a.bus.on('damageDealt', ({ target }) => { if (target === es[0]) n++; });
    p.castE({ x: 200, y: 0 });
    step(2400);
    off();
    return n;
  },
  (w, c) => w >= c * 1.7);

await card('kip_scrap', 'kip', ['kip_twin', 'kip_overclock'],
  (S, champ, augs) => {
    const { a, p, es, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 330, y: p.y }), { noAuto: true });
    let big = 0;
    const off = a.bus.on('damageDealt', ({ target, dmg }) => { if (target === es[0]) big = Math.max(big, dmg); });
    p.castE({ x: 200, y: 0 });
    step(8400);
    off();
    return Math.round(big);
  },
  (w, c) => w >= 2 * c);

// ================================================================= Tessaly
await card('tes_wound', 'tessaly', [],
  (S, champ, augs) => {
    const { es, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 300, y: p.y }));
    step(4500);
    return es[0].bleed ?? 0;
  },
  (w, c) => w === 6 && c === 3);

await card('tes_letting', 'tessaly', [],
  (S, champ, augs) => {
    const { es, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 300, y: p.y }));
    const ar = es[0].stats.get('armor');
    step(1500);
    return Math.round(ar - es[0].stats.get('armor'));
  },
  (w, c) => w === 25 && c === 0);

await card('tes_redtide', 'tessaly', ['tes_wound', 'tes_letting'],
  (S, champ, augs) => {
    const { a, p, es, step } = S(champ, augs, 2, (i, p) => ({ x: p.x + (i ? 400 : 300), y: p.y + (i ? 60 : 0) }));
    step(2500);
    p.nextAttackAt = 1e15;
    const before = es[1].bleedUntil > p.combat.now ? es[1].bleed : 0;
    a.dealDamage(p, es[0], 1e7, 'other', 'wahr');
    step(50);
    return (es[1].bleedUntil > p.combat.now ? es[1].bleed : 0) - before;
  },
  (w, c) => w > 0 && c === 0);

await card('tes_barbed', 'tessaly', [],
  (S, champ, augs) => {
    const { p, es, lost, step } = S(champ, augs, 2, (i, p) => ({ x: p.x + 150 + i * 120, y: p.y }), { noAuto: true });
    p.castQ({ x: 300, y: 0 });
    step(600);
    return es.filter((u) => lost(u) > 0).length;
  },
  (w, c) => w === 2 && c === 1);

await card('tes_keelhaul', 'tessaly', [],
  (S, champ, augs) => {
    // Harpoon the far dummy; the reel drags it past the near one, just off the line.
    const { p, es, lost, step } = S(champ, augs, 2, (i, p) => ({ x: p.x + (i ? 190 : 300), y: p.y + (i ? 45 : 0) }), { noAuto: true });
    p.castQ({ x: 300, y: 0 });
    step(700);
    return lost(es[1]);
  },
  (w, c) => w > 0 && c === 0);

await card('tes_reel', 'tessaly', ['tes_barbed', 'tes_keelhaul'],
  (S, champ, augs) => {
    const { p, es, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 300, y: p.y }), { noAuto: true });
    p.facing = { x: -1, y: 0 };
    p.dash({ x: -1, y: 0 }); // spend the chainpull
    step(400);
    // Back to the open middle — the dash ended next to a rock that ate the harpoon.
    p.x = 960; p.y = 540;
    es[0].x = p.x + 250; es[0].y = p.y;
    p.castQ({ x: 1, y: 0 });
    step(600);
    return p.dashChargesAvail;
  },
  (w, c) => w === 1 && c === 0);

// =================================================================== Aeren
await card('aer_steady', 'aeren', [],
  (S, champ, augs) => {
    const { p, step } = S(champ, augs, 0, () => ({ x: 0, y: 0 }), { noAuto: true });
    step(1000);
    return Math.round(p.stats.get('damage') * 100) / 100;
  },
  (w, c) => w >= c * 1.35);

await card('aer_volley', 'aeren', [],
  (S, champ, augs) => {
    const { a, p, step } = S(champ, augs, 0, () => ({ x: 0, y: 0 }), { noAuto: true });
    step(100);
    const before = a.projectiles.length;
    p.castQ({ x: 1, y: 0 });
    return a.projectiles.filter((q) => q.alive).length - before;
  },
  (w, c) => w === 5 && c === 3);

await card('aer_eye', 'aeren', ['aer_steady', 'aer_volley'],
  (S, champ, augs) => {
    const { a, es, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 300, y: p.y }));
    let n = 0;
    const off = a.bus.on('damageDealt', ({ target, type }) => { if (target === es[0] && type === 'ability') n++; });
    step(3000);
    off();
    return n;
  },
  (w, c) => w > 0 && c === 0);

await card('aer_running', 'aeren', [],
  (S, champ, augs) => {
    const { a, p, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 300, y: p.y }));
    // Walk up and down the whole time: the planted-feet rule says no shots.
    const move = p.move.bind(p);
    p.move = (dt) => move(dt, { x: 0, y: Math.sin(p.combat.now / 250) > 0 ? 1 : -1 });
    let n = 0;
    const off = a.bus.on('autoHit', () => n++);
    step(2500);
    off();
    return n;
  },
  (w, c) => w > 0 && c === 0);

await card('aer_tailwind', 'aeren', [],
  (S, champ, augs) => {
    const { p, step } = S(champ, augs, 0, () => ({ x: 0, y: 0 }), { noAuto: true });
    const as0 = p.stats.get('attackSpeed');
    p.dash({ x: 1, y: 0 });
    step(400);
    return Math.round((p.stats.get('attackSpeed') / as0) * 100) / 100;
  },
  (w, c) => w >= 1.3 && c < 1.05);

await card('aer_cyclone', 'aeren', ['aer_running', 'aer_tailwind'],
  (S, champ, augs) => {
    const { p, es, lost, step } = S(champ, augs, 1, (i, p) => ({ x: p.x + 330, y: p.y }), { noAuto: true });
    p.facing = { x: 1, y: 0 };
    p.dash({ x: 1, y: 0 });
    step(500);
    return lost(es[0]);
  },
  // The control still brushes the dummy with the dash's wind trail.
  (w, c) => w > c * 2);

await page.evaluate(() => window.__CC.resumeClock());
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`[lane] ${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(18)} ${r.detail}`);
}
if (errors.length) console.log('[lane] console errors:', errors.slice(0, 4));
console.log(failed === 0 ? `[lane] all ${results.length} lane cards do what they say` : `[lane] ${failed}/${results.length} FAILED`);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
