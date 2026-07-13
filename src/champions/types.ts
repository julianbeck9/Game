import type { Player } from '../entities/Player';
import type { Vec } from '../core/geometry';
import type { StatName } from '../core/stats';
import type { Unit } from '../entities/Unit';

/** Name + description for one ability slot (shown in the menu kit viewer). */
export interface AbilityInfo {
  name: string;
  desc: string;
}

/**
 * Playable champion: a LoL-like stat sheet plus a 3-slot kit (Q / E / Dash),
 * a passive, and a 16-bit sprite. Fan-homage kits are adapted to this game's
 * controls; all art and text here is original.
 */
export interface ChampionDef {
  id: string;
  name: string;
  tagline: string;
  /** Home region, shown on the select screen. */
  region: string;
  /** One-line kit summary for the select cards. */
  kitLine: string;
  /** Full kit text for the menu detail viewer. */
  info: {
    passive: AbilityInfo;
    q: AbilityInfo;
    e: AbilityInfo;
    dash: AbilityInfo;
  };
  base: Partial<Record<StatName, number>>;
  /**
   * Champion damage identity (LoL-like): which stats this champion's kit
   * actually scales with. Used to gate augment offers — an AP-only augment is
   * never offered to a champion that doesn't use AP. Defaults to attack-damage
   * (ad) when omitted; add 'ap' for mages like Lux.
   */
  scales?: ('ad' | 'ap')[];
  /** Ranged autos fire projectiles; melee autos are instant swings. */
  ranged: boolean;
  /** Aim-preview length and smart-cast acquisition range for Q. */
  qRange: number;
  cds: { Q: number; E: number; Dash: number };
  /** Yasuo: Q cooldown scales with attack speed instead of ability haste. */
  qCdFromAS?: boolean;
  /** Yasuo: crit chance counts double on auto-attacks. */
  critMult?: number;
  /** Q implementation; also used by the Echo augment for re-casts. */
  fireQ(p: Player, dir: Vec, scale: number): void;
  /** dir: aim direction (mouse on desktop, facing/joystick on touch). */
  castE(p: Player, dir?: Vec): void;
  /** Optional on-hit rider for auto-attacks (frost, marks, executes…). */
  onAutoHit?(p: Player, target: Unit): void;
  /** Passive setup at combat start (reset stacks, seed state). */
  onCombatInit?(p: Player): void;
  /** Passive per-frame tick (flow building, regen, thresholds…). */
  passiveTick?(p: Player, dt: number): void;
  /** Passive reaction to taking damage (Yasuo flow shield, etc.). */
  onDamageTaken?(p: Player, dmg: number, source: Unit | null): void;
  /** 16-bit sprite: rows of palette characters ('.' = transparent). */
  sprite: string[];
  palette: Record<string, number>;
}
