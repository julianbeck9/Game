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
  /** One-line kit summary for the select screen. */
  kitLine: string;
  base: Partial<Record<StatName, number>>;
  /** Ranged autos fire projectiles; melee autos are instant swings. */
  ranged: boolean;
  /** Aim-preview length and smart-cast acquisition range for Q. */
  qRange: number;
  cds: { Q: number; E: number; Dash: number };
  /** Q implementation; also used by the Echo augment for re-casts. */
  fireQ(p: Player, dir: Vec, scale: number): void;
  castE(p: Player): void;
  /** Optional on-hit rider for auto-attacks (Ashe frost). */
  onAutoHit?(p: Player, target: Unit): void;
  /** 8-bit sprite: rows of palette characters ('.' = transparent). */
  sprite: string[];
  palette: Record<string, number>;
}
