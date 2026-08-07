import type Phaser from 'phaser';

/** Best-effort fullscreen toggle (iPhone Safari has no element fullscreen — fail silently). */
export function toggleFullscreen(scene: Phaser.Scene): void {
  try {
    if (scene.scale.isFullscreen) {
      scene.scale.stopFullscreen();
    } else {
      scene.scale.startFullscreen();
    }
  } catch {
    // unsupported — the "add to home screen" route is the real fullscreen on iOS
  }
}

/**
 * Small ⛶ button in a corner. Returns a redraw-free static button.
 *
 * `layer` is the counter-transformed UI container used by scenes whose camera
 * zooms or scrolls (see `hudTransform` in core/camera); omit it in scenes with
 * a static camera.
 */
export function addFullscreenButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  layer?: Phaser.GameObjects.Container,
): void {
  const g = scene.add.graphics().setDepth(1002).setScrollFactor(0);
  const r = 34;
  g.fillStyle(0x0a0a14, 0.72);
  g.fillRoundedRect(x - r, y - r, r * 2, r * 2, 10);
  g.lineStyle(2, 0x3a3a55, 0.9);
  g.strokeRoundedRect(x - r, y - r, r * 2, r * 2, 10);
  // Four corner brackets
  g.lineStyle(4, 0xc8d0e8, 0.9);
  const s = 12;
  const o = 14;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    g.beginPath();
    g.moveTo(x + sx * o, y + sy * (o - s));
    g.lineTo(x + sx * o, y + sy * o);
    g.lineTo(x + sx * (o - s), y + sy * o);
    g.strokePath();
  }
  const zone = scene.add
    .zone(x, y, r * 2, r * 2)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true })
    .setDepth(1002)
    .setScrollFactor(0);
  zone.on('pointerdown', () => toggleFullscreen(scene));
  layer?.add([g, zone]);
}
