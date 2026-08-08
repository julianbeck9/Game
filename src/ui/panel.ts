import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';

/**
 * Shared UI primitives.
 *
 * Every between-round screen was drawing its own flat rectangles on its own
 * flat near-black background, so the pick screen, the shop and the menu each
 * looked slightly different and all of them looked unfinished. These live in
 * one place so a change to the visual language reaches every screen instead of
 * one of them drifting again.
 */

// Blend two colours; t=0 -> a, t=1 -> b.
export function mix(a: number, b: number, t: number): number {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(a),
    Phaser.Display.Color.ValueToColor(b),
    100,
    t * 100,
  );
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}

// Vertical gradient as stacked bands — Phaser Graphics has no gradient fill.
export function gradient(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  top: number, bottom: number, alpha = 1, steps = 24,
): void {
  for (let i = 0; i < steps; i++) {
    g.fillStyle(mix(top, bottom, i / (steps - 1)), alpha);
    g.fillRect(x, y + (h * i) / steps, w, h / steps + 1);
  }
}

// Full-screen backdrop: gradient, a pool of light where the content sits, vignette.
export function backdrop(scene: Phaser.Scene, focusY = GAME_H / 2, accent = 0x2a3a6a): void {
  const g = scene.add.graphics().setDepth(-10);
  gradient(g, 0, 0, GAME_W, GAME_H, 0x141426, 0x07070e);
  for (let i = 10; i > 0; i--) {
    g.fillStyle(accent, 0.035);
    g.fillEllipse(GAME_W / 2, focusY, 300 + i * 190, 160 + i * 92);
  }
  for (let i = 0; i < 7; i++) {
    const t = 26 + i * 12;
    g.fillStyle(0x000000, 0.055);
    g.fillRect(0, 0, GAME_W, t);
    g.fillRect(0, GAME_H - t, GAME_W, t);
    g.fillRect(0, 0, t, GAME_H);
    g.fillRect(GAME_W - t, 0, t, GAME_H);
  }
}

/**
 * A rounded card: outer glow, dark body tinted toward `color`, coloured border.
 *
 * `glow` is the number of glow passes and is the main way rarity or price tier
 * reads before any label is. Tint the darkness — do NOT pass a darkened version
 * of `color` as the body, which turns light accents (silver) into near-white
 * slabs that drown their own text.
 */
export function cardFrame(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  color: number, glow = 4, radius = 22,
): Phaser.GameObjects.Graphics {
  const L = x - w / 2;
  const T = y - h / 2;
  const g = scene.add.graphics();
  for (let i = glow; i > 0; i--) {
    g.fillStyle(color, 0.045);
    g.fillRoundedRect(L - i * 3, T - i * 3, w + i * 6, h + i * 6, radius + i * 2);
  }
  g.fillStyle(0x1b1b2b, 1);
  g.fillRoundedRect(L, T, w, h, radius);
  gradient(g, L + 2, T + 2, w - 4, h - 4, mix(0x161622, color, 0.22), 0x0b0b13, 1, 20);
  g.lineStyle(3, color, 0.95);
  g.strokeRoundedRect(L, T, w, h, radius);
  return g;
}

/** Rounded button plate. Returns the graphics so callers can hide/redraw it. */
export function buttonPlate(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  fill: number, stroke: number, radius = 14, alpha = 1,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, radius);
  g.lineStyle(2, stroke, 1);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, radius);
  return g;
}
