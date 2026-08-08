import type { EventMap } from '../core/events';
import type { StatName } from '../core/stats';
import type { Combat } from '../core/combat';
import type { Player } from '../entities/Player';
import type { RunState } from '../core/run';

export type Tag = 'Blut' | 'Sturm' | 'Arkan' | 'Ward' | 'Bruch';
export type Tier = 'silber' | 'gold' | 'prisma';

/** Rule flags: prisma augments break rules via these; combat core checks flags, never augment identity. */
export interface RuleFlags {
  noAutoAttacks: boolean;
  dashIFrames: boolean;
  prismaSlots: number;
  burnForever: boolean;
  /** Doppelkrone: silver augments act at half power. */
  silverHalved: boolean;
  dashCharges: number;
  /** Phönixherz: revives per run; the combat core consumes them on death. */
  revives: number;
  /** Per-ability cooldown multipliers (Q-/E-Fokus-Augmente, Windläufer). */
  qCdMult: number;
  eCdMult: number;
  dashCdMult: number;

  /*
   * Rule flags below change how a LOOP works rather than what a number is.
   *
   * A survey of the pool found 173 augments, 156 of them carrying hooks — but
   * only 6 carrying a rule flag. Nearly everything was a variation on "when X
   * happens, deal extra damage", which is why a playtest called them "schlecht
   * und uncool": the pool was wide and the decisions inside it were all the
   * same decision at different magnitudes. These three each retune a different
   * verb — when you may attack, what movement is for, and who a hit lands on.
   */

  /** Takedowns reset Q. Turns the ability from a cooldown into a rhythm. */
  qResetOnKill: boolean;
  /** Damage per second of the burning ground a dash leaves behind; 0 = none. */
  dashFireTrail: number;
  /** Extra enemies an auto-attack arcs to. */
  autoChain: number;
  /** Below 30% health the world slows and the player does not; 0 = off. */
  clutchSlowmo: boolean;
  /** Damage dealt to enemies the dash passes through; 0 = none. */
  dashDamage: number;
  /** Pixels a hit shoves its target away from the source; 0 = none. */
  knockbackOnHit: number;
  // Dash also fires Q in the dash direction. Fuses movement and damage into one button.
  dashCastsQ: boolean;
  // Enemies left below this HP fraction by a hit die outright. 0 = off.
  executeBelow: number;
}

export const DEFAULT_FLAGS: RuleFlags = {
  noAutoAttacks: false,
  dashIFrames: false,
  // How many prisma augments you may hold (and keep being offered). Higher so
  // prismatics actually show up in the pool rather than vanishing after one.
  prismaSlots: 4,
  burnForever: false,
  silverHalved: false,
  dashCharges: 1,
  revives: 0,
  qCdMult: 1,
  eCdMult: 1,
  dashCdMult: 1,
  qResetOnKill: false,
  dashFireTrail: 0,
  autoChain: 0,
  clutchSlowmo: false,
  dashDamage: 0,
  knockbackOnHit: 0,
  dashCastsQ: false,
  executeBelow: 0,
};

/** Everything an augment hook may touch. Handlers never reach into scene internals. */
export interface AugmentCtx {
  combat: Combat;
  player: Player;
  run: RunState;
  /**
   * Effect strength for this augment right now: applies the Doppelkrone
   * silver dampener and Blutmond's Blut doubling. Multiply magnitudes by it.
   */
  power(def: AugmentDef): number;
  /** Activate an augment for this fight only (Narrenwürfel). */
  grantTemp(def: AugmentDef): void;
}

export type AugmentHooks = {
  [K in keyof EventMap]?: (payload: EventMap[K], ctx: AugmentCtx) => void;
};

export interface AugmentStatMod {
  stat: StatName;
  flat?: number;
  pct?: number;
}

/** A champion capability an augment requires to be worth offering. */
export type AugmentNeed = 'ap';

export interface AugmentDef {
  id: string;
  name: string;
  tier: Tier;
  tags: Tag[];
  description: string;
  /**
   * Stat capabilities this augment needs to do anything. An AP-only augment
   * lists 'ap' so it's never offered to a champion that doesn't scale with AP.
   * Omit for stat-agnostic augments (utility, on-hit, tank, AD).
   */
  needs?: AugmentNeed[];
  /**
   * Champion id this augment belongs to. Champion augments rewrite what a
   * specific kit *does* (extra blades on the Q, a burst on the E) instead of
   * nudging a stat, and are only ever offered to that champion.
   */
  champion?: string;
  hooks?: AugmentHooks;
  /** Permanent stat mods, re-applied at each combat init through the pipeline. */
  statMods?: AugmentStatMod[];
  /**
   * Multiplier folded into `ctx.power(def)`, so hook-driven effects scale with
   * the source's rank. Set by item star forging (items/stars.ts).
   */
  powerMult?: number;
  ruleFlags?: Partial<RuleFlags>;
  /** Per-frame tick for dynamic augments (Schwungmasse etc.). */
  onUpdate?: (dt: number, ctx: AugmentCtx) => void;
  /** Combat-scene setup (shields, clones, per-fight state resets). */
  onCombatInit?: (ctx: AugmentCtx) => void;
}
