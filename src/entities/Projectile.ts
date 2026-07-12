import { Unit } from './Unit';
import { norm, len, pointInPillar } from '../core/geometry';
import { FIELD } from '../core/maps';

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
  /** Unit this projectile can never hit (e.g. splinters spawning on a target). */
  ignore?: Unit;
  /**
   * Boomerang: instead of dying at range end / pillars / arena edge, the
   * projectile turns around and homes back to this unit, able to hit each
   * target once more on the return leg.
   */
  boomerangTo?: Unit;
  /** Rendered as a spinning blade instead of a bolt. */
  spin?: boolean;
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
  get isHoming(): boolean {
    return !!this.opts.homing;
  }
  get isSpinning(): boolean {
    return !!this.opts.spin;
  }
  get dir(): { x: number; y: number } {
    return { x: this.dirX, y: this.dirY };
  }
  private returning = false;
  get color(): number {
    return this.opts.color;
  }
  get team(): 'player' | 'enemy' {
    return this.opts.team;
  }

  update(dt: number, targets: Unit[]): void {
    if (!this.alive) return;
    const o = this.opts;

    if (this.returning) {
      const home = o.boomerangTo!;
      if (!home.alive) {
        this.alive = false;
        return;
      }
      const n = norm(home.x - this.x, home.y - this.y);
      this.dirX = n.x;
      this.dirY = n.y;
    } else if (o.homing && o.homing.alive) {
      const n = norm(o.homing.x - this.x, o.homing.y - this.y);
      this.dirX = n.x;
      this.dirY = n.y;
    }

    const step = o.speed * dt;
    this.x += this.dirX * step;
    this.y += this.dirY * step;
    this.traveled += step;

    if (this.returning) {
      const home = o.boomerangTo!;
      if (len(home.x - this.x, home.y - this.y) <= home.radius + this.radius) {
        this.alive = false; // caught
        return;
      }
    } else {
      // Range end, field edge, or an obstacle: boomerangs turn around, bolts die
      const maxDist = o.maxDist ?? 2400;
      const atLimit =
        this.traveled >= maxDist ||
        this.x < FIELD.x1 - 40 ||
        this.x > FIELD.x2 + 40 ||
        this.y < FIELD.y1 - 40 ||
        this.y > FIELD.y2 + 40 ||
        ((o.blockedByPillars ?? true) && pointInPillar(this.x, this.y, this.radius));
      if (atLimit) {
        if (o.boomerangTo) {
          this.returning = true;
          this.hitUnits.clear(); // the return leg hits everyone again
          this.hits = 0;
        } else {
          this.expire();
          return;
        }
      }
    }

    for (const t of targets) {
      if (!t.alive || t.team === this.team || this.hitUnits.has(t) || t === o.ignore) continue;
      if (len(t.x - this.x, t.y - this.y) <= t.radius + this.radius) {
        this.hitUnits.add(t);
        this.hits++;
        o.onHit(t);
        if (this.hits >= (o.maxHits ?? 1)) {
          if (o.boomerangTo && !this.returning) {
            // Out of pierces: swing back instead of dying
            this.returning = true;
            this.hitUnits.clear();
            this.hits = 0;
          } else {
            this.alive = false;
          }
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
