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

export interface AugmentDef {
  id: string;
  name: string;
  tier: Tier;
  tags: Tag[];
  description: string;
  hooks?: AugmentHooks;
  /** Permanent stat mods, re-applied at each combat init through the pipeline. */
  statMods?: AugmentStatMod[];
  ruleFlags?: Partial<RuleFlags>;
  /** Per-frame tick for dynamic augments (Schwungmasse etc.). */
  onUpdate?: (dt: number, ctx: AugmentCtx) => void;
  /** Combat-scene setup (shields, clones, per-fight state resets). */
  onCombatInit?: (ctx: AugmentCtx) => void;
}
