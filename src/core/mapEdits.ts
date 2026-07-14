import type { MapWall, TerrainZone } from './maps';
import { PaintLayers } from './paintgrid';

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

// v3: fresh start. Older keys (v1 = coarse grid, v2 = polluted by a bug that
// double-expanded the baked paint in the editor) are intentionally ignored —
// the authored maps live in bakedPaint.ts now, so dropping local edits is safe.
const KEY = 'cc_map_edits_v3';
let cache: Record<string, MapEdit> | null = null;

function load(): Record<string, MapEdit> {
  if (cache) return cache;
  try {
    const v3 = localStorage.getItem(KEY);
    cache = v3 ? (JSON.parse(v3) as Record<string, MapEdit>) : {};
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
