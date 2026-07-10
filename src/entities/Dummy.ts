import Phaser from 'phaser';
import { Unit } from './Unit';
import { StatBlock } from '../core/stats';
import { COLORS } from '../config';

/** Training dummy for milestone 1: stands still, resets HP shortly after "dying". */
export class Dummy extends Unit {
  private respawnAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'enemy', new StatBlock({ maxHP: 300 }));
    this.radius = 30;
  }

  update(time: number, _dt: number): void {
    if (!this.alive) {
      if (this.respawnAt === 0) this.respawnAt = time + 1500;
      if (time >= this.respawnAt) {
        this.hp = this.maxHP;
        this.alive = true;
        this.respawnAt = 0;
      }
    }
  }

  protected drawBody(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(COLORS.enemyDark, 1);
    g.fillCircle(this.x, this.y, this.radius + 3);
    g.fillStyle(COLORS.enemy, 1);
    g.fillCircle(this.x, this.y, this.radius);
    // Target rings, so it reads as a dummy and not a fighter
    g.lineStyle(3, COLORS.enemyDark, 1);
    g.strokeCircle(this.x, this.y, this.radius * 0.6);
    g.strokeCircle(this.x, this.y, this.radius * 0.25);
  }

  draw(): void {
    const g = this.gfx;
    g.clear();
    if (!this.alive) {
      // Faded husk while waiting to reset
      g.fillStyle(COLORS.enemyDark, 0.3);
      g.fillCircle(this.x, this.y, this.radius);
      return;
    }
    this.drawBody(g);
    this.drawHpBar(g);
  }
}
