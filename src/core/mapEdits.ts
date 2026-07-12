import type { MapWall, TerrainZone } from './maps';

/**
 * Player-authored collision, saved in the browser. The in-game Map Editor
 * writes walls/water/lava here per map; the arena reads it live (overriding
 * the built-in defaults), and Export copies TS-ready data to the clipboard so
 * it can be baked into maps.ts permanently.
 */
export interface MapEdit {
  walls: MapWall[];
  terrain: TerrainZone[];
}

const KEY = 'cc_map_edits_v1';
let cache: Record<string, MapEdit> | null = null;

function load(): Record<string, MapEdit> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, MapEdit>;
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
      return `// ${id}\nwalls: [${walls}],\nterrain: [${terrain}],`;
    })
    .join('\n\n');
}
