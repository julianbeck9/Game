import type Phaser from 'phaser';
import { GAME_W, GAME_H } from '../../config';
import type { AmbientKind } from '../maps';

/**
 * Per-region weather. Drifting motes, blowing snow, rising embers, spores.
 *
 * Two rules shape every number in this file:
 *
 * 1. ARTDIRECTION rule 1 — this is background and must never compete. Nothing
 *    here is bright, nothing is fast enough to catch the eye, and the
 *    foreground layer punches a hole around the player so it can never sit on
 *    top of the one thing the player must not lose (the readability bug this
 *    game already shipped once).
 * 2. Motion parallax is the only depth cue available to a fixed camera. The
 *    foreground layer runs 2-3x faster and larger than the background one; that
 *    speed difference alone is what makes a flat painting feel like it has air
 *    in front of it.
 */

type Shape = 'dot' | 'flake' | 'streak' | 'wisp';

export interface AmbientProfile {
  color: number;
  /** Background particle count (behind everything). */
  count: number;
  /** Foreground particle count. Kept tiny — these pass over the fight. */
  fgCount: number;
  size: [number, number];
  vx: [number, number];
  vy: [number, number];
  /** Horizontal sine sway, px/s. */
  sway: number;
  swaySpeed: number;
  alpha: [number, number];
  /** 0 = steady, 1 = fully fades in and out. */
  twinkle: number;
  shape: Shape;
  /** Where a recycled particle re-enters the screen. */
  from: 'top' | 'bottom' | 'left' | 'right' | 'any';
  /** Slow global speed-up/slow-down, as a fraction. Wind gusts. */
  gust: number;
}

const PROFILES: Record<AmbientKind, AmbientProfile> = {
  // Ionia: blossom drifting down and to the left, the one warm-pink accent.
  petals: {
    color: 0xf0b8cc, count: 34, fgCount: 5, size: [3, 7], vx: [-26, -8], vy: [22, 46],
    sway: 20, swaySpeed: 0.9, alpha: [0.25, 0.5], twinkle: 0.15, shape: 'flake', from: 'top', gust: 0.25,
  },
  // Shurima: fast, flat, low sand streaking across the frame.
  sand: {
    color: 0xd8b878, count: 46, fgCount: 7, size: [2, 5], vx: [90, 180], vy: [-6, 10],
    sway: 6, swaySpeed: 1.6, alpha: [0.12, 0.30], twinkle: 0.1, shape: 'streak', from: 'left', gust: 0.55,
  },
  // Noxus: embers rising off the pit, the only ambient that flickers.
  embers: {
    color: 0xd2502a, count: 30, fgCount: 5, size: [2, 4], vx: [-12, 12], vy: [-52, -22],
    sway: 14, swaySpeed: 1.3, alpha: [0.28, 0.6], twinkle: 0.55, shape: 'dot', from: 'bottom', gust: 0.3,
  },
  // Demacia: gold dust hanging in shafts of light, almost still.
  motes: {
    color: 0xf0e4b0, count: 40, fgCount: 5, size: [2, 4], vx: [-7, 7], vy: [-9, 5],
    sway: 8, swaySpeed: 0.5, alpha: [0.14, 0.34], twinkle: 0.6, shape: 'dot', from: 'any', gust: 0.15,
  },
  // Freljord: snow, swaying hard on the way down.
  snow: {
    color: 0xe8f6ff, count: 54, fgCount: 8, size: [2, 5], vx: [-30, -6], vy: [34, 70],
    sway: 34, swaySpeed: 1.1, alpha: [0.22, 0.5], twinkle: 0.1, shape: 'flake', from: 'top', gust: 0.4,
  },
  // Zaun: heavy chem-spores welling upward, slow and fat.
  spores: {
    color: 0x9fe23a, count: 26, fgCount: 5, size: [3, 7], vx: [-9, 9], vy: [-26, -8],
    sway: 18, swaySpeed: 0.6, alpha: [0.14, 0.32], twinkle: 0.5, shape: 'dot', from: 'bottom', gust: 0.2,
  },
  // Shadow Isles: big low-contrast wisps of mist crossing the field.
  mist: {
    color: 0x5fe8d0, count: 14, fgCount: 4, size: [26, 60], vx: [10, 34], vy: [-7, 7],
    sway: 12, swaySpeed: 0.3, alpha: [0.05, 0.11], twinkle: 0.35, shape: 'wisp', from: 'left', gust: 0.3,
  },
  // Void: motes that blink in and out of existence rather than travelling.
  rift: {
    color: 0xb87aff, count: 34, fgCount: 5, size: [2, 5], vx: [-14, 14], vy: [-20, -4],
    sway: 10, swaySpeed: 0.8, alpha: [0.16, 0.42], twinkle: 0.85, shape: 'dot', from: 'any', gust: 0.2,
  },
};

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  alpha: number;
  /** Extra scale for foreground particles (parallax: nearer = bigger, faster). */
  near: number;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/**
 * Radius around the player where foreground particles fade to nothing.
 * Non-negotiable: a mote drifting over the player's head is exactly the class
 * of bug ARTDIRECTION rule 1 was written about.
 */
const PLAYER_CLEAR = 190;

export class Ambient {
  private profile: AmbientProfile;
  private bg: Mote[] = [];
  private fg: Mote[] = [];

  constructor(kind: AmbientKind, private bgGfx: Phaser.GameObjects.Graphics, private fgGfx: Phaser.GameObjects.Graphics) {
    this.profile = PROFILES[kind] ?? PROFILES.motes;
    for (let i = 0; i < this.profile.count; i++) this.bg.push(this.make(true, 1));
    for (let i = 0; i < this.profile.fgCount; i++) this.fg.push(this.make(true, 2.4));
  }

  private make(anywhere: boolean, near: number): Mote {
    const p = this.profile;
    let x = Math.random() * GAME_W;
    let y = Math.random() * GAME_H;
    if (!anywhere) {
      switch (p.from) {
        case 'top': y = -20; break;
        case 'bottom': y = GAME_H + 20; break;
        case 'left': x = -20; break;
        case 'right': x = GAME_W + 20; break;
        default: break;
      }
    }
    return {
      x,
      y,
      vx: rand(p.vx[0], p.vx[1]) * near,
      vy: rand(p.vy[0], p.vy[1]) * near,
      size: rand(p.size[0], p.size[1]) * (near > 1 ? 1.7 : 1),
      phase: Math.random() * Math.PI * 2,
      alpha: rand(p.alpha[0], p.alpha[1]) * (near > 1 ? 0.6 : 1),
      near,
    };
  }

  /** Recycle in place — allocating a particle per frame is how you leak. */
  private recycle(m: Mote): void {
    const fresh = this.make(false, m.near);
    m.x = fresh.x;
    m.y = fresh.y;
    m.vx = fresh.vx;
    m.vy = fresh.vy;
    m.size = fresh.size;
    m.phase = fresh.phase;
    m.alpha = fresh.alpha;
  }

  update(dt: number, now: number, px: number, py: number): void {
    const p = this.profile;
    // One shared gust so the whole field breathes together instead of each
    // particle wobbling on its own private clock.
    const gust = 1 + p.gust * Math.sin(now / 2600);
    this.step(this.bg, dt, now, gust);
    this.step(this.fg, dt, now, gust);
    this.draw(this.bgGfx, this.bg, now, -1, -1);
    this.draw(this.fgGfx, this.fg, now, px, py);
  }

  private step(list: Mote[], dt: number, now: number, gust: number): void {
    const p = this.profile;
    const m = 60; // off-screen margin before recycling
    for (const q of list) {
      q.x += (q.vx * gust + Math.sin(now / 1000 * p.swaySpeed + q.phase) * p.sway) * dt;
      q.y += q.vy * gust * dt;
      if (q.x < -m || q.x > GAME_W + m || q.y < -m || q.y > GAME_H + m) this.recycle(q);
    }
  }

  private draw(g: Phaser.GameObjects.Graphics, list: Mote[], now: number, px: number, py: number): void {
    const p = this.profile;
    for (const q of list) {
      let a = q.alpha;
      if (p.twinkle > 0) a *= 1 - p.twinkle * (0.5 + 0.5 * Math.sin(now / 700 + q.phase * 3));
      // Foreground only: dissolve near the player so it can never occlude.
      if (px >= 0) {
        const d = Math.hypot(q.x - px, q.y - py);
        if (d < PLAYER_CLEAR) a *= Math.max(0, (d - PLAYER_CLEAR * 0.35) / (PLAYER_CLEAR * 0.65));
      }
      if (a <= 0.012) continue;

      switch (p.shape) {
        case 'wisp': {
          // Soft blob, faked with three stacked circles — no shaders, so this
          // has to work identically in the Canvas renderer.
          g.fillStyle(p.color, a * 0.5);
          g.fillCircle(q.x, q.y, q.size);
          g.fillStyle(p.color, a * 0.35);
          g.fillCircle(q.x - q.size * 0.4, q.y + q.size * 0.2, q.size * 0.7);
          g.fillStyle(p.color, a * 0.3);
          g.fillCircle(q.x + q.size * 0.5, q.y - q.size * 0.15, q.size * 0.55);
          break;
        }
        case 'streak': {
          g.fillStyle(p.color, a);
          g.fillRect(q.x, q.y, q.size * 3.2, Math.max(1, q.size * 0.55));
          break;
        }
        case 'flake': {
          // Tumbling: the flake squashes as it turns, which reads as rotation
          // for a fraction of the cost of actually rotating a quad.
          const s = q.size * (0.45 + 0.55 * Math.abs(Math.sin(now / 620 + q.phase)));
          g.fillStyle(p.color, a);
          g.fillRect(q.x - s / 2, q.y - q.size / 2, s, q.size);
          break;
        }
        default: {
          g.fillStyle(p.color, a);
          g.fillCircle(q.x, q.y, q.size * 0.5);
          break;
        }
      }
    }
  }
}
