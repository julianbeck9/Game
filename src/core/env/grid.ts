import { CELL, COLS, ROWS } from '../paintgrid';
import type { PaintSets } from '../maps';

/**
 * Read-only analysis of the baked collision grid, for rendering only.
 *
 * The paint grid is gameplay truth (core/bakedPaint.ts + core/geometry.ts) and
 * nothing here may write to it. What this module does is turn "which cells are
 * solid" into the derived fields a renderer needs — how deep into a chasm a
 * cell is, which faces of a wall are exposed, where a wall's shadow falls — so
 * the environment layer can DRAW the collision the player is already fighting
 * against instead of inventing a second, prettier version of it that lies.
 */

export const N = COLS * ROWS;

/** Layer bits, packed one per cell. */
export const enum Solid {
  Wall = 1,
  Air = 2,
  Water = 4,
  Lava = 8,
}
/** Blocks walking — the union the player actually collides with. */
export const BLOCKING = Solid.Wall | Solid.Air | Solid.Water | Solid.Lava;
/** Stands above the floor plane (casts a shadow onto it). */
export const RAISED = Solid.Wall;

export interface CellFields {
  /** Per-cell layer bits. */
  mask: Uint8Array;
  /** For chasm cells: 1 at the rim, growing inward. 0 elsewhere. */
  airDepth: Uint8Array;
  /** For wall cells: 1 at the outer face, growing inward. 0 elsewhere. */
  wallDepth: Uint8Array;
  /** For water cells: 1 at the shore, growing inward. 0 elsewhere. */
  waterDepth: Uint8Array;
  /** For lava cells: 1 at the shore, growing inward. 0 elsewhere. */
  lavaDepth: Uint8Array;
  /**
   * 0..1 shadow cast by raised geometry onto open floor, sampled along the
   * light direction (up-left, per ARTDIRECTION rule 2). Open cells only.
   */
  shadow: Float32Array;
}

export const idx = (col: number, row: number): number => row * COLS + col;
export const colOf = (i: number): number => i % COLS;
export const rowOf = (i: number): number => (i - (i % COLS)) / COLS;
/** Centre of a cell in world pixels. */
export const cellCX = (col: number): number => col * CELL + CELL / 2;
export const cellCY = (row: number): number => row * CELL + CELL / 2;

/**
 * Distance (in cells) from the outside of `bit`, for cells that have `bit`.
 * A plain BFS: rim cells get 1, their inner neighbours 2, and so on. Capped at
 * 255 because the result is a Uint8Array and no arena is 255 cells thick.
 */
function depthInto(mask: Uint8Array, bit: number): Uint8Array {
  const out = new Uint8Array(N);
  const queue = new Int32Array(N);
  let head = 0;
  let tail = 0;

  // Seed: every cell with `bit` that touches a cell without it (or the grid edge).
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = idx(c, r);
      if ((mask[i] & bit) === 0) continue;
      const open =
        c === 0 || c === COLS - 1 || r === 0 || r === ROWS - 1 ||
        (mask[i - 1] & bit) === 0 ||
        (mask[i + 1] & bit) === 0 ||
        (mask[i - COLS] & bit) === 0 ||
        (mask[i + COLS] & bit) === 0;
      if (open) {
        out[i] = 1;
        queue[tail++] = i;
      }
    }
  }

  while (head < tail) {
    const i = queue[head++];
    const c = colOf(i);
    const r = rowOf(i);
    const d = out[i];
    if (d >= 255) continue;
    for (let k = 0; k < 4; k++) {
      const nc = c + (k === 0 ? -1 : k === 1 ? 1 : 0);
      const nr = r + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const ni = idx(nc, nr);
      if ((mask[ni] & bit) === 0 || out[ni] !== 0) continue;
      out[ni] = d + 1;
      queue[tail++] = ni;
    }
  }
  return out;
}

/**
 * Cheap directional shadow: from each open cell, walk toward the light
 * (up-left) and see how soon raised geometry blocks it. Near occluders throw a
 * dark shadow, far ones a faint one — which is the whole reason walls read as
 * standing ON the floor rather than being painted into it.
 *
 * A real shadow map is unnecessary here: the light is fixed by the art
 * direction and never moves, so this can be baked once per map.
 */
function shadowField(mask: Uint8Array, reach = 5): Float32Array {
  const out = new Float32Array(N);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = idx(c, r);
      if (mask[i] & BLOCKING) continue; // only open floor receives shadow
      for (let k = 1; k <= reach; k++) {
        const sc = c - k;
        const sr = r - k;
        if (sc < 0 || sr < 0) break;
        if (mask[idx(sc, sr)] & RAISED) {
          out[i] = 1 - (k - 1) / reach;
          break;
        }
      }
    }
  }
  return out;
}

/** Build every derived field for one map's paint. Called once per map load. */
export function analyse(paint: PaintSets): CellFields {
  const mask = new Uint8Array(N);
  for (const i of paint.wall) if (i >= 0 && i < N) mask[i] |= Solid.Wall;
  for (const i of paint.air) if (i >= 0 && i < N) mask[i] |= Solid.Air;
  for (const i of paint.water) if (i >= 0 && i < N) mask[i] |= Solid.Water;
  for (const i of paint.lava) if (i >= 0 && i < N) mask[i] |= Solid.Lava;

  return {
    mask,
    airDepth: depthInto(mask, Solid.Air),
    wallDepth: depthInto(mask, Solid.Wall),
    waterDepth: depthInto(mask, Solid.Water),
    lavaDepth: depthInto(mask, Solid.Lava),
    shadow: shadowField(mask),
  };
}

/** Is (col,row) inside the grid and carrying `bit`? Off-grid counts as absent. */
export function has(mask: Uint8Array, col: number, row: number, bit: number): boolean {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  return (mask[idx(col, row)] & bit) !== 0;
}

export interface Face {
  col: number;
  row: number;
  /** 0 = north, 1 = east, 2 = south, 3 = west. */
  dir: 0 | 1 | 2 | 3;
}

/**
 * Every cell face where `bit` meets something that is not `bit` — the outline
 * of a chasm, a wall or a shoreline, one 24px segment at a time.
 */
export function faces(mask: Uint8Array, bit: number): Face[] {
  const out: Face[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!has(mask, c, r, bit)) continue;
      if (!has(mask, c, r - 1, bit)) out.push({ col: c, row: r, dir: 0 });
      if (!has(mask, c + 1, r, bit)) out.push({ col: c, row: r, dir: 1 });
      if (!has(mask, c, r + 1, bit)) out.push({ col: c, row: r, dir: 2 });
      if (!has(mask, c - 1, r, bit)) out.push({ col: c, row: r, dir: 3 });
    }
  }
  return out;
}

/** World-space endpoints of a cell face, clockwise around the cell. */
export function faceSegment(f: Face): { x1: number; y1: number; x2: number; y2: number } {
  const x = f.col * CELL;
  const y = f.row * CELL;
  switch (f.dir) {
    case 0:
      return { x1: x, y1: y, x2: x + CELL, y2: y };
    case 1:
      return { x1: x + CELL, y1: y, x2: x + CELL, y2: y + CELL };
    case 2:
      return { x1: x, y1: y + CELL, x2: x + CELL, y2: y + CELL };
    default:
      return { x1: x, y1: y, x2: x, y2: y + CELL };
  }
}

/**
 * How lit a face is, given the fixed up-left key light. North and west faces
 * catch it, south and east faces turn away. Used so a chasm rim and a wall top
 * are bright where the painting is bright and dark where it is dark — an
 * overlay that disagrees with the art underneath reads as a bug, not as depth.
 */
export function faceLight(dir: 0 | 1 | 2 | 3): number {
  return dir === 0 ? 1 : dir === 3 ? 0.78 : dir === 1 ? 0.22 : 0.1;
}

/** Bilinear sample of a per-cell field at fractional cell coordinates. */
export function sampleField(f: ArrayLike<number>, cx: number, cy: number): number {
  const c0 = Math.max(0, Math.min(COLS - 1, Math.floor(cx)));
  const r0 = Math.max(0, Math.min(ROWS - 1, Math.floor(cy)));
  const c1 = Math.min(COLS - 1, c0 + 1);
  const r1 = Math.min(ROWS - 1, r0 + 1);
  const tx = Math.max(0, Math.min(1, cx - c0));
  const ty = Math.max(0, Math.min(1, cy - r0));
  const a = f[idx(c0, r0)] * (1 - tx) + f[idx(c1, r0)] * tx;
  const b = f[idx(c0, r1)] * (1 - tx) + f[idx(c1, r1)] * tx;
  return a * (1 - ty) + b * ty;
}

/** Which layer bit (if any) covers a world point. 0 when the floor is open. */
export function bitAt(mask: Uint8Array, x: number, y: number): number {
  const c = Math.floor(x / CELL);
  const r = Math.floor(y / CELL);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return 0;
  return mask[idx(c, r)];
}
