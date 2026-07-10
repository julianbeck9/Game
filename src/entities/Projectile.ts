import { Unit } from './Unit';
import { norm, len, pointInPillar } from '../core/geometry';
import { ARENA_X, ARENA_Y, ARENA_R } from '../config';

export interface ProjectileOpts {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
  radius: number;
  color: number;
  team: 'player' | 'enemy';
  /** Homing projectiles steer toward this unit each frame (auto-attacks). */
  homing?: Unit;
  /** How many units this projectile may hit before dying (1 = normal, 2 = pierces one). */
  maxHits?: number;
  maxDist?: number;
  onHit: (target: Unit) => void;
  /** Called when the projectile dies without exhausting its hits (range end / pillar). */
  onExpire?: (x: number, y: number) => void;
  blockedByPillars?: boolean;
}

export class Projectile {
  alive = true;
  x: number;
  y: number;
  private dirX: number;
  private dirY: number;
  private traveled = 0;
  private hits = 0;
  private hitUnits = new Set<Unit>();
  private opts: ProjectileOpts;

  constructor(opts: ProjectileOpts) {
    this.opts = opts;
    this.x = opts.x;
    this.y = opts.y;
    const n = norm(opts.dirX, opts.dirY);
    this.dirX = n.x;
    this.dirY = n.y;
  }

  get radius(): number {
    return this.opts.radius;
  }
  get color(): number {
    return this.opts.color;
  }
  get team(): 'player' | 'enemy' {
    return this.opts.team;
  }

  update(dt: number, targets: Unit[]): void {
    if (!this.alive) return;
    const o = this.opts;

    if (o.homing && o.homing.alive) {
      const n = norm(o.homing.x - this.x, o.homing.y - this.y);
      this.dirX = n.x;
      this.dirY = n.y;
    }

    const step = o.speed * dt;
    this.x += this.dirX * step;
    this.y += this.dirY * step;
    this.traveled += step;

    // Out of arena or range
    const maxDist = o.maxDist ?? 2000;
    if (
      this.traveled >= maxDist ||
      len(this.x - ARENA_X, this.y - ARENA_Y) > ARENA_R + 40
    ) {
      this.expire();
      return;
    }

    // Pillars block projectiles (skillshot play)
    if ((o.blockedByPillars ?? true) && pointInPillar(this.x, this.y, this.radius)) {
      this.expire();
      return;
    }

    for (const t of targets) {
      if (!t.alive || t.team === this.team || this.hitUnits.has(t)) continue;
      if (len(t.x - this.x, t.y - this.y) <= t.radius + this.radius) {
        this.hitUnits.add(t);
        this.hits++;
        o.onHit(t);
        if (this.hits >= (o.maxHits ?? 1)) {
          this.alive = false;
          return;
        }
      }
    }
  }

  private expire(): void {
    this.alive = false;
    this.opts.onExpire?.(this.x, this.y);
  }
}
