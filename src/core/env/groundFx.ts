import type Phaser from 'phaser';
import { CELL } from '../paintgrid';
import type { MapDef } from '../maps';
import type { Unit } from '../../entities/Unit';
import { CellFields, Solid, bitAt, cellCX, cellCY, colOf, rowOf } from './grid';
import { envPalette } from './palette';

/**
 * The floor acknowledges that something is happening on it: dust under running
 * feet, rings where a unit crosses water, prints left in snow, and liquids that
 * actually move.
 *
 * Everything is pooled into fixed-size arrays allocated once. Nothing here
 * creates a Phaser display object at runtime — the whole layer is two Graphics
 * objects that clear and redraw — because `npm run verify` fails the build if
 * the arena's display list grows across a round, and because allocating a
 * particle per footfall is the classic way to make a phone drop frames in the
 * fight that matters.
 */

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  r0: number;
  r1: number;
  color: number;
  alpha: number;
  /** Squashed to the ground plane (dust) or round (embers)? */
  flat: boolean;
}

interface Ring {
  x: number;
  y: number;
  born: number;
  life: number;
  r1: number;
  color: number;
}

interface Print {
  x: number;
  y: number;
  born: number;
  life: number;
  rot: number;
  size: number;
}

const MAX_PUFFS = 56;
const MAX_RINGS = 20;
const MAX_PRINTS = 44;
/** Distance a unit must cover before the ground reacts again. */
const STRIDE = 34;
/** Per-frame movement above this is a dash/knockback, not a walk. */
const DASH_STEP = 22;

/** Maps whose ground takes a footprint. */
const SNOWY = new Set(['freljord_snow', 'freljord_dark']);

export class GroundFx {
  private puffs: Puff[] = [];
  private rings: Ring[] = [];
  private prints: Print[] = [];
  private pi = 0;
  private ri = 0;
  private ti = 0;

  /** Last seen position + distance credit, per unit. */
  private tracks = new Map<Unit, { x: number; y: number; acc: number }>();

  /** Pre-sampled liquid cells: animating every cell is pointless at 24px. */
  private waterPts: { x: number; y: number; ph: number }[] = [];
  private lavaPts: { x: number; y: number; ph: number; r: number }[] = [];

  private dust: number;
  private shadow: number;
  private footprints: boolean;

  constructor(
    private gfx: Phaser.GameObjects.Graphics,
    private fields: CellFields,
    map: MapDef,
  ) {
    const pal = envPalette(map);
    this.dust = pal.dust;
    this.shadow = pal.shadow;
    this.footprints = SNOWY.has(map.id);

    for (let i = 0; i < MAX_PUFFS; i++) {
      this.puffs.push({ x: 0, y: 0, vx: 0, vy: 0, born: -1e9, life: 1, r0: 0, r1: 0, color: 0, alpha: 0, flat: true });
    }
    for (let i = 0; i < MAX_RINGS; i++) this.rings.push({ x: 0, y: 0, born: -1e9, life: 1, r1: 0, color: 0 });
    for (let i = 0; i < MAX_PRINTS; i++) this.prints.push({ x: 0, y: 0, born: -1e9, life: 1, rot: 0, size: 0 });

    // Deterministic sampling so a map looks the same every time it is rolled.
    let seed = map.seed || 1;
    const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const mask = fields.mask;
    for (let i = 0; i < mask.length; i++) {
      const b = mask[i];
      if (b & Solid.Water) {
        if (rnd() < 0.11) this.waterPts.push({ x: cellCX(colOf(i)), y: cellCY(rowOf(i)), ph: rnd() * Math.PI * 2 });
      } else if (b & Solid.Lava) {
        if (rnd() < 0.13) {
          this.lavaPts.push({ x: cellCX(colOf(i)), y: cellCY(rowOf(i)), ph: rnd() * Math.PI * 2, r: CELL * (0.7 + rnd() * 0.9) });
        }
      }
    }
  }

  // ---- emitters ------------------------------------------------------------

  private puff(x: number, y: number, color: number, scale: number, flat: boolean, alpha: number): void {
    const p = this.puffs[this.pi];
    this.pi = (this.pi + 1) % MAX_PUFFS;
    p.x = x + (Math.random() - 0.5) * 10;
    p.y = y + (Math.random() - 0.5) * 5;
    p.vx = (Math.random() - 0.5) * 26 * scale;
    p.vy = (flat ? (Math.random() - 0.5) * 12 : -30 - Math.random() * 26) * scale;
    p.born = this.now;
    p.life = (flat ? 520 : 900) + Math.random() * 340;
    p.r0 = 3 * scale;
    p.r1 = (13 + Math.random() * 8) * scale;
    p.color = color;
    p.alpha = alpha;
    p.flat = flat;
  }

  private ring(x: number, y: number, color: number, r1: number): void {
    const r = this.rings[this.ri];
    this.ri = (this.ri + 1) % MAX_RINGS;
    r.x = x;
    r.y = y;
    r.born = this.now;
    r.life = 900;
    r.r1 = r1;
    r.color = color;
  }

  private print(x: number, y: number, rot: number): void {
    const p = this.prints[this.ti];
    this.ti = (this.ti + 1) % MAX_PRINTS;
    p.x = x;
    p.y = y;
    p.born = this.now;
    p.life = 5200;
    p.rot = rot;
    p.size = 7 + Math.random() * 2;
  }

  private now = 0;

  // ---- per-frame -----------------------------------------------------------

  update(dt: number, now: number, units: Unit[]): void {
    this.now = now;
    this.emitForUnits(units);
    this.gfx.clear();
    this.drawLiquids(now);
    this.drawPrints(now);
    this.drawPuffs(dt, now);
    this.drawRings(now);
  }

  /**
   * Turn unit movement into ground reactions. Distance is accumulated rather
   * than sampled per frame so the effect is tied to how far something actually
   * travelled, not to the frame rate — a phone at 30fps kicks up the same dust
   * per metre as a desktop at 144.
   */
  private emitForUnits(units: Unit[]): void {
    const mask = this.fields.mask;
    for (const u of units) {
      if (!u.alive) {
        this.tracks.delete(u);
        continue;
      }
      const t = this.tracks.get(u);
      if (!t) {
        this.tracks.set(u, { x: u.x, y: u.y, acc: 0 });
        continue;
      }
      const dx = u.x - t.x;
      const dy = u.y - t.y;
      const step = Math.hypot(dx, dy);
      t.x = u.x;
      t.y = u.y;
      if (step < 0.05) continue;

      // Feet, not centre: the ground reacts where the unit touches it.
      const fx = u.x;
      const fy = u.y + u.radius * 0.7;
      const bits = bitAt(mask, fx, fy);

      // A dash or a knockback covers a lot of ground in one frame and deserves
      // a burst, not the same trickle a walk gets.
      if (step > DASH_STEP) {
        const n = bits & Solid.Water ? 1 : 3;
        for (let i = 0; i < n; i++) this.surfaceHit(fx, fy, bits, 1.5, Math.atan2(dy, dx));
        t.acc = 0;
        continue;
      }

      t.acc += step;
      if (t.acc < STRIDE) continue;
      t.acc = 0;
      this.surfaceHit(fx, fy, bits, 1, Math.atan2(dy, dx));
    }
  }

  /** What this particular ground does when something moves across it. */
  private surfaceHit(x: number, y: number, bits: number, scale: number, dir: number): void {
    if (bits & Solid.Water) {
      this.ring(x, y, 0xcfeaff, 26 * scale);
      return;
    }
    if (bits & Solid.Lava) {
      this.puff(x, y, 0xff8a3a, scale, false, 0.5);
      return;
    }
    this.puff(x, y, this.dust, scale, true, 0.26 * scale);
    if (this.footprints && scale < 1.2) this.print(x, y, dir);
  }

  // ---- drawing -------------------------------------------------------------

  private drawPuffs(dt: number, now: number): void {
    const g = this.gfx;
    for (const p of this.puffs) {
      const t = (now - p.born) / p.life;
      if (t < 0 || t >= 1) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= p.flat ? 0.94 : 0.98;
      const r = p.r0 + (p.r1 - p.r0) * (1 - (1 - t) * (1 - t)); // ease-out
      const a = p.alpha * (1 - t) * (1 - t);
      if (a <= 0.01) continue;
      g.fillStyle(p.color, a);
      // Dust hugs the ground plane; embers keep their volume as they rise.
      if (p.flat) g.fillEllipse(p.x, p.y, r * 2.4, r * 1.05);
      else g.fillCircle(p.x, p.y, r * 0.55);
    }
  }

  private drawRings(now: number): void {
    const g = this.gfx;
    for (const r of this.rings) {
      const t = (now - r.born) / r.life;
      if (t < 0 || t >= 1) continue;
      const rad = r.r1 * (0.25 + 0.75 * t);
      g.lineStyle(2, r.color, 0.45 * (1 - t));
      // Flattened: seen from ~30° above, a ripple is an ellipse.
      g.strokeEllipse(r.x, r.y, rad * 2.2, rad * 0.95);
    }
  }

  private drawPrints(now: number): void {
    const g = this.gfx;
    for (const p of this.prints) {
      const t = (now - p.born) / p.life;
      if (t < 0 || t >= 1) continue;
      // Hold, then fade — a print that starts vanishing immediately reads as a
      // rendering glitch rather than as a trace left behind.
      const a = 0.3 * Math.min(1, (1 - t) * 3);
      g.fillStyle(this.shadow, a);
      g.fillEllipse(p.x, p.y, p.size * 2, p.size * 0.9);
    }
  }

  /**
   * Water caustics and lava breathing. Sampled cells rather than every cell:
   * at 24px the eye reads the pattern, not the coverage, and full coverage
   * would be roughly 400 fills a frame for no visible gain.
   */
  private drawLiquids(now: number): void {
    const g = this.gfx;
    for (const w of this.waterPts) {
      const a = 0.10 + 0.16 * Math.sin(now / 620 + w.ph);
      if (a <= 0.02) continue;
      const wob = Math.sin(now / 900 + w.ph * 2) * 5;
      g.fillStyle(0xdff2ff, a);
      g.fillEllipse(w.x + wob, w.y, 15, 3.5);
    }
    for (const l of this.lavaPts) {
      const a = 0.16 + 0.16 * Math.sin(now / 780 + l.ph);
      g.fillStyle(0xff7a26, a);
      g.fillCircle(l.x, l.y, l.r * (0.8 + 0.2 * Math.sin(now / 1100 + l.ph)));
      g.fillStyle(0xffc266, a * 0.55);
      g.fillCircle(l.x, l.y, l.r * 0.45);
    }
  }
}
