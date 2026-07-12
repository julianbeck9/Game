import type { Player } from '../entities/Player';
import type { Vec } from '../core/geometry';
import type { StatName } from '../core/stats';
import type { Unit } from '../entities/Unit';

/**
 * Playable champion: a LoL-like stat sheet plus a 3-slot kit (Q / E / Dash)
 * and an 8-bit sprite. Fan-homage kits are adapted to this game's controls;
 * all art and text here is original.
 */
export interface ChampionDef {
  id: string;
  name: string;
  tagline: string;
  /** Home region, shown on the select screen. */
  region: string;
  /** One-line kit summary for the select screen. */
  kitLine: string;
  base: Partial<Record<StatName, number>>;
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
  /** Optional on-hit rider for auto-attacks (Ashe frost). */
  onAutoHit?(p: Player, target: Unit): void;
  /** 16-bit sprite: rows of palette characters ('.' = transparent). */
  sprite: string[];
  palette: Record<string, number>;
}
