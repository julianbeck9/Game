import Phaser from 'phaser';
import { Unit } from './Unit';
import { StatBlock } from '../core/stats';
import { COLORS } from '../config';

/** Schattenzwilling: a still, taunting after-image left behind by the dash. */
export class Decoy extends Unit {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private until: number,
  ) {
    super(scene, x, y, 'player', new StatBlock({ maxHP: 60 }));
  }

  update(time: number, _dt: number): void {
    if (this.alive && time >= this.until) {
      this.alive = false;
    }
  }

  protected drawBody(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(COLORS.playerDark, 0.5);
    g.fillCircle(this.x, this.y, this.radius + 3);
    g.fillStyle(COLORS.player, 0.45);
    g.fillCircle(this.x, this.y, this.radius);
    g.lineStyle(3, COLORS.buff, 0.6);
    g.strokeCircle(this.x, this.y, this.radius + 8);
  }

  protected drawHpBar(): void {
    // Decoys show no HP bar — they're an illusion
  }
}
