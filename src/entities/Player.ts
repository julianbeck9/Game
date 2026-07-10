import Phaser from 'phaser';
import { Unit } from './Unit';
import { StatBlock } from '../core/stats';
import { Combat } from '../core/combat';
import { clampToArena, resolvePillars, norm, len, Vec } from '../core/geometry';
import { COLORS, PLAYER_BASE } from '../config';

export class Player extends Unit {
  /** Last non-zero movement direction; used for facing (Q quick-cast, dash). */
  facing: Vec = { x: 1, y: 0 };
  private nextAttackAt = 0;

  constructor(
    scene: Phaser.Scene,
    private combat: Combat,
    x: number,
    y: number,
  ) {
    super(scene, x, y, 'player', new StatBlock({ ...PLAYER_BASE }));
  }

  /** moveVec: normalized-ish input vector (joystick or WASD), magnitude 0..1. */
  move(dt: number, moveVec: Vec): void {
    const mag = Math.min(1, len(moveVec.x, moveVec.y));
    if (mag > 0.05) {
      const n = norm(moveVec.x, moveVec.y);
      this.facing = n;
      const speed = this.stats.get('moveSpeed');
      let nx = this.x + n.x * speed * mag * dt;
      let ny = this.y + n.y * speed * mag * dt;
      const p1 = resolvePillars(nx, ny, this.radius);
      const p2 = clampToArena(p1.x, p1.y, this.radius);
      this.x = p2.x;
      this.y = p2.y;
    }
  }

  update(time: number, _dt: number): void {
    if (!this.alive) return;
    this.stats.update(time);
    this.tryAutoAttack(time);
  }

  private tryAutoAttack(time: number): void {
    if (time < this.nextAttackAt) return;
    const range = this.stats.get('attackRange');
    const target = this.combat.nearestEnemy(this, range);
    if (!target) return;

    const atkSpeed = Math.max(0.1, this.stats.get('attackSpeed'));
    this.nextAttackAt = time + 1000 / atkSpeed;

    const dmg = this.stats.get('damage');
    this.combat.spawnProjectile({
      x: this.x,
      y: this.y,
      dirX: target.x - this.x,
      dirY: target.y - this.y,
      speed: this.stats.get('projSpeed'),
      radius: 8,
      color: COLORS.playerProj,
      team: 'player',
      homing: target,
      maxDist: range + 200,
      onHit: (t) => {
        const dealt = this.combat.dealDamage(this, t, dmg, 'auto');
        this.combat.bus.emit('autoHit', { target: t, dmg: dealt });
      },
    });
  }

  protected drawBody(g: Phaser.GameObjects.Graphics): void {
    // Gold champion disc
    g.fillStyle(COLORS.playerDark, 1);
    g.fillCircle(this.x, this.y, this.radius + 3);
    g.fillStyle(COLORS.player, 1);
    g.fillCircle(this.x, this.y, this.radius);

    // Facing tick
    g.lineStyle(4, COLORS.playerDark, 1);
    g.beginPath();
    g.moveTo(this.x, this.y);
    g.lineTo(this.x + this.facing.x * (this.radius - 4), this.y + this.facing.y * (this.radius - 4));
    g.strokePath();

    // Tiny crown: three spikes above center
    g.fillStyle(COLORS.player, 1);
    const cy = this.y - this.radius - 8;
    g.fillTriangle(this.x - 12, cy + 6, this.x - 4, cy + 6, this.x - 8, cy - 4);
    g.fillTriangle(this.x - 4, cy + 6, this.x + 4, cy + 6, this.x, cy - 7);
    g.fillTriangle(this.x + 4, cy + 6, this.x + 12, cy + 6, this.x + 8, cy - 4);
  }

  protected drawHpBar(g: Phaser.GameObjects.Graphics): void {
    // Player HP bar sits below (crown occupies the top)
    const w = this.radius * 2.4;
    const h = 7;
    const x = this.x - w / 2;
    const y = this.y + this.radius + 12;
    g.fillStyle(COLORS.hpBack, 0.9);
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(COLORS.hpGreen, 1);
    g.fillRect(x, y, w * Phaser.Math.Clamp(this.hpPct, 0, 1), h);
  }
}
