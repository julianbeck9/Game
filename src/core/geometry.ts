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

/**
 * Push a circle out of painted cells, resolving only against faces exposed to
 * empty space. Internal seams between adjacent painted cells are ignored, so a
 * unit slides smoothly along the outer contour instead of snagging on the grid.
 * (Circle treated as an AABB of half-width r — smoother than per-corner pushes.)
 */
function resolveCells(x: number, y: number, r: number, solid: Set<number>): Vec {
  if (solid.size === 0) return { x, y };
  let px = x;
  let py = y;
  for (let iter = 0; iter < 6; iter++) {
    let bestPen = Infinity;
    let bestAxis = 0; // 1 = x, 2 = y
    let bestVal = 0;
    const c0 = Math.floor((px - r) / CELL);
    const c1 = Math.floor((px + r) / CELL);
    const r0 = Math.floor((py - r) / CELL);
    const r1 = Math.floor((py + r) / CELL);
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
        if (!solid.has(rr * COLS + cc)) continue;
        const cx = cc * CELL;
        const cy = rr * CELL;
        const ex = cx + CELL;
        const ey = cy + CELL;
        if (px + r <= cx || px - r >= ex || py + r <= cy || py - r >= ey) continue; // no overlap
        const solidAt = (dc: number, dr: number): boolean => {
          const nc = cc + dc;
          const nr = rr + dr;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return true; // off-grid = solid (no push outward)
          return solid.has(nr * COLS + nc);
        };
        // Candidate push-outs, only through faces exposed to empty space
        if (!solidAt(-1, 0)) {
          const pen = px + r - cx;
          if (pen > 0 && pen < bestPen) { bestPen = pen; bestAxis = 1; bestVal = cx - r; }
        }
        if (!solidAt(1, 0)) {
          const pen = ex - (px - r);
          if (pen > 0 && pen < bestPen) { bestPen = pen; bestAxis = 1; bestVal = ex + r; }
        }
        if (!solidAt(0, -1)) {
          const pen = py + r - cy;
          if (pen > 0 && pen < bestPen) { bestPen = pen; bestAxis = 2; bestVal = cy - r; }
        }
        if (!solidAt(0, 1)) {
          const pen = ey - (py - r);
          if (pen > 0 && pen < bestPen) { bestPen = pen; bestAxis = 2; bestVal = ey + r; }
        }
      }
    }
    if (bestAxis === 0) break;
    if (bestAxis === 1) px = bestVal;
    else py = bestVal;
  }
  return { x: px, y: py };
}

/** Painted-collision push-out for movement: dash blocks wall+air; walk blocks all. */
export function resolvePaintMove(x: number, y: number, r: number, overTerrain: boolean): Vec {
  const p = activePaint();
  return resolveCells(x, y, r, overTerrain ? p.dashSolid : p.walkSolid);
}

/**
 * Push a circle of radius r out of any impassable terrain zone (water/lava).
 * Terrain blocks WALKING only — dashes pass over it, so this is applied by
 * moveBy when overTerrain is false.
 */
export function resolveTerrain(x: number, y: number, r: number): Vec {
  let p = { x, y };
  for (const t of activeTerrain()) p = rectResolve(p.x, p.y, r, t);
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
  return p;
}

/** Is the point inside a solid wall (projectiles are eaten by walls)? */
export function pointInWall(x: number, y: number, r = 0): boolean {
  for (const w of activeWalls()) if (rectContains(x, y, r, w)) return true;
  return inCells(x, y, r, activePaint().wall);
}

/** One walking collision pass: pillars → terrain → walls → paint → bounds. */
function resolveWalk(x: number, y: number, r: number): Vec {
  const p1 = resolvePillars(x, y, r);
  const p2 = resolveTerrain(p1.x, p1.y, r);
  // Solid walls resolve LAST so they always win — hard cover blocks walking.
  const pw = resolveWalls(p2.x, p2.y, r);
  // Painted collision (walls/air/water/lava all block walking).
  const pp = resolvePaintMove(pw.x, pw.y, r, false);
  return clampToArena(pp.x, pp.y, r);
}

/**
 * Walk a circle of radius r by (dx, dy) against every walking collider, and
 * return where it ends up.
 *
 * Substeps so a fast move cannot tunnel through a thin wall in one hop, and —
 * importantly — **slides**: when the combined step is blocked, the axes are
 * retried separately so the mover glides along the surface. Plain push-out
 * cancels a blocked step outright, and any bot that keeps steering into the
 * same wall then recomputes the same blocked vector every frame and stands
 * still forever (B9). Since a round only ends when every enemy is dead, that
 * wedges the whole run, so sliding is a correctness fix here, not just polish.
 */
/**
 * Is a paint-grid cell somewhere a unit of radius r could stand and walk?
 *
 * Solidity must match what actually blocks walking, which is the `walkSolid`
 * set — wall ∪ **air** ∪ water ∪ lava (see maps.setActiveMap). The air layer is
 * easy to forget because no other query needs it: `pointInWall` covers wall and
 * `pointInTerrain` covers water/lava, so a check built from those two silently
 * treats every painted chasm as walkable. That made both the reachability fill
 * and the navigation field route bots straight across the gaps — which read as
 * "the B9 fix doesn't hold" in about a third of verify runs.
 */
export function cellStandable(col: number, row: number, r: number): boolean {
  const x = col * CELL + CELL / 2;
  const y = row * CELL + CELL / 2;
  if (x < FIELD.x1 + r || x > FIELD.x2 - r || y < FIELD.y1 + r || y > FIELD.y2 - r) return false;
  if (pointInPillar(x, y, r)) return false;
  for (const w of activeWalls()) if (rectContains(x, y, r, w)) return false;
  for (const t of activeTerrain()) if (rectContains(x, y, r, t)) return false;
  return !inCells(x, y, r, activePaint().walkSolid);
}

/**
 * Can a unit of radius r actually walk from (ax, ay) to within reach of
 * (bx, by)? A flood fill over the 24px paint grid — 80×45 cells, so a few
 * thousand cheap checks, run only when something spawns.
 *
 * This replaced a "walk 12 steps and see if you got anywhere" probe, which was
 * the wrong tool: it only proved the spot wasn't a one-cell hole, so any sealed
 * pocket wider than ~144px passed it and the enemy inside still hung the round.
 * Connectivity is not a local property, and nothing short of a fill decides it.
 */
export function canReach(ax: number, ay: number, bx: number, by: number, r: number): boolean {
  const startC = Math.floor(ax / CELL);
  const startR = Math.floor(ay / CELL);
  if (startC < 0 || startC >= COLS || startR < 0 || startR >= ROWS) return false;

  const seen = new Uint8Array(COLS * ROWS);
  const queue: number[] = [startR * COLS + startC];
  seen[startR * COLS + startC] = 1;
  // Arriving near the target is enough: it may itself be standing tight to a
  // wall, which would make its own cell impassable at this radius.
  const NEAR = 120;

  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const c = idx % COLS;
    const rr = (idx - c) / COLS;
    const x = c * CELL + CELL / 2;
    const y = rr * CELL + CELL / 2;
    if (Math.hypot(x - bx, y - by) <= NEAR) return true;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nc = c + dc;
      const nr = rr + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const ni = nr * COLS + nc;
      if (seen[ni]) continue;
      seen[ni] = 1;
      if (cellStandable(nc, nr, r)) queue.push(ni);
    }
  }
  return false;
}

/**
 * Nearest spot to (x, y) that a unit of radius r can actually be dropped into
 * and then leave, heading roughly `toward`.
 *
 * Spawn points are authored as fixed coordinates (see ArenaScene: enemies land
 * on a row at y=210) while collision is painted per map, so a spawn can end up
 * inside a sealed pocket of baked geometry. A unit there is not merely blocked
 * in one direction — every heading is walled — so no amount of steering or
 * detouring frees it, and a round that only ends when all enemies die can never
 * end (B9). Being free at the point itself is not enough: the check walks a
 * short way to confirm the spot is genuinely open and not a one-cell hole.
 */
export function findOpenSpawn(x: number, y: number, r: number, toward: Vec): Vec {
  const usable = (px: number, py: number): boolean => {
    if (pointInWall(px, py, r) || pointInTerrain(px, py, r) || pointInPillar(px, py, r)) return false;
    return canReach(px, py, toward.x, toward.y, r);
  };

  if (usable(x, y)) return { x, y };
  // Widening rings, rotated per ring so successive rings don't retest one line.
  for (let ring = 1; ring <= 16; ring++) {
    const rad = ring * 40;
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2 + ring * 0.3;
      const c = clampToArena(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, r);
      if (usable(c.x, c.y)) return c;
    }
  }
  return clampToArena(x, y, r); // nothing better anywhere — keep the original
}

export function walkStep(x: number, y: number, r: number, dx: number, dy: number): Vec {
  const dlen = Math.sqrt(dx * dx + dy * dy);
  const steps = dlen > 8 ? Math.ceil(dlen / 8) : 1;
  const sx = dx / steps;
  const sy = dy / steps;
  const stepLen = Math.sqrt(sx * sx + sy * sy);
  let cx = x;
  let cy = y;
  if (stepLen < 0.0001) return { x: cx, y: cy };
  // Progress is measured ALONG the intended direction, not as raw displacement:
  // a push-out that shoves the mover backwards also "moves" it, and picking by
  // distance alone would happily choose that over standing still.
  const progress = (p: Vec) => ((p.x - cx) * sx + (p.y - cy) * sy) / stepLen;
  for (let i = 0; i < steps; i++) {
    const full = resolveWalk(cx + sx, cy + sy, r);
    if (progress(full) < stepLen * 0.5) {
      const ax = resolveWalk(cx + sx, cy, r);
      const ay = resolveWalk(cx, cy + sy, r);
      const best = progress(ax) >= progress(ay) ? ax : ay;
      if (progress(best) > progress(full)) {
        cx = best.x;
        cy = best.y;
        continue;
      }
    }
    cx = full.x;
    cy = full.y;
  }
  return { x: cx, y: cy };
}
