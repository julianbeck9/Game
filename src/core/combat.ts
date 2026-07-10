import type { Unit } from '../entities/Unit';
import type { Projectile, ProjectileOpts } from '../entities/Projectile';
import type { EventBus, DamageType } from './events';

/**
 * The surface entities and augments use to act on the world.
 * Implemented by ArenaScene; nothing below the scene reaches into it directly.
 */
export interface Combat {
  readonly bus: EventBus;
  readonly units: Unit[];
  readonly now: number;
  spawnProjectile(opts: ProjectileOpts): Projectile;
  dealDamage(source: Unit | null, target: Unit, amount: number, type: DamageType): number;
  nearestEnemy(of: Unit, maxDist?: number): Unit | null;
}
