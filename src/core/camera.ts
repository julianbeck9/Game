import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';

/**
 * The camera rig — and the reason the rest of the juice was invisible.
 *
 * The arena is exactly one game-sized field (1920x1080) and the camera never
 * moved or zoomed, so the whole map was always fitted into the window at once.
 * A champion is 42px across. Fitted into a 1600px-wide browser that is roughly
 * **35 screen pixels**, about 3.9% of the frame height. Hades and Gungeon put
 * their character nearer 10%.
 *
 * That single number invalidates a lot of earlier work: squash-and-stretch,
 * anticipation, follow-through, hurt-squash and the death collapse were all
 * tuned and then rendered onto a figure too small to resolve any of it. The
 * amplitudes were never the problem. The magnification was.
 *
 * So this rig does three things, in descending order of how much they matter:
 *
 * 1. **Zoom in and follow.** Everything already built gets bigger. No gameplay
 *    geometry changes — collision radii, navigation and spawn logic are all
 *    untouched, which matters because the enemy-standoff fix (B9) is sensitive
 *    to unit radius and was expensive to get right.
 * 2. **Kick.** A directional shove along the damage vector that springs back.
 *    Phaser's `shake` is random jitter: it says "something happened" but not
 *    what or from where. A kick says a blow came *from there* — which is the
 *    difference between noise and impact.
 * 3. **Punch.** A snap of extra zoom on heavy hits and kills that eases out.
 *    Cheap, and it reads as the world flinching.
 *
 * Cost of zooming: you no longer see the whole arena. At the default zoom the
 * view covers about 71% of the field's width, so an enemy in a far corner can
 * sit off-screen. That is a real trade and it is why `OFFSCREEN_MARK` exists in
 * ArenaScene rather than being left as an exercise for the player.
 */

/** How far in. 1 = the old fit-the-whole-arena view. */
export const BASE_ZOOM = 1.6;

/** Spring constants for the kick. Stiff and well damped: a shove, not a wobble. */
const KICK_STIFF = 220;
const KICK_DAMP = 22;

/** How fast the camera centre chases the player, per second of catch-up. */
const FOLLOW_LERP = 7.5;

/** How far the view leads ahead of the aim, in world px at full extension. */
const LOOKAHEAD = 130;

export class CameraRig {
  private readonly cam: Phaser.Cameras.Scene2D.Camera;

  /** Smoothed look-at point, in world space. */
  private cx = GAME_W / 2;
  private cy = GAME_H / 2;

  /** Smoothed lookahead offset, so the lead eases in instead of snapping. */
  private leadX = 0;
  private leadY = 0;

  private kickX = 0;
  private kickY = 0;
  private kickVX = 0;
  private kickVY = 0;

  /** Extra zoom on top of the base, decaying back to 0. */
  private punchZ = 0;

  /** Current shake amplitude in WORLD px, decaying. See `shake`. */
  private shakeAmp = 0;

  constructor(scene: Phaser.Scene, startX = GAME_W / 2, startY = GAME_H / 2) {
    this.cam = scene.cameras.main;
    // Bounds are the field itself: the camera may never show the void outside
    // the painted map, however hard the player runs at a corner.
    this.cam.setBounds(0, 0, GAME_W, GAME_H);
    this.cam.setZoom(BASE_ZOOM);
    this.cx = startX;
    this.cy = startY;
    this.cam.centerOn(startX, startY);
  }

  /** Current zoom including the punch — the HUD counter-transform needs it. */
  get zoom(): number {
    return this.cam.zoom;
  }

  /**
   * A directional shove. `dx,dy` is the unit damage vector (source -> target);
   * the camera is thrown *along* it, so a hit from the left pushes the view
   * right. `sev` is the shared severity from core/impact, so the kick agrees
   * with the hit-stop and the spray instead of having its own opinion.
   */
  kick(dx: number, dy: number, sev: number): void {
    const power = 10 + sev * 32;
    this.kickVX += dx * power;
    this.kickVY += dy * power;
  }

  /** A snap of zoom that eases back out. `amount` is in zoom units. */
  punch(amount: number): void {
    this.punchZ = Math.min(0.35, this.punchZ + amount);
  }

  /**
   * Random jitter, replacing `Phaser.Camera.shake`.
   *
   * Phaser's own shake offsets the camera MATRIX, which moves everything the
   * camera draws — including `scrollFactor(0)` objects. With the HUD now
   * screen-locked and anchored hard against the edges, a shake dragged the
   * round counter and the ability buttons past the border and clipped them:
   * on a screenshot it read as a broken layout rather than as a jolt.
   *
   * Applied as a world-space offset instead, so it shakes the arena and leaves
   * the interface alone. `intensity` keeps Phaser's fraction-of-viewport
   * convention so the existing call sites did not have to be retuned.
   */
  shake(intensity: number): void {
    this.shakeAmp = Math.min(22, Math.max(this.shakeAmp, intensity * GAME_W));
  }

  /**
   * @param dtMs   Real elapsed time. Deliberately NOT the hit-stop-scaled dt:
   *               during a freeze the world stops but the camera should still
   *               finish its kick, otherwise the freeze eats the very impact
   *               it exists to sell.
   * @param aimX   Optional world point the player is aiming at; the view leads
   *               toward it so you see what you are about to hit.
   */
  update(dtMs: number, px: number, py: number, aimX?: number, aimY?: number): void {
    const dt = Math.min(0.05, dtMs / 1000);

    // Lead toward the aim, eased. Snapping the lead makes the camera twitch
    // every time the pointer crosses the champion.
    let wantLX = 0;
    let wantLY = 0;
    if (aimX !== undefined && aimY !== undefined) {
      const ax = aimX - px;
      const ay = aimY - py;
      const l = Math.hypot(ax, ay);
      if (l > 1) {
        const reach = Math.min(1, l / 520);
        wantLX = (ax / l) * LOOKAHEAD * reach;
        wantLY = (ay / l) * LOOKAHEAD * reach;
      }
    }
    const lead = 1 - Math.exp(-4 * dt);
    this.leadX += (wantLX - this.leadX) * lead;
    this.leadY += (wantLY - this.leadY) * lead;

    // Exponential smoothing rather than a fixed step, so the follow is
    // framerate-independent — the headless harness runs at ~26fps and would
    // otherwise camera-lag differently from a real 60fps session.
    const k = 1 - Math.exp(-FOLLOW_LERP * dt);
    this.cx += (px + this.leadX - this.cx) * k;
    this.cy += (py + this.leadY - this.cy) * k;

    // Damped spring for the kick.
    this.kickVX += (-KICK_STIFF * this.kickX - KICK_DAMP * this.kickVX) * dt;
    this.kickVY += (-KICK_STIFF * this.kickY - KICK_DAMP * this.kickVY) * dt;
    this.kickX += this.kickVX * dt;
    this.kickY += this.kickVY * dt;

    if (this.punchZ > 0.0005) this.punchZ *= Math.exp(-7 * dt);
    else this.punchZ = 0;

    let shX = 0;
    let shY = 0;
    if (this.shakeAmp > 0.4) {
      shX = (Math.random() * 2 - 1) * this.shakeAmp;
      shY = (Math.random() * 2 - 1) * this.shakeAmp;
      this.shakeAmp *= Math.exp(-9 * dt);
    } else {
      this.shakeAmp = 0;
    }

    this.cam.setZoom(BASE_ZOOM + this.punchZ);
    this.cam.centerOn(this.cx + this.kickX + shX, this.cy + this.kickY + shY);
  }
}

/**
 * Where to park a fixed-to-screen UI layer so it lands on its design pixels.
 *
 * A zoomed camera scales scrollFactor-0 objects about the camera midpoint, so
 * a HUD panel authored at (18,16) drifts and grows as soon as the zoom is not
 * 1. Rather than a second camera — which needs an ignore-list covering every
 * world object, including the many created mid-fight — the whole HUD goes into
 * one container that is counter-transformed here.
 *
 * Screen position of a child at local `l` inside a container at `p` scaled by
 * `1/Z`, under a camera zoomed `Z` about midpoint `c`:
 *
 *     screen = c + (p + l/Z - c) * Z  =  c + (p - c) * Z + l
 *
 * so the child lands exactly on `l` when `c + (p - c) * Z = 0`, i.e.
 * `p = c * (1 - 1/Z)`. Children keep their original absolute coordinates.
 */
export function hudTransform(zoom: number): { x: number; y: number; scale: number } {
  return {
    x: (GAME_W / 2) * (1 - 1 / zoom),
    y: (GAME_H / 2) * (1 - 1 / zoom),
    scale: 1 / zoom,
  };
}
