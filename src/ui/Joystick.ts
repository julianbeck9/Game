import Phaser from 'phaser';
import { Vec } from '../core/geometry';
import { JOYSTICK_R, GAME_W } from '../config';

/**
 * Floating virtual joystick: appears where the left-half touch lands,
 * follows the drag, disappears on release.
 */
export class Joystick {
  /** Normalized output vector, magnitude 0..1. Zero when inactive. */
  vec: Vec = { x: 0, y: 0 };
  active = false;

  private pointerId = -1;
  private baseX = 0;
  private baseY = 0;
  private gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(1000).setScrollFactor(0);

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.active || p.x >= GAME_W / 2) return;
      this.active = true;
      this.pointerId = p.id;
      this.baseX = p.x;
      this.baseY = p.y;
      this.vec = { x: 0, y: 0 };
    });

    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.active || p.id !== this.pointerId) return;
      const dx = p.x - this.baseX;
      const dy = p.y - this.baseY;
      const d = Math.sqrt(dx * dx + dy * dy);
      const clamped = Math.min(d, JOYSTICK_R);
      if (d > 0) {
        this.vec = { x: (dx / d) * (clamped / JOYSTICK_R), y: (dy / d) * (clamped / JOYSTICK_R) };
      }
    });

    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.pointerId) return;
      this.active = false;
      this.pointerId = -1;
      this.vec = { x: 0, y: 0 };
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
  }

  draw(): void {
    const g = this.gfx;
    g.clear();
    if (!this.active) return;
    g.lineStyle(3, 0xffffff, 0.25);
    g.strokeCircle(this.baseX, this.baseY, JOYSTICK_R);
    g.fillStyle(0xffffff, 0.06);
    g.fillCircle(this.baseX, this.baseY, JOYSTICK_R);
    const kx = this.baseX + this.vec.x * JOYSTICK_R;
    const ky = this.baseY + this.vec.y * JOYSTICK_R;
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(kx, ky, 40);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
