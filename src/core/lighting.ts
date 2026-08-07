/**
 * lighting.ts — arena lighting, grade and glow.
 *
 * The maps are hand-painted at a fixed isometric tilt and were previously drawn
 * flat: every pixel of a 1920×1080 painting at full brightness, with ~28px
 * champions pasted on top. That is the single biggest reason the game reads as a
 * prototype — there is no light in it, so there is no depth, no focus and no
 * separation between the cast and the scenery.
 *
 * This module adds a light model on top of the painting without touching a
 * single gameplay value.
 *
 * ── The readability contract (read this before changing any depth) ──────────
 *
 * The darkening layer sits at depth 2.4. EVERY object that carries gameplay
 * information lives above it:
 *
 *     0    painted map           ← darkened
 *     1    collision overlay     ← darkened
 *     2    ambient motes         ← darkened
 *   > 2.4  SHADOW (this file)
 *   > 2.6  GROUND LIGHT (this file, additive — brightens the map only)
 *     3    hazards               ← untouched
 *     4    walls                 ← untouched
 *     5    enemy telegraphs      ← untouched
 *     8/9  aim + projectiles     ← untouched
 *   > 9.6  RIM/BLOOM (this file, additive halos hugging units + projectiles)
 *     10   unit ground rings     ← untouched
 *     11   champion sprites      ← untouched
 *     99+  HUD                   ← untouched
 *
 * So the background loses brightness and the cast does not. Contrast between
 * them can only go up. This game already shipped a bug where the player was
 * hard to locate (BENCHMARK B3); the layering above is what makes it
 * structurally impossible for this feature to bring it back — plus the player
 * carries the brightest light on the field, which is a positive locator rather
 * than merely a non-regression.
 *
 * ── Why a hand-composited canvas instead of a shader or a RenderTexture ─────
 *
 * `npm run verify` boots the game in WebGL *and* Canvas and fails on any console
 * error. Canvas has no shader pipelines, `setTint` is WebGL-only, and Phaser's
 * RenderTexture erase path takes different code branches per renderer. So the
 * shadow mask is composited by hand into a plain 2D canvas (`destination-out`
 * punches the light holes), uploaded once per frame as a CanvasTexture and drawn
 * as one MULTIPLY image. Every operation used here exists in both renderers.
 * The one blend mode that can be missing — MULTIPLY on very old Canvas
 * implementations — degrades to source-over, which for a dark, semi-transparent
 * overlay looks nearly identical. There is no branch that can crash.
 *
 * The mask runs at 1/4 resolution (480×270). Light falloff and vignettes are
 * smooth by nature, so the upscale is invisible, and it cuts the per-frame fill
 * cost by 16×.
 */

import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import type { MapDef } from './maps';
import type { EventBus } from './events';
import type { Unit } from '../entities/Unit';
import type { Projectile } from '../entities/Projectile';
import type { Hazard } from './combat';

/** The slice of ArenaScene this module reads. Structural, to avoid a cycle. */
export interface LitScene extends Phaser.Scene {
  readonly bus: EventBus;
  readonly units: Unit[];
  readonly projectiles: Projectile[];
  readonly hazards: Hazard[];
  readonly player: Unit;
}

const MASK_W = 480;
const MASK_H = 270;
const MASK_SCALE = GAME_W / MASK_W;

const DEPTH_SHADOW = 2.4;
const DEPTH_GROUND = 2.6;
const DEPTH_RIM = 9.6;

const GROUND_POOL = 24;
const RIM_POOL = 22;
const MAX_FLASHES = 20;

/** Texture key of the soft radial blob every additive glow is drawn from. */
const GLOW_PREFIX = 'cc-glow-';
const SHADOW_KEY = 'cc-shadow-mask';

/**
 * One region's light. `shade` is the colour the *unlit* map is multiplied by,
 * so it is the colour of this arena's darkness, not of its light — Freljord
 * shadows are blue, Shurima shadows are warm brown. `key` is the colour of the
 * light the player carries, chosen to sit opposite the shade so the pool around
 * the player separates from the arena instead of blending into it.
 */
interface Grade {
  shade: number;
  /** Shadow strength in the middle of the arena (0 = untouched, 1 = shade). */
  centre: number;
  /** Shadow strength at the screen corners. */
  edge: number;
  /** Colour of the player's carried light. */
  key: number;
  /** Colour of the weak fill light other units and hazards emit. */
  fill: number;
}

/**
 * Per-map grade. Deliberately not uniform: Shurima and the snow maps are painted
 * at blinding midday and can take a lot of shade before they read dark, while
 * the Void and Zaun paintings already carry their own lighting and only need a
 * nudge — over-grading them would flatten art that is already doing the job.
 */
const GRADES: Record<string, Grade> = {
  // Ionia: bright green-blue daylight → cool late-afternoon shade. Painted at
  // full midday, so it takes a lot of grade before it stops reading as flat.
  highland: { shade: 0x0c1832, centre: 0.4, edge: 0.76, key: 0xffc25a, fill: 0x8fd0ff },
  // Demacia: white marble and gold → cool blue shade, warm key (torchlit hall).
  demacia: { shade: 0x0e1a3c, centre: 0.38, edge: 0.74, key: 0xffcc70, fill: 0x9fc8ff },
  // Frozen Lake is already a night painting: little extra shade, moonlit blue.
  freljord_dark: { shade: 0x07142c, centre: 0.22, edge: 0.58, key: 0xffbc5a, fill: 0x9fd8ff },
  // Frostguard Keep is bright overcast snow — the map that hid the player worst
  // in the first playtest, and therefore the one that needs the most shade.
  freljord_snow: { shade: 0x091634, centre: 0.42, edge: 0.78, key: 0xffbc5a, fill: 0xbfe4ff },
  // Noxus: a pit lit by braziers. Shade toward dried blood, key toward fire.
  noxus: { shade: 0x18040a, centre: 0.34, edge: 0.7, key: 0xff9a3c, fill: 0xff6a4a },
  // Shurima: hardest case. Uniform blinding sand, no contrast anywhere, and the
  // map on which a plain gold marker was once literally invisible.
  shurima: { shade: 0x1a0e04, centre: 0.44, edge: 0.8, key: 0xfff0b8, fill: 0xffd88a },
  // Zaun: already smoggy and green-lit; shade to soot, key to a warm lamp so the
  // player does not vanish into the toxic green the map is full of.
  zaun: { shade: 0x050f0a, centre: 0.26, edge: 0.62, key: 0xffb45a, fill: 0xa8f04a },
  // Shadow Isles: haunted teal mist, already dark.
  shadow: { shade: 0x03110f, centre: 0.26, edge: 0.64, key: 0xffc98a, fill: 0x6ff0d8 },
  // The Void: violet and self-lit. Shade almost black, key deliberately warm —
  // a purple light on a purple map is not a light, it is a smudge.
  void: { shade: 0x0c0320, centre: 0.24, edge: 0.6, key: 0xffb055, fill: 0xc07aff },
};

const DEFAULT_GRADE: Grade = { shade: 0x0a0a18, centre: 0.32, edge: 0.68, key: 0xffc832, fill: 0xa8d8ff };

/** A light for this frame: reveals the map underneath and adds coloured glow. */
interface Light {
  x: number;
  y: number;
  r: number;
  /** How much of the shadow this light removes at its centre (0..1). */
  reveal: number;
  /** Additive strength of the coloured pool (0..1). */
  glow: number;
  color: number;
}

/** A short-lived burst — muzzle flash, impact, death. */
interface Flash {
  x: number;
  y: number;
  r: number;
  color: number;
  born: number;
  life: number;
  power: number;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Quantised so the glow-texture cache stays small no matter what VFX ask for. */
function quantise(color: number): number {
  const q = (v: number) => Math.min(255, Math.round(v / 24) * 24);
  return (q((color >> 16) & 0xff) << 16) | (q((color >> 8) & 0xff) << 8) | q(color & 0xff);
}

/**
 * A soft radial blob in the given colour. Baked once per colour and reused.
 * Textures are global and survive scene restarts, hence the `exists` guard —
 * re-creating a key makes Phaser log a console error, which fails `verify`.
 */
function glowTexture(scene: Phaser.Scene, color: number): string {
  const c = quantise(color);
  const key = GLOW_PREFIX + c.toString(16).padStart(6, '0');
  if (scene.textures.exists(key)) return key;
  const size = 128;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return key;
  const ctx = tex.getContext();
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // A single linear ramp reads as a hard-edged disc; this profile keeps a hot
  // core and a long tail, which is what a real falloff looks like.
  grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grd.addColorStop(0.22, `rgba(${r},${g},${b},0.72)`);
  grd.addColorStop(0.5, `rgba(${r},${g},${b},0.3)`);
  grd.addColorStop(0.78, `rgba(${r},${g},${b},0.08)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
  return key;
}

export class Lighting {
  private grade: Grade;
  private tex: Phaser.Textures.CanvasTexture | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  /** Baked grade + vignette; redrawn into the mask every frame before the holes. */
  private base: HTMLCanvasElement | null = null;
  /** White falloff used with `destination-out` to punch the light holes. */
  private brush: HTMLCanvasElement | null = null;
  private ground: Phaser.GameObjects.Image[] = [];
  private rim: Phaser.GameObjects.Image[] = [];
  private flashes: Flash[] = [];
  private lights: Light[] = [];
  private seenProjectiles = new WeakSet<Projectile>();
  private keyGlow = '';
  /** Set once anything in the mask path misbehaves: the grade stays, holes stop. */
  private maskBroken = false;
  private dead = false;

  constructor(
    private scene: LitScene,
    map: MapDef,
  ) {
    this.grade = GRADES[map.id] ?? DEFAULT_GRADE;
    this.keyGlow = glowTexture(scene, this.grade.key);
    glowTexture(scene, this.grade.fill); // pre-bake so frame 1 never stalls on it

    this.buildMask();
    this.buildPools();
    this.subscribe();

    scene.events.once('shutdown', () => this.destroy());
    scene.events.once('destroy', () => this.destroy());
  }

  // ---- Construction ----

  private buildMask(): void {
    this.brush = document.createElement('canvas');
    this.brush.width = 128;
    this.brush.height = 128;
    const bx = this.brush.getContext('2d');
    if (bx) {
      const grd = bx.createRadialGradient(64, 64, 0, 64, 64, 64);
      // Flatter core than the coloured glow: a light should *reveal* a readable
      // patch of map, not a pinhole.
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.35, 'rgba(255,255,255,0.86)');
      grd.addColorStop(0.62, 'rgba(255,255,255,0.42)');
      grd.addColorStop(0.85, 'rgba(255,255,255,0.1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      bx.fillStyle = grd;
      bx.fillRect(0, 0, 128, 128);
    }

    this.base = this.bakeBase();

    const t = this.scene.textures;
    const existing = t.exists(SHADOW_KEY) ? (t.get(SHADOW_KEY) as Phaser.Textures.CanvasTexture) : null;
    this.tex = existing ?? t.createCanvas(SHADOW_KEY, MASK_W, MASK_H);
    if (!this.tex) {
      this.maskBroken = true;
      return;
    }
    this.ctx = this.tex.getContext();

    this.scene.add
      .image(0, 0, SHADOW_KEY)
      .setOrigin(0, 0)
      .setDisplaySize(GAME_W, GAME_H)
      .setDepth(DEPTH_SHADOW)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  /**
   * Grade + vignette, baked once. The vignette is elliptical (drawn in a square
   * space and squashed) so a 16:9 screen darkens evenly toward all four corners
   * rather than only left and right, and its centre sits slightly up-and-left
   * because that is where the maps are painted as being lit from.
   */
  private bakeBase(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = MASK_W;
    c.height = MASK_H;
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    const s = this.grade.shade;
    const r = (s >> 16) & 0xff;
    const g = (s >> 8) & 0xff;
    const b = s & 0xff;
    const at = (a: number) => `rgba(${r},${g},${b},${a.toFixed(3)})`;
    const { centre, edge } = this.grade;

    ctx.save();
    ctx.scale(1, MASK_H / MASK_W);
    const cx = MASK_W * 0.485;
    const cy = MASK_W * 0.475;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, MASK_W * 0.58);
    grd.addColorStop(0, at(centre));
    grd.addColorStop(0.45, at(centre + (edge - centre) * 0.14));
    grd.addColorStop(0.75, at(centre + (edge - centre) * 0.48));
    grd.addColorStop(1, at(edge));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, MASK_W, MASK_W);
    ctx.restore();

    // Key-light relief from the upper left, per the art brief's fixed light
    // direction. Subtle on purpose — it is a tilt, not a second sun.
    ctx.globalCompositeOperation = 'destination-out';
    const sun = ctx.createRadialGradient(MASK_W * 0.3, MASK_H * 0.12, 0, MASK_W * 0.3, MASK_H * 0.12, MASK_W * 0.62);
    sun.addColorStop(0, 'rgba(255,255,255,0.22)');
    sun.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, MASK_W, MASK_H);
    ctx.globalCompositeOperation = 'source-over';
    return c;
  }

  /**
   * Fixed-size pools. Nothing here may be created per frame: `verify` fails the
   * build if the arena's display list grows by more than 40 objects over a
   * round, and a per-frame `add.image` would blow straight through that.
   */
  private buildPools(): void {
    const make = (depth: number, key: string): Phaser.GameObjects.Image =>
      this.scene.add
        .image(0, 0, key)
        .setDepth(depth)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false);
    for (let i = 0; i < GROUND_POOL; i++) this.ground.push(make(DEPTH_GROUND, this.keyGlow));
    for (let i = 0; i < RIM_POOL; i++) this.rim.push(make(DEPTH_RIM, this.keyGlow));
  }

  private subscribe(): void {
    const bus = this.scene.bus;
    const at = (u: Unit) => ({ x: u.x, y: u.y });
    // Muzzle flash on cast: the moment a spell leaves the champion the arena
    // around them lights up. This is the effect that makes an ability feel like
    // it has energy rather than like a decal that faded in.
    bus.on('abilityCast', () => {
      const p = at(this.scene.player);
      this.flash(p.x, p.y, 300, this.grade.key, 0.95, 260);
    });
    bus.on('dashStart', () => {
      const p = at(this.scene.player);
      this.flash(p.x, p.y, 210, this.grade.key, 0.6, 240);
    });
    bus.on('abilityHit', ({ target, ability }) => {
      const col = ability === 'E' ? 0xffe680 : ability === 'Q' ? 0xffd24a : 0xa8d8ff;
      this.flash(target.x, target.y, 230, col, 0.9, 220);
    });
    bus.on('autoHit', ({ target }) => this.flash(target.x, target.y, 130, 0xfff0c0, 0.55, 150));
    bus.on('damageTaken', () => {
      const p = at(this.scene.player);
      this.flash(p.x, p.y, 200, 0xff5a4a, 0.7, 200);
    });
    // A kill is the loudest moment in the game; it gets the loudest light.
    bus.on('enemyDeath', ({ enemy }) => this.flash(enemy.x, enemy.y, 340, 0xffb060, 1, 380));
  }

  // ---- Public API ----

  /** A burst of light that briefly reveals and warms the surroundings. */
  flash(x: number, y: number, r: number, color: number, power: number, life: number): void {
    if (this.dead) return;
    if (this.flashes.length >= MAX_FLASHES) this.flashes.shift();
    this.flashes.push({ x, y, r, color, born: this.scene.time.now, life, power });
  }

  /** Called once per frame from ArenaScene, after the scene has drawn itself. */
  update(): void {
    if (this.dead) return;
    const now = this.scene.time.now;
    this.collect(now);
    this.paintMask();
    this.paintGlow(now);
  }

  destroy(): void {
    this.dead = true;
    this.flashes.length = 0;
    this.lights.length = 0;
    this.ground.length = 0;
    this.rim.length = 0;
    this.ctx = null;
    this.tex = null;
  }

  // ---- Per frame ----

  /** Rebuild this frame's light list from the live world state. */
  private collect(now: number): void {
    const lights = this.lights;
    lights.length = 0;
    const s = this.scene;

    // The player carries the brightest light on the field. This is the direct
    // answer to "where am I": even in a crowd, the largest warm pool is you.
    const p = s.player;
    if (p && p.alive) {
      // Two out-of-phase sines: a torch that breathes but never pulses on a beat.
      const flicker = 1 + 0.035 * Math.sin(now / 233) + 0.022 * Math.sin(now / 97);
      lights.push({ x: p.x, y: p.y, r: 330 * flicker, reveal: 0.88, glow: 0.2, color: this.grade.key });
    }

    for (const u of s.units) {
      if (!u.alive || u === p) continue;
      // Enemies get a small cold-side light of their own so they do not sit in
      // pure shadow — an enemy you cannot see is not a difficulty, it is a bug.
      lights.push({ x: u.x, y: u.y, r: 150, reveal: 0.45, glow: 0.1, color: this.grade.fill });
    }

    for (const h of s.hazards) {
      lights.push({ x: h.x, y: h.y, r: h.r * 1.5, reveal: 0.4, glow: 0.16, color: h.color });
    }

    for (const pr of s.projectiles) {
      if (!pr.alive) continue;
      // First sighting of a projectile is the frame it was fired: that is a
      // muzzle flash, and it costs nothing to detect here rather than wiring an
      // event through every champion kit.
      if (!this.seenProjectiles.has(pr)) {
        this.seenProjectiles.add(pr);
        this.flash(pr.x, pr.y, 170, pr.color, 0.7, 170);
      }
      lights.push({ x: pr.x, y: pr.y, r: 26 + pr.radius * 4.5, reveal: 0.55, glow: 0.3, color: pr.color });
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      const t = (now - f.born) / f.life;
      if (t >= 1 || t < 0) {
        this.flashes.splice(i, 1);
        continue;
      }
      // Fast attack, long tail — a flash that fades linearly reads as a fade,
      // not as a flash.
      const k = (1 - t) * (1 - t);
      lights.push({ x: f.x, y: f.y, r: f.r * (0.55 + 0.45 * t), reveal: f.power * k, glow: f.power * k * 0.5, color: f.color });
    }
  }

  /** Composite the shadow mask: baked grade, then a hole per light. */
  private paintMask(): void {
    if (this.maskBroken || !this.ctx || !this.base || !this.brush || !this.tex) return;
    const ctx = this.ctx;
    try {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, MASK_W, MASK_H);
      ctx.drawImage(this.base, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      for (const l of this.lights) {
        const a = l.reveal;
        if (a <= 0.01) continue;
        const r = l.r / MASK_SCALE;
        ctx.globalAlpha = a > 1 ? 1 : a;
        ctx.drawImage(this.brush, l.x / MASK_SCALE - r, l.y / MASK_SCALE - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      this.tex.refresh();
    } catch {
      // Whatever went wrong, the arena keeps a clean grade and stops carving
      // holes. A missing light is a look; a thrown exception is a failed boot.
      // The base is repainted so the last half-finished mask is not left frozen
      // on screen with a bright hole where the player happened to be standing.
      this.maskBroken = true;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, MASK_W, MASK_H);
      ctx.drawImage(this.base, 0, 0);
      this.tex.refresh();
    }
  }

  /**
   * Additive passes: the coloured pool each light throws on the ground, and the
   * tight halo that separates a unit or a projectile from the scenery behind it.
   */
  private paintGlow(now: number): void {
    let gi = 0;
    for (const l of this.lights) {
      if (gi >= this.ground.length) break;
      if (l.glow <= 0.01) continue;
      const img = this.ground[gi++];
      const key = glowTexture(this.scene, l.color);
      if (img.texture.key !== key) img.setTexture(key);
      img.setVisible(true).setPosition(l.x, l.y);
      img.setDisplaySize(l.r * 2, l.r * 2);
      img.setAlpha(Math.min(0.85, l.glow));
    }
    for (; gi < this.ground.length; gi++) this.ground[gi].setVisible(false);

    // Rim pass. Hades' core readability trick is that every character is
    // backlit; we cannot rim-light the sprite itself without owning the entity
    // layer, so we put a tight, bright halo *behind* it. Against a graded
    // background that reads as separation at any sprite size.
    let ri = 0;
    const s = this.scene;
    const push = (x: number, y: number, r: number, color: number, alpha: number): void => {
      if (ri >= this.rim.length) return;
      const img = this.rim[ri++];
      const key = glowTexture(this.scene, color);
      if (img.texture.key !== key) img.setTexture(key);
      img.setVisible(true).setPosition(x, y);
      img.setDisplaySize(r * 2, r * 2);
      img.setAlpha(alpha);
    };
    for (const u of s.units) {
      if (!u.alive) continue;
      const isPlayer = u === s.player;
      // The player's halo breathes with the same clock as their torch so the
      // two read as one light source rather than two effects.
      const pulse = isPlayer ? 1 + 0.05 * Math.sin(now / 233) : 1;
      push(
        u.x,
        u.y - u.radius * 0.15,
        u.radius * (isPlayer ? 2.9 : 2.3) * pulse,
        isPlayer ? this.grade.key : 0xff4a38,
        isPlayer ? 0.5 : 0.32,
      );
    }
    for (const pr of s.projectiles) {
      if (!pr.alive) continue;
      // Cheap bloom: the same blob over the projectile itself, which is what a
      // one-pass bloom would produce anyway for a small bright object.
      push(pr.x, pr.y, pr.radius * 3.4 + 10, pr.color, 0.55);
    }
    for (const f of this.flashes) {
      const t = (now - f.born) / f.life;
      if (t < 0 || t >= 1) continue;
      const k = (1 - t) * (1 - t);
      push(f.x, f.y, f.r * (0.28 + 0.3 * t), f.color, Math.min(0.75, f.power * k));
    }
    for (; ri < this.rim.length; ri++) this.rim[ri].setVisible(false);
  }
}

/**
 * Build the arena's lighting. Never throws: if anything about this browser's
 * canvas support surprises us the arena simply renders as it did before.
 */
export function createLighting(scene: LitScene, map: MapDef): Lighting | null {
  try {
    return new Lighting(scene, map);
  } catch (err) {
    // Deliberately a warning, not an error: `verify` treats console errors as a
    // failed boot, and losing the lighting is a downgrade, not a break.
    console.warn('[lighting] disabled:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Exposed for tests: the grade a map resolves to. */
export function gradeFor(mapId: string): Grade {
  return GRADES[mapId] ?? DEFAULT_GRADE;
}

/** Exposed for tests/debug: the grade table as CSS colours. */
export function gradeSummary(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, g] of Object.entries(GRADES)) out[id] = hex(g.shade);
  return out;
}
