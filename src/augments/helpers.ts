import type { Unit } from '../entities/Unit';
import type { AugmentCtx, AugmentDef, Tier } from './types';
import type { StatName } from '../core/stats';
import { augmentFitsChampion } from './eligibility';

/**
 * Runtime reference to the full augment pool, filled in by registry.ts after
 * all tier modules loaded. Lets Transmutations-augments roll from the whole
 * pool without circular imports.
 */
export const poolRef: { all: AugmentDef[] } = { all: [] };

/**
 * Grant a random not-yet-owned augment permanently (Transmutationen).
 * Meant for onCombatInit-time grants: the init loop iterating run.augments
 * picks the pushed entry up and activates it — no manual grantTemp here.
 */
export function grantRandomAugment(ctx: AugmentCtx, tier: Tier | null, announce = true): AugmentDef | null {
  const pool = poolRef.all.filter(
    (a) =>
      (tier === null || a.tier === tier) &&
      !ctx.run.augments.some((o) => o.id === a.id) &&
      augmentFitsChampion(a, ctx.run.champion),
  );
  if (pool.length === 0) return null;
  const rolled = pool[Math.floor(Math.random() * pool.length)];
  ctx.run.augments.push(rolled);
  for (const t of rolled.tags) ctx.run.tagCounts[t]++;
  if (rolled.ruleFlags) Object.assign(ctx.run.flags, rolled.ruleFlags);
  if (announce) ctx.combat.announce(`New: ${rolled.name}`, '#ddaaff');
  return rolled;
}

/**
 * Shared helpers for the augment pool. Balancing numbers come from a
 * classic-arena reference sheet; flat values are rescaled to our stat
 * ranges with fixed factors (HP ÷10, AD/AP ÷3, proc damage ÷8,
 * flat movement speed → % of 350). Percentages, ability haste and
 * armor/MR transfer 1:1 because the formulas match.
 */

export const RUN_ROUNDS = 12;

/** Round-scaled value: `a` in round 1 growing linearly to `b` in round 12. */
export function pp(ctx: AugmentCtx, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (ctx.run.round - 1) / (RUN_ROUNDS - 1)));
  return a + (b - a) * t;
}

/** Round-scaled proc damage on our scale (reference damage ÷ 8). */
export function ppDmg(ctx: AugmentCtx, a: number, b: number): number {
  return pp(ctx, a, b) / 8;
}

/** Flat reference movement speed → our % (reference base 350). */
export function msPct(flat: number): number {
  return flat / 350;
}

/**
 * Re-entrancy guard for damage-echo augments: while a proc is being dealt,
 * damageDealt hooks that would echo again must stay quiet, or two echo
 * augments would ping-pong forever.
 */
let inProc = false;

export function procActive(): boolean {
  return inProc;
}

/** Deal proc damage without waking up other damage-echo augments. */
export function procDamage(
  ctx: AugmentCtx,
  target: Unit,
  amount: number,
  school: 'physisch' | 'magisch' | 'wahr' = 'wahr',
): number {
  if (!target.alive) return 0;
  inProc = true;
  const dealt = ctx.combat.dealDamage(ctx.player, target, amount, 'other', school);
  inProc = false;
  return dealt;
}

/** Timed slow through the stat pipeline (prefix `slow:` marks slowed units). */
export function slowUnit(ctx: AugmentCtx, u: Unit, id: string, pct: number, ms: number): void {
  u.stats.set({ id: `slow:${id}`, stat: 'moveSpeed', pct: -Math.min(0.95, pct), expiresAt: ctx.combat.now + ms });
}

/** All living enemies within radius r of (x, y). */
export function enemiesWithin(ctx: AugmentCtx, x: number, y: number, r: number): Unit[] {
  return ctx.combat.units.filter(
    (u) => u.alive && u.team === 'enemy' && Math.hypot(u.x - x, u.y - y) <= r,
  );
}

/** Per-unit proc cooldown bookkeeping (module-level; units die with the round). */
const unitLocks = new WeakMap<Unit, Record<string, number>>();

export function unitLockReady(u: Unit, key: string, now: number, cdMs: number): boolean {
  let locks = unitLocks.get(u);
  if (!locks) {
    locks = {};
    unitLocks.set(u, locks);
  }
  if ((locks[key] ?? 0) > now) return false;
  locks[key] = now + cdMs;
  return true;
}

/** Per-unit stack counters (Zermürbung, Schrumpfstrahl, …). */
const unitCounters = new WeakMap<Unit, Record<string, number>>();

export function unitCounterAdd(u: Unit, key: string, delta: number, max = Infinity): number {
  let c = unitCounters.get(u);
  if (!c) {
    c = {};
    unitCounters.set(u, c);
  }
  c[key] = Math.min(max, (c[key] ?? 0) + delta);
  return c[key];
}

export function unitCounterGet(u: Unit, key: string): number {
  return unitCounters.get(u)?.[key] ?? 0;
}

// ---------------------------------------------------------------------------
// Zufällige Werteboni (Statistik!-Familie): einmalig würfeln, dauerhaft anwenden
// ---------------------------------------------------------------------------

const STAT_ROLLS: [string, StatName, number, boolean][] = [
  ['AD', 'damage', 4, false],
  ['AP', 'abilityPower', 7, false],
  ['LP', 'maxHP', 25, false],
  ['Angriffstempo', 'attackSpeed', 0.12, true],
  ['Rüstung', 'armor', 8, false],
  ['MR', 'magicResist', 8, false],
  ['Haste', 'abilityHaste', 12, false],
  ['Tempo', 'moveSpeed', 0.06, true],
];

/** Roll `n` permanent stat bonuses once (keyed), then (re-)apply them each combat. */
export function statRolls(ctx: AugmentCtx, key: string, n: number): void {
  if (!ctx.run.memory[`${key}Rolled`]) {
    ctx.run.memory[`${key}Rolled`] = 1;
    const names: string[] = [];
    for (let i = 0; i < n; i++) {
      const [label, stat, val, isPct] = STAT_ROLLS[Math.floor(Math.random() * STAT_ROLLS.length)];
      names.push(label);
      const memKey = `${key}:${stat}${isPct ? ':p' : ''}`;
      ctx.run.memory[memKey] = (ctx.run.memory[memKey] ?? 0) + val;
    }
    ctx.combat.announce(`Stats: ${names.join(' · ')}`, '#a8d8ff');
  }
  for (const [, stat, , isPct] of STAT_ROLLS) {
    const memKey = `${key}:${stat}${isPct ? ':p' : ''}`;
    const v = ctx.run.memory[memKey];
    if (!v) continue;
    ctx.player.stats.set(
      isPct ? { id: `perm:${memKey}`, stat, pct: v } : { id: `perm:${memKey}`, stat, flat: v },
    );
  }
}
