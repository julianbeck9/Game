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

/** Impassable terrain: you can't walk over it (dashes cross it, shots fly over). */
export interface TerrainZone {
  kind: 'water' | 'lava';
  x: number;
  y: number;
  w: number;
  h: number;
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
  /** Impassable water/lava zones (empty for open maps). */
  terrain: TerrainZone[];
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
    name: 'Cherry Garden',
    region: 'Ionia',
    floor: [0x14201a, 0x1a2a20, 0x223528],
    line: 0x3a5a48,
    rim: 0xdd88aa,
    obstacleStyle: 'baum',
    obstacleColor: 0xe89ab8,
    obstacles: [
      { x: CX - 560, y: CY - 220, r: 56 },
      { x: CX + 560, y: CY + 220, r: 56 },
      { x: CX - 300, y: CY + 320, r: 44 },
      { x: CX + 300, y: CY - 320, r: 44 },
    ],
    terrain: [
      { kind: 'water', x: CX - 430, y: CY - 30, w: 300, h: 200 },
      { kind: 'water', x: CX + 440, y: CY + 60, w: 280, h: 190 },
    ],
    ambient: 'petals',
    ambientColor: 0xf0b8cc,
    seed: 11,
  },
  {
    id: 'windklippen',
    name: 'Wind Cliffs',
    region: 'Ionia',
    floor: [0x16222c, 0x1c2c38, 0x243846],
    line: 0x3a5a6a,
    rim: 0x7fd8f0,
    obstacleStyle: 'fels',
    obstacleColor: 0x4a6a7a,
    obstacles: [
      { x: CX, y: CY, r: 66 },
      { x: CX - 640, y: CY + 60, r: 48 },
      { x: CX + 640, y: CY - 60, r: 48 },
    ],
    terrain: [
      { kind: 'water', x: CX - 320, y: CY - 200, w: 300, h: 160 },
      { kind: 'water', x: CX + 330, y: CY + 190, w: 300, h: 160 },
    ],
    ambient: 'motes',
    ambientColor: 0xaee8f8,
    seed: 23,
  },
  {
    id: 'sonnengrab',
    name: 'Sun Grave',
    region: 'Shurima',
    floor: [0x2a2114, 0x35291a, 0x413320],
    line: 0x6a5a2a,
    rim: 0xf0c860,
    obstacleStyle: 'obelisk',
    obstacleColor: 0xd8b060,
    obstacles: [
      { x: CX - 500, y: CY - 240, r: 50 },
      { x: CX + 500, y: CY - 240, r: 50 },
      { x: CX - 500, y: CY + 240, r: 50 },
      { x: CX + 500, y: CY + 240, r: 50 },
    ],
    terrain: [
      { kind: 'lava', x: CX - 380, y: CY, w: 260, h: 210 },
      { kind: 'lava', x: CX + 380, y: CY, w: 260, h: 210 },
    ],
    ambient: 'sand',
    ambientColor: 0xd8b878,
    seed: 37,
  },
  {
    id: 'gleisskanal',
    name: 'Gleaming Canal',
    region: 'Shurima',
    floor: [0x261e12, 0x322818, 0x3e321e],
    line: 0x7a6228,
    rim: 0x9fe8ff,
    obstacleStyle: 'saeule',
    obstacleColor: 0xc8a850,
    obstacles: [
      { x: CX - 300, y: CY, r: 50 },
      { x: CX + 300, y: CY, r: 50 },
    ],
    terrain: [
      { kind: 'water', x: CX - 470, y: CY, w: 240, h: 300 },
      { kind: 'water', x: CX + 470, y: CY, w: 240, h: 300 },
    ],
    ambient: 'motes',
    ambientColor: 0x9fe8ff,
    seed: 41,
  },
  {
    id: 'schlachtgrube',
    name: 'Battle Pit',
    region: 'Noxus',
    floor: [0x1e1414, 0x281a1a, 0x322020],
    line: 0x5a2a2a,
    rim: 0xcc3344,
    obstacleStyle: 'stachel',
    obstacleColor: 0x663333,
    obstacles: [
      { x: CX - 600, y: CY, r: 54 },
      { x: CX + 600, y: CY, r: 54 },
    ],
    terrain: [
      { kind: 'lava', x: CX - 440, y: CY - 40, w: 280, h: 210 },
      { kind: 'lava', x: CX + 440, y: CY + 40, w: 280, h: 210 },
      { kind: 'lava', x: CX, y: CY, w: 220, h: 150 },
    ],
    ambient: 'embers',
    ambientColor: 0xff7722,
    seed: 53,
  },
  {
    id: 'marmorhof',
    name: 'Marble Court',
    region: 'Demacia',
    floor: [0x1e2028, 0x282c38, 0x343948],
    line: 0x4a5570,
    rim: 0xe8ecf8,
    obstacleStyle: 'saeule',
    obstacleColor: 0xb8c0d8,
    obstacles: [
      { x: CX - 520, y: CY - 260, r: 46 },
      { x: CX + 520, y: CY - 260, r: 46 },
      { x: CX - 520, y: CY + 260, r: 46 },
      { x: CX + 520, y: CY + 260, r: 46 },
    ],
    terrain: [
      { kind: 'water', x: CX - 440, y: CY, w: 240, h: 230 },
      { kind: 'water', x: CX + 440, y: CY, w: 240, h: 230 },
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

export function activeTerrain(): TerrainZone[] {
  return active.terrain;
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
