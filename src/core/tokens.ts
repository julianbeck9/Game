import type { Combat } from './combat';
import type { Unit } from '../entities/Unit';
import { run } from './run';

/**
 * Attack tokens: how many enemies may be attacking the player at once.
 *
 * Head counts were raised to 5-9 per round so difficulty would come from
 * reading a crowd instead of from stat sponges. But every one of those nine
 * attacked on its own timer, so the crowd was not something to read, it was a
 * damage-per-second figure — the player could not dodge nine independent
 * swings and shots, and with health now a pool across the whole run, that
 * chip damage simply ended runs (sim median: round 2 of 20).
 *
 * Doom (2016) and Hades solve exactly this with tokens: a small number of
 * enemies hold the right to attack, the rest reposition and wait their turn.
 * The crowd stays large and threatening, but the number of things the player
 * must track at once is capped at a number a human can actually track.
 *
 * A token is held for HOLD_MS, then returned; the unit rests REST_MS before it
 * may ask again, so the attackers rotate instead of the nearest three
 * monopolising the fight. Bosses and mini-bosses never need one — they are the
 * point of their round and must never stand around waiting.
 */

const HOLD_MS = 2600;
const REST_MS = 900;
/** Refreshed every frame while busy; far longer than a frame so no other
 * unit's purge can catch a busy holder between its own updates. */
const BUSY_GRACE_MS = 200;

/** Simultaneous attackers allowed this round. Grows with the run, never past 4. */
export function tokenBudget(round: number): number {
  if (round <= 4) return 2;
  if (round <= 12) return 3;
  return 4;
}

class AttackTokens {
  private holders = new Map<Unit, number>(); // unit -> token expires at
  private restUntil = new Map<Unit, number>(); // unit -> may ask again at

  constructor(private readonly max: number) {}

  /**
   * Ask for (or keep) the right to attack. Cheap enough to call every frame.
   * `busy` = the unit is mid wind-up: its token is kept alive until the attack
   * resolves. Without that a token could expire half-way through a swing, a
   * new unit would take it, and for a moment one more enemy attacked than the
   * budget allows — the check caught 4 attackers against a budget of 3.
   */
  request(u: Unit, now: number, busy = false): boolean {
    const mine = this.holders.get(u);
    if (mine !== undefined && busy) this.holders.set(u, Math.max(mine, now + BUSY_GRACE_MS));
    for (const [h, exp] of this.holders) {
      if (exp > now && h.alive) continue;
      this.holders.delete(h);
      this.restUntil.set(h, now + REST_MS);
    }
    if (this.holders.has(u)) return true;
    if ((this.restUntil.get(u) ?? 0) > now) return false;
    if (this.holders.size >= this.max) return false;
    this.holders.set(u, now + HOLD_MS);
    return true;
  }

  /** Units currently attacking — exposed for measurement only. */
  get active(): number {
    return this.holders.size;
  }
}

// One pool per fight, with no wiring into the scene. Not keyed on the Combat
// object itself: ArenaScene is reused across rounds, so it would carry last
// round's holders and budget forward. `combat.units` is a fresh array on every
// scene create(), which makes it exactly one key per fight.
const pools = new WeakMap<object, AttackTokens>();

export function tokensFor(combat: Combat): AttackTokens {
  let p = pools.get(combat.units);
  if (!p) {
    p = new AttackTokens(tokenBudget(run.round));
    pools.set(combat.units, p);
  }
  return p;
}
