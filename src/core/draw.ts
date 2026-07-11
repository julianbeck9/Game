import type Phaser from 'phaser';

/** Blend a color toward white (f > 0) or black (f < 0), f in [-1, 1]. */
export function shade(c: number, f: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const t = f > 0 ? 255 : 0;
  const p = Math.abs(f);
  return (
    (Math.round((t - r) * p + r) << 16) |
    (Math.round((t - g) * p + g) << 8) |
    Math.round((t - b) * p + b)
  );
}

/** Drop shadow + rim + body + top-left highlight: units read as lit spheres, not flat discs. */
export function shadedDisc(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, base: number): void {
  g.fillStyle(0x000000, 0.28);
  g.fillEllipse(x, y + r * 0.85, r * 2.15, r * 0.75);
  g.fillStyle(shade(base, -0.45), 1);
  g.fillCircle(x, y, r + 3);
  g.fillStyle(base, 1);
  g.fillCircle(x, y, r);
  g.fillStyle(shade(base, 0.4), 0.45);
  g.fillCircle(x - r * 0.28, y - r * 0.32, r * 0.55);
}

/** Small crown made of three spikes on a band. */
export function crown(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  color: number,
  alpha = 1,
): void {
  const h = w * 0.55;
  g.fillStyle(color, alpha);
  g.fillTriangle(x - w / 2, y, x - w / 6, y, x - w / 3, y - h * 0.75);
  g.fillTriangle(x - w / 6, y, x + w / 6, y, x, y - h);
  g.fillTriangle(x + w / 6, y, x + w / 2, y, x + w / 3, y - h * 0.75);
  g.fillRect(x - w / 2, y, w, h * 0.28);
}

/** Rising ember particles for ambience (menu + arena rim). */
export interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  born: number;
  life: number;
  color: number;
}

export function spawnEmber(now: number, x: number, y: number, color: number): Ember {
  return {
    x,
    y,
    vx: (Math.random() - 0.5) * 14,
    vy: -22 - Math.random() * 26,
    size: 1.5 + Math.random() * 2.5,
    born: now,
    life: 2600 + Math.random() * 2200,
    color,
  };
}

export function updateAndDrawEmbers(
  g: Phaser.GameObjects.Graphics,
  embers: Ember[],
  now: number,
  dt: number,
): Ember[] {
  let alive = embers.filter((e) => now - e.born < e.life);
  if (alive.length > 60) alive = alive.slice(alive.length - 60); // perf cap
  for (const e of alive) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    const t = (now - e.born) / e.life;
    g.fillStyle(e.color, 0.55 * (1 - t));
    g.fillCircle(e.x, e.y, e.size * (1 - t * 0.5));
  }
  return alive;
}
