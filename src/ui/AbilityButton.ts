import Phaser from 'phaser';
import { Vec, len, norm } from '../core/geometry';

export interface AbilityButtonOpts {
  x: number;
  y: number;
  r: number;
  label: string;
  color: number;
  /** Drag past this distance switches from tap to aim mode (aimable buttons only). */
  aimable?: boolean;
  /** Tap (or aim-release) triggers the cast. dir is null for plain taps. */
  onCast: (dir: Vec | null) => void;
  /** Live aim preview while dragging (aimable only). */
  onAimPreview?: (dir: Vec | null) => void;
  /** 0 = ready, 1 = full cooldown remaining. */
  getCooldownPct: () => number;
}

const AIM_THRESHOLD = 36;

/** Touch ability button with radial cooldown overlay and optional hold-drag aiming. */
export class AbilityButton {
  private gfx: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private pointerId = -1;
  private startX = 0;
  private startY = 0;
  private aiming = false;
  private aimDir: Vec | null = null;

  constructor(
    scene: Phaser.Scene,
    private opts: AbilityButtonOpts,
  ) {
    this.gfx = scene.add.graphics().setDepth(1000).setScrollFactor(0);
    this.text = scene.add
      .text(opts.x, opts.y, opts.label, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(opts.r * 0.62)}px`,
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(1001)
      .setScrollFactor(0)
      .setAlpha(0.9);

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.pointerId !== -1) return;
      if (len(p.x - opts.x, p.y - opts.y) > opts.r) return;
      this.pointerId = p.id;
      this.startX = p.x;
      this.startY = p.y;
      this.aiming = false;
      this.aimDir = null;
    });

    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.pointerId || !opts.aimable) return;
      const dx = p.x - this.startX;
      const dy = p.y - this.startY;
      if (!this.aiming && len(dx, dy) > AIM_THRESHOLD) this.aiming = true;
      if (this.aiming) {
        this.aimDir = norm(dx, dy);
        opts.onAimPreview?.(this.aimDir);
      }
    });

    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.pointerId) return;
      this.pointerId = -1;
      opts.onAimPreview?.(null);
      if (this.aiming && this.aimDir) {
        opts.onCast(this.aimDir);
      } else {
        opts.onCast(null);
      }
      this.aiming = false;
      this.aimDir = null;
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
  }

  draw(): void {
    const { x, y, r, color } = this.opts;
    const g = this.gfx;
    const cd = this.opts.getCooldownPct();
    const held = this.pointerId !== -1;

    g.clear();
    g.fillStyle(0x000000, 0.45);
    g.fillCircle(x, y, r);
    g.fillStyle(color, cd > 0 ? 0.25 : held ? 0.95 : 0.7);
    g.fillCircle(x, y, r - 5);

    // Radial cooldown sweep (dark pie over the remaining fraction)
    if (cd > 0) {
      g.fillStyle(0x000000, 0.6);
      g.slice(x, y, r - 5, -Math.PI / 2, -Math.PI / 2 + cd * Math.PI * 2, false);
      g.fillPath();
    }

    g.lineStyle(3, 0xffffff, 0.5);
    g.strokeCircle(x, y, r);
  }

  destroy(): void {
    this.gfx.destroy();
    this.text.destroy();
  }
}
