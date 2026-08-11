import { Kit } from './kits';
import type { Player } from '../entities/Player';
import type { Unit } from '../entities/Unit';
import type { Vec } from '../core/geometry';

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
const AMP = (p: Player) => 1 + p.stats.get('abilityDamage');

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
const MELEE = { attackRange: 170, attackSpeed: 1.0, critChance: 0.05, armor: 12, magicResist: 10 };
const RANGED = { attackRange: 480, attackSpeed: 1.0, critChance: 0.05, armor: 7, magicResist: 8 };

export const NEW_KITS: Record<string, Kit> = {
  // -------------------------------------------------------------- Brannoc
  // Ember stacks are the whole kit: autos build them, the dash spends them.
  brannoc: {
    ranged: false,
    qRange: 300,
    cds: { Q: 7000, E: 12000, Dash: 4000 },
    base: { ...MELEE, maxHP: 316, moveSpeed: 305, damage: 24, attackSpeed: 1.18, armor: 15 },
    scales: ['ad'],
    kitLine: 'Passive ember · Q melt arc · E stoke · Dash furnace run',
    spec: { q: { kind: 'circle', radius: 140, at: 'cursor', range: 300 } },
    info: {
      passive: AI('Ember', 'Your attacks leave burning stacks. Everything else in the kit spends them.'),
      q: AI('Melt Arc', 'Leap and slam: 35 damage in a wide circle, leaving burning ground for 4s.'),
      e: AI('Stoke', 'Costs 12 health. +40% attack speed for 5s, and attacks apply two ember stacks.'),
      dash: AI('Furnace Run', 'Charge through enemies. Each ember stack consumed adds 8 damage.'),
    },
    onAutoHit: (p, t) => {
      if (!t.alive) return;
      const n = p.memory.stokeUntil && p.memory.stokeUntil > T(p) ? 2 : 1;
      for (let i = 0; i < n; i++) stacks(t, 'ember', T(p), 3000, 5);
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      const { x, y } = aimAt(p, d, 300);
      p.moveBy(x - p.x, y - p.y, true);
      p.combat.ring(x, y, 0xff7a3a, 140);
      for (const u of inRange(p, x, y, 140)) boom(p, u, (63 + 0.9 * AD(p)) * AMP(p));
      p.combat.addHazard({ x, y, r: 140, until: T(p) + 4000, dps: 15, team: 'player', color: 0xff7a3a });
    },
    castE: (p) => {
      // Costs health and heals nothing — the pack is explicit that Brannoc has
      // no sustain at all and trades his own health for tempo.
      p.hp = Math.max(1, p.hp - 12);
      p.memory.stokeUntil = T(p) + 5000;
      p.stats.set({ id: 'buff:stoke', stat: 'attackSpeed', pct: 0.4, expiresAt: T(p) + 5000 });
      p.combat.announce('Stoke', '#ff9a5a');
    },
    onDash: (p, d) => {
      p.moveBy(d.x * 260, d.y * 260, true);
      for (const u of inRange(p, p.x, p.y, 90)) {
        const em = readStacks(u, 'ember', T(p));
        (u as unknown as Record<string, number>).ember = 0;
        boom(p, u, (18 + em * 15 + 0.5 * AD(p)) * AMP(p));
        const a = Math.atan2(u.y - p.y, u.x - p.x);
        u.moveBy(Math.cos(a) * 90, Math.sin(a) * 90);
      }
      return true;
    },
  },

  // ------------------------------------------------------------ Skorrvald
  // Frost is applied slowly and cashed in all at once by E.
  skorrvald: {
    ranged: false,
    qRange: 200,
    cds: { Q: 9000, E: 11000, Dash: 5000 },
    base: { ...MELEE, maxHP: 340, moveSpeed: 270, damage: 27, armor: 22, magicResist: 16, attackSpeed: 1.0 },
    scales: ['ad'],
    kitLine: 'Passive frost · Q rime wall · E avalanche · Dash glacier step',
    spec: { q: { kind: 'self' }, e: { kind: 'circle', radius: 200, at: 'self' } },
    info: {
      passive: AI('Rime', 'Every third attack chills: enemies move 30% slower for 2s.'),
      q: AI('Rime Wall', 'Block 80% of incoming damage for 1.5s.'),
      e: AI('Avalanche', 'Shatter every chill within 200: 25 damage and a 1s root each.'),
      dash: AI('Glacier Step', 'A short dash ending in a frost burst. The longest invulnerability in the roster.'),
    },
    onAutoHit: (p, t) => {
      if (!t.alive) return;
      p.memory.axe = (p.memory.axe ?? 0) + 1;
      if (p.memory.axe % 3 !== 0) return;
      t.stats.set({ id: 'slow:rime', stat: 'moveSpeed', pct: -0.3, expiresAt: T(p) + 2000 });
      (t as unknown as Record<string, number>).frostUntil = T(p) + 2000;
    },
    fireQ: (p) => {
      p.memory.wallUntil = T(p) + 1500;
      p.addShield(p.maxHP * 0.35);
      p.combat.ring(p.x, p.y, 0x9fdfff, 90);
      p.combat.announce('Rime Wall', '#9fdfff');
    },
    castE: (p) => {
      p.combat.ring(p.x, p.y, 0x9fdfff, 200);
      for (const u of inRange(p, p.x, p.y, 200)) {
        const m = u as unknown as Record<string, number>;
        if ((m.frostUntil ?? 0) < T(p)) continue;
        m.frostUntil = 0;
        boom(p, u, (45 + 0.7 * AD(p)) * AMP(p), 'magisch');
        u.ctrlUntil = Math.max(u.ctrlUntil, T(p) + 1000);
      }
    },
    onDash: (p, d) => {
      p.invulnUntil = T(p) + 340;
      p.moveBy(d.x * 180, d.y * 180, true);
      p.combat.ring(p.x, p.y, 0x9fdfff, 90);
      for (const u of inRange(p, p.x, p.y, 90)) {
        boom(p, u, (22 + 0.45 * AD(p)) * AMP(p), 'magisch');
        u.stats.set({ id: 'slow:rime', stat: 'moveSpeed', pct: -0.3, expiresAt: T(p) + 2000 });
        (u as unknown as Record<string, number>).frostUntil = T(p) + 2000;
      }
      return true;
    },
  },

  // ----------------------------------------------------------------- Nyth
  // Glass: fastest attacks, two dash charges, no defence whatsoever.
  nyth: {
    ranged: false,
    qRange: 250,
    cds: { Q: 6000, E: 14000, Dash: 3000 },
    base: { ...MELEE, maxHP: 180, moveSpeed: 356, damage: 15, attackSpeed: 2.2, attackRange: 150, armor: 6 },
    scales: ['ad'],
    kitLine: 'Passive rend · Q umbra lash · E veilbreak · Dash phase tear',
    spec: { q: { kind: 'line', range: 250, width: 44 } },
    info: {
      passive: AI('Rend', 'Hitting the same target repeatedly stacks +15% attack damage, up to four.'),
      q: AI('Umbra Lash', 'A lash that marks what it hits for 4s.'),
      e: AI('Veilbreak', 'Costs 15 health. Untargetable briefly; everything within 220 takes 20% more damage for 5s.'),
      dash: AI('Phase Tear', 'Two charges, passes through terrain. Your next attack within 1.2s crits.'),
    },
    onAutoHit: (p, t) => {
      if (!t.alive) return;
      const same = lastTarget.get(p) === t;
      lastTarget.set(p, t);
      const n = same ? stacks(t, 'rend', T(p), 3000, 4) : 0;
      if (n > 0) boom(p, t, AD(p) * 0.15 * n);
      if ((p.memory.phaseCritUntil ?? 0) > T(p)) {
        p.memory.phaseCritUntil = 0;
        boom(p, t, AD(p) * 1.5);
        p.combat.ring(t.x, t.y, 0xcc88ff, 50);
      }
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      p.combat.flashLine(p.x, p.y, p.x + d.x * 250, p.y + d.y * 250, 0xcc88ff);
      for (const u of p.combat.units) {
        if (!u.alive || u.team !== 'enemy') continue;
        const rx = u.x - p.x;
        const ry = u.y - p.y;
        const along = rx * d.x + ry * d.y;
        if (along < 0 || along > 250 || Math.abs(rx * d.y - ry * d.x) > 22 + u.radius) continue;
        boom(p, u, (50 + 1.0 * AD(p)) * AMP(p));
        (u as unknown as Record<string, number>).nythMarkUntil = T(p) + 4000;
      }
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
    onDash: (p, d) => {
      p.moveBy(d.x * 300, d.y * 300, true);
      p.memory.phaseCritUntil = T(p) + 1200;
      return true;
    },
  },

  // ---------------------------------------------------------------- Sunna
  // The glaive is a placed object: throw it, fight around it, dash to recall.
  sunna: {
    ranged: false,
    qRange: 300,
    cds: { Q: 8000, E: 13000, Dash: 4500 },
    base: { ...MELEE, maxHP: 250, moveSpeed: 313, damage: 20, attackSpeed: 1.43, attackRange: 205, armor: 10 },
    scales: ['ad'],
    kitLine: 'Passive sweep · Q sunnail · E zenith · Dash sunleap',
    spec: { q: { kind: 'circle', radius: 70, at: 'cursor', range: 300 } },
    info: {
      passive: AI('Sweep', 'Your swing carries through up to three enemies.'),
      q: AI('Sunnail', 'Pin the glaive to a spot: it burns everything within 70 for 6s.'),
      e: AI('Zenith', 'The glaive orbits you for 4s, striking constantly. Attacks are disabled while it does.'),
      dash: AI('Sunleap', 'Leap over enemies and land in a shockwave.'),
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      const { x, y } = aimAt(p, d, 300);
      p.memory.glaiveX = x;
      p.memory.glaiveY = y;
      p.combat.ring(x, y, 0xffd24a, 70);
      for (const u of inRange(p, x, y, 70)) boom(p, u, (54 + 0.9 * AD(p)) * AMP(p));
      p.combat.addHazard({ x, y, r: 70, until: T(p) + 6000, dps: 12, team: 'player', color: 0xffd24a });
    },
    castE: (p) => {
      p.memory.zenithUntil = T(p) + 4000;
      p.combat.announce('Zenith', '#ffd24a');
    },
    passiveTick: (p) => {
      if ((p.memory.zenithUntil ?? 0) < T(p)) return;
      if ((p.memory.zenithNext ?? 0) > T(p)) return;
      p.memory.zenithNext = T(p) + 250;
      p.combat.ring(p.x, p.y, 0xffd24a, 70);
      for (const u of inRange(p, p.x, p.y, 70)) boom(p, u, (18 + 0.32 * AD(p)) * AMP(p));
    },
    onDash: (p, d) => {
      p.moveBy(d.x * 240, d.y * 240, true);
      p.combat.ring(p.x, p.y, 0xffd24a, 90);
      for (const u of inRange(p, p.x, p.y, 90)) boom(p, u, (32 + 0.55 * AD(p)) * AMP(p));
      // Landing on the pinned glaive recalls it and refunds half the cooldown.
      const gx = p.memory.glaiveX ?? 0;
      const gy = p.memory.glaiveY ?? 0;
      if (gx && Math.hypot(p.x - gx, p.y - gy) < 110) {
        p.memory.glaiveX = 0;
        p.reduceCooldown('Dash', 2250);
        p.combat.announce('Recall', '#ffd24a');
      }
      return true;
    },
  },

  // -------------------------------------------------------------- Mirelle
  // Zone control: a lingering bog and a channelled tether.
  mirelle: {
    ranged: true,
    qRange: 420,
    cds: { Q: 8000, E: 12000, Dash: 5000 },
    base: { ...RANGED, maxHP: 170, moveSpeed: 296, damage: 19, abilityPower: 26, attackRange: 490 },
    scales: ['ap'],
    kitLine: 'Passive wisp · Q mire bloom · E drowned tether · Dash lantern step',
    spec: { q: { kind: 'circle', radius: 120, at: 'cursor', range: 420 } },
    info: {
      passive: AI('Wisp', 'Your attacks drift toward the nearest target on their own.'),
      q: AI('Mire Bloom', 'A bog for 5s: 7 damage per second and a 25% slow.'),
      e: AI('Drowned Tether', 'A beam that drains 9 per second for 3s.'),
      dash: AI('Lantern Step', 'Blink, leaving a gravelight that drags enemies inward for 1s.'),
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      const { x, y } = aimAt(p, d, 420);
      p.combat.ring(x, y, 0x66ddaa, 120);
      p.combat.addHazard({
        x, y, r: 120, until: T(p) + 5000,
        dps: 14 + 0.22 * AP(p), team: 'player', color: 0x66ddaa,
      });
      for (const u of inRange(p, x, y, 120)) {
        u.stats.set({ id: 'slow:mire', stat: 'moveSpeed', pct: -0.25, expiresAt: T(p) + 5000 });
      }
    },
    castE: (p) => {
      const t = p.combat.nearestEnemy(p, 280);
      if (!t) return;
      for (let i = 0; i < 6; i++) {
        p.combat.delay(i * 500, () => {
          if (!t.alive || !p.alive) return;
          p.combat.flashLine(p.x, p.y, t.x, t.y, 0x66ddaa);
          boom(p, t, (9 + 0.16 * AP(p)) * AMP(p), 'magisch');
          if (i === 5) p.addShield(20 + 0.2 * AP(p));
        });
      }
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
    base: { ...RANGED, maxHP: 204, moveSpeed: 316, damage: 15, attackSpeed: 2.85, attackRange: 470 },
    scales: ['ad'],
    kitLine: 'Passive six-shooter · Q scattershot · E clockwork turret · Dash recoil roll',
    spec: { q: { kind: 'cone', range: 260, angle: 60 } },
    info: {
      passive: AI('Six-Shooter', 'Six shots, then a reload. The dash reloads instantly.'),
      q: AI('Scattershot', 'Eight pellets in a cone. Full damage only up close.'),
      e: AI('Clockwork Turret', 'Plant a turret for 8s. It fires every 0.6s and can be destroyed.'),
      dash: AI('Recoil Roll', 'Reload instantly. Your next three shots deal 50% more.'),
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      const base = Math.atan2(d.y, d.x);
      for (const u of p.combat.units) {
        if (!u.alive || u.team !== 'enemy') continue;
        const dd = Math.hypot(u.x - p.x, u.y - p.y);
        if (dd > 260) continue;
        const a = Math.atan2(u.y - p.y, u.x - p.x);
        let diff = Math.abs(a - base);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff > Math.PI / 6) continue;
        // Hard falloff past 200px, exactly as the pack specifies.
        const falloff = dd <= 200 ? 1 : Math.max(0.25, 1 - (dd - 200) / 200);
        boom(p, u, (130 + 1.6 * AD(p)) * AMP(p) * falloff);
      }
      p.combat.ring(p.x, p.y, 0xffcc66, 120);
    },
    castE: (p, dir) => {
      const d = dir ?? p.facing;
      const { x, y } = aimAt(p, d, 200);
      p.combat.ring(x, y, 0xffcc66, 40);
      for (let i = 0; i < 13; i++) {
        p.combat.delay(i * 600, () => {
          const t = p.combat.units.find(
            (u) => u.alive && u.team === 'enemy' && Math.hypot(u.x - x, u.y - y) < 300,
          );
          if (!t) return;
          p.combat.flashLine(x, y, t.x, t.y, 0xffcc66);
          boom(p, t, (15 + 0.35 * AD(p)) * AMP(p));
        });
      }
    },
    onDash: (p, d) => {
      p.moveBy(d.x * 250, d.y * 250, true);
      p.resetAutoAttack();
      p.stats.set({ id: 'buff:recoil', stat: 'damage', pct: 0.5, expiresAt: T(p) + 2000 });
      return true;
    },
  },

  // -------------------------------------------------------------- Tessaly
  // Everything pulls: the dash pulls her in, the Q pulls them to her.
  tessaly: {
    ranged: true,
    qRange: 350,
    cds: { Q: 8000, E: 15000, Dash: 5000 },
    base: { ...RANGED, maxHP: 196, moveSpeed: 305, damage: 22, armor: 10, attackSpeed: 1.33, attackRange: 460 },
    scales: ['ad'],
    kitLine: 'Passive bleed · Q harpoon · E bloodtide · Dash chainpull',
    spec: { q: { kind: 'line', range: 350, width: 40 } },
    info: {
      passive: AI('Bleed', 'Your attacks bleed for 4 per second, stacking three times.'),
      q: AI('Harpoon', 'Drag the first enemy hit 150 toward you and root it.'),
      e: AI('Bloodtide', 'Costs 10 health. For 6s, killing a bleeding enemy grants a shield and attack speed.'),
      dash: AI('Chainpull', 'Hits an enemy: you are pulled to them. Hits nothing: a plain dash.'),
    },
    onAutoHit: (p, t) => {
      if (t.alive) p.combat.addBurn(t, 4, 3000);
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      let best: Unit | null = null;
      let bestAlong = 1e9;
      for (const u of p.combat.units) {
        if (!u.alive || u.team !== 'enemy') continue;
        const rx = u.x - p.x;
        const ry = u.y - p.y;
        const along = rx * d.x + ry * d.y;
        if (along < 0 || along > 350 || Math.abs(rx * d.y - ry * d.x) > 20 + u.radius) continue;
        if (along < bestAlong) { bestAlong = along; best = u; }
      }
      p.combat.flashLine(p.x, p.y, p.x + d.x * 350, p.y + d.y * 350, 0xdd5577);
      if (!best) return;
      boom(p, best, (54 + 1.1 * AD(p)) * AMP(p));
      const a = Math.atan2(p.y - best.y, p.x - best.x);
      best.moveBy(Math.cos(a) * 150, Math.sin(a) * 150);
      best.ctrlUntil = Math.max(best.ctrlUntil, T(p) + 800);
    },
    castE: (p) => {
      p.hp = Math.max(1, p.hp - 10);
      p.memory.tideUntil = T(p) + 6000;
      p.combat.announce('Bloodtide', '#dd5577');
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
        const a = Math.atan2(target.y - p.y, target.x - p.x);
        const dd = Math.hypot(target.x - p.x, target.y - p.y) - 60;
        p.moveBy(Math.cos(a) * dd, Math.sin(a) * dd, true);
        boom(p, target, (27 + 0.55 * AD(p)) * AMP(p));
      } else {
        p.moveBy(d.x * 200, d.y * 200, true);
      }
      return true;
    },
  },

  // ---------------------------------------------------------------- Aeren
  // Mobility and lines: two dash charges, a wind trail, a wall.
  aeren: {
    ranged: true,
    qRange: 360,
    cds: { Q: 5000, E: 16000, Dash: 4000 },
    base: { ...RANGED, maxHP: 180, moveSpeed: 336, damage: 17, attackSpeed: 1.67, attackRange: 480 },
    scales: ['ad'],
    kitLine: 'Passive pierce · Q splitshaft · E stormline · Dash gust step',
    spec: { q: { kind: 'line', range: 360, width: 36 } },
    info: {
      passive: AI('Pierce', 'Your shots pass through two enemies.'),
      q: AI('Splitshaft', 'A piercing arrow. Fires a three-arrow fan when you have not just moved.'),
      e: AI('Stormline', 'A wall of wind for 4s: crossing it deals 20 damage and slows heavily.'),
      dash: AI('Gust Step', 'Two charges, leaving a wind trail that damages and shoves.'),
    },
    fireQ: (p, dir) => {
      const d = dir ?? p.facing;
      // Standing still charges the shot into a fan — rewards holding position,
      // which is the counterweight to having the most mobility in the roster.
      const charged = p.isStationary;
      const angles = charged ? [-0.18, 0, 0.18] : [0];
      for (const off of angles) {
        const a = Math.atan2(d.y, d.x) + off;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        p.combat.flashLine(p.x, p.y, p.x + dx * 360, p.y + dy * 360, 0xaaf0ff);
        let hits = 0;
        for (const u of p.combat.units) {
          if (!u.alive || u.team !== 'enemy' || hits >= 3) continue;
          const rx = u.x - p.x;
          const ry = u.y - p.y;
          const along = rx * dx + ry * dy;
          if (along < 0 || along > 360 || Math.abs(rx * dy - ry * dx) > 18 + u.radius) continue;
          hits++;
          boom(p, u, ((charged ? 47 : 40) + 0.9 * AD(p)) * AMP(p));
        }
      }
    },
    castE: (p, dir) => {
      const d = dir ?? p.facing;
      const { x, y } = aimAt(p, d, 300);
      p.combat.ring(x, y, 0xaaf0ff, 150);
      p.combat.addHazard({ x, y, r: 150, until: T(p) + 4000, dps: 10, team: 'player', color: 0xaaf0ff });
      for (const u of inRange(p, x, y, 150)) {
        boom(p, u, (36 + 0.55 * AD(p)) * AMP(p), 'magisch');
        u.stats.set({ id: 'slow:storm', stat: 'moveSpeed', pct: -0.4, expiresAt: T(p) + 2000 });
      }
    },
    onDash: (p, d) => {
      const ox = p.x;
      const oy = p.y;
      p.moveBy(d.x * 280, d.y * 280, true);
      p.combat.addHazard({
        x: (ox + p.x) / 2, y: (oy + p.y) / 2, r: 80,
        until: T(p) + 2500, dps: 15, team: 'player', color: 0xaaf0ff,
      });
      return true;
    },
  },
};
