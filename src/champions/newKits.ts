import { Kit } from './kits';
import type { Player } from '../entities/Player';
import type { Unit } from '../entities/Unit';
import { norm, type Vec } from '../core/geometry';
import { run } from '../core/run';

/**
 * The eight original champions, built from champion-pack/champions.json.
 *
 * These replace the League-derived roster. The pack ships each champion's
 * auto / dash / Q / E with cooldowns, damage, reach and a note describing the
 * mechanic, and the kits below implement those notes rather than paraphrasing
 * them — the JSON is the design document, this file is the implementation.
 *
 * Everything here goes through public Combat/Player API only, so this file
 * stays independent of kits.ts and its private helpers. Each `spec` is filled
 * in honestly, because scripts/hitboxcheck.mjs asserts that the damage lands
 * inside the declared shape — a kit that lies about its own reach fails the
 * gate rather than shipping and confusing a player.
 */

const AI = (name: string, desc: string) => ({ name, desc });
const T = (p: Player) => p.combat.now;
const AD = (p: Player) => p.stats.get('damage');
const AP = (p: Player) => p.stats.get('abilityPower');
// abilityDamage is already a multiplier with a base of 1.0 (config.ts). This
// read `1 + ...` and so doubled every ability of the new roster — found when a
// scattershot pellet measured 72 against an expected 38.
const AMP = (p: Player) => p.stats.get('abilityDamage');
/** Owned lane augment (augments/lanes.ts). Kits read ownership; augments never reach into kits. */
const has = (id: string) => run.augments.some((a) => a.id === id);

/** Enemies within `r` of a point. */
function inRange(p: Player, x: number, y: number, r: number): Unit[] {
  return p.combat.units.filter(
    (u) => u.alive && u.team === 'enemy' && Math.hypot(u.x - x, u.y - y) <= r + u.radius,
  );
}

/** Deal ability damage and keep the bookkeeping in one place. */
function boom(p: Player, u: Unit, dmg: number, school: 'physisch' | 'magisch' = 'physisch'): void {
  p.combat.dealDamage(p, u, dmg, 'ability', school);
}

/** Aim point clamped to reach — the same contract as kits.ts `aimAt`. */
function aimAt(p: Player, d: Vec, range: number): { x: number; y: number } {
  const dist = p.aimDist > 0 ? Math.min(p.aimDist, range) : range;
  return { x: p.x + d.x * dist, y: p.y + d.y * dist };
}

/** Stack counter kept on the unit, expiring on its own clock. */
function stacks(u: Unit, key: string, now: number, addMs: number, cap: number): number {
  const m = u as unknown as Record<string, number>;
  if ((m[`${key}Until`] ?? 0) < now) m[key] = 0;
  m[key] = Math.min(cap, (m[key] ?? 0) + 1);
  m[`${key}Until`] = now + addMs;
  return m[key];
}

function readStacks(u: Unit, key: string, now: number): number {
  const m = u as unknown as Record<string, number>;
  return (m[`${key}Until`] ?? 0) < now ? 0 : (m[key] ?? 0);
}

const lastTarget = new WeakMap<Player, Unit>();
/** Tessaly's chainpull: whom the slide is heading for. */
const chainTarget = new WeakMap<Player, Unit>();

/** Enemies within r of the segment (x0,y0)->(player): what a charge passed through. */
function alongPath(p: Player, x0: number, y0: number, r: number): Unit[] {
  const dx = p.x - x0;
  const dy = p.y - y0;
  const L2 = dx * dx + dy * dy || 1;
  return p.combat.units.filter((u) => {
    if (!u.alive || u.team !== 'enemy') return false;
    const t = Math.max(0, Math.min(1, ((u.x - x0) * dx + (u.y - y0) * dy) / L2));
    return Math.hypot(u.x - (x0 + dx * t), u.y - (y0 + dy * t)) <= r + u.radius;
  });
}

/**
 * Drag a unit toward the player over ~180ms, drawing the chain every step.
 * The old harpoon moved its target 150px in one frame: the effect happened, but
 * nobody saw a pull, they saw an enemy jump.
 */
function reelIn(p: Player, u: Unit, distance: number, color: number, onStep?: (u: Unit) => boolean): void {
  const steps = 6;
  let stopped = false;
  for (let i = 0; i < steps; i++) {
    p.combat.delay(i * 30, () => {
      if (!u.alive || stopped) return;
      const a = Math.atan2(p.y - u.y, p.x - u.x);
      const room = Math.hypot(p.x - u.x, p.y - u.y) - p.radius - u.radius - 6;
      const step = Math.max(0, Math.min(distance / steps, room));
      u.moveBy(Math.cos(a) * step, Math.sin(a) * step);
      p.combat.flashLine(p.x, p.y, u.x, u.y, color);
      if (onStep?.(u)) stopped = true;
    });
  }
}

/** Carry the player to (x, y) over `ms`, then land — a leap you can watch. */
function leap(p: Player, x: number, y: number, ms: number, land: () => void): void {
  const steps = Math.max(2, Math.round(ms / 28));
  const sx = (x - p.x) / steps;
  const sy = (y - p.y) / steps;
  for (let i = 1; i <= steps; i++) {
    p.combat.delay(i * 28, () => {
      if (!p.alive) return;
      p.moveBy(sx, sy, true);
      if (i === steps) land();
    });
  }
}

/**
 * Ward: temporary health with a cap (pack: wardSystem). The pack forbids any
 * ability from restoring real health; sustain exists only as capped, earned
 * ward. Implemented on the engine's shield, which absorbs damage first.
 */
function ward(p: Player, amount: number, cap: number): void {
  const room = cap - p.shield;
  if (room > 0) p.addShield(Math.min(amount, room));
}

/** Run `fn` for every enemy death this fight. The bus is cleared per round. */
function onKill(p: Player, fn: (enemy: Unit) => void): () => void {
  return p.combat.bus.on('enemyDeath', ({ enemy }) => fn(enemy));
}

/** Thrown object that travels `dist` along d and calls `arrive` where it stops. */
function lob(
  p: Player, d: Vec, dist: number, speed: number, radius: number, color: number, spin: boolean,
  arrive: (x: number, y: number) => void,
): void {
  p.combat.spawnProjectile({
    x: p.x, y: p.y, dirX: d.x, dirY: d.y, speed, radius, color, spin,
    team: 'player', maxHits: 99, maxDist: Math.max(20, dist),
    onHit: () => {}, // flies over enemies: the landing is the hitbox
    onExpire: arrive,
  });
}

// ---------------------------------------------------------------- lane helpers
// Shared by a kit and the lane augments that rewrite it (augments/lanes.ts).

// Brannoc: Banked Coals raises the ember cap and how long a stack lasts.
const emberCap = () => (has('bra_banked') ? 8 : 5);
const emberMs = () => (has('bra_banked') ? 5000 : 3000);

/**
 * Add `n` embers. With Flashpoint an enemy that reaches the cap detonates —
 * damage around it and two embers on everything caught, which can chain. A
 * unit detonates at most once a second, so a tight pack cannot loop forever.
 */
function addEmbers(p: Player, u: Unit, n: number): void {
  let k = 0;
  for (let i = 0; i < n; i++) k = stacks(u, 'ember', T(p), emberMs(), emberCap());
  const m = u as unknown as Record<string, number>;
  if (!has('bra_flashpoint') || k < emberCap() || (m.flashUntil ?? 0) > T(p)) return;
  m.ember = 0;
  m.flashUntil = T(p) + 1000;
  const x = u.x;
  const y = u.y;
  // A short beat between links, so a chain reads as a chain.
  p.combat.delay(90, () => {
    p.combat.ring(x, y, 0xffb066, 110);
    for (const v of inRange(p, x, y, 110)) {
      boom(p, v, (30 + 0.6 * AD(p)) * AMP(p));
      if (v !== u && v.alive) addEmbers(p, v, 2);
    }
  });
}

/** Skorrvald's chill: 30% slow for 2s that Avalanche can shatter. Deep Freeze counts them. */
function chill(p: Player, u: Unit): void {
  const m = u as unknown as Record<string, number>;
  u.stats.set({ id: 'slow:rime', stat: 'moveSpeed', pct: -0.3, expiresAt: T(p) + 2000 });
  m.frostUntil = T(p) + 2000;
  if (!has('sko_deepfreeze') || (m.frozenUntil ?? 0) > T(p)) return;
  if (stacks(u, 'chills', T(p), 6000, 3) < 3) return;
  m.chills = 0;
  m.frozenUntil = T(p) + 1200;
  u.ctrlUntil = Math.max(u.ctrlUntil, T(p) + 1200);
  p.combat.ring(u.x, u.y, 0xdff6ff, 40);
  p.combat.procAt(u.x, u.y, 'FROZEN', '#dff6ff');
}

/** Skorrvald's Rime Wall is standing. */
const wallUp = (p: Player) => (p.memory.wallUntil ?? 0) >= T(p);

/** Nyth's mark. Long Shadow makes it last and strips armor while it does. */
function markNyth(p: Player, u: Unit): void {
  const long = has('nyt_longshadow');
  (u as unknown as Record<string, number>).nythMarkUntil = T(p) + (long ? 8000 : 4000);
  if (!long) return;
  u.stats.set({ id: 'debuff:shadow', stat: 'armor', flat: -30, expiresAt: T(p) + 8000 });
  u.stats.set({ id: 'debuff:shadowmr', stat: 'magicResist', flat: -30, expiresAt: T(p) + 8000 });
}

/** Umbra Lash: cracks out 250 and snaps back; each enemy struck once. */
function lash(p: Player, d: Vec): void {
  const struck = new Set<Unit>();
  p.combat.spawnProjectile({
    x: p.x, y: p.y, dirX: d.x, dirY: d.y, speed: 1300, radius: 11, color: 0xcc88ff,
    team: 'player', maxHits: 12, maxDist: 250, boomerangTo: p, spin: true,
    onHit: (u) => {
      if (struck.has(u)) return;
      struck.add(u);
      boom(p, u, (50 + 1.0 * AD(p)) * AMP(p));
      markNyth(p, u);
    },
  });
}

/** Pin Sunna's glaive: the landing hit, then the burning zone (Sunwell widens it). */
function pinGlaive(p: Player, gx: number, gy: number): void {
  const well = has('sun_sunwell');
  p.memory.glaiveX = gx;
  p.memory.glaiveY = gy;
  p.memory.glaiveUntil = T(p) + 6000;
  p.combat.ring(gx, gy, 0xffd24a, 70);
  for (const u of inRange(p, gx, gy, 70)) boom(p, u, (54 + 0.9 * AD(p)) * AMP(p));
  p.combat.addHazard({
    x: gx, y: gy, r: well ? 130 : 70, until: T(p) + 6000, dps: well ? 18 : 12, team: 'player', color: 0xffd24a,
  });
}

// Mirelle's bog is any live player zone in her colour.
const BOG = 0x66ddaa;
function inBog(p: Player, x: number, y: number): boolean {
  return p.combat.hazards.some(
    (h) => h.team === 'player' && h.color === BOG && h.until > T(p) && Math.hypot(x - h.x, y - h.y) <= h.r,
  );
}

function bog(p: Player, x: number, y: number, r: number, ms: number): void {
  p.combat.ring(x, y, BOG, r);
  p.combat.addHazard({ x, y, r, until: T(p) + ms, dps: 14 + 0.22 * AP(p), team: 'player', color: BOG });
  for (const u of inRange(p, x, y, r)) {
    u.stats.set({ id: 'slow:mire', stat: 'moveSpeed', pct: -0.25, expiresAt: T(p) + ms });
  }
}

/** A wisp from a bog death; Will-o'-Swarm lets it jump on `left - 1` more times. */
function wisp(p: Player, from: Unit, seen: Set<Unit>, left: number): void {
  const next = p.combat.units.find(
    (u) => u.alive && u.team === 'enemy' && !seen.has(u) && Math.hypot(u.x - from.x, u.y - from.y) < 400,
  );
  if (!next) return;
  seen.add(next);
  p.combat.spawnProjectile({
    x: from.x, y: from.y, dirX: next.x - from.x, dirY: next.y - from.y, speed: 700, radius: 8, color: BOG,
    // ignore: a jump spawns inside the enemy it leaves and would hit it again
    team: 'player', homing: next, maxDist: 600, ignore: from,
    onHit: (u) => {
      boom(p, u, (20 + 0.15 * AP(p)) * AMP(p), 'magisch');
      if (left > 1) wisp(p, u, seen, left - 1);
    },
  });
}

/** One Drowned Tether. Unbroken lengthens it, Siphon grows each tick. */
function tether(p: Player, t: Unit, reach: number, wardCap: number): void {
  const ticks = has('mir_unbroken') ? 9 : 6;
  const siphon = has('mir_siphon');
  let held = true;
  for (let i = 0; i < ticks; i++) {
    p.combat.delay(i * 500, () => {
      if (!held || !t.alive || !p.alive) { held = false; return; }
      if (Math.hypot(t.x - p.x, t.y - p.y) > reach) { held = false; return; }
      p.combat.flashLine(p.x, p.y, t.x, t.y, BOG);
      boom(p, t, (9 + 0.16 * AP(p)) * AMP(p) * (siphon ? 1.2 ** i : 1), 'magisch');
      if (i === ticks - 1) ward(p, 20, wardCap);
    });
  }
}

/** Kip's live turrets — Scrap Shot ricochets off them. */
const turrets = new WeakMap<Player, { x: number; y: number; until: number }[]>();

/** Tessaly's bleed: one stack (and one burn) while under the cap. */
function bleed(p: Player, u: Unit): void {
  const wound = has('tes_wound');
  const ms = wound ? 5000 : 3000;
  const before = readStacks(u, 'bleed', T(p));
  if (stacks(u, 'bleed', T(p), ms, wound ? 6 : 3) > before) p.combat.addBurn(u, 4, ms);
  if (has('tes_letting')) u.stats.set({ id: 'debuff:letting', stat: 'armor', flat: -25, expiresAt: T(p) + ms });
}

/** Keelhaul: a reeled enemy that runs into another one stuns both. */
function keelhaul(p: Player, u: Unit): boolean {
  const other = p.combat.units.find(
    (v) => v.alive && v.team === 'enemy' && v !== u && Math.hypot(v.x - u.x, v.y - u.y) <= u.radius + v.radius + 6,
  );
  if (!other) return false;
  for (const v of [u, other]) {
    v.ctrlUntil = Math.max(v.ctrlUntil, T(p) + 1000);
    boom(p, v, (40 + 0.6 * AD(p)) * AMP(p));
  }
  p.combat.ring((u.x + other.x) / 2, (u.y + other.y) / 2, 0xdd5577, 50);
  p.combat.procAt(u.x, u.y, 'KEELHAUL', '#dd5577');
  return true;
}

/** Aeren's Splitshaft: one arrow, or a fan when charged — five with Gale Volley. */
function splitshaft(p: Player, d: Vec, charged: boolean): void {
  const angles = !charged ? [0] : has('aer_volley') ? [-0.36, -0.18, 0, 0.18, 0.36] : [-0.18, 0, 0.18];
  for (const off of angles) {
    const a = Math.atan2(d.y, d.x) + off;
    p.combat.spawnProjectile({
      x: p.x, y: p.y, dirX: Math.cos(a), dirY: Math.sin(a), speed: 1400, radius: 9,
      color: 0xaaf0ff, team: 'player', maxHits: 3, maxDist: 360,
      onHit: (u) => boom(p, u, ((charged ? 47 : 40) + 0.9 * AD(p)) * AMP(p)),
    });
  }
}

/*
 * Pack numbers -> engine scale.
 *
 * champions.json is internally consistent but written on its own scale: 85-170
 * health, 9-16 damage, 186-246 move speed. This engine runs at roughly double
 * that (185-320 health, 16-23 damage, 295-335 speed), and its enemies carry
 * 190-300 base health BEFORE per-round scaling. Imported raw, a champion needed
 * seventeen auto-attacks to kill one trash enemy — which is precisely the
 * reported "das game ist unmoeglich" and "alle fuehlen sich schwach an".
 *
 * The conversion keeps the pack's RELATIVE design intact — Nyth stays the glass
 * cannon, Skorrvald stays the wall — and moves only the absolute scale: health
 * x2.0, damage x1.7, move speed x1.45, attack ranges mapped onto the engine's
 * 170 melee / 460-490 ranged bands.
 *
 * The ranged band is the other half of "alle sind melee": the pack's 320-380
 * reach is shorter than this engine's MELEE champions used to have (160) once
 * the 1.6x camera zoom is accounted for, so an archer had to stand in the pile
 * to attack at all.
 */
const MELEE = { attackRange: 170, attackSpeed: 1.0, critChance: 0.05, armor: 12, magicResist: 10, projSpeed: 900 };
// projSpeed is REQUIRED for a ranged auto to travel. Leaving it off fell back
// to the 900 default here, but the old kits set it explicitly and the omission
// is the kind of gap that reads as 'the archer does nothing'.
// 540-580, deliberately ABOVE every enemy's ranged auto (now 370-430). A ranged
// champion whose reach is shorter than the enemy archer's is a melee champion
// with worse stats, which is what this roster shipped as.
const RANGED = { attackRange: 560, attackSpeed: 1.0, critChance: 0.05, armor: 7, magicResist: 8, projSpeed: 1000 };

export const NEW_KITS: Record<string, Kit> = {
  // -------------------------------------------------------------- Brannoc
  // Ember stacks are the whole kit: autos build them, the dash spends them.
  brannoc: {
    ranged: false,
    qRange: 300,
    cds: { Q: 7000, E: 12000, Dash: 4000 },
    base: { ...MELEE, maxHP: 316, moveSpeed: 305, damage: 24, attackSpeed: 1.18, armor: 15 },
    autoArc: { arc: 180 }, // pack: 'Trifft alle im Kegel'
    dashIFrames: 0.26,
    scales: ['ad'],
    kitLine: 'Passive ember · Q melt arc · E stoke · Dash furnace run',
    spec: { q: { kind: 'circle', radius: 140, at: 'cursor', range: 300 } },
    info: {
      passive: AI('Ember', 'Your swing hits everything in a 180° cone and leaves an ember stack (3s, up to 5). The rest of the kit spends them.'),
      q: AI('Melt Arc', 'Leap to the target point (up to 300) and slam: 63 (+90% AD) in a 140 circle, then burning ground for 4s (15/s).'),
      e: AI('Stoke', 'Costs 12 health. +40% attack speed for 5s, and each hit applies two ember stacks.'),
      dash: AI('Furnace Run', 'Charge 260 (0.26s invulnerable). Everything you pass through takes 18 (+50% AD) plus 15 per ember stack, and is knocked back.'),
    },
    onAutoHit: (p, t) => {
      if (!t.alive) return;
      const stoked = (p.memory.stokeUntil ?? 0) > T(p);
      addEmbers(p, t, stoked ? (has('bra_candle') ? 3 : 2) : 1);
      // Martyr's Forge: at 30% health or less the swing sets the ground alight
      if (has('bra_martyr') && p.hp <= p.maxHP * 0.3 && (p.memory.martyrFireAt ?? 0) < T(p)) {
        p.memory.martyrFireAt = T(p) + 200; // one patch per swing, however many it cleaves
        p.combat.addHazard({ x: t.x, y: t.y, r: 50, until: T(p) + 2000, dps: 40, team: 'player', color: 0xff5a3a });
      }
    },
    passiveTick: (p) => {
      if (!has('bra_martyr')) return;
      // Martyr's Forge: every 10 health lost embers everything within 250
      if (p.memory.martyrHp === undefined || p.hp > p.memory.martyrHp) p.memory.martyrHp = p.hp;
      const n = Math.floor((p.memory.martyrHp - p.hp) / 10);
      if (n <= 0) return;
      p.memory.martyrHp -= n * 10;
      p.combat.ring(p.x, p.y, 0xff5a3a, 250);
      for (const u of inRange(p, p.x, p.y, 250)) addEmbers(p, u, n);
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      const { x, y } = aimAt(p, d, 300);
      // A leap you can watch (~220ms), then the slam. It used to be a one-frame
      // teleport: the damage was right, the jump was invisible.
      leap(p, x, y, 220, () => {
        p.combat.ring(p.x, p.y, 0xff7a3a, 140);
        for (const u of inRange(p, p.x, p.y, 140)) boom(p, u, (63 + 0.9 * AD(p)) * AMP(p));
        p.combat.addHazard({ x: p.x, y: p.y, r: 140, until: T(p) + 4000, dps: 15, team: 'player', color: 0xff7a3a });
        if (!has('bra_furnace_heart')) return;
        // Furnace Heart: the slam sets off every ember within 300
        for (const u of inRange(p, p.x, p.y, 300)) {
          const em = readStacks(u, 'ember', T(p));
          if (em <= 0) continue;
          (u as unknown as Record<string, number>).ember = 0;
          p.combat.ring(u.x, u.y, 0xffb066, 40);
          boom(p, u, 12 * em * AMP(p));
        }
      });
    },
    castE: (p) => {
      // Costs health and heals nothing — the pack is explicit that Brannoc has
      // no sustain at all and trades his own health for tempo.
      const candle = has('bra_candle');
      const ms = candle ? 9000 : 5000;
      p.hp = Math.max(1, p.hp - (candle ? 25 : 12));
      p.memory.stokeUntil = T(p) + ms;
      p.stats.set({ id: 'buff:stoke', stat: 'attackSpeed', pct: 0.4, expiresAt: T(p) + ms });
      if (candle) p.stats.set({ id: 'buff:candle', stat: 'moveSpeed', pct: 0.25, expiresAt: T(p) + ms });
      p.combat.announce('Stoke', '#ff9a5a');
    },
    onDash: (p) => {
      // The body slides the full 260px; whatever it ran through pays on arrival.
      p.memory.chargeX = p.x;
      p.memory.chargeY = p.y;
      return 260;
    },
    onDashEnd: (p) => {
      const heart = has('bra_furnace_heart');
      for (const u of alongPath(p, p.memory.chargeX ?? p.x, p.memory.chargeY ?? p.y, 60)) {
        const em = readStacks(u, 'ember', T(p));
        if (!heart) (u as unknown as Record<string, number>).ember = 0;
        boom(p, u, (18 + em * 15 + 0.5 * AD(p)) * AMP(p));
        if (heart && em > 0) addEmbers(p, u, em); // Furnace Heart: the run doubles them
        const a = Math.atan2(u.y - p.y, u.x - p.x);
        u.moveBy(Math.cos(a) * 90, Math.sin(a) * 90);
      }
      p.combat.ring(p.x, p.y, 0xff7a3a, 90);
    },
  },

  // ------------------------------------------------------------ Skorrvald
  // Frost is applied slowly and cashed in all at once by E.
  skorrvald: {
    ranged: false,
    qRange: 200,
    cds: { Q: 9000, E: 11000, Dash: 5000 },
    base: { ...MELEE, maxHP: 340, moveSpeed: 270, damage: 27, armor: 22, magicResist: 16, attackSpeed: 1.0 },
    autoArc: { arc: 110 },
    dashIFrames: 0.34, // the longest in the roster, as the pack says
    // Rime Wall: 80% of FRONTAL damage blocked while the wall stands; every
    // blocked hit banks 6 ward (cap 40). Damage from behind gets through —
    // which way you face is the whole skill of the button.
    incomingMult: (p, src, amount) => {
      if (!wallUp(p) || !src) return 1;
      const fx = src.x - p.x;
      const fy = src.y - p.y;
      if (fx * p.facing.x + fy * p.facing.y <= 0) return 1;
      ward(p, 6, has('sko_glacial') ? 80 : 40);
      // Mirror Ice: the blocked hit goes back where it came from (next tick —
      // never re-enter dealDamage from inside it)
      if (has('sko_mirror')) {
        p.combat.delay(0, () => {
          if (!src.alive) return;
          p.combat.flashLine(p.x, p.y, src.x, src.y, 0xdff6ff);
          p.combat.dealDamage(p, src, amount * 0.6, 'reflect');
        });
      }
      return 0.2;
    },
    passiveTick: (p) => {
      if (!has('sko_bastion')) return;
      // Living Bastion: hold your ground half a second and the wall rises
      if (p.memory.stillSince === undefined || !p.isStationary) { p.memory.stillSince = T(p); return; }
      if (T(p) - p.memory.stillSince < 500) return;
      p.memory.wallUntil = Math.max(p.memory.wallUntil ?? 0, T(p) + 150);
      if ((p.memory.bastionRing ?? 0) > T(p)) return;
      p.memory.bastionRing = T(p) + 600;
      p.combat.ring(p.x, p.y, 0x9fdfff, 90);
    },
    scales: ['ad'],
    kitLine: 'Passive frost · Q rime wall · E avalanche · Dash glacier step',
    spec: { q: { kind: 'self' }, e: { kind: 'circle', radius: 200, at: 'self' } },
    info: {
      passive: AI('Rime', 'Your swing hits everything in a 110° arc. Every third swing chills: 30% slow for 2s.'),
      q: AI('Rime Wall', 'For 1.5s, hits from the FRONT are cut by 80%, and each blocked hit grants 6 ward (up to 40). Hits from behind get through.'),
      e: AI('Avalanche', 'Shatter every chill within 200: 45 (+70% AD) magic damage and a 1s root each.'),
      dash: AI('Glacier Step', 'Slide 180 with 0.34s invulnerability — the longest in the roster — and land in a 90 frost burst: 22 (+45% AD) and a chill.'),
    },
    onAutoHit: (p, t) => {
      if (!t.alive) return;
      p.memory.axe = (p.memory.axe ?? 0) + 1;
      if (!has('sko_blackice') && p.memory.axe % 3 !== 0) return; // Black Ice: every swing
      chill(p, t);
    },
    fireQ: (p) => {
      // The block lives in incomingMult above. The 35%-of-max-health shield
      // this used to grant was not in the pack, and it blocked from every side.
      p.memory.wallUntil = T(p) + (has('sko_glacial') ? 3000 : 1500);
      p.combat.ring(p.x, p.y, 0x9fdfff, 90);
      p.combat.announce('Rime Wall', '#9fdfff');
    },
    castE: (p) => {
      p.combat.ring(p.x, p.y, 0x9fdfff, 200);
      const fm = (u: Unit) => u as unknown as Record<string, number>;
      // Collected first: a Shatterpoint chill is for the NEXT Avalanche, not this one
      const shattered = inRange(p, p.x, p.y, 200).filter((u) => (fm(u).frostUntil ?? 0) >= T(p));
      for (const u of shattered) {
        fm(u).frostUntil = 0;
        const frozen = (fm(u).frozenUntil ?? 0) > T(p);
        boom(p, u, (45 + 0.7 * AD(p)) * AMP(p) * (frozen ? 1.5 : 1), 'magisch');
        u.ctrlUntil = Math.max(u.ctrlUntil, T(p) + 1000);
      }
      if (!has('sko_shatter')) return;
      for (const u of shattered) {
        p.combat.ring(u.x, u.y, 0xdff6ff, 120);
        for (const v of inRange(p, u.x, u.y, 120)) if (v !== u) chill(p, v);
      }
    },
    onDash: () => 180,
    onDashEnd: (p) => {
      p.combat.ring(p.x, p.y, 0x9fdfff, 90);
      for (const u of inRange(p, p.x, p.y, 90)) {
        boom(p, u, (22 + 0.45 * AD(p)) * AMP(p), 'magisch');
        chill(p, u);
      }
    },
  },

  // ----------------------------------------------------------------- Nyth
  // Glass: fastest attacks, two dash charges, no defence whatsoever.
  nyth: {
    ranged: false,
    qRange: 250,
    cds: { Q: 6000, E: 14000, Dash: 3000 },
    base: { ...MELEE, maxHP: 180, moveSpeed: 356, damage: 15, attackSpeed: 2.2, attackRange: 150, armor: 6 },
    dashCharges: 2,
    dashIFrames: 0.3,
    // The lash's mark is the economy of the kit: a kill on a marked enemy hands
    // back a dash charge and 8 ward (cap 24). It was written but never read.
    onCombatInit: (p) => {
      onKill(p, (e) => {
        if (((e as unknown as Record<string, number>).nythMarkUntil ?? 0) < T(p)) return;
        p.reduceCooldown('Dash', 99999);
        ward(p, 8, 24);
        if (has('nyt_harvest')) p.reduceCooldown('Q', 99999);
        if (has('nyt_ledger')) {
          // Death's Ledger: +10% damage per marked kill this round, ten at most
          p.memory.ledger = Math.min(10, (p.memory.ledger ?? 0) + 1);
          p.stats.set({ id: 'buff:ledger', stat: 'damage', pct: 0.1 * p.memory.ledger });
        }
        p.combat.procAt(e.x, e.y, 'REAPED', '#cc88ff');
      });
    },
    scales: ['ad'],
    kitLine: 'Passive rend · Q umbra lash · E veilbreak · Dash phase tear',
    spec: { q: { kind: 'line', range: 250, width: 22, speed: 1300 } },
    info: {
      passive: AI('Rend', 'Hitting the same target again stacks Rend: +15% of your attack damage per stack, up to four, for 3s.'),
      q: AI('Umbra Lash', 'A blade that cracks out 250 and snaps back: 50 (+100% AD), and marks what it hits for 4s. Killing a marked enemy refunds a dash charge and grants 8 ward (up to 24).'),
      e: AI('Veilbreak', 'Costs 15 health. Invulnerable for 0.8s; enemies within 220 lose 25 armor and magic resist for 5s.'),
      dash: AI('Phase Tear', 'Two charges. Slide 300 (0.3s invulnerable), through enemies and terrain. Your next attack within 1.2s deals +150%.'),
    },
    onAutoHit: (p, t) => {
      if (!t.alive) return;
      const same = lastTarget.get(p) === t;
      lastTarget.set(p, t);
      const n = same ? stacks(t, 'rend', T(p), 3000, 4) : 0;
      if (n > 0) boom(p, t, AD(p) * 0.15 * n);
      if ((p.memory.phaseCritUntil ?? 0) > T(p)) {
        p.memory.phaseCritUntil = 0;
        const ambush = has('nyt_ambush'); // Ambush: the strike lands on everything near
        for (const v of ambush ? inRange(p, t.x, t.y, 160) : [t]) boom(p, v, AD(p) * 1.5);
        p.combat.ring(t.x, t.y, 0xcc88ff, ambush ? 160 : 50);
        if (has('nyt_veilwalk')) p.reduceCooldown('Dash', 99999); // Veilwalker: the charge comes back
      }
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      // A real lash: a blade that cracks out 250 and snaps back. Each enemy is
      // struck once, on the way out; the return leg is the whip recoiling.
      lash(p, d);
      if (has('nyt_ledger')) p.combat.delay(200, () => lash(p, d)); // Death's Ledger: twice
    },
    castE: (p) => {
      p.hp = Math.max(1, p.hp - 15);
      p.invulnUntil = T(p) + 800;
      p.combat.ring(p.x, p.y, 0x8844cc, 220);
      for (const u of inRange(p, p.x, p.y, 220)) {
        u.stats.set({ id: 'debuff:veil', stat: 'armor', flat: -25, expiresAt: T(p) + 5000 });
        u.stats.set({ id: 'debuff:veilmr', stat: 'magicResist', flat: -25, expiresAt: T(p) + 5000 });
      }
    },
    onDash: (p) => {
      p.memory.phaseCritUntil = T(p) + 1450; // 1.2s after the ~250ms slide ends
      p.memory.tearX = p.x;
      p.memory.tearY = p.y;
      return 300;
    },
    onDashEnd: (p) => {
      // Veilwalker: everything the tear passed through is marked
      if (!has('nyt_veilwalk')) return;
      for (const u of alongPath(p, p.memory.tearX ?? p.x, p.memory.tearY ?? p.y, 50)) {
        markNyth(p, u);
        p.combat.ring(u.x, u.y, 0xcc88ff, 30);
      }
    },
  },

  // ---------------------------------------------------------------- Sunna
  // The glaive is a placed object: throw it, fight around it, dash to recall.
  sunna: {
    ranged: false,
    qRange: 300,
    cds: { Q: 8000, E: 13000, Dash: 4500 },
    base: { ...MELEE, maxHP: 250, moveSpeed: 313, damage: 20, attackSpeed: 1.43, attackRange: 205, armor: 10 },
    autoArc: { arc: 140, maxTargets: 3 }, // pack: 'Durchdringt bis zu 3 Gegner'
    dashIFrames: 0.22,
    // Zenith: the glaive is busy — unless Endless Noon frees your hands
    autoBlocked: (p) => !has('sun_noon') && (p.memory.zenithUntil ?? 0) > T(p),
    onAutoHit: (p) => {
      // Solar Tether: once per swing, the pinned glaive strikes around itself too
      if (!has('sun_tether') || !p.memory.glaiveX || (p.memory.glaiveUntil ?? 0) < T(p)) return;
      if (p.memory.tetherAt === T(p)) return;
      p.memory.tetherAt = T(p);
      const gx = p.memory.glaiveX;
      const gy = p.memory.glaiveY ?? 0;
      p.combat.flashLine(p.x, p.y, gx, gy, 0xffd24a);
      for (const u of inRange(p, gx, gy, 90)) boom(p, u, 0.5 * AD(p));
    },
    scales: ['ad'],
    kitLine: 'Passive sweep · Q sunnail · E zenith · Dash sunleap',
    spec: { q: { kind: 'circle', radius: 70, at: 'cursor', range: 300 } },
    info: {
      passive: AI('Sweep', 'Your glaive swing hits up to three enemies in a 140° arc.'),
      q: AI('Sunnail', 'Throw the glaive (up to 300). It pins where it stops — a wall stops it early — dealing 54 (+90% AD) within 70, then burning there for 6s (12/s).'),
      e: AI('Zenith', 'For 4s the glaive orbits you, hitting everything within 70 for 18 (+32% AD) every 0.25s. You cannot attack while it does.'),
      dash: AI('Sunleap', 'Leap 240 (0.22s invulnerable) and land in a 90 shockwave: 32 (+55% AD). Land on the pinned glaive to recall it and cut 2.25s off the dash.'),
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      const { x, y } = aimAt(p, d, 300);
      // The glaive is thrown, spinning, and pins where it actually stops — a
      // wall in the way pins it at the wall.
      lob(p, d, Math.hypot(x - p.x, y - p.y), 950, 14, 0xffd24a, true, (gx, gy) => pinGlaive(p, gx, gy));
    },
    castE: (p) => {
      p.memory.zenithStart = T(p);
      p.memory.zenithUntil = T(p) + (has('sun_noon') ? 6000 : 4000);
      p.combat.announce('Zenith', '#ffd24a');
    },
    passiveTick: (p) => {
      if ((p.memory.zenithUntil ?? 0) < T(p)) return;
      if ((p.memory.zenithNext ?? 0) > T(p)) return;
      p.memory.zenithNext = T(p) + 250;
      const r = has('sun_corona') ? 120 : 70;
      p.combat.ring(p.x, p.y, 0xffd24a, r);
      for (const u of inRange(p, p.x, p.y, r)) boom(p, u, (18 + 0.32 * AD(p)) * AMP(p));
    },
    onDash: (p) => {
      p.memory.leapX = p.x;
      p.memory.leapY = p.y;
      return 240;
    },
    onDashEnd: (p) => {
      p.combat.ring(p.x, p.y, 0xffd24a, 90);
      for (const u of inRange(p, p.x, p.y, 90)) boom(p, u, (32 + 0.55 * AD(p)) * AMP(p));
      // Landing on the pinned glaive recalls it and refunds half the cooldown.
      const gx = p.memory.glaiveX ?? 0;
      const gy = p.memory.glaiveY ?? 0;
      if (gx && Math.hypot(p.x - gx, p.y - gy) < 110) {
        p.memory.glaiveX = 0;
        p.reduceCooldown('Dash', 2250);
        p.combat.announce('Recall', '#ffd24a');
        if (has('sun_return')) {
          // Return Arc: the recalled glaive flies on along the leap and pins again
          const lx = p.x - (p.memory.leapX ?? p.x);
          const ly = p.y - (p.memory.leapY ?? p.y);
          const d = Math.hypot(lx, ly) > 1 ? norm(lx, ly) : p.facing;
          p.combat.spawnProjectile({
            x: p.x, y: p.y, dirX: d.x, dirY: d.y, speed: 1100, radius: 16, color: 0xffd24a, spin: true,
            team: 'player', maxHits: 99, maxDist: 400,
            onHit: (u) => boom(p, u, (60 + 1.2 * AD(p)) * AMP(p)),
            onExpire: (ex, ey) => pinGlaive(p, ex, ey),
          });
        }
      }
      // Dawnstep: in Zenith every leap is free and stretches it, 10s at most
      if (has('sun_dawnstep') && (p.memory.zenithUntil ?? 0) > T(p)) {
        p.memory.zenithUntil = Math.min((p.memory.zenithStart ?? T(p)) + 10000, p.memory.zenithUntil + 1000);
        p.reduceCooldown('Dash', 99999);
      }
    },
  },

  // -------------------------------------------------------------- Mirelle
  // Zone control: a lingering bog and a channelled tether.
  mirelle: {
    ranged: true,
    qRange: 420,
    cds: { Q: 8000, E: 12000, Dash: 5000 },
    base: { ...RANGED, maxHP: 170, moveSpeed: 296, damage: 19, abilityPower: 26, attackRange: 580 },
    dashIFrames: 0.16,
    // Mire Bloom's second half: an enemy that dies inside a bog releases a
    // wisp that strikes a new target for 20. Kills spread the zone's value.
    onCombatInit: (p) => {
      onKill(p, (e) => {
        if (inBog(p, e.x, e.y)) wisp(p, e, new Set([e]), has('mir_swarm') ? 3 : 1);
      });
    },
    onAutoHit: (p, t) => {
      // The Moor Remembers: a bolt on an enemy in a bog seeds a new one under it
      if (!has('mir_spread') || !t.alive || !inBog(p, t.x, t.y)) return;
      const m = t as unknown as Record<string, number>;
      if ((m.bogSeedAt ?? 0) > T(p)) return; // one seed per enemy per second
      m.bogSeedAt = T(p) + 1000;
      bog(p, t.x, t.y, 60, 3000);
    },
    scales: ['ap'],
    kitLine: 'Passive wisp · Q mire bloom · E drowned tether · Dash lantern step',
    spec: { q: { kind: 'circle', radius: 120, at: 'cursor', range: 420 } },
    info: {
      passive: AI('Wisp', 'Your bolts home in on their target.'),
      q: AI('Mire Bloom', 'Lob a lantern (up to 420). Where it lands, a 120 bog for 5s: 14 (+22% AP) per second and a 25% slow. An enemy dying in it releases a wisp that hits another enemy for 20 (+15% AP).'),
      e: AI('Drowned Tether', 'Tether the nearest enemy within 280: 9 (+16% AP) every 0.5s for 3s. Hold it the full 3s for 20 ward (up to 40). If it breaks, you get nothing.'),
      dash: AI('Lantern Step', 'Blink 220 (0.16s invulnerable). The gravelight left behind drags enemies within 160 inward for 1s.'),
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      const { x, y } = aimAt(p, d, 420);
      // A lantern is lobbed and the bog spreads where it lands.
      const rising = has('mir_rising');
      lob(p, d, Math.hypot(x - p.x, y - p.y), 800, 10, BOG, false, (bx, by) =>
        bog(p, bx, by, rising ? 160 : 120, rising ? 9000 : 5000));
    },
    castE: (p) => {
      // Hold the tether its full length (target in reach) for 20 ward, cap 40.
      // Let it break and you get nothing — the pack is explicit about that.
      const reach = has('mir_unbroken') ? 420 : 280;
      const t = p.combat.nearestEnemy(p, reach);
      if (!t) return;
      const twin = has('mir_twin');
      tether(p, t, reach, twin ? 60 : 40);
      if (!twin) return;
      // Twin Chains: the tether forks to the next-nearest enemy in reach
      const second = p.combat.units
        .filter((u) => u.alive && u.team === 'enemy' && u !== t && Math.hypot(u.x - p.x, u.y - p.y) <= reach)
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (second) tether(p, second, reach, 60);
    },
    onDash: (p, d) => {
      const ox = p.x;
      const oy = p.y;
      p.moveBy(d.x * 220, d.y * 220, true);
      p.combat.ring(ox, oy, 0x66ddaa, 60);
      for (let i = 0; i < 4; i++) {
        p.combat.delay(i * 250, () => {
          for (const u of inRange(p, ox, oy, 160)) {
            const a = Math.atan2(oy - u.y, ox - u.x);
            u.moveBy(Math.cos(a) * 24, Math.sin(a) * 24);
          }
        });
      }
      return true;
    },
  },

  // ------------------------------------------------------------------ Kip
  // Magazine economy: six shots, then a reload the dash can cancel.
  kip: {
    ranged: true,
    qRange: 260,
    cds: { Q: 6000, E: 14000, Dash: 3500 },
    base: { ...RANGED, maxHP: 204, moveSpeed: 316, damage: 15, attackSpeed: 2.85, attackRange: 545 },
    magazine: { size: 6, reloadMs: 1400 }, // the six-shooter that was only a description
    dashIFrames: 0.22,
    onAutoFire: (p) => {
      // Last Round: the shot that empties the magazine
      if (!has('kip_lastround') || p.ammo !== 0) return null;
      p.combat.procAt(p.x, p.y - 30, 'LAST ROUND', '#ffcc66');
      return { mult: 3, pierce: 3 };
    },
    onCombatInit: (p) => {
      // Speed Loader: an empty magazine throws a ring of pellets
      p.combat.bus.on('reload', () => {
        if (!has('kip_speedloader')) return;
        p.combat.ring(p.x, p.y, 0xffcc66, 120);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          p.combat.spawnProjectile({
            x: p.x, y: p.y, dirX: Math.cos(a), dirY: Math.sin(a), speed: 1300, radius: 6,
            color: 0xffcc66, team: 'player', maxHits: 1, maxDist: 220,
            onHit: (u) => boom(p, u, (20 + 0.3 * AD(p)) * AMP(p)),
          });
        }
      });
    },
    onAutoHit: (p, t) => {
      // Scrap Shot: a shot landing near a turret ricochets to a second enemy
      if (!has('kip_scrap')) return;
      const near = (turrets.get(p) ?? []).some((q) => q.until > T(p) && Math.hypot(t.x - q.x, t.y - q.y) < 300);
      if (!near) return;
      const next = p.combat.units.find(
        (u) => u.alive && u.team === 'enemy' && u !== t && Math.hypot(u.x - t.x, u.y - t.y) < 300,
      );
      if (!next) return;
      p.combat.spawnProjectile({
        x: t.x, y: t.y, dirX: next.x - t.x, dirY: next.y - t.y, speed: 1200, radius: 6, color: 0xffcc66,
        team: 'player', homing: next, ignore: t, maxDist: 400,
        onHit: (u) => boom(p, u, AD(p)),
      });
    },
    scales: ['ad'],
    kitLine: 'Passive six-shooter · Q scattershot · E clockwork turret · Dash recoil roll',
    spec: { q: { kind: 'cone', range: 260, angle: 60 } },
    info: {
      passive: AI('Six-Shooter', 'Six shots, then a 1.4s reload. Rapid fire while the magazine lasts.'),
      q: AI('Scattershot', 'Eight pellets across a 60° cone (260): each 33 (+40% AD), weaker past 200. Point blank, most of them land on one target. Costs three rounds.'),
      e: AI('Clockwork Turret', 'Plant a turret (up to 200 away) for 8s. Every 0.6s it shoots an enemy within 300 for 15 (+35% AD).'),
      dash: AI('Recoil Roll', 'Roll 250 (0.22s invulnerable) and reload instantly. +50% attack damage for 2s.'),
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      p.spendAmmo(3); // pack: the scattershot costs three rounds
      const base = Math.atan2(d.y, d.x);
      const ox = p.x;
      const oy = p.y;
      // Eight real pellets across the 60-degree cone. "Full damage only up
      // close" now falls out of the geometry: point blank, most pellets land on
      // one body; at the cone's edge the spread misses most of them.
      for (let i = 0; i < 8; i++) {
        const a = base + (i / 7 - 0.5) * (Math.PI / 3);
        p.combat.spawnProjectile({
          x: ox, y: oy, dirX: Math.cos(a), dirY: Math.sin(a), speed: 1500, radius: 6,
          color: 0xffcc66, team: 'player', maxHits: 1, maxDist: 260,
          onHit: (u) => {
            const dd = Math.hypot(u.x - ox, u.y - oy);
            const falloff = dd <= 200 ? 1 : Math.max(0.25, 1 - (dd - 200) / 200);
            boom(p, u, ((130 + 1.6 * AD(p)) / 4) * AMP(p) * falloff);
          },
        });
      }
    },
    castE: (p, dir) => {
      const d = dir ?? p.facing;
      const { x, y } = aimAt(p, d, 200);
      p.combat.ring(x, y, 0xffcc66, 40);
      // The turret is something you can see standing there: a brass base for
      // its whole 8s. A zero-damage zone is the engine's existing way to draw a
      // persistent marker on the ground.
      p.combat.addHazard({ x, y, r: 24, until: T(p) + 8000, dps: 0, team: 'player', color: 0xffcc66 });
      const live = (turrets.get(p) ?? []).filter((q) => q.until > T(p));
      live.push({ x, y, until: T(p) + 8000 });
      turrets.set(p, live);
      const every = has('kip_overclock') ? 300 : 600; // Overclock
      if (has('kip_scrap')) {
        // Scrap Shot: the turret goes out with a bang
        p.combat.delay(8000, () => {
          p.combat.ring(x, y, 0xff9944, 160);
          for (const u of inRange(p, x, y, 160)) boom(p, u, (80 + 1.2 * AD(p)) * AMP(p));
        });
      }
      for (let i = 0; i <= 7800 / every; i++) {
        p.combat.delay(i * every, () => {
          const t = p.combat.units.find(
            (u) => u.alive && u.team === 'enemy' && Math.hypot(u.x - x, u.y - y) < 300,
          );
          if (!t) return;
          p.combat.flashLine(x, y, t.x, t.y, 0xffcc66);
          boom(p, t, (15 + 0.35 * AD(p)) * AMP(p));
        });
      }
    },
    onDash: (p) => {
      p.reload();
      p.stats.set({ id: 'buff:recoil', stat: 'damage', pct: 0.5, expiresAt: T(p) + 2000 });
      return 250;
    },
  },

  // -------------------------------------------------------------- Tessaly
  // Everything pulls: the dash pulls her in, the Q pulls them to her.
  tessaly: {
    ranged: true,
    qRange: 350,
    cds: { Q: 8000, E: 15000, Dash: 5000 },
    base: { ...RANGED, maxHP: 196, moveSpeed: 305, damage: 22, armor: 10, attackSpeed: 1.33, attackRange: 540 },
    dashIFrames: 0.2,
    scales: ['ad'],
    kitLine: 'Passive bleed · Q harpoon · E bloodtide · Dash chainpull',
    spec: { q: { kind: 'line', range: 350, width: 24, speed: 1100 } },
    info: {
      passive: AI('Bleed', 'Your barbed shots bleed for 4 per second over 3s, stacking up to three times.'),
      q: AI('Harpoon', 'A harpoon that flies 350: 54 (+110% AD) to the first enemy hit, which is reeled 150 toward you and rooted for 0.8s.'),
      e: AI('Bloodtide', 'Costs 10 health. For 6s, every kill on a bleeding enemy grants 6 ward (up to 36) and +5% attack speed (up to ten times).'),
      dash: AI('Chainpull', 'An enemy ahead within 300: slide to it (0.2s invulnerable) and strike for 27 (+55% AD). Nothing ahead: a 200 dash.'),
    },
    onAutoHit: (p, t) => {
      // Bleed, three stacks at most: a new stack only while fewer than three
      // are running. Uncapped, it used to pile up to the engine's burn cap of 10.
      if (t.alive) bleed(p, t);
    },
    onCombatInit: (p) => {
      // Red Tide: a bleeding enemy that dies passes its stacks on
      onKill(p, (e) => {
        if (!has('tes_redtide')) return;
        const n = readStacks(e, 'bleed', T(p));
        if (n <= 0) return;
        p.combat.ring(e.x, e.y, 0xdd5577, 160);
        for (const u of inRange(p, e.x, e.y, 160)) for (let i = 0; i < n; i++) bleed(p, u);
      });
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      // The harpoon flies (you can sidestep it, and you can watch it miss), and
      // a catch is reeled in over ~180ms with the chain drawn — a visible pull.
      const keel = has('tes_keelhaul');
      p.combat.spawnProjectile({
        x: p.x, y: p.y, dirX: d.x, dirY: d.y, speed: 1100, radius: 12, color: 0xdd5577,
        team: 'player', maxHits: has('tes_barbed') ? 99 : 1, maxDist: 350, // Barbed Line: through all
        onHit: (u) => {
          boom(p, u, (54 + 1.1 * AD(p)) * AMP(p));
          u.ctrlUntil = Math.max(u.ctrlUntil, T(p) + 800);
          if (has('tes_reel')) p.reduceCooldown('Dash', 99999); // Reel and Strike
          reelIn(p, u, 150, 0xdd5577, keel ? (v) => keelhaul(p, v) : undefined);
        },
      });
    },
    castE: (p) => {
      p.hp = Math.max(1, p.hp - 10);
      p.combat.announce('Bloodtide', '#dd5577');
      // 6s: every kill on a BLEEDING enemy pays 6 ward (cap 36) and +5% attack
      // speed (up to 10 stacks). This used to cost 10 health and do nothing.
      let n = 0;
      const off = onKill(p, (e) => {
        if (readStacks(e, 'bleed', T(p)) <= 0) return;
        ward(p, 6, 36);
        n = Math.min(10, n + 1);
        p.stats.set({ id: 'buff:tide', stat: 'attackSpeed', pct: 0.05 * n, expiresAt: T(p) + 6000 });
        p.combat.procAt(e.x, e.y, 'BLOODTIDE', '#dd5577');
      });
      p.combat.delay(6000, off);
    },
    onDash: (p, d) => {
      let target: Unit | null = null;
      for (const u of p.combat.units) {
        if (!u.alive || u.team !== 'enemy') continue;
        const rx = u.x - p.x;
        const ry = u.y - p.y;
        const along = rx * d.x + ry * d.y;
        if (along < 0 || along > 300 || Math.abs(rx * d.y - ry * d.x) > 40 + u.radius) continue;
        target = u;
        break;
      }
      if (target) {
        // Slide along the chain to the target, strike on arrival.
        chainTarget.set(p, target);
        return Math.max(40, (target.x - p.x) * d.x + (target.y - p.y) * d.y - 60);
      }
      chainTarget.delete(p);
      return 200;
    },
    onDashEnd: (p) => {
      const t = chainTarget.get(p);
      chainTarget.delete(p);
      if (!t || !t.alive || Math.hypot(t.x - p.x, t.y - p.y) > 140) return;
      p.combat.flashLine(p.x, p.y, t.x, t.y, 0xdd5577);
      const rooted = t.ctrlUntil > T(p) && has('tes_reel'); // Reel and Strike: triple on the rooted
      boom(p, t, (27 + 0.55 * AD(p)) * AMP(p) * (rooted ? 3 : 1));
    },
  },

  // ---------------------------------------------------------------- Aeren
  // Mobility and lines: two dash charges, a wind trail, a wall.
  aeren: {
    ranged: true,
    qRange: 360,
    cds: { Q: 5000, E: 16000, Dash: 4000 },
    base: { ...RANGED, maxHP: 180, moveSpeed: 336, damage: 17, attackSpeed: 1.67, attackRange: 560 },
    autoPierce: 2, // pack: 'Durchdringt 2 Gegner in einer Linie'
    dashCharges: 2,
    dashIFrames: 0.18,
    onAutoFire: (p, t) => {
      // Eye of the Storm: standing still, every third shot looses a free fan
      if (!has('aer_eye') || !p.isStationary) return null;
      p.memory.eye = (p.memory.eye ?? 0) + 1;
      if (p.memory.eye % 3 === 0) splitshaft(p, norm(t.x - p.x, t.y - p.y), true);
      return null;
    },
    scales: ['ad'],
    kitLine: 'Passive pierce · Q splitshaft · E stormline · Dash gust step',
    spec: { q: { kind: 'line', range: 360, width: 18, speed: 1400 } },
    info: {
      passive: AI('Pierce', 'Your shots pass through two more enemies behind the first.'),
      q: AI('Splitshaft', 'An arrow that flies 360 and pierces three: 40 (+90% AD). Standing still, it is a three-arrow fan at 47 (+90% AD) each.'),
      e: AI('Stormline', 'A 300-wide wall of wind across your aim for 4s. It blocks enemy projectiles; crossing it costs 36 (+55% AD) magic damage and a 40% slow.'),
      dash: AI('Gust Step', 'Two charges. Slide 280 (0.18s invulnerable), leaving a wind trail for 2.5s (15/s).'),
    },
    fireQ: (p, dir) => {
      // Standing still charges the shot into a fan — rewards holding position,
      // which is the counterweight to having the most mobility in the roster.
      splitshaft(p, dir ?? p.facing, p.isStationary);
    },
    castE: (p, dir) => {
      const d = dir ?? p.facing;
      const { x, y } = aimAt(p, d, 300);
      // A real wall of wind across the aim, 300 long, for 4s: it eats enemy
      // projectiles (combat.addWall), and anything that crosses it takes 20 and
      // a 40% slow — once per crossing. It was a circle that did neither.
      const half = 150;
      const x1 = x - d.y * half;
      const y1 = y + d.x * half;
      const x2 = x + d.y * half;
      const y2 = y - d.x * half;
      const until = T(p) + 4000;
      p.combat.addWall(x1, y1, x2, y2, until);
      const side = new Map<Unit, number>(); // which side of the line each enemy was on
      const tick = () => {
        if (T(p) >= until || !p.alive) return;
        p.combat.flashLine(x1, y1, x2, y2, 0xaaf0ff);
        for (const u of p.combat.units) {
          if (!u.alive || u.team !== 'enemy') continue;
          const sgn = Math.sign((u.x - x1) * (y2 - y1) - (u.y - y1) * (x2 - x1));
          const along = ((u.x - x1) * (x2 - x1) + (u.y - y1) * (y2 - y1)) / (half * half * 4);
          const prev = side.get(u);
          side.set(u, sgn);
          if (prev === undefined || prev === sgn || along < 0 || along > 1) continue;
          boom(p, u, (36 + 0.55 * AD(p)) * AMP(p), 'magisch');
          u.stats.set({ id: 'slow:storm', stat: 'moveSpeed', pct: -0.4, expiresAt: T(p) + 2000 });
        }
        p.combat.delay(100, tick);
      };
      tick();
    },
    onDash: (p, d) => {
      p.memory.gustX = p.x;
      p.memory.gustY = p.y;
      if (has('aer_cyclone')) splitshaft(p, d, true); // Cyclone Step
      return 280;
    },
    onDashEnd: (p) => {
      // The trail lies along the path actually travelled, in three gusts.
      const ox = p.memory.gustX ?? p.x;
      const oy = p.memory.gustY ?? p.y;
      for (const f of [0.2, 0.5, 0.8]) {
        p.combat.addHazard({
          x: ox + (p.x - ox) * f, y: oy + (p.y - oy) * f, r: 55,
          until: T(p) + 2500, dps: 15, team: 'player', color: 0xaaf0ff,
        });
      }
    },
  },
};
