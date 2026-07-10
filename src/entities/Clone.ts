import Phaser from 'phaser';
import { Unit } from './Unit';
import { Player } from './Player';
import { StatBlock } from '../core/stats';
import { Combat } from '../core/combat';
import { clampToArena, resolvePillars, norm, dist } from '../core/geometry';
import { COLORS } from '../config';

/**
 * Spiegelkönig: simplified mirror of the player. It reads the player's LIVE
 * stat pipeline (augment mods included) and attacks at `scale` effect —
 * the "deine Augments mit 25% Wirkung" approximation for v1.
 */
export class Clone extends Unit {
  private nextAttackAt = 0;
  private strafeSign = 1;
  private strafeSwitchAt = 0;

  constructor(
    scene: Phaser.Scene,
    private combat: Combat,
    x: number,
    y: number,
    private mirror: Player,
    private scale: number,
  ) {
    super(scene, x, y, 'player', new StatBlock({ maxHP: mirror.maxHP * 0.4 }));
    this.radius = 20;
  }

  update(time: number, dt: number): void {
    if (!this.alive) return;
    const target = this.combat.nearestEnemy(this);
    if (!target) return;

    // Simple AI: hold ~350 range, strafe
    const d = dist(this.x, this.y, target.x, target.y);
    const speed = this.mirror.stats.get('moveSpeed') * 0.9;
    const toT = norm(target.x - this.x, target.y - this.y);
    if (time >= this.strafeSwitchAt) {
      this.strafeSign = Math.random() < 0.5 ? -1 : 1;
      this.strafeSwitchAt = time + 900 + Math.random() * 900;
    }
    const perp = { x: -toT.y * this.strafeSign, y: toT.x * this.strafeSign };
    let mx = perp.x * 0.6;
    let my = perp.y * 0.6;
    if (d > 380) {
      mx += toT.x;
      my += toT.y;
    } else if (d < 220) {
      mx -= toT.x;
      my -= toT.y;
    }
    const n = norm(mx, my);
    const p1 = resolvePillars(this.x + n.x * speed * dt, this.y + n.y * speed * dt, this.radius);
    const p2 = clampToArena(p1.x, p1.y, this.radius);
    this.x = p2.x;
    this.y = p2.y;

    // Mirrored auto-attacks at scaled damage
    const range = this.mirror.stats.get('attackRange');
    if (d <= range && time >= this.nextAttackAt) {
      const atkSpeed = Math.max(0.1, this.mirror.stats.get('attackSpeed'));
      this.nextAttackAt = time + 1000 / atkSpeed;
      const dmg = this.mirror.stats.get('damage') * this.scale;
      this.combat.spawnProjectile({
        x: this.x,
        y: this.y,
        dirX: target.x - this.x,
        dirY: target.y - this.y,
        speed: this.mirror.stats.get('projSpeed'),
        radius: 6,
        color: COLORS.prisma,
        team: 'player',
        homing: target,
        maxDist: range + 200,
        onHit: (t) => this.combat.dealDamage(this, t, dmg, 'other'),
      });
    }
  }

  protected drawBody(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(COLORS.playerDark, 0.8);
    g.fillCircle(this.x, this.y, this.radius + 2);
    g.fillStyle(COLORS.prisma, 0.55);
    g.fillCircle(this.x, this.y, this.radius);
    // Mini crown
    g.fillStyle(COLORS.prisma, 0.8);
    const cy = this.y - this.radius - 6;
    g.fillTriangle(this.x - 8, cy + 4, this.x - 2, cy + 4, this.x - 5, cy - 3);
    g.fillTriangle(this.x - 3, cy + 4, this.x + 3, cy + 4, this.x, cy - 5);
    g.fillTriangle(this.x + 2, cy + 4, this.x + 8, cy + 4, this.x + 5, cy - 3);
  }
}
