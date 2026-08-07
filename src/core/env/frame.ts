import type Phaser from 'phaser';
import { GAME_W, GAME_H } from '../../config';
import type { MapDef } from '../maps';
import { envPalette } from './palette';

/**
 * Edge framing: a vignette plus a soft inset border, tinted per region.
 *
 * The maps are single fullscreen paintings, so without this the arena reads as
 * a photograph that happens to be cropped by the browser window. Darkening the
 * outer band turns the crop into a deliberate boundary and pushes the eye to
 * the middle, where the fight is.
 *
 * It is drawn UNDER every gameplay element (depth 2.5, below hazards at 3 and
 * telegraphs at 5). That is deliberate and it is the whole reason this is safe
 * under ARTDIRECTION rule 1: the environment recedes at the edges, but an enemy
 * or a telegraph standing in the corner stays exactly as bright as one in the
 * centre. A vignette drawn over gameplay would be a readability regression
 * dressed up as atmosphere.
 */

const TEX_W = 256;
const TEX_H = 144;
const KEY = 'env:frame';

/** How far in the border fade reaches, as a fraction of the short side. */
const INSET = 0.17;
/** Peak darkening in the very corners. */
const MAX_ALPHA = 0.5;

export function bakeFrame(scene: Phaser.Scene, map: MapDef): Phaser.GameObjects.Image | null {
  const tex = scene.textures.exists(KEY)
    ? (scene.textures.get(KEY) as Phaser.Textures.CanvasTexture)
    : scene.textures.createCanvas(KEY, TEX_W, TEX_H);
  if (!tex || !tex.getContext) return null;
  const ctx = tex.getContext();
  if (!ctx) return null;

  const pal = envPalette(map);
  const r = (pal.frame >> 16) & 255;
  const g = (pal.frame >> 8) & 255;
  const b = pal.frame & 255;
  const rgba = (a: number): string => `rgba(${r},${g},${b},${a})`;

  ctx.clearRect(0, 0, TEX_W, TEX_H);

  // Radial falloff, squashed to the frame's aspect so the darkening is even
  // along all four edges instead of pinching the long sides.
  ctx.save();
  ctx.translate(TEX_W / 2, TEX_H / 2);
  ctx.scale(TEX_W / TEX_H, 1);
  const rad = TEX_H / 2;
  const grd = ctx.createRadialGradient(0, 0, rad * 0.42, 0, 0, rad * 1.16);
  grd.addColorStop(0, rgba(0));
  grd.addColorStop(0.55, rgba(MAX_ALPHA * 0.16));
  grd.addColorStop(0.82, rgba(MAX_ALPHA * 0.5));
  grd.addColorStop(1, rgba(MAX_ALPHA));
  ctx.fillStyle = grd;
  ctx.fillRect(-TEX_W, -TEX_H, TEX_W * 2, TEX_H * 2);
  ctx.restore();

  // Straight inset bands on top, so the boundary reads as a frame and not only
  // as a soft glow. Top is lightest: the horizon side of a ~30° view should not
  // look like it has a lid on it.
  const inset = Math.round(TEX_H * INSET);
  // A gradient needs BOTH endpoints, so the rect (x,y,w,h) and the gradient
  // line (gx1,gy1)->(gx2,gy2) are separate: the band on the right edge is drawn
  // at x = TEX_W - inset but fades leftward, which a single point cannot say.
  const band = (
    x: number,
    y: number,
    w: number,
    h: number,
    gx1: number,
    gy1: number,
    gx2: number,
    gy2: number,
    peak: number,
  ): void => {
    const lg = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
    lg.addColorStop(0, rgba(peak));
    lg.addColorStop(1, rgba(0));
    ctx.fillStyle = lg;
    ctx.fillRect(x, y, w, h);
  };
  band(0, 0, TEX_W, inset, 0, 0, 0, inset, 0.26);
  band(0, TEX_H - inset, TEX_W, inset, 0, TEX_H, 0, TEX_H - inset, 0.4);
  band(0, 0, inset, TEX_H, 0, 0, inset, 0, 0.3);
  band(TEX_W - inset, 0, inset, TEX_H, TEX_W, 0, TEX_W - inset, 0, 0.3);

  tex.refresh();

  const img = scene.add.image(GAME_W / 2, GAME_H / 2, KEY);
  img.setDisplaySize(GAME_W, GAME_H).setDepth(2.5);
  return img;
}
