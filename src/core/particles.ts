import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { sprayFor } from './impact';

/**
 * Pooled combat particle system.
 *
 * ## Why immediate-mode over pooled Graphics instead of Phaser's ParticleEmitter
 *
 * Three reasons, in order of weight:
 *
 * 1. **The leak check.** `scripts/verify.mjs` fails the build if the arena's
 *    display-object count grows by more than 40 across a played round. Anything
 *    that creates a GameObject per effect — which is what the old VFX did, one
 *    `add.graphics()` per hit — races that budget the moment a fight gets busy.
 *    Here every particle is a plain struct in an array that was allocated once;
 *    the scene gains exactly FOUR display objects for the entire system, at
 *    construction, and never another one.
 * 2. **Canvas.** Phaser's particle emitters lean on texture batching that
 *    degrades badly in the Canvas renderer, and `verify` boots both. Drawing
 *    shapes into a Graphics is the one path that behaves identically in both.
 * 3. **Shape.** Emitters spray *textures*. The brief asks for streaks, chunks
 *    and wedges — geometry that changes shape as it ages. That is drawing code,
 *    not a texture, so we draw.
 *
 * The cost of this choice is that we redraw every live particle each frame.
 * That is fine: Phaser flattens a Graphics into one batched geometry buffer, and
 * the pool caps the work at a known ceiling regardless of how ugly the fight is.
 *
 * ## The one rule for adding effects here
 *
 * Everything keys off `severity` from `core/impact.ts` — the same 0..1 number
 * that already drives hit-stop, shake and damage-number size. Do not invent a
 * second threshold. If a light hit and a heavy hit should differ, they differ
 * because severity changed the spray, not because a new magic number appeared.
 */

// --- particle kinds -------------------------------------------------------
// Plain consts rather than a const enum: `isolatedModules` is on, which makes
// const enums a build error.
const SPARK = 0; // tapered streak — the bright flying bit, additive
const DEBRIS = 1; // solid rotating chunk with a dark keyline — reads as matter
const SMOKE = 2; // soft expanding puff, normal blend
const EMBER = 3; // small glowing dot that rises and flickers

/**
 * Hard ceilings. Both pools are ring buffers: when full, the oldest particle is
 * recycled rather than a new one allocated. A fight can therefore never make
 * this system cost more than it does right now, which is the property mobile
 * needs and the leak check enforces.
 */
const MAX_PARTICLES = 512;
const MAX_DECALS = 72;
const MAX_SHOCKS = 24;

interface P {
  active: boolean;
  kind: number;
  x: number;
  y: number;
  px: number; // previous position — streaks are drawn from it, so speed = length
  py: number;
  vx: number;
  vy: number;
  born: number;
  life: number; // ms
  size: number;
  color: number;
  rot: number;
  spin: number;
  drag: number; // per-second velocity retention
  grav: number; // px/s², screen-space down
  seed: number;
}

/** Ground marks. Flattened vertically so they sit in the map's ~30° tilt. */
interface D {
  active: boolean;
  x: number;
  y: number;
  r: number;
  born: number;
  life: number;
  color: number;
  alpha: number;
  seed: number;
  /** 0 = scorch blob, 1 = blood splat, 2 = radial cracks */
  kind: number;
}

/**
 * Expanding shockwave. Replaces the old `drawBurst`, which created a Graphics
 * and a tween per hit — one display object per blow, competing with the leak
 * budget exactly when a fight is busiest. Same look, pooled.
 */
interface S {
  active: boolean;
  x: number;
  y: number;
  born: number;
  life: number;
  r: number;
  color: number;
  /** Travel direction; the ring stretches along it so force has a heading. */
  ax: number;
  ay: number;
  /** 0 = round, 1 = fully elongated. Scales with severity. */
  stretch: number;
  spokes: number;
}

/** Cheap deterministic noise so decal outlines are irregular without allocating. */
function rnd(seed: number, i: number): number {
  const s = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Darken a colour for keylines. The maps span sand, snow, stone and blood — a
 *  saturated chunk with no dark edge vanishes on at least one of them. */
function darken(color: number, f: number): number {
  const r = Math.round(((color >> 16) & 0xff) * f);
  const g = Math.round(((color >> 8) & 0xff) * f);
  const b = Math.round((color & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

/** Blend toward white, for the hot core of a fresh spark. */
function lighten(color: number, f: number): number {
  const r = Math.round(((color >> 16) & 0xff) + (255 - ((color >> 16) & 0xff)) * f);
  const g = Math.round(((color >> 8) & 0xff) + (255 - ((color >> 8) & 0xff)) * f);
  const b = Math.round((color & 0xff) + (255 - (color & 0xff)) * f);
  return (r << 16) | (g << 8) | b;
}

export class Particles {
  private pool: P[] = [];
  private decals: D[] = [];
  private shocks: S[] = [];
  private cursor = 0;
  private decalCursor = 0;
  private shockCursor = 0;

  private gDecal: Phaser.GameObjects.Graphics;
  private gSolid: Phaser.GameObjects.Graphics;
  private gGlow: Phaser.GameObjects.Graphics;
  private gScreen: Phaser.GameObjects.Graphics;

  /** Screen flash state: colour + when it ends. Drawn without a tween so it
   *  costs nothing to fire and cannot leak a tween on scene shutdown. */
  private flashUntil = 0;
  private flashFrom = 0;
  private flashColor = 0xffffff;
  private flashPeak = 0;

  /** Per-emitter throttle for continuous trails, keyed on the emitting object.
   *  A WeakMap so a dead projectile's entry disappears with it. */
  private trailGate = new WeakMap<object, number>();

  private now = 0;
  private readonly additive: boolean;

  // Not stored: nothing after construction needs the scene, and `noUnusedLocals`
  // rejects a private field that is never read again.
  constructor(scene: Phaser.Scene) {
    // Canvas supports 'lighter' compositing, but it is markedly slower there and
    // stacked additive shapes wash out to unreadable white. WebGL gets the glow;
    // Canvas gets honest alpha, which is the graceful degradation the brief asks
    // for rather than a second-class crash.
    this.additive = scene.game.renderer.type === Phaser.WEBGL;

    // Ground marks sit under the cast (units are depth 10) but over the map's
    // hazard layer (depth 3), so a scorch reads as being *on the floor*.
    this.gDecal = scene.add.graphics().setDepth(4);
    // Debris is matter and occludes units; sparks are light and sit above it.
    this.gSolid = scene.add.graphics().setDepth(12);
    this.gGlow = scene.add.graphics().setDepth(13);
    if (this.additive) this.gGlow.setBlendMode(Phaser.BlendModes.ADD);
    this.gScreen = scene.add.graphics().setDepth(300).setScrollFactor(0);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        active: false, kind: 0, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
        born: 0, life: 0, size: 0, color: 0, rot: 0, spin: 0, drag: 0, grav: 0, seed: 0,
      });
    }
    for (let i = 0; i < MAX_DECALS; i++) {
      this.decals.push({
        active: false, x: 0, y: 0, r: 0, born: 0, life: 0, color: 0, alpha: 0, seed: 0, kind: 0,
      });
    }
    for (let i = 0; i < MAX_SHOCKS; i++) {
      this.shocks.push({
        active: false, x: 0, y: 0, born: 0, life: 0, r: 0, color: 0,
        ax: 1, ay: 0, stretch: 0, spokes: 0,
      });
    }
  }

  /** Recycle the oldest slot when the pool is saturated — bounded by design. */
  private take(): P {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      if (!p.active) return p;
    }
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    return p;
  }

  private emit(
    kind: number, x: number, y: number, vx: number, vy: number,
    life: number, size: number, color: number,
    drag = 0.9, grav = 0, spin = 0,
  ): void {
    const p = this.take();
    p.active = true;
    p.kind = kind;
    p.x = x; p.y = y; p.px = x; p.py = y;
    p.vx = vx; p.vy = vy;
    p.born = this.now;
    p.life = life;
    p.size = size;
    p.color = color;
    p.rot = Math.random() * Math.PI * 2;
    p.spin = spin;
    p.drag = drag;
    p.grav = grav;
    p.seed = Math.random() * 1000;
  }

  // ---------------------------------------------------------------- effects

  /**
   * Directional hit spray.
   *
   * `dx,dy` is the damage vector — the direction the blow was travelling. Debris
   * continues along it (momentum is transferred, so matter flies AWAY from the
   * attacker) while a minority back-scatters toward the attacker, which is what
   * sells a hit as a collision rather than a puff appearing on a sprite.
   *
   * Light and heavy hits differ in *kind*, not just scale: below the debris
   * threshold a hit is a few fast sparks and nothing else, while a heavy one
   * adds solid chunks, smoke and a mark on the floor. That is deliberate — if
   * every hit produced every element and only the radius changed, the player
   * would read one effect at two sizes instead of two different events.
   */
  impact(x: number, y: number, dx: number, dy: number, sev: number, color: number): void {
    const s = sprayFor(sev);
    const base = Math.atan2(dy, dx);

    for (let i = 0; i < s.sparks; i++) {
      // A quarter of the sparks bounce back toward the attacker.
      const back = Math.random() < 0.25;
      const spread = back ? 1.1 : s.spread;
      const a = base + (back ? Math.PI : 0) + (Math.random() - 0.5) * spread;
      const sp = s.speed * (0.45 + Math.random() * 0.75) * (back ? 0.5 : 1);
      this.emit(
        SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        170 + Math.random() * 190, 1.6 + Math.random() * 1.9 + sev * 2.2,
        Math.random() < 0.5 ? lighten(color, 0.55) : color,
        0.86, 220,
      );
    }

    for (let i = 0; i < s.debris; i++) {
      const a = base + (Math.random() - 0.5) * (s.spread * 1.25);
      const sp = s.speed * (0.3 + Math.random() * 0.5);
      this.emit(
        DEBRIS, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        480 + Math.random() * 460, 2.4 + Math.random() * 3.4 + sev * 3,
        color, 0.82, 900, (Math.random() - 0.5) * 16,
      );
    }

    for (let i = 0; i < s.smoke; i++) {
      const a = base + (Math.random() - 0.5) * 2.4;
      const sp = 26 + Math.random() * 44;
      this.emit(
        SMOKE, x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10,
        Math.cos(a) * sp, Math.sin(a) * sp - 22,
        320 + Math.random() * 260, 7 + Math.random() * 9 + sev * 12,
        0x2a2a33, 0.9, -14,
      );
    }

    if (s.decal) {
      this.decal(x, y + 6, 12 + sev * 20, darken(color, 0.5), 0, 2600 + sev * 2200, 0.3);
    }
    // Screen flash is reserved for hits that genuinely matter, or it becomes
    // wallpaper and stops meaning "that one hurt".
    if (s.flash > 0) this.screenFlash(color, s.flash, 90);
  }

  /**
   * Death. An enemy used to vanish behind a ring; now it comes apart.
   *
   * Chunks fly out under gravity and settle, embers rise off the wreck, a smoke
   * plume marks where it stood and the floor keeps a stain. The 360° spread is
   * intentional — death is not directional, and a radial burst reads as
   * *destruction* where a cone would read as another hit.
   */
  death(x: number, y: number, color: number, big = false): void {
    const n = big ? 14 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = 130 + Math.random() * 210 * (big ? 1.5 : 1);
      this.emit(
        DEBRIS, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60,
        620 + Math.random() * 520, 3 + Math.random() * 4.5 + (big ? 3 : 0),
        color, 0.84, 1150, (Math.random() - 0.5) * 20,
      );
    }
    for (let i = 0; i < (big ? 16 : 11); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 90 + Math.random() * 260;
      this.emit(
        SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        200 + Math.random() * 230, 2 + Math.random() * 2.4,
        lighten(color, 0.5), 0.87, 180,
      );
    }
    for (let i = 0; i < 6; i++) {
      this.emit(
        SMOKE, x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 50, -30 - Math.random() * 46,
        520 + Math.random() * 420, 11 + Math.random() * 13,
        0x24242e, 0.92, -18,
      );
    }
    for (let i = 0; i < 5; i++) {
      this.emit(
        EMBER, x + (Math.random() - 0.5) * 22, y + (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 40, -60 - Math.random() * 70,
        620 + Math.random() * 520, 1.7 + Math.random() * 1.6,
        lighten(color, 0.3), 0.94, -22,
      );
    }
    this.decal(x, y + 8, 22 + (big ? 16 : 0), darken(color, 0.45), 1, 5200, 0.36);
  }

  /**
   * Muzzle flash with an actual silhouette: a forward wedge plus a four-point
   * star, not a circle. A circle at the barrel reads as a glow bug; a wedge
   * reads as *something left in that direction*, which is the whole job.
   */
  muzzle(x: number, y: number, angle: number, color: number, size = 10): void {
    // The wedge is a short-lived SMOKE-free construct drawn from sparks so it
    // inherits the pool's lifetime management rather than needing its own.
    for (let i = 0; i < 7; i++) {
      const a = angle + (Math.random() - 0.5) * 0.85;
      const sp = 260 + Math.random() * 420;
      this.emit(
        SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        90 + Math.random() * 110, 1.5 + Math.random() * 2,
        lighten(color, 0.6), 0.8, 60,
      );
    }
    // One fat, very short streak along the barrel line = the flash itself.
    this.emit(
      SPARK, x, y, Math.cos(angle) * 620, Math.sin(angle) * 620,
      70, size * 0.85, lighten(color, 0.75), 0.6, 0,
    );
    for (let i = 0; i < 2; i++) {
      this.emit(
        SMOKE, x + Math.cos(angle) * size, y + Math.sin(angle) * size,
        Math.cos(angle) * 60, Math.sin(angle) * 60 - 14,
        260, size * 0.7, 0x33333d, 0.88, -10,
      );
    }
  }

  /**
   * Continuous projectile trail. Throttled per emitter so a screen full of
   * bolts cannot drain the pool: each emitter may drop one mote every ~22ms
   * regardless of frame rate, which keeps trail density tied to time rather
   * than to how fast the machine happens to be running.
   */
  trail(key: object, x: number, y: number, dx: number, dy: number, color: number, size = 3): void {
    const next = this.trailGate.get(key) ?? 0;
    if (this.now < next) return;
    this.trailGate.set(key, this.now + 22);
    const a = Math.atan2(dy, dx) + Math.PI + (Math.random() - 0.5) * 0.5;
    const sp = 20 + Math.random() * 45;
    this.emit(
      EMBER, x - dx * size, y - dy * size,
      Math.cos(a) * sp, Math.sin(a) * sp,
      190 + Math.random() * 170, size * (0.4 + Math.random() * 0.5),
      color, 0.9, -8,
    );
  }

  /**
   * Expanding shockwave at the point of contact, stretched along the damage
   * vector. The old version was a circle, which said "something happened here"
   * but not "something hit you from THAT direction" — and direction is the
   * single most useful thing a hit can tell a player who is trying to work out
   * what is attacking them.
   */
  shock(x: number, y: number, dx: number, dy: number, sev: number, color: number): void {
    const s = this.shocks[this.shockCursor];
    this.shockCursor = (this.shockCursor + 1) % MAX_SHOCKS;
    const l = Math.hypot(dx, dy) || 1;
    s.active = true;
    s.x = x; s.y = y;
    s.born = this.now;
    s.life = 180 + sev * 170;
    s.r = 14 + sev * 34;
    s.color = color;
    s.ax = dx / l; s.ay = dy / l;
    s.stretch = 0.25 + sev * 0.5;
    s.spokes = sev >= 0.3 ? 4 + Math.round(sev * 4) : 0;
  }

  /** A ground mark. Kept low-alpha and under the cast: history, never clutter. */
  decal(x: number, y: number, r: number, color: number, kind: number, life = 4000, alpha = 0.32): void {
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % MAX_DECALS;
    d.active = true;
    d.x = x; d.y = y; d.r = r;
    d.born = this.now; d.life = life;
    d.color = color; d.alpha = alpha;
    d.kind = kind;
    d.seed = Math.random() * 1000;
  }

  /** Brief full-screen wash. Peak alpha stays low — this is a punctuation mark. */
  screenFlash(color: number, peak = 0.12, ms = 90): void {
    // Never let a second flash dim an in-flight brighter one.
    if (this.now < this.flashUntil && peak < this.flashPeak) return;
    this.flashColor = color;
    this.flashPeak = peak;
    this.flashFrom = this.now;
    this.flashUntil = this.now + ms;
  }

  /**
   * One spark with an explicit velocity. For callers that already know exactly
   * where a particle should go — a cone spray that must stay inside the
   * ability's declared opening angle, for instance — rather than asking for a
   * severity-shaped burst.
   */
  spark(x: number, y: number, vx: number, vy: number, color: number, size = 2): void {
    this.emit(SPARK, x, y, vx, vy, 190 + Math.random() * 220, size, color, 0.88, 140);
  }

  /** Directional dust kicked up by a dash/landing, perpendicular to travel. */
  dust(x: number, y: number, dx: number, dy: number, color = 0x9a9a8a, n = 8): void {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const a = base + side * (Math.PI / 2) + (Math.random() - 0.5) * 1.2;
      const sp = 40 + Math.random() * 110;
      this.emit(
        SMOKE, x, y + 6, Math.cos(a) * sp, Math.sin(a) * sp * 0.5 - 10,
        280 + Math.random() * 240, 6 + Math.random() * 8, color, 0.87, -6,
      );
    }
  }

  // ------------------------------------------------------------------ frame

  /**
   * Integrate and redraw. `dt` is the scene's already-scaled delta, so particles
   * slow down during hit-stop along with everything else — a spray that kept
   * running at full speed through a freeze frame is the classic tell that the
   * VFX layer is not part of the same world as the combat.
   */
  update(now: number, dt: number): void {
    this.now = now;
    const gs = this.gSolid;
    const gg = this.gGlow;
    const gd = this.gDecal;
    gs.clear();
    gg.clear();
    gd.clear();

    // --- ground marks (drawn first, lowest depth) ---
    for (let i = 0; i < MAX_DECALS; i++) {
      const d = this.decals[i];
      if (!d.active) continue;
      const t = (now - d.born) / d.life;
      if (t >= 1) { d.active = false; continue; }
      // Hold, then fade — a stain that starts fading immediately never reads as
      // having been left behind.
      const a = d.alpha * (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
      this.drawDecal(gd, d, a);
    }

    // --- shockwaves (under the spray, over the floor) ---
    for (let i = 0; i < MAX_SHOCKS; i++) {
      const s = this.shocks[i];
      if (!s.active) continue;
      const t = (now - s.born) / s.life;
      if (t >= 1) { s.active = false; continue; }
      this.drawShock(gg, s, t);
    }

    // --- particles ---
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      const age = now - p.born;
      if (age >= p.life) { p.active = false; continue; }
      const t = age / p.life;

      p.px = p.x;
      p.py = p.y;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;

      switch (p.kind) {
        case SPARK: this.drawSpark(gg, p, t); break;
        case DEBRIS: this.drawDebris(gs, p, t); break;
        case SMOKE: this.drawSmoke(gs, p, t); break;
        default: this.drawEmber(gg, p, t); break;
      }
    }

    // --- screen flash ---
    this.gScreen.clear();
    if (now < this.flashUntil) {
      const t = (now - this.flashFrom) / (this.flashUntil - this.flashFrom);
      this.gScreen.fillStyle(this.flashColor, this.flashPeak * (1 - t) * (1 - t));
      this.gScreen.fillRect(0, 0, GAME_W, GAME_H);
    }
  }

  /**
   * Ring stretched along the blow. Drawn as an ellipse rotated to the damage
   * vector, with a bright leading edge on the far side — the side the force
   * went — plus optional spokes for heavy hits.
   */
  private drawShock(g: Phaser.GameObjects.Graphics, s: S, t: number): void {
    const fade = (1 - t) * (1 - t);
    const r = s.r * (0.55 + t * 1.5);
    const ang = Math.atan2(s.ay, s.ax);
    const rx = r * (1 + s.stretch);
    const ry = r * (1 - s.stretch * 0.45);

    // Phaser's Graphics has no rotated-ellipse primitive, so walk the ellipse
    // and rotate each point into the blow's frame.
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const N = 22;
    g.lineStyle(Math.max(1.2, (2 + s.stretch * 4) * (1 - t)), s.color, 0.9 * fade);
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const ex = Math.cos(a) * rx;
      const ey = Math.sin(a) * ry;
      const px = s.x + ex * cos - ey * sin;
      const py = s.y + ex * sin + ey * cos;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.strokePath();

    if (s.spokes > 0) {
      g.lineStyle(Math.max(1, 2.5 * (1 - t)), lighten(s.color, 0.5), 0.8 * fade);
      for (let i = 0; i < s.spokes; i++) {
        // Spokes bias toward the blow's heading rather than spreading evenly,
        // so even the debris-free part of the burst carries the direction.
        const a = ang + (i / s.spokes - 0.5) * 2.2 + rnd(s.x + i, i) * 0.25;
        const inner = r * 0.75;
        const outer = r * (1.35 + s.stretch * 0.7);
        g.beginPath();
        g.moveTo(s.x + Math.cos(a) * inner, s.y + Math.sin(a) * inner);
        g.lineTo(s.x + Math.cos(a) * outer, s.y + Math.sin(a) * outer);
        g.strokePath();
      }
    }
  }

  /** Tapered streak from the previous position: length encodes speed for free. */
  private drawSpark(g: Phaser.GameObjects.Graphics, p: P, t: number): void {
    const fade = 1 - t * t;
    const w = Math.max(0.6, p.size * (1 - t * 0.75));
    // Stretch the tail beyond the last frame's position so slow sparks still
    // read as streaks rather than dots.
    const tx = p.x - (p.x - p.px) * 2.4;
    const ty = p.y - (p.y - p.py) * 2.4;
    g.lineStyle(w, p.color, (this.additive ? 0.95 : 0.8) * fade);
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(p.x, p.y);
    g.strokePath();
    // Hot head, only while young — this is what makes a spark look like it is
    // burning rather than like a coloured line.
    if (t < 0.5) {
      g.fillStyle(0xffffff, (this.additive ? 0.8 : 0.55) * (1 - t * 2));
      g.fillCircle(p.x, p.y, w * 0.6);
    }
  }

  /** Solid rotating chunk with a dark keyline, so it reads on any map palette. */
  private drawDebris(g: Phaser.GameObjects.Graphics, p: P, t: number): void {
    const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    const s = p.size * (1 - t * 0.25);
    const c = Math.cos(p.rot);
    const sn = Math.sin(p.rot);
    // A squat quad rather than a square: chunks of a thing, not dice.
    const hw = s;
    const hh = s * 0.62;
    const x1 = p.x + (-hw * c - -hh * sn), y1 = p.y + (-hw * sn + -hh * c);
    const x2 = p.x + (hw * c - -hh * sn), y2 = p.y + (hw * sn + -hh * c);
    const x3 = p.x + (hw * c - hh * sn), y3 = p.y + (hw * sn + hh * c);
    const x4 = p.x + (-hw * c - hh * sn), y4 = p.y + (-hw * sn + hh * c);
    g.fillStyle(p.color, 0.95 * fade);
    g.beginPath();
    g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4);
    g.closePath();
    g.fillPath();
    g.lineStyle(1.4, darken(p.color, 0.25), 0.9 * fade);
    g.beginPath();
    g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4);
    g.closePath();
    g.strokePath();
  }

  private drawSmoke(g: Phaser.GameObjects.Graphics, p: P, t: number): void {
    const r = p.size * (0.6 + t * 1.5);
    // Smoke must never bloom opaque over the cast — it exists to soften an
    // impact's edge, not to hide whatever is standing in it.
    g.fillStyle(p.color, 0.3 * (1 - t) * (1 - t));
    g.fillEllipse(p.x, p.y, r * 2, r * 1.5);
  }

  private drawEmber(g: Phaser.GameObjects.Graphics, p: P, t: number): void {
    // Flicker, because a steady dot reads as a UI element, not as fire.
    const flick = 0.65 + 0.35 * Math.sin((this.now + p.seed * 10) / 45);
    g.fillStyle(p.color, (this.additive ? 0.9 : 0.7) * (1 - t) * flick);
    g.fillCircle(p.x, p.y, p.size * (1 - t * 0.4));
  }

  /** Decals are flattened to ~0.55 vertical: they lie in the ground plane of a
   *  ~30° tilted map instead of standing up like a coin facing the camera. */
  private drawDecal(g: Phaser.GameObjects.Graphics, d: D, alpha: number): void {
    if (alpha <= 0.002) return;
    if (d.kind === 2) {
      g.lineStyle(2, d.color, alpha);
      for (let i = 0; i < 6; i++) {
        const a = rnd(d.seed, i) * Math.PI * 2;
        const l = d.r * (0.5 + rnd(d.seed, i + 40) * 0.9);
        g.beginPath();
        g.moveTo(d.x, d.y);
        g.lineTo(d.x + Math.cos(a) * l, d.y + Math.sin(a) * l * 0.55);
        g.strokePath();
      }
      return;
    }
    // Irregular blob: a polygon whose radius wobbles per vertex. Derived from a
    // seed at draw time so no array is allocated per decal.
    const n = 9;
    g.fillStyle(d.color, alpha);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = d.r * (0.62 + rnd(d.seed, i) * 0.62);
      const px = d.x + Math.cos(a) * rr;
      const py = d.y + Math.sin(a) * rr * 0.55;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
    // Blood throws a few satellite droplets; scorch does not.
    if (d.kind === 1) {
      for (let i = 0; i < 5; i++) {
        const a = rnd(d.seed, i + 70) * Math.PI * 2;
        const l = d.r * (1.05 + rnd(d.seed, i + 90) * 0.75);
        g.fillCircle(d.x + Math.cos(a) * l, d.y + Math.sin(a) * l * 0.55, d.r * 0.13 * (0.5 + rnd(d.seed, i + 110)));
      }
    }
  }

  /** Wipe every live effect — used on round end so nothing bleeds into the next. */
  clear(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) this.pool[i].active = false;
    for (let i = 0; i < MAX_DECALS; i++) this.decals[i].active = false;
    for (let i = 0; i < MAX_SHOCKS; i++) this.shocks[i].active = false;
    this.flashUntil = 0;
    this.gSolid.clear();
    this.gGlow.clear();
    this.gDecal.clear();
    this.gScreen.clear();
  }

  destroy(): void {
    this.gDecal.destroy();
    this.gSolid.destroy();
    this.gGlow.destroy();
    this.gScreen.destroy();
  }
}
