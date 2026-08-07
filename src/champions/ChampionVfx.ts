/**
 * ChampionVfx — cast/attack effects, driven by AnimatedChampion events.
 *
 * ## What changed and why
 *
 * The previous version created one or more `scene.add.*` GameObjects plus a
 * tween per event and destroyed them on complete. That works until a six-enemy
 * squad all swing at once, at which point it is allocating and destroying
 * display objects every frame of a fight — the exact thing the leak check in
 * `scripts/verify.mjs` guards against, and the exact thing that costs most on
 * mobile.
 *
 * This version is pooled and immediate-mode, matching `core/particles.ts`: a
 * fixed array of effect structs, drawn into ONE Graphics each frame. The scene
 * gains one display object for all champion VFX, forever.
 *
 * ## The shape rule
 *
 * The silhouettes here are driven by `VfxSpec`, and `VfxSpec`'s geometry comes
 * from the champion's declared `AbilityShape` via `abilityVfx.specForShape`.
 * Nothing in this file may hard-code a reach, a radius or a cone angle — if an
 * effect needs to know how far it goes, it reads `s.dist`; how wide, `s.size`
 * or `s.spread`. That is what keeps the preview, the description and the effect
 * describing the same ability. See `abilityVfx.ts` for the mapping.
 *
 *   const vfx = new ChampionVfx(scene, particles); // once per gameplay scene
 *   vfx.bind(champion);                            // per AnimatedChampion
 *   vfx.update(time, dt);                          // once per frame
 */

import Phaser from 'phaser';
import { AnimatedChampion, ChampEvents, ChampVfxEvent } from './AnimatedChampion';
import { VfxSpec } from './championConfig';
import type { Particles } from '../core/particles';

/** Above units (10) and the particle layers (12/13), below damage numbers (140)
 *  and the HUD. Cast flourishes must never cover the number that says how much
 *  it did, nor the telegraph that says what is about to happen. */
const DEPTH = 14;

const MAX_FX = 48;

interface Fx {
  active: boolean;
  kind: string;
  x: number;
  y: number;
  angle: number;
  color: number;
  dist: number;
  size: number;
  spread: number;
  born: number;
  life: number;
  /** Emitters that shed particles along their path need to know where they were. */
  lx: number;
  ly: number;
  seed: number;
}

function lighten(color: number, f: number): number {
  const r = Math.round(((color >> 16) & 0xff) + (255 - ((color >> 16) & 0xff)) * f);
  const g = Math.round(((color >> 8) & 0xff) + (255 - ((color >> 8) & 0xff)) * f);
  const b = Math.round((color & 0xff) + (255 - (color & 0xff)) * f);
  return (r << 16) | (g << 8) | b;
}

export class ChampionVfx {
  private g: Phaser.GameObjects.Graphics;
  private pool: Fx[] = [];
  private cursor = 0;
  private now = 0;
  private particles: Particles;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, particles: Particles) {
    this.scene = scene;
    this.particles = particles;
    this.g = scene.add.graphics().setDepth(DEPTH);
    for (let i = 0; i < MAX_FX; i++) {
      this.pool.push({
        active: false, kind: '', x: 0, y: 0, angle: 0, color: 0xffffff,
        dist: 0, size: 0, spread: 0, born: 0, life: 0, lx: 0, ly: 0, seed: 0,
      });
    }
  }

  bind(champ: AnimatedChampion): void {
    champ.on(ChampEvents.AttackHit, (e: ChampVfxEvent) => this.play(e));
    champ.on(ChampEvents.CastRelease, (e: ChampVfxEvent) => this.play(e));
    champ.on(ChampEvents.Hurt, (e: ChampVfxEvent) => this.hurt(e));
  }

  private take(): Fx {
    for (let i = 0; i < MAX_FX; i++) {
      const f = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_FX;
      if (!f.active) return f;
    }
    const f = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_FX;
    return f;
  }

  private spawn(kind: string, x: number, y: number, angle: number, s: VfxSpec, life: number): Fx {
    const f = this.take();
    f.active = true;
    f.kind = kind;
    f.x = x; f.y = y;
    f.lx = x; f.ly = y;
    f.angle = angle;
    f.color = s.color;
    // Geometry always comes from the spec, which comes from the AbilityShape.
    f.dist = s.dist ?? 200;
    f.size = s.size ?? 8;
    f.spread = s.spread ?? 45;
    f.born = this.now;
    f.life = life;
    f.seed = Math.random() * 1000;
    return f;
  }

  private play(e: ChampVfxEvent): void {
    const s = e.spec;
    if (!s) return;
    if (s.shake) this.scene.cameras.main.shake(120, s.shake * 0.001);

    switch (s.kind) {
      case 'meleeArc':
        this.spawn('meleeArc', e.x, e.y, e.angle, s, 190);
        break;
      case 'projectile':
        this.spawn('projectile', e.x, e.y, e.angle, s, ((s.dist ?? 260) / (s.speed ?? 520)) * 1000);
        this.particles.muzzle(e.x, e.y, e.angle, s.color, Math.max(6, (s.size ?? 4) * 1.5));
        break;
      case 'lob':
        this.spawn('lob', e.x, e.y, e.angle, s, ((s.dist ?? 140) / (s.speed ?? 320)) * 1000);
        break;
      case 'puff':
        this.puff(e, s);
        break;
      case 'beam':
        this.spawn('beam', e.x, e.y, e.angle, s, 230);
        break;
      case 'grab':
        this.spawn('grab', e.x, e.y, e.angle, s, 300);
        break;
      case 'aoe':
        this.spawn('aoe', e.champ.x, e.champ.y, e.angle, s, 360);
        this.particles.dust(e.champ.x, e.champ.y, Math.cos(e.angle), Math.sin(e.angle), lighten(s.color, 0.2), 10);
        break;
      case 'cone':
        this.spawn('cone', e.x, e.y, e.angle, s, 300);
        this.coneSpray(e, s);
        break;
      case 'muzzle':
        // Real geometry, no ring: the travelling projectile is the actual one.
        this.particles.muzzle(e.x, e.y, e.angle, s.color, s.size ?? 10);
        break;
      case 'flash':
        this.spawn('flash', e.champ.x, e.champ.y - e.champ.displayHeight * 0.4, e.angle, s, 300);
        break;
      default:
        this.puff(e, s);
        break;
    }
  }

  /** Hit reaction on the sprite: a small directional scuff, not a red circle. */
  private hurt(e: ChampVfxEvent): void {
    this.particles.impact(e.x, e.y, Math.cos(e.angle + Math.PI), Math.sin(e.angle + Math.PI), 0.14, 0xff6a5e);
  }

  /** Expanding cloud, delegated wholly to the pool — no geometry of its own. */
  private puff(e: ChampVfxEvent, s: VfxSpec): void {
    const dist = s.dist ?? 100;
    this.particles.dust(
      e.x + Math.cos(e.angle) * dist * 0.35,
      e.y + Math.sin(e.angle) * dist * 0.35,
      Math.cos(e.angle), Math.sin(e.angle), s.color, 9,
    );
  }

  /**
   * Debris thrown inside the cone's real opening angle. Reads `s.spread`, which
   * `vfxGeometry` set from the AbilityShape's `angle` — so a wide breath and a
   * narrow spray throw their particles across exactly the arc they damage.
   */
  private coneSpray(e: ChampVfxEvent, s: VfxSpec): void {
    const half = ((s.spread ?? 45) * Math.PI) / 360;
    const range = s.dist ?? 200;
    for (let i = 0; i < 14; i++) {
      const a = e.angle + (Math.random() * 2 - 1) * half;
      const sp = range * (1.1 + Math.random() * 0.8);
      this.particles.spark(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, s.color, 2 + Math.random() * 2.5);
    }
  }

  // ------------------------------------------------------------------ frame

  update(now: number): void {
    this.now = now;
    const g = this.g;
    g.clear();
    for (let i = 0; i < MAX_FX; i++) {
      const f = this.pool[i];
      if (!f.active) continue;
      const t = (now - f.born) / f.life;
      if (t >= 1) { f.active = false; continue; }
      switch (f.kind) {
        case 'meleeArc': this.drawMeleeArc(g, f, t); break;
        case 'projectile': this.drawProjectile(g, f, t); break;
        case 'lob': this.drawLob(g, f, t); break;
        case 'beam': this.drawBeam(g, f, t); break;
        case 'grab': this.drawGrab(g, f, t); break;
        case 'aoe': this.drawAoe(g, f, t); break;
        case 'cone': this.drawCone(g, f, t); break;
        default: this.drawFlash(g, f, t); break;
      }
    }
  }

  /**
   * Crescent slash. A filled ring-sector that sweeps through the facing rather
   * than a thin outlined arc — the old version drew a hairline that vanished
   * against the painted maps. The band is thick at the leading edge and tapers
   * behind it, which is what reads as a blade travelling.
   */
  private drawMeleeArc(g: Phaser.GameObjects.Graphics, f: Fx, t: number): void {
    const r = f.size * (1.4 + t * 1.1);
    const sweep = 2.1; // radians of arc the blade covers
    // The whole crescent rotates through the swing, leading edge first.
    const lead = f.angle - sweep * 0.5 + sweep * t;
    const N = 12;
    const fade = 1 - t * t;

    // Dark keyline hull first, so the slash reads on light maps too.
    for (const pass of [0, 1]) {
      const col = pass === 0 ? 0x000000 : f.color;
      const alpha = pass === 0 ? 0.4 * fade : 0.85 * fade;
      const pad = pass === 0 ? 2.5 : 0;
      g.fillStyle(col, alpha);
      g.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = lead - sweep * (i / N);
        // Outer edge thins toward the tail: a crescent, not a band.
        const rr = r + pad + f.size * 0.55 * (1 - i / N);
        const px = f.x + Math.cos(a) * rr;
        const py = f.y + Math.sin(a) * rr;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      for (let i = N; i >= 0; i--) {
        const a = lead - sweep * (i / N);
        const rr = r - pad - f.size * 0.15;
        g.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fillPath();
    }
    // Bright leading edge.
    g.lineStyle(2.5 * fade + 0.5, 0xffffff, 0.8 * fade);
    g.beginPath();
    g.moveTo(f.x + Math.cos(lead) * (r - f.size * 0.15), f.y + Math.sin(lead) * (r - f.size * 0.15));
    g.lineTo(f.x + Math.cos(lead) * (r + f.size * 0.55), f.y + Math.sin(lead) * (r + f.size * 0.55));
    g.strokePath();
  }

  /** Travelling dart that sheds a trail. Reach is `f.dist` — the spec's range. */
  private drawProjectile(g: Phaser.GameObjects.Graphics, f: Fx, t: number): void {
    const x = f.x + Math.cos(f.angle) * f.dist * t;
    const y = f.y + Math.sin(f.angle) * f.dist * t;
    const dx = Math.cos(f.angle);
    const dy = Math.sin(f.angle);
    const nx = -dy;
    const ny = dx;
    const w = f.size;

    g.fillStyle(0x000000, 0.4);
    g.fillCircle(x, y, w * 1.9);
    g.fillStyle(f.color, 0.95);
    g.beginPath();
    g.moveTo(x + dx * w * 3, y + dy * w * 3);
    g.lineTo(x + nx * w, y + ny * w);
    g.lineTo(x - dx * w * 2.4, y - dy * w * 2.4);
    g.lineTo(x - nx * w, y - ny * w);
    g.closePath();
    g.fillPath();
    g.lineStyle(Math.max(1, w * 0.5), 0xffffff, 0.8);
    g.beginPath();
    g.moveTo(x + dx * w * 1.6, y + dy * w * 1.6);
    g.lineTo(x - dx * w * 1.2, y - dy * w * 1.2);
    g.strokePath();

    this.particles.trail(f, x, y, dx, dy, f.color, w * 0.8);
    f.lx = x; f.ly = y;
    // Landing: one impact spray where the reach actually ends.
    if (t > 0.94 && f.seed >= 0) {
      f.seed = -1; // fire once
      this.particles.impact(x, y, dx, dy, 0.22, f.color);
    }
  }

  /** Thrown arc with a ground shadow, so the height reads in a top-down view. */
  private drawLob(g: Phaser.GameObjects.Graphics, f: Fx, t: number): void {
    const gx = f.x + Math.cos(f.angle) * f.dist * t;
    const gy = f.y + Math.sin(f.angle) * f.dist * t;
    const h = 60 * Math.sin(Math.PI * t);
    // Shadow stays on the floor and shrinks as the object rises — the cheapest
    // honest height cue there is in a top-down game.
    g.fillStyle(0x000000, 0.3 * (1 - h / 90));
    g.fillEllipse(gx, gy, f.size * 2.4, f.size * 1.2);
    g.fillStyle(0x000000, 0.45);
    g.fillCircle(gx, gy - h, f.size * 1.25);
    g.fillStyle(f.color, 1);
    g.fillCircle(gx, gy - h, f.size);
    g.fillStyle(lighten(f.color, 0.55), 0.9);
    g.fillCircle(gx - f.size * 0.3, gy - h - f.size * 0.3, f.size * 0.4);
    if (t > 0.95 && f.seed >= 0) {
      f.seed = -1;
      this.particles.shock(gx, gy, 0, -1, 0.3, f.color);
      this.particles.impact(gx, gy, 0, -1, 0.32, f.color);
    }
  }

  /** Tapered beam: wide at the muzzle, narrowing to the spec's reach. */
  private drawBeam(g: Phaser.GameObjects.Graphics, f: Fx, t: number): void {
    const fade = 1 - t;
    const dx = Math.cos(f.angle);
    const dy = Math.sin(f.angle);
    const nx = -dy;
    const ny = dx;
    const h = f.size * fade;
    const ex = f.x + dx * f.dist;
    const ey = f.y + dy * f.dist;
    g.fillStyle(f.color, 0.75 * fade);
    g.beginPath();
    g.moveTo(f.x + nx * h, f.y + ny * h);
    g.lineTo(ex + nx * h * 0.25, ey + ny * h * 0.25);
    g.lineTo(ex - nx * h * 0.25, ey - ny * h * 0.25);
    g.lineTo(f.x - nx * h, f.y - ny * h);
    g.closePath();
    g.fillPath();
    g.lineStyle(Math.max(1, h * 0.45), 0xffffff, 0.85 * fade);
    g.beginPath();
    g.moveTo(f.x, f.y);
    g.lineTo(ex, ey);
    g.strokePath();
  }

  /** Segmented chain that shoots out and snaps back — a hook, not a bar. */
  private drawGrab(g: Phaser.GameObjects.Graphics, f: Fx, t: number): void {
    // Out fast, hold, back slower: the rhythm is what makes it read as a grab.
    const ext = t < 0.35 ? t / 0.35 : t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    const len = f.dist * ext;
    const dx = Math.cos(f.angle);
    const dy = Math.sin(f.angle);
    const links = Math.max(2, Math.round(len / 26));
    g.lineStyle(f.size * 0.55, 0x000000, 0.5);
    g.beginPath();
    g.moveTo(f.x, f.y);
    g.lineTo(f.x + dx * len, f.y + dy * len);
    g.strokePath();
    for (let i = 0; i < links; i++) {
      const p = (i / links) * len;
      g.fillStyle(i % 2 === 0 ? f.color : lighten(f.color, 0.35), 0.95);
      g.fillCircle(f.x + dx * p, f.y + dy * p, f.size * 0.42);
    }
    // Claw head
    const hx = f.x + dx * len;
    const hy = f.y + dy * len;
    g.fillStyle(0x000000, 0.5);
    g.fillCircle(hx, hy, f.size * 1.15);
    g.fillStyle(lighten(f.color, 0.3), 1);
    g.fillCircle(hx, hy, f.size * 0.85);
  }

  /**
   * Ground blast at the ability's TRUE radius (`f.dist` comes from the shape's
   * `radius`). Flattened to ~0.6 vertical so it lies in the map's tilt instead
   * of standing up as a perfect circle.
   */
  private drawAoe(g: Phaser.GameObjects.Graphics, f: Fx, t: number): void {
    const e = 1 - (1 - t) * (1 - t); // ease-out
    const r = f.dist * (0.25 + e * 0.85);
    const fade = 1 - t;
    g.fillStyle(f.color, 0.16 * fade);
    g.fillEllipse(f.x, f.y, r * 2, r * 1.2);
    g.lineStyle(2.5, 0x000000, 0.45 * fade);
    g.strokeEllipse(f.x, f.y, r * 2, r * 1.2);
    g.lineStyle(5 * fade + 1.5, f.color, 0.95 * fade);
    g.strokeEllipse(f.x, f.y, r * 2, r * 1.2);
    g.lineStyle(2 * fade + 0.5, 0xffffff, 0.75 * fade);
    g.strokeEllipse(f.x, f.y, r * 1.86, r * 1.12);
  }

  /**
   * Filled sector at the shape's real range and opening angle, with a sweep
   * highlight running across it. Reads `f.dist` (range) and `f.spread` (angle) —
   * never a constant.
   */
  private drawCone(g: Phaser.GameObjects.Graphics, f: Fx, t: number): void {
    const half = (f.spread * Math.PI) / 360;
    const fade = 1 - t;
    const r = f.dist * (0.55 + t * 0.5);
    const N = 16;

    g.fillStyle(f.color, 0.22 * fade);
    g.beginPath();
    g.moveTo(f.x, f.y);
    for (let i = 0; i <= N; i++) {
      const a = f.angle - half + (i / N) * half * 2;
      g.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r);
    }
    g.closePath();
    g.fillPath();

    // Dark edge then bright edge: the pairing is what keeps a translucent shape
    // legible over sand, snow and blood alike.
    for (const [w, col, al] of [[4, 0x000000, 0.4], [2.5, f.color, 0.95]] as const) {
      g.lineStyle(w, col, al * fade);
      g.beginPath();
      g.moveTo(f.x, f.y);
      for (let i = 0; i <= N; i++) {
        const a = f.angle - half + (i / N) * half * 2;
        g.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r);
      }
      g.closePath();
      g.strokePath();
    }
  }

  /** Self-buff pop: a rising ring plus embers, centred on the champion. */
  private drawFlash(g: Phaser.GameObjects.Graphics, f: Fx, t: number): void {
    const fade = 1 - t;
    const r = f.size * (1 + t * 3.2);
    g.lineStyle(3 * fade + 1, f.color, 0.9 * fade);
    g.strokeEllipse(f.x, f.y, r * 2, r * 1.3);
    g.fillStyle(lighten(f.color, 0.4), 0.35 * fade * fade);
    g.fillEllipse(f.x, f.y, r * 1.6, r * 1.0);
  }

  clear(): void {
    for (let i = 0; i < MAX_FX; i++) this.pool[i].active = false;
    this.g.clear();
  }

  destroy(): void {
    this.g.destroy();
  }
}
