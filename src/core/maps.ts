import { GAME_W, GAME_H } from '../config';

/**
 * Fullscreen battle maps. Each map is a themed rectangle: the whole screen
 * is the arena. Regions riff on classic fantasy-faction moods — blossom
 * gardens, marble courts, frozen lakes, blood pits, sun ruins, toxic
 * sprawls, haunted isles and a torn rift — with original names and layouts.
 *
 * Three collision primitives:
 *   - obstacles  round pillars/trees/spikes (block walk + shots)
 *   - walls      solid stone rectangles (block walk + DASH + shots) — hard cover
 *   - terrain    water / lava rectangles (block walk only; dash & shots cross)
 *
 * Layouts keep a clear central lane (x ~810..1110) plus the top spawn row
 * and the bottom player-spawn open, so the simple bot AI can always reach you.
 */

export interface MapObstacle {
  x: number;
  y: number;
  r: number;
}

/** Solid wall: blocks walking, dashing AND projectiles. Center-anchored rect. */
export interface MapWall {
  x: number;
  y: number;
  w: number;
  h: number;
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
  /** Solid stone walls (hard cover). */
  walls: MapWall[];
  /** Wall fill colour. */
  wallColor: number;
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

/**
 * Shared collision skeleton (verified clear): two L-shaped stone covers sit
 * inboard, water/lava pools sit in the far side-pockets with a ~110px gap to
 * the walls. The central lane (x 735..1185) and both spawn rows (top y<310,
 * player at bottom-centre) stay open so the simple bot AI always reaches you.
 */
const COVER_WALLS: MapWall[] = [
  { x: CX - 440, y: CY - 70, w: 44, h: 250 }, // left vertical
  { x: CX - 330, y: CY - 180, w: 210, h: 44 }, // left top ledge
  { x: CX + 440, y: CY + 70, w: 44, h: 250 }, // right vertical
  { x: CX + 330, y: CY + 180, w: 210, h: 44 }, // right bottom ledge
];
const CORNER_OBSTACLES: MapObstacle[] = [
  { x: CX - 760, y: CY - 340, r: 44 },
  { x: CX + 760, y: CY + 340, r: 44 },
  { x: CX - 760, y: CY + 340, r: 40 },
  { x: CX + 760, y: CY - 340, r: 40 },
];
/** Far side-pockets — inner edge ~x 380 / 1540, well clear of the walls. */
const sidePools = (kind: 'water' | 'lava'): TerrainZone[] => [
  { kind, x: CX - 720, y: CY - 40, w: 280, h: 300 },
  { kind, x: CX + 720, y: CY + 40, w: 280, h: 300 },
];

export const MAPS: MapDef[] = [
  // 1) Ionia — cream plaza, blossom trees, garden canals
  {
    id: 'kirschgarten',
    name: 'Cherry Garden',
    region: 'Ionia',
    floor: [0x2a2b22, 0x37382c, 0x454636],
    line: 0x9fb87a,
    rim: 0xdd88aa,
    obstacleStyle: 'baum',
    obstacleColor: 0xe89ab8,
    obstacles: CORNER_OBSTACLES,
    walls: COVER_WALLS,
    wallColor: 0xcdd2c0,
    terrain: sidePools('water'),
    ambient: 'petals',
    ambientColor: 0xf0b8cc,
    seed: 11,
  },

  // 2) Demacia — white/gold marble court, reflecting pools
  {
    id: 'marmorhof',
    name: 'Justice Court',
    region: 'Demacia',
    floor: [0x23262f, 0x2f3340, 0x3d4356],
    line: 0xd8b45a,
    rim: 0xe8ecf8,
    obstacleStyle: 'saeule',
    obstacleColor: 0xc8cfe0,
    obstacles: CORNER_OBSTACLES,
    walls: COVER_WALLS,
    wallColor: 0xe6e9f2,
    terrain: sidePools('water'),
    ambient: 'motes',
    ambientColor: 0xf0e4b0,
    seed: 67,
  },

  // 3) Freljord — dark frozen lake, ice spikes
  {
    id: 'frostsee',
    name: 'Frozen Lake',
    region: 'Freljord',
    floor: [0x1b2230, 0x26303f, 0x33415a],
    line: 0x6fa8d8,
    rim: 0x9fd8ff,
    obstacleStyle: 'stachel',
    obstacleColor: 0x8fd0f0,
    obstacles: CORNER_OBSTACLES,
    walls: COVER_WALLS,
    wallColor: 0x9aa6bc,
    terrain: sidePools('water'),
    ambient: 'motes',
    ambientColor: 0xbfe4ff,
    seed: 29,
  },

  // 4) Noxus — blood pit, iron spikes, running blood (lava)
  {
    id: 'blutgrube',
    name: 'Blood Pit',
    region: 'Noxus',
    floor: [0x201415, 0x2c1a1b, 0x3a2323],
    line: 0x9a3a3a,
    rim: 0xcc3344,
    obstacleStyle: 'stachel',
    obstacleColor: 0x7a3a34,
    obstacles: CORNER_OBSTACLES,
    walls: COVER_WALLS,
    wallColor: 0x6a5a52,
    terrain: sidePools('lava'),
    ambient: 'embers',
    ambientColor: 0xd23a2a,
    seed: 53,
  },

  // 5) Shurima — sandstone ruins, quicksand (lava) + oasis (water)
  {
    id: 'sonnengrab',
    name: 'Sun Ruins',
    region: 'Shurima',
    floor: [0x3a2c17, 0x4a391f, 0x5c4826],
    line: 0xd8b45a,
    rim: 0xf0c860,
    obstacleStyle: 'obelisk',
    obstacleColor: 0xd8b060,
    obstacles: CORNER_OBSTACLES,
    walls: COVER_WALLS,
    wallColor: 0xc9a86a,
    terrain: [
      { kind: 'lava', x: CX - 720, y: CY - 40, w: 280, h: 300 },
      { kind: 'water', x: CX + 720, y: CY + 40, w: 280, h: 300 },
    ],
    ambient: 'sand',
    ambientColor: 0xd8b878,
    seed: 37,
  },

  // 6) Zaun — toxic sprawl, pipes & fences, green sludge (lava)
  {
    id: 'giftgassen',
    name: 'Toxic Sprawl',
    region: 'Zaun',
    floor: [0x17201a, 0x1f2b20, 0x2a3a29],
    line: 0x7fd23a,
    rim: 0x9fff44,
    obstacleStyle: 'saeule',
    obstacleColor: 0x5a6a4a,
    obstacles: CORNER_OBSTACLES,
    walls: COVER_WALLS,
    wallColor: 0x4a5240,
    terrain: sidePools('lava'),
    ambient: 'embers',
    ambientColor: 0x8fe23a,
    seed: 71,
  },

  // 7) Shadow Isles — haunted stone, black mist (no liquid, extra cover)
  {
    id: 'schatteninseln',
    name: 'Black Mist',
    region: 'Shadow Isles',
    floor: [0x12201f, 0x18292a, 0x203737],
    line: 0x3fb0a0,
    rim: 0x5fe8d0,
    obstacleStyle: 'baum',
    obstacleColor: 0x2a4a44,
    obstacles: CORNER_OBSTACLES,
    walls: [
      ...COVER_WALLS,
      { x: CX - 730, y: CY + 20, w: 44, h: 200 },
      { x: CX + 730, y: CY - 20, w: 44, h: 200 },
    ],
    wallColor: 0x2c4340,
    terrain: [],
    ambient: 'motes',
    ambientColor: 0x5fe8d0,
    seed: 83,
  },

  // 8) Void — torn rift, black stone, purple void chasm (lava)
  {
    id: 'rissnarbe',
    name: 'Rift Scar',
    region: 'The Void',
    floor: [0x160f26, 0x1e1533, 0x281c46],
    line: 0x9a5cff,
    rim: 0xb87aff,
    obstacleStyle: 'stachel',
    obstacleColor: 0x9a5cff,
    obstacles: CORNER_OBSTACLES,
    walls: COVER_WALLS,
    wallColor: 0x281d3f,
    terrain: sidePools('lava'),
    ambient: 'motes',
    ambientColor: 0xb87aff,
    seed: 97,
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

export function activeWalls(): MapWall[] {
  return active.walls;
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
