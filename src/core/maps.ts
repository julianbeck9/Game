import { GAME_W, GAME_H } from '../config';
import { getEdit } from './mapEdits';
import { BAKED_PAINT } from './bakedPaint';

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

/** Solid wall: blocks walking, dashing AND projectiles. Center-anchored rect, rot° optional. */
export interface MapWall {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in degrees (0 = axis-aligned). */
  rot?: number;
}

/** Impassable terrain: you can't walk over it (dashes cross it, shots fly over). */
export interface TerrainZone {
  kind: 'water' | 'lava';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in degrees (0 = axis-aligned). */
  rot?: number;
}

export type ObstacleStyle = 'baum' | 'obelisk' | 'stachel' | 'saeule' | 'fels';
/**
 * Region weather. Purely visual — nothing in gameplay reads this. The extra
 * kinds exist so Freljord gets snow rather than the same generic "motes" three
 * other maps use; identical ambience on every map is what made the arenas read
 * as one reskinned room. Rendering lives in core/env/ambient.ts.
 */
export type AmbientKind =
  | 'petals'
  | 'sand'
  | 'embers'
  | 'motes'
  | 'snow'
  | 'spores'
  | 'mist'
  | 'rift';

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
  /**
   * Painted background art (key under public/maps/<key>.png). When set, the
   * arena renders this fullscreen instead of the procedural floor/walls.
   */
  bgImage?: string;
}

/** All background-art keys, for preloading. URL = maps/<key>.png in public/. */
export const MAP_IMAGE_KEYS = [
  'highland',
  'demacia',
  'freljord_dark',
  'freljord_snow',
  'noxus',
  'shurima',
  'zaun',
  'shadow',
  'void',
] as const;

/** Playable field bounds (units clamp to this rect). */
export const FIELD = { x1: 26, y1: 26, x2: GAME_W - 26, y2: GAME_H - 26 };

const CY = GAME_H / 2;

// Cover blocks placed on the side AWAY from each map's water (so a wall never
// sits next to a hazard), off the central lane and spawn rows. Solid stone:
// blocks walking, dashing and shots.
const leftCover = (yc = CY): MapWall[] => [
  { x: 640, y: yc, w: 46, h: 230 },
  { x: 730, y: yc - 110, w: 190, h: 46 },
];
const rightCover = (yc = CY): MapWall[] => [
  { x: 1280, y: yc, w: 46, h: 230 },
  { x: 1190, y: yc + 110, w: 190, h: 46 },
];

// Water/lava traced to each painting's visible liquid, kept off the central
// lane (x ~800..1120) and the spawn rows so the bot AI can always reach you.
// Walls stay empty for now — painted stone reads at an isometric angle that a
// top-down box can't match cleanly, so we don't fake it.

/**
 * Nine hand-painted region arenas. Each renders its uploaded artwork
 * fullscreen (public/maps/<bgImage>.png); the floor/line/rim colours are
 * only a fallback if the image ever fails to load. `ambient` still layers
 * the region's weather (petals / snow-motes / embers) over the art.
 *
 * Collision is intentionally empty for now so there are no invisible walls
 * on top of the art — the wall/water system stays wired and can be filled
 * in per map once we tune where the painted walls should physically block.
 */
export const MAPS: MapDef[] = [
  {
    id: 'highland',
    name: 'Highland Court',
    region: 'Ionia',
    floor: [0x2a2b22, 0x37382c, 0x454636],
    line: 0x9fb87a,
    rim: 0xdd88aa,
    obstacleStyle: 'baum',
    obstacleColor: 0xe89ab8,
    obstacles: [],
    walls: rightCover(),
    wallColor: 0xcdd2c0,
    terrain: [{ kind: 'water', x: 560, y: 520, w: 240, h: 380 }],
    ambient: 'petals',
    ambientColor: 0xf0b8cc,
    seed: 11,
    bgImage: 'highland',
  },
  {
    id: 'demacia',
    name: 'Justice Court',
    region: 'Demacia',
    floor: [0x23262f, 0x2f3340, 0x3d4356],
    line: 0xd8b45a,
    rim: 0xe8ecf8,
    obstacleStyle: 'saeule',
    obstacleColor: 0xc8cfe0,
    obstacles: [],
    walls: leftCover(),
    wallColor: 0xe6e9f2,
    terrain: [{ kind: 'water', x: 1360, y: 520, w: 200, h: 400 }],
    ambient: 'motes',
    ambientColor: 0xf0e4b0,
    seed: 67,
    bgImage: 'demacia',
  },
  {
    id: 'freljord_dark',
    name: 'Frozen Lake',
    region: 'Freljord',
    floor: [0x1b2230, 0x26303f, 0x33415a],
    line: 0x6fa8d8,
    rim: 0x9fd8ff,
    obstacleStyle: 'stachel',
    obstacleColor: 0x8fd0f0,
    obstacles: [],
    walls: leftCover(430),
    wallColor: 0x9aa6bc,
    terrain: [{ kind: 'water', x: 1420, y: 440, w: 320, h: 340 }, { kind: 'water', x: 600, y: 780, w: 300, h: 240 }],
    ambient: 'snow',
    ambientColor: 0xbfe4ff,
    seed: 29,
    bgImage: 'freljord_dark',
  },
  {
    id: 'freljord_snow',
    name: 'Frostguard Keep',
    region: 'Freljord',
    floor: [0x2a3648, 0x36455a, 0x455870],
    line: 0x8fc0e8,
    rim: 0xbfe4ff,
    obstacleStyle: 'stachel',
    obstacleColor: 0xaad8f0,
    obstacles: [],
    walls: leftCover(),
    wallColor: 0xb8c4d4,
    terrain: [{ kind: 'water', x: 1450, y: 460, w: 340, h: 460 }],
    ambient: 'snow',
    ambientColor: 0xdff0ff,
    seed: 31,
    bgImage: 'freljord_snow',
  },
  {
    id: 'noxus',
    name: 'Blood Pit',
    region: 'Noxus',
    floor: [0x201415, 0x2c1a1b, 0x3a2323],
    line: 0x9a3a3a,
    rim: 0xcc3344,
    obstacleStyle: 'stachel',
    obstacleColor: 0x7a3a34,
    obstacles: [],
    walls: leftCover(),
    wallColor: 0x6a5a52,
    terrain: [{ kind: 'lava', x: 1300, y: 430, w: 220, h: 360 }],
    ambient: 'embers',
    ambientColor: 0xd23a2a,
    seed: 53,
    bgImage: 'noxus',
  },
  {
    id: 'shurima',
    name: 'Sun Ruins',
    region: 'Shurima',
    floor: [0x3a2c17, 0x4a391f, 0x5c4826],
    line: 0xd8b45a,
    rim: 0xf0c860,
    obstacleStyle: 'obelisk',
    obstacleColor: 0xd8b060,
    obstacles: [],
    walls: leftCover(480),
    wallColor: 0xc9a86a,
    terrain: [{ kind: 'water', x: 1360, y: 820, w: 280, h: 240 }],
    ambient: 'sand',
    ambientColor: 0xd8b878,
    seed: 37,
    bgImage: 'shurima',
  },
  {
    id: 'zaun',
    name: 'Toxic Sprawl',
    region: 'Zaun',
    floor: [0x17201a, 0x1f2b20, 0x2a3a29],
    line: 0x7fd23a,
    rim: 0x9fff44,
    obstacleStyle: 'saeule',
    obstacleColor: 0x5a6a4a,
    obstacles: [],
    walls: leftCover(),
    wallColor: 0x4a5240,
    terrain: [{ kind: 'lava', x: 1280, y: 500, w: 260, h: 360 }],
    ambient: 'spores',
    ambientColor: 0x8fe23a,
    seed: 71,
    bgImage: 'zaun',
  },
  {
    id: 'shadow',
    name: 'Black Mist',
    region: 'Shadow Isles',
    floor: [0x12201f, 0x18292a, 0x203737],
    line: 0x3fb0a0,
    rim: 0x5fe8d0,
    obstacleStyle: 'baum',
    obstacleColor: 0x2a4a44,
    obstacles: [],
    walls: [...leftCover(), ...rightCover()],
    wallColor: 0x2c4340,
    terrain: [],
    ambient: 'mist',
    ambientColor: 0x5fe8d0,
    seed: 83,
    bgImage: 'shadow',
  },
  {
    id: 'void',
    name: 'Rift Scar',
    region: 'The Void',
    floor: [0x160f26, 0x1e1533, 0x281c46],
    line: 0x9a5cff,
    rim: 0xb87aff,
    obstacleStyle: 'stachel',
    obstacleColor: 0x9a5cff,
    obstacles: [],
    walls: rightCover(500),
    wallColor: 0x281d3f,
    terrain: [{ kind: 'lava', x: 560, y: 720, w: 360, h: 220 }],
    ambient: 'rift',
    ambientColor: 0xb87aff,
    seed: 97,
    bgImage: 'void',
  },
];

// ---------------------------------------------------------------------------
// Active-map state (geometry reads obstacles from here each frame)
// ---------------------------------------------------------------------------

let active: MapDef = MAPS[0];
let lastId = '';
export interface PaintSets {
  wall: Set<number>;
  air: Set<number>;
  water: Set<number>;
  lava: Set<number>;
  /** Blocks walking (everything). */
  walkSolid: Set<number>;
  /** Blocks dashing (wall + air only; you dash over water/lava). */
  dashSolid: Set<number>;
}

const emptyPaint = (): PaintSets => ({
  wall: new Set(),
  air: new Set(),
  water: new Set(),
  lava: new Set(),
  walkSolid: new Set(),
  dashSolid: new Set(),
});

let activePaintSets: PaintSets = emptyPaint();

export function activeMap(): MapDef {
  return active;
}

export function setActiveMap(m: MapDef): void {
  active = m;
  // Local edit wins; otherwise fall back to the permanently-baked paint.
  // Both are already on the current 24px grid — no expansion needed.
  const p = getEdit(m.id)?.paint ?? BAKED_PAINT[m.id];
  const wall = new Set(p?.wall ?? []);
  const air = new Set(p?.air ?? []);
  const water = new Set(p?.water ?? []);
  const lava = new Set(p?.lava ?? []);
  const walkSolid = new Set<number>([...wall, ...air, ...water, ...lava]);
  const dashSolid = new Set<number>([...wall, ...air]);
  activePaintSets = { wall, air, water, lava, walkSolid, dashSolid };
}

/** Painted collision cells for the active map (built by setActiveMap). */
export function activePaint(): PaintSets {
  return activePaintSets;
}

export function activeObstacles(): MapObstacle[] {
  return active.obstacles;
}

export function activeWalls(): MapWall[] {
  const e = getEdit(active.id);
  if (e) return e.walls;
  return BAKED_PAINT[active.id] ? [] : active.walls; // baked paint replaces boxes
}

export function activeTerrain(): TerrainZone[] {
  const e = getEdit(active.id);
  if (e) return e.terrain;
  return BAKED_PAINT[active.id] ? [] : active.terrain;
}

/**
 * Measurement override: when set, `rollMap` always returns this map.
 *
 * Screenshot comparisons are worthless without it. The before/after sets for
 * the quality pass were captured on *different randomly rolled maps*, so a
 * "before" on Demacia was being compared against an "after" on Highland — and
 * the difference read as a change in the lighting when it was a change of
 * scenery. Pin the map and the comparison is about the code again.
 */
let forcedMapId: string | null = null;

export function forceMap(id: string | null): void {
  forcedMapId = id;
}

/** Pick a random map, never the same twice in a row. */
export function rollMap(): MapDef {
  if (forcedMapId) {
    const forced = MAPS.find((m) => m.id === forcedMapId);
    if (forced) {
      lastId = forced.id;
      return forced;
    }
  }
  const pool = MAPS.filter((m) => m.id !== lastId);
  const m = pool[Math.floor(Math.random() * pool.length)];
  lastId = m.id;
  return m;
}

export function mapById(id: string): MapDef | undefined {
  return MAPS.find((m) => m.id === id);
}
