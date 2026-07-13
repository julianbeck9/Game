import { GAME_W, GAME_H } from '../config';

/**
 * Freehand collision is painted onto a coarse cell grid: the editor brushes
 * cells as wall / water / lava, and geometry tests circles against the painted
 * cells. Much friendlier than placing boxes for irregular, isometric art.
 */
export const CELL = 48;
export const COLS = Math.ceil(GAME_W / CELL);
export const ROWS = Math.ceil(GAME_H / CELL);

export type PaintKind = 'wall' | 'water' | 'lava';

export interface PaintLayers {
  wall: number[];
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
