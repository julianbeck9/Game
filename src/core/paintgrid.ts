import { GAME_W, GAME_H } from '../config';

/**
 * Freehand collision is painted onto a coarse cell grid: the editor brushes
 * cells as wall / water / lava, and geometry tests circles against the painted
 * cells. Much friendlier than placing boxes for irregular, isometric art.
 */
export const CELL = 24;
export const COLS = Math.ceil(GAME_W / CELL);
export const ROWS = Math.ceil(GAME_H / CELL);

// The grid used to be coarser (48px). Cells painted then are half-resolution;
// expandLegacy() converts an old index into its 2×2 block on the current grid,
// so baked and saved paint survive the finer grid.
export const LEGACY_CELL = 48;
export const LEGACY_COLS = Math.ceil(GAME_W / LEGACY_CELL);
const SCALE = Math.round(LEGACY_CELL / CELL); // 2

export function expandLegacy(cells: number[]): number[] {
  if (SCALE === 1) return cells.slice();
  const out: number[] = [];
  for (const i of cells) {
    const c = i % LEGACY_COLS;
    const r = Math.floor(i / LEGACY_COLS);
    for (let dr = 0; dr < SCALE; dr++) {
      for (let dc = 0; dc < SCALE; dc++) {
        const nc = c * SCALE + dc;
        const nr = r * SCALE + dr;
        if (nc < COLS && nr < ROWS) out.push(nr * COLS + nc);
      }
    }
  }
  return out;
}

export function expandLegacyLayers(p: PaintLayers): PaintLayers {
  return {
    wall: expandLegacy(p.wall),
    air: expandLegacy(p.air ?? []),
    water: expandLegacy(p.water),
    lava: expandLegacy(p.lava),
  };
}

// wall  = blocks walk + dash + projectiles (solid stone)
// air   = blocks walk + dash, projectiles fly through (a chasm/void edge)
// water = blocks walk only (dash + shots cross)
// lava  = blocks walk only (dash + shots cross)
export type PaintKind = 'wall' | 'air' | 'water' | 'lava';

export interface PaintLayers {
  wall: number[];
  air: number[];
  water: number[];
  lava: number[];
}

export function cellIndex(col: number, row: number): number {
  return row * COLS + col;
}

export function cellCol(i: number): number {
  return i % COLS;
}

export function cellRow(i: number): number {
  return Math.floor(i / COLS);
}
