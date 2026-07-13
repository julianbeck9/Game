import type { MapWall, TerrainZone } from './maps';
import { PaintLayers, expandLegacyLayers } from './paintgrid';

/**
 * Player-authored collision, saved in the browser. The in-game Map Editor
 * writes walls/water/lava here per map; the arena reads it live (overriding
 * the built-in defaults), and Export copies TS-ready data to the clipboard so
 * it can be baked into maps.ts permanently.
 */
export interface MapEdit {
  walls: MapWall[];
  terrain: TerrainZone[];
  /** Freehand painted collision cells (indices into the paint grid). */
  paint?: PaintLayers;
}

const KEY = 'cc_map_edits_v2'; // v2 = finer (24px) paint grid
const LEGACY_KEY = 'cc_map_edits_v1'; // v1 = 48px grid (auto-migrated once)
let cache: Record<string, MapEdit> | null = null;

function load(): Record<string, MapEdit> {
  if (cache) return cache;
  try {
    const v2 = localStorage.getItem(KEY);
    if (v2) {
      cache = JSON.parse(v2) as Record<string, MapEdit>;
      return cache;
    }
    // One-time migration: expand old 48px paint cells to the 24px grid.
    const v1 = localStorage.getItem(LEGACY_KEY);
    if (v1) {
      const old = JSON.parse(v1) as Record<string, MapEdit>;
      for (const e of Object.values(old)) {
        if (e.paint) e.paint = expandLegacyLayers(e.paint);
      }
      cache = old;
      localStorage.setItem(KEY, JSON.stringify(cache));
      return cache;
    }
    cache = {};
  } catch {
    cache = {};
  }
  return cache;
}

export function getEdit(id: string): MapEdit | undefined {
  return load()[id];
}

export function setEdit(id: string, e: MapEdit): void {
  const all = load();
  all[id] = e;
  cache = all;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full / disabled — edits stay in memory for this session */
  }
}

export function clearEdit(id: string): void {
  const all = load();
  delete all[id];
  cache = all;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** TS-ready dump of every edited map, for pasting back into maps.ts. */
export function exportEdits(): string {
  const all = load();
  const zone = (z: { x: number; y: number; w: number; h: number }) =>
    `{ x: ${Math.round(z.x)}, y: ${Math.round(z.y)}, w: ${Math.round(z.w)}, h: ${Math.round(z.h)} }`;
  return Object.entries(all)
    .map(([id, e]) => {
      const walls = e.walls.map(zone).join(', ');
      const terrain = e.terrain
        .map((t) => `{ kind: '${t.kind}', x: ${Math.round(t.x)}, y: ${Math.round(t.y)}, w: ${Math.round(t.w)}, h: ${Math.round(t.h)} }`)
        .join(', ');
      const pt = e.paint;
      const paint = pt && (pt.wall.length || pt.air?.length || pt.water.length || pt.lava.length)
        ? `\npaint: { wall: [${pt.wall.join(',')}], air: [${(pt.air ?? []).join(',')}], water: [${pt.water.join(',')}], lava: [${pt.lava.join(',')}] },`
        : '';
      return `// ${id}\nwalls: [${walls}],\nterrain: [${terrain}],${paint}`;
    })
    .join('\n\n');
}
