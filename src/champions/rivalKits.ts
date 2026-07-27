import type { EnemyAbilitySpec, Enemy } from '../entities/Enemy';
import type { Unit } from '../entities/Unit';
import { clampToArena, resolvePillars } from '../core/geometry';

/**
 * When a fighter enemy is dressed as a rival champion (see enemies.ts), it also
 * borrows a signature ability from that champion's kit — a bot-flavoured version
 * telegraphed and executed through the Enemy brain. These are adaptations of the
 * player kits (kits.ts), not the same code: they run on an Enemy, aim at the
 * player, and read the enemy's damage scale. One iconic ability per champion,
 * matched to whether that champion fights at melee or range.
 */

function clampBlink(x: number, y: number, r: number): { x: number; y: number } {
  const p = resolvePillars(x, y, r);
  return clampToArena(p.x, p.y, r);
}

/** Non-enemy units near a point (the player and any player-side summons). */
function foesNear(e: Enemy, x: number, y: number, r: number): Unit[] {
  return e.combat.units.filter(
    (u) => u.alive && u.team !== 'enemy' && Math.hypot(u.x - x, u.y - y) <= r + u.radius,
  );
}

const slowFoe = (t: Unit, e: Enemy, pct: number, ms: number, id: string) =>
  t.stats.set({ id: `rslow:${id}`, stat: 'moveSpeed', pct: -Math.min(0.95, pct), expiresAt: e.combat.now + ms });

/** Drag a unit toward the enemy (hooks/leash), leaving a small gap. */
function pull(t: Unit, e: Enemy, gap = 70): void {
  const dx = e.x - t.x;
  const dy = e.y - t.y;
  const d = Math.hypot(dx, dy) || 1;
  const dd = Math.max(0, d - gap);
  t.moveBy((dx / d) * dd, (dy / d) * dd);
}

/** Shove a unit away from the enemy (knockbacks). */
function shove(t: Unit, e: Enemy, dist: number): void {
  const dx = t.x - e.x;
  const dy = t.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  t.moveBy((dx / d) * dist, (dy / d) * dist);
}

// ---- parametric ability builders ------------------------------------------

interface LineOpts {
  id: string; color: number; dmg: number; cd?: number; range?: number; speed?: number;
  radius?: number; telegraphMs?: number; pierce?: boolean; slowPct?: number; slowMs?: number; rootMs?: number;
}
function champLine(o: LineOpts): EnemyAbilitySpec {
  const range = o.range ?? 760;
  const tel = o.telegraphMs ?? 560;
  return {
    shape: { kind: 'line', range, width: (o.radius ?? 15) * 2, speed: o.speed },
    id: o.id, cd: o.cd ?? 5000,
    condition: (_e, d) => d >= 150 && d <= range,
    telegraphMs: tel,
    drawTelegraph: (e, g, prog) => {
      const a = e.telegraphAim;
      g.lineStyle(6 + prog * 8, o.color, 0.25 + prog * 0.35);
      g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x + a.x * range, e.y + a.y * range); g.strokePath();
    },
    execute: (e) => {
      e.combat.spawnProjectile({
        x: e.x + e.telegraphAim.x * (e.radius + 8), y: e.y + e.telegraphAim.y * (e.radius + 8),
        dirX: e.telegraphAim.x, dirY: e.telegraphAim.y,
        speed: o.speed ?? 1000, radius: o.radius ?? 13, color: o.color, team: 'enemy',
        maxDist: range + 80, maxHits: o.pierce ? 5 : 1, blockedByPillars: !o.pierce,
        onHit: (t) => {
          e.combat.dealDamage(e, t, o.dmg * e.dmgScale(), 'ability');
          if (o.rootMs) slowFoe(t, e, 0.92, o.rootMs, o.id);
          else if (o.slowPct) slowFoe(t, e, o.slowPct, o.slowMs ?? 1000, o.id);
        },
      });
      e.memory.castPop = e.combat.now;
    },
  };
}

interface DashOpts { id: string; color: number; dmg: number; cd?: number; range?: number; radius?: number; slowPct?: number; slowMs?: number; }
function champDash(o: DashOpts): EnemyAbilitySpec {
  const range = o.range ?? 470;
  const radius = o.radius ?? 130;
  return {
    shape: { kind: 'dash', range },
    id: o.id, cd: o.cd ?? 6000,
    condition: (_e, d) => d >= 120 && d <= range,
    // 520ms against a 130 blast: a 300-speed champion covers 156px, so a clean
    // sidestep beats it. It used to be 420ms against 150 — 126px of escape from
    // a 150 blast, i.e. not dodgeable even with perfect play.
    telegraphMs: 520,
    drawTelegraph: (e, g, prog) => {
      const a = e.telegraphAim; const w = 30;
      g.fillStyle(o.color, 0.14 + prog * 0.22);
      g.fillTriangle(e.x - a.y * w, e.y + a.x * w, e.x + a.y * w, e.y - a.x * w, e.x + a.x * range * prog, e.y + a.y * range * prog);
      g.lineStyle(3, o.color, 0.7); g.strokeCircle(e.x, e.y, e.radius + 6);
    },
    execute: (e) => {
      // Land on the LOCKED telegraph aim, not on wherever the target stands at
      // impact. Re-reading the live position made this a guaranteed hit: the
      // dash homed onto you no matter how you moved during the wind-up.
      const a = e.telegraphAim;
      const t = e.target;
      const lockedD = Math.hypot(t.x - e.x, t.y - e.y) || 1;
      const gap = e.radius + t.radius + 6;
      const dd = Math.max(0, Math.min(range, lockedD) - gap);
      const p = clampBlink(e.x + a.x * dd, e.y + a.y * dd, e.radius);
      e.combat.flashLine(e.x, e.y, p.x, p.y, o.color);
      e.x = p.x; e.y = p.y;
      e.combat.ring(e.x, e.y, o.color, radius);
      for (const u of foesNear(e, e.x, e.y, radius)) {
        e.combat.dealDamage(e, u, o.dmg * e.dmgScale(), 'ability');
        if (o.slowPct) slowFoe(u, e, o.slowPct, o.slowMs ?? 900, o.id);
      }
      e.memory.castPop = e.combat.now;
    },
  };
}

interface NovaOpts { id: string; color: number; dmg: number; cd?: number; radius?: number; telegraphMs?: number; slowPct?: number; slowMs?: number; knockback?: number; }
function champNova(o: NovaOpts): EnemyAbilitySpec {
  const radius = o.radius ?? 175;
  return {
    shape: { kind: 'circle', radius, at: 'self' },
    id: o.id, cd: o.cd ?? 6500,
    condition: (_e, d) => d <= radius + 50,
    telegraphMs: o.telegraphMs ?? 650,
    drawTelegraph: (e, g, prog) => {
      g.lineStyle(4, o.color, 0.9); g.strokeCircle(e.x, e.y, radius);
      g.fillStyle(o.color, 0.1 + prog * 0.25); g.fillCircle(e.x, e.y, radius * prog);
    },
    execute: (e) => {
      e.combat.ring(e.x, e.y, o.color, radius);
      for (const u of foesNear(e, e.x, e.y, radius)) {
        e.combat.dealDamage(e, u, o.dmg * e.dmgScale(), 'ability');
        if (o.slowPct) slowFoe(u, e, o.slowPct, o.slowMs ?? 800, o.id);
        if (o.knockback) shove(u, e, o.knockback);
      }
      e.memory.castPop = e.combat.now;
    },
  };
}

interface HookOpts { id: string; color: number; dmg: number; cd?: number; range?: number; slowMs?: number; }
function champHook(o: HookOpts): EnemyAbilitySpec {
  const range = o.range ?? 620;
  return {
    shape: { kind: 'line', range, width: 26 },
    id: o.id, cd: o.cd ?? 7000,
    condition: (_e, d) => d >= 140 && d <= range,
    telegraphMs: 520,
    drawTelegraph: (e, g, prog) => {
      const a = e.telegraphAim;
      g.lineStyle(5 + prog * 5, o.color, 0.25 + prog * 0.4);
      g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x + a.x * range, e.y + a.y * range); g.strokePath();
    },
    execute: (e) => {
      e.combat.spawnProjectile({
        x: e.x, y: e.y, dirX: e.telegraphAim.x, dirY: e.telegraphAim.y,
        speed: 1300, radius: 14, color: o.color, team: 'enemy', maxDist: range + 40,
        onHit: (t) => {
          e.combat.dealDamage(e, t, o.dmg * e.dmgScale(), 'ability');
          pull(t, e, e.radius + t.radius + 12);
          slowFoe(t, e, 0.6, o.slowMs ?? 900, o.id);
        },
      });
      e.memory.castPop = e.combat.now;
    },
  };
}

interface HazardOpts { id: string; color: number; dmg: number; cd?: number; radius?: number; durMs?: number; delayMs?: number; range?: number; }
function champHazard(o: HazardOpts): EnemyAbilitySpec {
  const range = o.range ?? 560;
  const radius = o.radius ?? 125;
  return {
    // lands on the target's position, so it is a cursor-placed circle
    shape: { kind: 'circle', radius, at: 'cursor', range },
    id: o.id, cd: o.cd ?? 7000,
    condition: (_e, d) => d <= range,
    telegraphMs: o.delayMs ?? 850,
    drawTelegraph: (e, g, prog) => {
      if (!e.memory.hzSet) { e.memory.hzSet = 1; e.memory.hzX = e.target.x; e.memory.hzY = e.target.y; }
      g.lineStyle(3, o.color, 0.9); g.strokeCircle(e.memory.hzX, e.memory.hzY, radius);
      g.fillStyle(o.color, 0.08 + prog * 0.2); g.fillCircle(e.memory.hzX, e.memory.hzY, radius * prog);
    },
    execute: (e) => {
      e.memory.hzSet = 0;
      e.combat.addHazard({
        x: e.memory.hzX, y: e.memory.hzY, r: radius,
        until: e.combat.now + (o.durMs ?? 2600), dps: o.dmg * e.dmgScale(), team: 'enemy', color: o.color,
      });
      e.memory.castPop = e.combat.now;
    },
  };
}

interface BuffOpts { id: string; color: number; cd?: number; ms?: number; as?: number; dmg?: number; move?: number; ann?: string; }
function champBuff(o: BuffOpts): EnemyAbilitySpec {
  const ms = o.ms ?? 4000;
  return {
    shape: { kind: 'self' },
    id: o.id, cd: o.cd ?? 9000,
    condition: (e) => (e.memory.buffUntil ?? 0) <= e.combat.now,
    telegraphMs: 380,
    drawTelegraph: (e, g, prog) => {
      g.lineStyle(4, o.color, 0.4 + prog * 0.6); g.strokeCircle(e.x, e.y, e.radius + 8 + prog * 16);
    },
    execute: (e) => {
      const now = e.combat.now;
      e.memory.buffUntil = now + ms;
      if (o.as) e.stats.set({ id: `rbuff:${o.id}:as`, stat: 'attackSpeed', pct: o.as, expiresAt: now + ms });
      if (o.dmg) e.stats.set({ id: `rbuff:${o.id}:dmg`, stat: 'damage', pct: o.dmg, expiresAt: now + ms });
      if (o.move) e.stats.set({ id: `rbuff:${o.id}:ms`, stat: 'moveSpeed', pct: o.move, expiresAt: now + ms });
      if (o.ann) e.combat.announce(o.ann, '#' + o.color.toString(16).padStart(6, '0'));
      e.memory.castPop = now;
    },
  };
}

// ---- per-champion signature abilities --------------------------------------

export const RIVAL_ABILITIES: Record<string, () => EnemyAbilitySpec[]> = {
  // melee champions — leaps, hooks, point-blank bursts
  zac: () => [champDash({ id: 'zac-sling', color: 0x66cc44, dmg: 55, radius: 150, slowPct: 0.85, slowMs: 700 })],
  fizz: () => [champDash({ id: 'fizz-trident', color: 0x3fd0e0, dmg: 55, slowPct: 0.4, slowMs: 1200 })],
  jarvan: () => [champDash({ id: 'jarvan-flag', color: 0xe8c14a, dmg: 60, slowPct: 0.5, slowMs: 900 })],
  taric: () => [champNova({ id: 'taric-dazzle', color: 0xe86bd0, dmg: 45, radius: 165, slowPct: 0.5, slowMs: 900 })],
  alistar: () => [champNova({ id: 'alistar-pulv', color: 0x6a8cff, dmg: 45, radius: 170, knockback: 240 })],
  leesin: () => [champLine({ id: 'lee-sonic', color: 0xd98a3a, dmg: 55, range: 560, slowPct: 0.3, slowMs: 1000 })],
  nocturne: () => [champDash({ id: 'noc-dread', color: 0x6a3aa0, dmg: 55, range: 520, slowPct: 0.5, slowMs: 1000 })],
  warwick: () => [champBuff({ id: 'ww-hunt', color: 0x9aa0a6, as: 0.5, dmg: 0.2, move: 0.2, ms: 4500, ann: 'Blood Hunt!' })],
  blitzcrank: () => [champHook({ id: 'blitz-grab', color: 0xf0c419, dmg: 60 })],
  amumu: () => [champHook({ id: 'amumu-bandage', color: 0x3a9a5a, dmg: 45 })],
  masteryi: () => [champBuff({ id: 'yi-highlander', color: 0xe03a3a, as: 0.6, dmg: 0.25, move: 0.15, ms: 4000, ann: 'Highlander!' })],
  chogath: () => [champNova({ id: 'cho-rupture', color: 0x8a3aa0, dmg: 55, radius: 175, slowPct: 0.9, slowMs: 500 })],
  shen: () => [champDash({ id: 'shen-dash', color: 0x3a6a9a, dmg: 50, slowPct: 0.5, slowMs: 800 })],

  // ranged champions — skillshots, zones
  teemo: () => [champHazard({ id: 'teemo-shroom', color: 0x7ac043, dmg: 16, radius: 110, durMs: 3000, range: 620 })],
  kogmaw: () => [champLine({ id: 'kog-artillery', color: 0xc03a9a, dmg: 55, range: 820, speed: 900 })],
  cassiopeia: () => [champHazard({ id: 'cass-miasma', color: 0x3aa06a, dmg: 16, radius: 140, durMs: 2800 })],
  ziggs: () => [champHazard({ id: 'ziggs-bomb', color: 0xe0a020, dmg: 20, radius: 130, durMs: 1800, delayMs: 700 })],
  brand: () => [champHazard({ id: 'brand-pillar', color: 0xe0542a, dmg: 20, radius: 130, durMs: 2200, delayMs: 700 })],
  varus: () => [champLine({ id: 'varus-arrow', color: 0x9a3ac0, dmg: 50, pierce: true, slowPct: 0.35, slowMs: 1000 })],
  fiddlesticks: () => [champHazard({ id: 'fiddle-drain', color: 0x6a8a3a, dmg: 18, radius: 130, durMs: 2400 })],
  lux: () => [champLine({ id: 'lux-bind', color: 0xf0d84a, dmg: 55, rootMs: 900 })],
  sivir: () => [champLine({ id: 'sivir-boomer', color: 0xc0a040, dmg: 45, range: 700, pierce: true })],
  ashe: () => [champLine({ id: 'ashe-frost', color: 0x6ac0e0, dmg: 50, slowPct: 0.5, slowMs: 1400 })],
  gragas: () => [champHazard({ id: 'gragas-cask', color: 0x9a5a3a, dmg: 18, radius: 150, durMs: 2200 })],
  karthus: () => [champHazard({ id: 'karthus-waste', color: 0x8a4ac0, dmg: 20, radius: 110, durMs: 1200, delayMs: 520, range: 640 })],
  lucian: () => [champLine({ id: 'lucian-light', color: 0xe0d0a0, dmg: 40, range: 640, pierce: true })],
};

export function rivalAbilitiesFor(championId: string): EnemyAbilitySpec[] | null {
  const make = RIVAL_ABILITIES[championId];
  return make ? make() : null;
}
