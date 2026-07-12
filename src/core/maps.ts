import { GAME_W, GAME_H } from '../config';

/**
 * Fullscreen battle maps. Each map is a themed rectangle: the whole screen
 * is the arena. Regions riff on four classic fantasy-faction moods —
 * blossom gardens, desert ruins, brutal war-pits, marble courts — with
 * original names and layouts.
 */

export interface MapObstacle {
  x: number;
  y: number;
  r: number;
}

export type ObstacleStyle = 'baum' | 'obelisk' | 'stachel' | 'saeule' | 'fels';
export type AmbientKind = 'petals' | 'sand' | 'embers' | 'motes';

export interface MapDef {
  id: string;
  name: string;
  region: string;
  /** Floor tones: [dark base, mid tile, light tile accent]. */
  floor: [number, number, number];
  /** Painted line/decal color and screen-edge frame color. */
  line: number;
  rim: number;
  obstacleStyle: ObstacleStyle;
  obstacleColor: number;
  obstacles: MapObstacle[];
  ambient: AmbientKind;
  ambientColor: number;
  /** Deterministic decor seed so a map always looks the same. */
  seed: number;
}

/** Playable field bounds (units clamp to this rect). */
export const FIELD = { x1: 26, y1: 26, x2: GAME_W - 26, y2: GAME_H - 26 };

const CX = GAME_W / 2;
const CY = GAME_H / 2;

export const MAPS: MapDef[] = [
  {
    id: 'kirschgarten',
    name: 'Kirschgarten',
    region: 'Ionia',
    floor: [0x14201a, 0x1a2a20, 0x223528],
    line: 0x3a5a48,
    rim: 0xdd88aa,
    obstacleStyle: 'baum',
    obstacleColor: 0xe89ab8,
    obstacles: [
      { x: CX - 520, y: CY - 200, r: 56 },
      { x: CX + 520, y: CY + 200, r: 56 },
      { x: CX - 380, y: CY + 300, r: 44 },
      { x: CX + 380, y: CY - 300, r: 44 },
    ],
    ambient: 'petals',
    ambientColor: 0xf0b8cc,
    seed: 11,
  },
  {
    id: 'windklippen',
    name: 'Windklippen',
    region: 'Ionia',
    floor: [0x16222c, 0x1c2c38, 0x243846],
    line: 0x3a5a6a,
    rim: 0x7fd8f0,
    obstacleStyle: 'fels',
    obstacleColor: 0x4a6a7a,
    obstacles: [
      { x: CX, y: CY, r: 70 },
      { x: CX - 620, y: CY + 60, r: 48 },
      { x: CX + 620, y: CY - 60, r: 48 },
    ],
    ambient: 'motes',
    ambientColor: 0xaee8f8,
    seed: 23,
  },
  {
    id: 'sonnengrab',
    name: 'Sonnengrab',
    region: 'Shurima',
    floor: [0x2a2114, 0x35291a, 0x413320],
    line: 0x6a5a2a,
    rim: 0xf0c860,
    obstacleStyle: 'obelisk',
    obstacleColor: 0xd8b060,
    obstacles: [
      { x: CX - 460, y: CY - 240, r: 50 },
      { x: CX + 460, y: CY - 240, r: 50 },
      { x: CX - 460, y: CY + 240, r: 50 },
      { x: CX + 460, y: CY + 240, r: 50 },
    ],
    ambient: 'sand',
    ambientColor: 0xd8b878,
    seed: 37,
  },
  {
    id: 'gleisskanal',
    name: 'Gleißkanal',
    region: 'Shurima',
    floor: [0x261e12, 0x322818, 0x3e321e],
    line: 0x7a6228,
    rim: 0x9fe8ff,
    obstacleStyle: 'saeule',
    obstacleColor: 0xc8a850,
    obstacles: [
      { x: CX - 240, y: CY, r: 52 },
      { x: CX + 240, y: CY, r: 52 },
      { x: CX, y: CY - 330, r: 44 },
      { x: CX, y: CY + 330, r: 44 },
    ],
    ambient: 'motes',
    ambientColor: 0x9fe8ff,
    seed: 41,
  },
  {
    id: 'schlachtgrube',
    name: 'Schlachtgrube',
    region: 'Noxus',
    floor: [0x1e1414, 0x281a1a, 0x322020],
    line: 0x5a2a2a,
    rim: 0xcc3344,
    obstacleStyle: 'stachel',
    obstacleColor: 0x663333,
    obstacles: [
      { x: CX - 560, y: CY, r: 54 },
      { x: CX + 560, y: CY, r: 54 },
      { x: CX, y: CY - 60, r: 46 },
    ],
    ambient: 'embers',
    ambientColor: 0xff7722,
    seed: 53,
  },
  {
    id: 'marmorhof',
    name: 'Marmorhof',
    region: 'Demacia',
    floor: [0x1e2028, 0x282c38, 0x343948],
    line: 0x4a5570,
    rim: 0xe8ecf8,
    obstacleStyle: 'saeule',
    obstacleColor: 0xb8c0d8,
    obstacles: [
      { x: CX - 480, y: CY - 260, r: 46 },
      { x: CX + 480, y: CY - 260, r: 46 },
      { x: CX - 480, y: CY + 260, r: 46 },
      { x: CX + 480, y: CY + 260, r: 46 },
      { x: CX, y: CY, r: 40 },
    ],
    ambient: 'motes',
    ambientColor: 0xf0e8c0,
    seed: 67,
  },
];

// ---------------------------------------------------------------------------
// Active-map state (geometry reads obstacles from here each frame)
// ---------------------------------------------------------------------------

let active: MapDef = MAPS[0];
let lastId = '';

export function activeMap(): MapDef {
  return active;
}

export function setActiveMap(m: MapDef): void {
  active = m;
}

export function activeObstacles(): MapObstacle[] {
  return active.obstacles;
}

/** Pick a random map, never the same twice in a row. */
export function rollMap(): MapDef {
  const pool = MAPS.filter((m) => m.id !== lastId);
  const m = pool[Math.floor(Math.random() * pool.length)];
  lastId = m.id;
  return m;
}

export function mapById(id: string): MapDef | undefined {
  return MAPS.find((m) => m.id === id);
}
