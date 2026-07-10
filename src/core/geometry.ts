import { ARENA_X, ARENA_Y, ARENA_R, PILLARS } from '../config';

export interface Vec {
  x: number;
  y: number;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function norm(x: number, y: number): Vec {
  const l = len(x, y);
  if (l === 0) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return len(bx - ax, by - ay);
}

/** Clamp a circle of radius r to stay inside the arena. Returns corrected position. */
export function clampToArena(x: number, y: number, r: number): Vec {
  const dx = x - ARENA_X;
  const dy = y - ARENA_Y;
  const d = len(dx, dy);
  const max = ARENA_R - r;
  if (d <= max) return { x, y };
  const n = norm(dx, dy);
  return { x: ARENA_X + n.x * max, y: ARENA_Y + n.y * max };
}

/** Push a circle of radius r out of any pillar it overlaps. */
export function resolvePillars(x: number, y: number, r: number): Vec {
  let px = x;
  let py = y;
  for (const p of PILLARS) {
    const dx = px - p.x;
    const dy = py - p.y;
    const d = len(dx, dy);
    const min = p.r + r;
    if (d < min) {
      const n = d === 0 ? { x: 1, y: 0 } : norm(dx, dy);
      px = p.x + n.x * min;
      py = p.y + n.y * min;
    }
  }
  return { x: px, y: py };
}

export function pointInPillar(x: number, y: number, r = 0): boolean {
  for (const p of PILLARS) {
    if (dist(x, y, p.x, p.y) < p.r + r) return true;
  }
  return false;
}
