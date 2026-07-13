import { FIELD, activeObstacles, activeTerrain, activeWalls, activePaint } from './maps';
import { CELL, COLS, ROWS } from './paintgrid';

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

/** Clamp a circle of radius r to stay inside the fullscreen field. */
export function clampToArena(x: number, y: number, r: number): Vec {
  return {
    x: Math.min(FIELD.x2 - r, Math.max(FIELD.x1 + r, x)),
    y: Math.min(FIELD.y2 - r, Math.max(FIELD.y1 + r, y)),
  };
}

/** Push a circle of radius r out of any map obstacle it overlaps. */
export function resolvePillars(x: number, y: number, r: number): Vec {
  let px = x;
  let py = y;
  for (const p of activeObstacles()) {
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
  for (const p of activeObstacles()) {
    if (dist(x, y, p.x, p.y) < p.r + r) return true;
  }
  return false;
}

/** Center-anchored rectangle, optionally rotated by `rot` degrees. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
}

/** Point in the rect's local (un-rotated) frame. */
function localOf(px: number, py: number, rct: Rect): Vec {
  const a = -((rct.rot ?? 0) * Math.PI) / 180;
  const dx = px - rct.x;
  const dy = py - rct.y;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

/** Is a circle (radius r) overlapping the (possibly rotated) rect? */
function rectContains(px: number, py: number, r: number, rct: Rect): boolean {
  const l = localOf(px, py, rct);
  return Math.abs(l.x) < rct.w / 2 + r && Math.abs(l.y) < rct.h / 2 + r;
}

/** Push a circle out of a (possibly rotated) rect along its shallow local axis. */
function rectResolve(px: number, py: number, r: number, rct: Rect): Vec {
  const l = localOf(px, py, rct);
  const hw = rct.w / 2 + r;
  const hh = rct.h / 2 + r;
  if (Math.abs(l.x) >= hw || Math.abs(l.y) >= hh) return { x: px, y: py };
  const ox = hw - Math.abs(l.x);
  const oy = hh - Math.abs(l.y);
  let nlx = l.x;
  let nly = l.y;
  if (ox < oy) nlx = l.x < 0 ? -hw : hw;
  else nly = l.y < 0 ? -hh : hh;
  const a = ((rct.rot ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: rct.x + nlx * c - nly * s, y: rct.y + nlx * s + nly * c };
}

// ---- painted-cell collision (freehand editor) ----

/** Does a circle overlap any painted cell in `set`? */
function inCells(x: number, y: number, r: number, set: Set<number>): boolean {
  if (set.size === 0) return false;
  const c0 = Math.floor((x - r) / CELL);
  const c1 = Math.floor((x + r) / CELL);
  const r0 = Math.floor((y - r) / CELL);
  const r1 = Math.floor((y + r) / CELL);
  for (let rr = r0; rr <= r1; rr++) {
    for (let cc = c0; cc <= c1; cc++) {
      if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
      if (!set.has(rr * COLS + cc)) continue;
      const cx = cc * CELL;
      const cy = rr * CELL;
      const nx = Math.max(cx, Math.min(x, cx + CELL));
      const ny = Math.max(cy, Math.min(y, cy + CELL));
      if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
    }
  }
  return false;
}

/** Push a circle out of painted cells (edge-based, so it slides along contours). */
function resolveCells(x: number, y: number, r: number, set: Set<number>): Vec {
  if (set.size === 0) return { x, y };
  let px = x;
  let py = y;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    const c0 = Math.floor((px - r) / CELL);
    const c1 = Math.floor((px + r) / CELL);
    const r0 = Math.floor((py - r) / CELL);
    const r1 = Math.floor((py + r) / CELL);
    for (let rr = r0; rr <= r1 && !moved; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
        if (!set.has(rr * COLS + cc)) continue;
        const cx = cc * CELL;
        const cy = rr * CELL;
        const ex = cx + CELL;
        const ey = cy + CELL;
        const nx = Math.max(cx, Math.min(px, ex));
        const ny = Math.max(cy, Math.min(py, ey));
        const dx = px - nx;
        const dy = py - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1e-6 && d2 < r * r) {
          const d = Math.sqrt(d2);
          const push = r - d;
          px += (dx / d) * push;
          py += (dy / d) * push;
          moved = true;
          break;
        }
        if (d2 <= 1e-6) {
          // centre inside the cell: eject to the nearest edge
          const m = Math.min(px - cx, ex - px, py - cy, ey - py);
          if (m === px - cx) px = cx - r;
          else if (m === ex - px) px = ex + r;
          else if (m === py - cy) py = cy - r;
          else py = ey + r;
          moved = true;
          break;
        }
      }
    }
    if (!moved) break;
  }
  return { x: px, y: py };
}

/**
 * Push a circle of radius r out of any impassable terrain zone (water/lava).
 * Terrain blocks WALKING only — dashes pass over it, so this is applied by
 * moveBy when overTerrain is false.
 */
export function resolveTerrain(x: number, y: number, r: number): Vec {
  let p = { x, y };
  for (const t of activeTerrain()) p = rectResolve(p.x, p.y, r, t);
  const paint = activePaint();
  p = resolveCells(p.x, p.y, r, paint.water);
  p = resolveCells(p.x, p.y, r, paint.lava);
  return p;
}

/** Is the point inside any terrain zone (for lava damage checks, spawn avoidance)? */
export function pointInTerrain(x: number, y: number, r = 0): boolean {
  for (const t of activeTerrain()) if (rectContains(x, y, r, t)) return true;
  const paint = activePaint();
  return inCells(x, y, r, paint.water) || inCells(x, y, r, paint.lava);
}

/**
 * Push a circle of radius r out of any solid wall it overlaps. Unlike terrain,
 * walls are hard: they block WALKING and DASHING alike, so moveBy always
 * applies this (even when overTerrain is true).
 */
export function resolveWalls(x: number, y: number, r: number): Vec {
  let p = { x, y };
  for (const w of activeWalls()) p = rectResolve(p.x, p.y, r, w);
  p = resolveCells(p.x, p.y, r, activePaint().wall);
  return p;
}

/** Is the point inside a solid wall (projectiles are eaten by walls)? */
export function pointInWall(x: number, y: number, r = 0): boolean {
  for (const w of activeWalls()) if (rectContains(x, y, r, w)) return true;
  return inCells(x, y, r, activePaint().wall);
}
