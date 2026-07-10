import type { Unit } from '../entities/Unit';
import type { Projectile, ProjectileOpts } from '../entities/Projectile';
import type { EventBus, DamageType } from './events';
import type { EnemyConfig } from '../entities/Enemy';

/**
 * The surface entities and augments use to act on the world.
 * Implemented by ArenaScene; nothing below the scene reaches into it directly.
 */
export interface Combat {
  readonly bus: EventBus;
  readonly units: Unit[];
  readonly projectiles: Projectile[];
  readonly now: number;
  readonly playerUnit: Unit;
  spawnProjectile(opts: ProjectileOpts): Projectile;
  dealDamage(source: Unit | null, target: Unit, amount: number, type: DamageType): number;
  nearestEnemy(of: Unit, maxDist?: number): Unit | null;
  /** Mid-fight enemy spawns (Wächter/Usurpator summoning Diener). */
  spawnEnemyUnit(cfg: EnemyConfig, x: number, y: number): Unit;
}
