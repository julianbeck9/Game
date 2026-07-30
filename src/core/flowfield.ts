import { CELL, COLS, ROWS } from './paintgrid';
import { activeMap } from './maps';
import { cellStandable, norm, type Vec } from './geometry';

/**
 * Navigation for bots, on the same 24px grid the collision is painted on.
 *
 * Enemies used to steer in a straight line at a ring slot around the player,
 * with no knowledge of geometry at all. On the nine maps with baked collision
 * that means a wall between bot and player is simply never solved: the bot
 * grinds into it, and because a round only ends when every enemy is dead, the
 * run hangs (B9). Wall sliding and sideways "detour" headings both help a bot
 * leave a corner, but neither can route *around* an obstacle — bouncing off
 * walls is not navigation, and measurement showed exactly that: blocked foes
 * stopped freezing and started wandering off instead of arriving.
 *
 * So: one breadth-first distance field per (map, target cell, radius), and every
 * bot walks downhill on it. Costs one pass over ~3600 cells, and the cache key
 * includes the target's CELL, so it is rebuilt only when the player crosses a
 * cell boundary — not per frame, and shared by the whole squad.
 */

const UNREACHED = -1;

interface Field {
  key: string;
  dist: Int32Array;
}

let cached: Field | null = null;

/** Seed radius: the target may itself stand tight to a wall. */
const SEED_NEAR = 90;

function buildField(tx: number, ty: number, r: number): Int32Array {
  const dist = new Int32Array(COLS * ROWS).fill(UNREACHED);
  const queue: number[] = [];

  // Seed every standable cell near the target, rather than the target's own
  // cell: at a unit's radius that cell can be unstandable while the unit is
  // legitimately standing there, which would leave the field entirely empty.
  const near = Math.ceil(SEED_NEAR / CELL);
  const tc = Math.floor(tx / CELL);
  const tr = Math.floor(ty / CELL);
  for (let dr = -near; dr <= near; dr++) {
    for (let dc = -near; dc <= near; dc++) {
      const c = tc + dc;
      const rr = tr + dr;
      if (c < 0 || c >= COLS || rr < 0 || rr >= ROWS) continue;
      if (!cellStandable(c, rr, r)) continue;
      const i = rr * COLS + c;
      if (dist[i] !== UNREACHED) continue;
      dist[i] = 0;
      queue.push(i);
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const c = i % COLS;
    const rr = (i - c) / COLS;
    const next = dist[i] + 1;
    for (let k = 0; k < 4; k++) {
      const nc = c + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const nr = rr + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const ni = nr * COLS + nc;
      if (dist[ni] !== UNREACHED) continue;
      if (!cellStandable(nc, nr, r)) continue;
      dist[ni] = next;
      queue.push(ni);
    }
  }
  return dist;
}

function fieldTo(tx: number, ty: number, r: number): Int32Array {
  const key = `${activeMap().id}|${Math.floor(tx / CELL)},${Math.floor(ty / CELL)}|${r}`;
  if (cached && cached.key === key) return cached.dist;
  cached = { key, dist: buildField(tx, ty, r) };
  return cached.dist;
}

/** Drop the cached field (map changed, or a test wants a clean slate). */
export function resetFlowField(): void {
  cached = null;
}

/**
 * Unit vector from (x, y) toward the target along the navigable route, or null
 * when the field cannot advise — off-grid, already at the target, or no route
 * at all. Callers fall back to their own steering in that case.
 */
export function flowDir(x: number, y: number, tx: number, ty: number, r: number): Vec | null {
  const dist = fieldTo(tx, ty, r);
  const c = Math.floor(x / CELL);
  const rr = Math.floor(y / CELL);
  if (c < 0 || c >= COLS || rr < 0 || rr >= ROWS) return null;

  const here = dist[rr * COLS + c];
  if (here === 0) return null; // already in the target's pocket; band logic takes over

  // Eight-way so movement reads as diagonal rather than staircased. An unreached
  // cell (including the bot's own, when it has been pushed inside geometry) is
  // treated as "infinitely far", so any reachable neighbour still looks better.
  const from = here === UNREACHED ? Number.POSITIVE_INFINITY : here;
  let best = from;
  let bx = 0;
  let by = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dc === 0 && dr === 0) continue;
      const nc = c + dc;
      const nr = rr + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const d = dist[nr * COLS + nc];
      if (d === UNREACHED) continue;
      // Don't cut a diagonal through a corner the body cannot fit past.
      if (dc !== 0 && dr !== 0 && (!cellStandable(c + dc, rr, r) || !cellStandable(c, rr + dr, r))) continue;
      if (d < best) {
        best = d;
        bx = dc;
        by = dr;
      }
    }
  }
  if (bx === 0 && by === 0) return null;
  return norm(bx, by);
}
