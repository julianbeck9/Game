import { describe, expect, it, beforeEach } from 'vitest';
import { walkStep, pointInWall, canReach, findOpenSpawn, cellStandable } from '../../src/core/geometry';
import { setActiveMap, MAPS, type MapDef } from '../../src/core/maps';
import { BAKED_PAINT } from '../../src/core/bakedPaint';
import { COLS } from '../../src/core/paintgrid';

/**
 * Invariants of walking against geometry.
 *
 * Scope note, so nobody mistakes this for more than it is: these lock down the
 * properties walkStep must never break (no clipping into a wall, free movement
 * when unobstructed, tangential progress along a face). They are **not** a
 * regression test for the B9 deadlock — verified by deleting the sliding branch
 * and re-running: these still pass, because `rectResolve` already resolves a
 * flat rect wall along its shallow axis and so keeps the tangential component
 * on its own. The actual B9 guard is the headless standoff check in
 * scripts/verify.mjs, which measures the thing that really broke.
 *
 * The map id must stay out of BAKED_PAINT so `activeWalls()` returns these
 * walls instead of the baked paint grid (see maps.ts `activeWalls`).
 */
const wallMap = (walls: MapDef['walls']): MapDef => ({
  id: 'test-geometry',
  name: 'Test',
  region: 'Test',
  floor: [0, 0, 0],
  line: 0,
  rim: 0,
  obstacleStyle: 'fels',
  obstacleColor: 0,
  obstacles: [],
  walls,
  wallColor: 0,
  terrain: [],
  ambient: 'motes',
  ambientColor: 0,
  seed: 1,
});

const R = 20;

describe('walkStep', () => {
  beforeEach(() => {
    // One tall wall occupying x ∈ [950, 1050]; its left face is at x = 950.
    setActiveMap(wallMap([{ x: 1000, y: 540, w: 100, h: 900 }]));
  });

  it('keeps making tangential progress along a wall face', () => {
    // Walking hard into the face, with only a small tangential component.
    let p = { x: 900, y: 300 };
    const startY = p.y;
    for (let i = 0; i < 40; i++) p = walkStep(p.x, p.y, R, 12, 3);

    // The wall must still hold: the mover never ends up inside it.
    expect(p.x).toBeLessThanOrEqual(950 - R + 0.001);
    expect(pointInWall(p.x, p.y, R)).toBe(false);
    // …but it has to have made real tangential progress, not stuck at the face.
    expect(p.y - startY).toBeGreaterThan(60);
  });

  it('never leaves the mover inside a wall, from any approach angle', () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg * Math.PI) / 180;
      let p = { x: 700, y: 540 };
      for (let i = 0; i < 60; i++) {
        p = walkStep(p.x, p.y, R, Math.cos(a) * 14, Math.sin(a) * 14);
      }
      expect(pointInWall(p.x, p.y, R)).toBe(false);
    }
  });

  it('moves freely when nothing is in the way', () => {
    const p = walkStep(400, 400, R, 30, 0);
    expect(p.x).toBeCloseTo(430, 5);
    expect(p.y).toBeCloseTo(400, 5);
  });

  it('is a no-op for a zero-length step', () => {
    const p = walkStep(400, 400, R, 0, 0);
    expect(p.x).toBeCloseTo(400, 5);
    expect(p.y).toBeCloseTo(400, 5);
  });
});

/**
 * B9's real fix. Enemies are placed on authored coordinates while collision is
 * painted per map, so one could land inside sealed geometry — unreachable, and
 * therefore un-killable, and therefore the round never ended.
 *
 * A sealed box 300px across: wide enough that the earlier "walk a few steps and
 * see if you got anywhere" probe was satisfied inside it. Only a connectivity
 * fill tells the two cases apart, which is what these pin down.
 */
describe('canReach / findOpenSpawn (B9)', () => {
  const BOX = 300;
  const BX = 500;
  const BY = 400;
  const T = 60; // wall thickness, comfortably more than one 24px paint cell

  beforeEach(() => {
    // Hollow box centred on (BX, BY) — four slabs, no gap.
    setActiveMap(
      wallMap([
        { x: BX, y: BY - BOX / 2, w: BOX + T, h: T },
        { x: BX, y: BY + BOX / 2, w: BOX + T, h: T },
        { x: BX - BOX / 2, y: BY, w: T, h: BOX + T },
        { x: BX + BOX / 2, y: BY, w: T, h: BOX + T },
      ]),
    );
  });

  it('reports a sealed pocket as unreachable', () => {
    expect(canReach(BX, BY, 1500, 900, R)).toBe(false);
  });

  it('reports open ground as reachable', () => {
    expect(canReach(1500, 900, 1400, 800, R)).toBe(true);
  });

  it('is symmetric about the barrier', () => {
    expect(canReach(1500, 900, BX, BY, R)).toBe(false);
  });

  it('moves a spawn out of the pocket to somewhere that can reach the target', () => {
    const target = { x: 1500, y: 900 };
    const spot = findOpenSpawn(BX, BY, R, target);
    expect(canReach(spot.x, spot.y, target.x, target.y, R)).toBe(true);
    expect(pointInWall(spot.x, spot.y, R)).toBe(false);
  });

  it('leaves an already-good spawn where it is', () => {
    const target = { x: 1400, y: 800 };
    const spot = findOpenSpawn(1500, 900, R, target);
    expect(spot.x).toBeCloseTo(1500, 5);
    expect(spot.y).toBeCloseTo(900, 5);
  });
});

/**
 * The subtle half of B9. Walking is blocked by `walkSolid`, which is
 * wall ∪ **air** ∪ water ∪ lava. A standability check assembled from
 * `pointInWall` + `pointInTerrain` covers every layer except air, and nothing
 * else in the codebase needs air on its own — so the omission is invisible by
 * inspection. It let the reachability fill and the navigation field plot routes
 * straight across painted chasms, and all nine baked maps have air cells, so it
 * misfired everywhere. Symptom: verify's standoff check failed about a third of
 * the time, looking like a flaky test rather than a wrong predicate.
 */
describe('cellStandable covers every walk-blocking layer (B9)', () => {
  it('treats painted air as unwalkable on every baked map', () => {
    const offenders: string[] = [];
    let checkedMaps = 0;
    for (const map of MAPS) {
      const air = BAKED_PAINT[map.id]?.air;
      if (!air || air.length === 0) continue;
      checkedMaps++;
      setActiveMap(map);
      for (const idx of air) {
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        if (cellStandable(col, row, R)) {
          offenders.push(`${map.id} cell ${idx} (col ${col}, row ${row})`);
          break;
        }
      }
    }
    // Guard against a vacuous pass if the baked data ever loses its air layers.
    expect(checkedMaps).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
