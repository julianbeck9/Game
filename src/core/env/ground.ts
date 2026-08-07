import type Phaser from 'phaser';
import { GAME_W, GAME_H } from '../../config';
import { CELL, COLS, ROWS } from '../paintgrid';
import type { MapDef } from '../maps';
import { envPalette } from './palette';
import {
  CellFields,
  Face,
  Solid,
  faceLight,
  faceSegment,
  faces,
  sampleField,
} from './grid';

/**
 * Bakes the collision grid into ONE texture that sits directly over the painted
 * map: soft shadow/depth fields plus crisp edge lines.
 *
 * Why baked and not drawn live — a Phaser Graphics object replays its whole
 * command list every frame in both renderers, and the outline of a map's
 * collision is a few thousand segments. As a texture it is a single quad, so
 * the cost is one draw call regardless of how complicated the arena is. The
 * grid never changes during a round, so there is nothing to gain from redrawing
 * it.
 *
 * Everything here is derived from `activePaint()` — the same data
 * core/geometry.ts collides against. That is the point: what the player sees as
 * a ledge IS the ledge. Nothing in this file may write back to that data.
 */

/** Half resolution: crisp enough for a 4px lip, a quarter of the memory. */
const TEX_W = 960;
const TEX_H = 540;
const SCALE = TEX_W / GAME_W; // world px -> texture px
/** Samples per collision cell for the soft field pass, before upscaling. */
const SUB = 3;

const KEY = 'env:ground';

type RGBA = { r: number; g: number; b: number; a: number };

/** Straight-alpha "src over dst", accumulating into dst. */
function over(dst: RGBA, sr: number, sg: number, sb: number, sa: number): void {
  if (sa <= 0) return;
  const outA = sa + dst.a * (1 - sa);
  if (outA <= 0) {
    dst.a = 0;
    return;
  }
  dst.r = (sr * sa + dst.r * dst.a * (1 - sa)) / outA;
  dst.g = (sg * sa + dst.g * dst.a * (1 - sa)) / outA;
  dst.b = (sb * sa + dst.b * dst.a * (1 - sa)) / outA;
  dst.a = outA;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The soft pass: depth into chasms, bulk-darkening of unplayable stone, tinted
 * water/lava and the shadow raised geometry throws down-right onto the floor.
 *
 * Rendered at cell resolution and then smooth-upscaled, which is what makes a
 * grid of 24px squares come out as a gradient instead of as stairs. Doing it
 * with real per-pixel maths at 1920x1080 would cost 2M samples per map load for
 * a result nobody could tell apart from this.
 */
function paintSoftField(f: CellFields, map: MapDef): HTMLCanvasElement {
  const w = COLS * SUB;
  const h = ROWS * SUB;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const pal = envPalette(map);
  const img = ctx!.createImageData(w, h);
  const data = img.data;

  const sh = pal.shadow;
  const shR = (sh >> 16) & 255;
  const shG = (sh >> 8) & 255;
  const shB = sh & 255;
  const vd = pal.voidTone;
  const vdR = (vd >> 16) & 255;
  const vdG = (vd >> 8) & 255;
  const vdB = vd & 255;

  const acc: RGBA = { r: 0, g: 0, b: 0, a: 0 };

  for (let y = 0; y < h; y++) {
    // Cell-space coordinate of this sample's centre.
    const cy = (y + 0.5) / SUB - 0.5;
    for (let x = 0; x < w; x++) {
      const cx = (x + 0.5) / SUB - 0.5;

      acc.r = 0;
      acc.g = 0;
      acc.b = 0;
      acc.a = 0;

      // 1. Unplayable stone sinks back a little so the walkable floor is the
      //    brightest thing on screen. Subtle — the painting already has form.
      const wd = sampleField(f.wallDepth, cx, cy);
      if (wd > 0) over(acc, shR, shG, shB, 0.09 + 0.13 * clamp01(wd / 3));

      // 2. Chasms: the further from the rim, the further down. This doubles as
      //    the arena's outer frame, because on most maps the void IS the edge.
      const ad = sampleField(f.airDepth, cx, cy);
      if (ad > 0) over(acc, vdR, vdG, vdB, 0.26 + 0.46 * clamp01((ad - 0.4) / 4));

      // 3. Liquids read as volume, not as a flat painted patch.
      const wa = sampleField(f.waterDepth, cx, cy);
      if (wa > 0) over(acc, 0x14, 0x3c, 0x6e, 0.10 + 0.20 * clamp01(wa / 3));
      const la = sampleField(f.lavaDepth, cx, cy);
      if (la > 0) over(acc, 0x8a, 0x22, 0x06, 0.12 + 0.20 * clamp01(la / 3));

      // 4. Cast shadow on open floor. Only here does the light direction show
      //    up as an actual direction rather than as an edge treatment.
      const s = sampleField(f.shadow, cx, cy);
      if (s > 0.01) over(acc, shR, shG, shB, 0.30 * s);

      const p = (y * w + x) * 4;
      data[p] = acc.r;
      data[p + 1] = acc.g;
      data[p + 2] = acc.b;
      data[p + 3] = Math.round(acc.a * 255);
    }
  }
  ctx!.putImageData(img, 0, 0);
  return cv;
}

/** Stroke one batch of cell faces, offset along the face normal. */
function strokeFaces(
  ctx: CanvasRenderingContext2D,
  list: Face[],
  offset: number,
  width: number,
  color: string,
  alphaFor: (dir: 0 | 1 | 2 | 3) => number,
): void {
  // Normals point out of the cell: N up, E right, S down, W left.
  const nx = [0, 1, 0, -1];
  const ny = [-1, 0, 1, 0];
  // One path per alpha value, so the whole outline is a handful of strokes.
  const byAlpha = new Map<number, Face[]>();
  for (const f of list) {
    const a = Math.round(alphaFor(f.dir) * 100) / 100;
    if (a <= 0.01) continue;
    const b = byAlpha.get(a);
    if (b) b.push(f);
    else byAlpha.set(a, [f]);
  }
  ctx.lineCap = 'butt';
  ctx.strokeStyle = color;
  ctx.lineWidth = width * SCALE;
  for (const [alpha, group] of byAlpha) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (const f of group) {
      const s = faceSegment(f);
      const ox = nx[f.dir] * offset;
      const oy = ny[f.dir] * offset;
      ctx.moveTo((s.x1 + ox) * SCALE, (s.y1 + oy) * SCALE);
      ctx.lineTo((s.x2 + ox) * SCALE, (s.y2 + oy) * SCALE);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Draw or refresh the baked ground texture for `map` and return the image that
 * shows it. Reuses one fixed texture key: maps come and go every round, and
 * churning texture keys is how you end up with Phaser's "key already in use"
 * error in the console — which `npm run verify` treats as a failure.
 */
export function bakeGround(
  scene: Phaser.Scene,
  map: MapDef,
  f: CellFields,
): Phaser.GameObjects.Image | null {
  let tex = scene.textures.exists(KEY)
    ? (scene.textures.get(KEY) as Phaser.Textures.CanvasTexture)
    : scene.textures.createCanvas(KEY, TEX_W, TEX_H);
  if (!tex || !tex.getContext) return null;

  const ctx = tex.getContext();
  if (!ctx) return null;
  ctx.clearRect(0, 0, TEX_W, TEX_H);

  // Soft pass first, smooth-upscaled onto the crisp canvas.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(paintSoftField(f, map), 0, 0, TEX_W, TEX_H);

  const pal = envPalette(map);
  const mask = f.mask;

  // --- Chasm rim: the single most important line on the screen ---------------
  // A painted cliff edge is ambiguous at this angle; the player finds it by
  // walking into it. A lit lip on the standing side and a dark drop on the void
  // side turn "somewhere around here" into an exact, readable boundary.
  const airFaces = faces(mask, Solid.Air);
  // The lit-ledge strokes are deliberately faint. They trace the 24px baked
  // COLLISION grid, which only approximates the painted art underneath, so a
  // bright highlight does not land on a painted edge — it reads as a debug
  // overlay drawn over the picture. The shadow falling into a chasm survives at
  // full strength because a dark edge reads as depth even when it is a cell or
  // two off; a bright one reads as a mistake.
  strokeFaces(ctx, airFaces, 5, 8, hex(pal.voidTone), () => 0.5); // shadow falling in
  strokeFaces(ctx, airFaces, -3, 5, hex(pal.lip), (d) => 0.04 + 0.16 * faceLight(d)); // lit ledge

  // --- Walls: contact shadow where they meet the floor, rim where they catch light
  const wallFaces = faces(mask, Solid.Wall);
  strokeFaces(ctx, wallFaces, 4, 7, hex(pal.shadow), (d) => (d === 2 || d === 1 ? 0.34 : 0.12));
  strokeFaces(ctx, wallFaces, -2, 4, hex(pal.lip), (d) => (d === 0 || d === 3 ? 0.08 : 0));

  // --- Shorelines -----------------------------------------------------------
  const waterFaces = faces(mask, Solid.Water);
  strokeFaces(ctx, waterFaces, 3, 6, hex(pal.shadow), () => 0.22);
  strokeFaces(ctx, waterFaces, -3, 5, hex(0xdcf2ff), (d) => 0.05 + 0.1 * faceLight(d));

  const lavaFaces = faces(mask, Solid.Lava);
  strokeFaces(ctx, lavaFaces, 4, 7, hex(0x140704), () => 0.4);
  strokeFaces(ctx, lavaFaces, -3, 5, hex(0xffb347), () => 0.5);

  tex.refresh();

  const img = scene.add.image(GAME_W / 2, GAME_H / 2, KEY);
  img.setDisplaySize(GAME_W, GAME_H).setDepth(0.6);
  return img;
}

/** World size of one collision cell — exported so callers stay off paintgrid. */
export { CELL };
