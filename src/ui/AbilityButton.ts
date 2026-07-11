import Phaser from 'phaser';
import { Vec, len, norm } from '../core/geometry';
import { shade } from '../core/draw';

export interface AbilityButtonOpts {
  x: number;
  y: number;
  r: number;
  /** Small key hint shown at the bottom edge (desktop affordance). */
  label: string;
  color: number;
  /** Vector icon drawn at the button center. */
  drawIcon: (g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) => void;
  /** Drag past this distance switches from tap to aim mode (aimable buttons only). */
  aimable?: boolean;
  /** Tap (or aim-release) triggers the cast. dir is null for plain taps. */
  onCast: (dir: Vec | null) => void;
  /** Live aim preview while dragging (aimable only). */
  onAimPreview?: (dir: Vec | null) => void;
  /** 0 = ready, 1 = full cooldown remaining. */
  getCooldownPct: () => number;
  /** Charge pips (dash with Doppeltritt). */
  getCharges?: () => { avail: number; max: number };
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
      .text(opts.x, opts.y + opts.r - 16, opts.label, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(opts.r * 0.26)}px`,
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(1001)
      .setScrollFactor(0)
      .setAlpha(0.55);

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
    const ready = cd <= 0;

    g.clear();
    // Base plate
    g.fillStyle(0x000000, 0.5);
    g.fillCircle(x, y + 3, r);
    g.fillStyle(shade(color, -0.55), 1);
    g.fillCircle(x, y, r);
    g.fillStyle(color, ready ? (held ? 1 : 0.85) : 0.3);
    g.fillCircle(x, y, r - 5);
    if (ready) {
      g.fillStyle(shade(color, 0.35), 0.4);
      g.fillCircle(x - r * 0.25, y - r * 0.3, r * 0.5);
    }

    // Icon
    g.lineStyle(0, 0, 0);
    this.opts.drawIcon(g, x, y - 2, r * 0.52);

    // Radial cooldown sweep (dark pie over the remaining fraction)
    if (cd > 0) {
      g.fillStyle(0x000000, 0.62);
      g.slice(x, y, r - 5, -Math.PI / 2, -Math.PI / 2 + cd * Math.PI * 2, false);
      g.fillPath();
    }

    g.lineStyle(3, ready ? 0xffffff : 0x888899, ready ? 0.65 : 0.4);
    g.strokeCircle(x, y, r);

    // Charge pips
    const ch = this.opts.getCharges?.();
    if (ch && ch.max > 1) {
      for (let i = 0; i < ch.max; i++) {
        const px = x - (ch.max - 1) * 10 + i * 20;
        g.fillStyle(i < ch.avail ? 0xffffff : 0x333344, 0.95);
        g.fillCircle(px, y + r + 14, 6);
      }
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.text.destroy();
  }
}
