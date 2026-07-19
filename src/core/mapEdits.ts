import type { MapWall, TerrainZone } from './maps';
import { PaintLayers } from './paintgrid';
import { isPlainObject, loadVersioned, saveVersioned } from './storage';

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

// Bump on every bake: exporting the Map Editor's edits via exportEdits() into
// maps.ts/bakedPaint.ts means the baseline now already has this collision, so
// a leftover browser store from before the bake must not silently re-cover
// it. Bumping this changes the key below, orphaning any pre-bake store.
// (v1 = coarse grid, v2 = polluted by a bug that double-expanded the baked
// paint in the editor — both already retired the same way.)
const SCHEMA_VERSION = 3;
const KEY = `cc_map_edits_v${SCHEMA_VERSION}`;

function isMapEdit(raw: unknown): raw is MapEdit {
  if (!isPlainObject(raw)) return false;
  return Array.isArray(raw.walls) && Array.isArray(raw.terrain);
}

/** Structural check: every entry must look like a real MapEdit, or the whole
 * store is treated as corrupt and dropped in favor of clean defaults. */
function isEditStore(raw: unknown): raw is Record<string, MapEdit> {
  if (!isPlainObject(raw)) return false;
  return Object.values(raw).every(isMapEdit);
}

let cache: Record<string, MapEdit> | null = null;

function load(): Record<string, MapEdit> {
  if (!cache) cache = loadVersioned(KEY, isEditStore, () => ({}));
  return cache;
}

export function getEdit(id: string): MapEdit | undefined {
  return load()[id];
}

export function setEdit(id: string, e: MapEdit): void {
  const all = load();
  all[id] = e;
  cache = all;
  saveVersioned(KEY, all);
}

export function clearEdit(id: string): void {
  const all = load();
  delete all[id];
  cache = all;
  saveVersioned(KEY, all);
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
