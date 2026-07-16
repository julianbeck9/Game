import type { Unit } from '../entities/Unit';
import type { Projectile, ProjectileOpts } from '../entities/Projectile';
import type { EventBus, DamageType, School } from './events';
import type { EnemyConfig } from '../entities/Enemy';
import type { ChampionVfx } from '../champions/ChampionVfx';

export interface Hazard {
  x: number;
  y: number;
  r: number;
  until: number;
  /** Damage per second to units of the opposing team standing inside. */
  dps: number;
  team: 'player' | 'enemy';
  color: number;
}

/**
 * The surface entities and augments use to act on the world.
 * Implemented by ArenaScene; nothing below the scene reaches into it directly.
 */
export interface Combat {
  readonly bus: EventBus;
  readonly units: Unit[];
  readonly projectiles: Projectile[];
  /** Live damage zones — bots read these to step out of the player's puddles. */
  readonly hazards: Hazard[];
  readonly now: number;
  readonly playerUnit: Unit;
  /** Procedural champion-sprite VFX layer; entities bind their sprite to it. */
  readonly champVfx: ChampionVfx;
  spawnProjectile(opts: ProjectileOpts): Projectile;
  /** school defaults per type: auto/reflect/ability → physisch, burn → magisch, other → wahr. */
  dealDamage(source: Unit | null, target: Unit, amount: number, type: DamageType, school?: School): number;
  nearestEnemy(of: Unit, maxDist?: number): Unit | null;
  /** Windwand etc.: a line segment that eats enemy projectiles until `until`. */
  addWall(x1: number, y1: number, x2: number, y2: number, until: number): void;
  /** Mid-fight enemy spawns (Wächter/Usurpator summoning Diener). */
  spawnEnemyUnit(cfg: EnemyConfig, x: number, y: number): Unit;

  /** What bots aim at right now: the taunt decoy if one is active, else the player. */
  botTarget(): Unit;
  /** Redirect bot aggression to a unit until it dies or the timer runs out. */
  setTaunt(unit: Unit, until: number): void;

  /** Add a stacking burn to a unit (honors the burnForever rule flag). */
  addBurn(target: Unit, dps: number, durationMs: number): void;
  /** Damaging ground zone (Nachbrenner trail, Feuerring, …). */
  addHazard(h: Hazard): void;

  /** Run fn after ms, skipped if the fight has ended. */
  delay(ms: number, fn: () => void): void;
  /** Short floating announcement text (augment procs etc.). */
  announce(text: string, color?: string): void;
  /** Transient line flash (chain lightning etc.). */
  flashLine(x1: number, y1: number, x2: number, y2: number, color: number): void;
  /** Expanding ring effect (novas, kill bursts, lightning impacts). */
  ring(x: number, y: number, color: number, maxR: number): void;
  /** Spiegelkönig: spawn a simplified mirror of the player at the given effect scale. */
  spawnMirror(scale: number): void;
  /** Schattenzwilling: leave a taunting decoy at a position. */
  spawnDecoy(x: number, y: number, durationMs: number): Unit;
}
