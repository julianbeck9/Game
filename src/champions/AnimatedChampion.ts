/**
 * AnimatedChampion — prozedurale Sprite-Animation für Crown & Clash (Phaser 3 + TS).
 *
 * Kein Sprite-Sheet: ein statisches 64x64-Sprite pro Champion, animiert via Transform
 * zur Laufzeit (Idle/Walk/Attack/Cast/Hurt). Ein Code-Pfad über alle 26, kein Art-Drift.
 * Nur Scale/Position/Rotation/Tint → identisch in WebGL + Canvas (Headless-safe).
 * Tuning/VFX kommen aus championConfig.ts.
 *
 * --- INTEGRATION (Ersatz für scene.add.image) ---
 *   // vorher:  const c = scene.add.image(x, y, `champ:${id}`);
 *   const c = new AnimatedChampion(scene, x, y, `champ:${id}`, id);
 *   scene.add.existing(c);
 *   // optional VFX:  vfx.bind(c)   (siehe ChampionVfx.ts)
 *
 *   c.face('right'); c.setBase('walk'); c.setHome(x, y);
 *   c.attack(); c.cast(); c.hurt();
 *
 * Loader bleibt:  this.load.image(`champ:${id}`, `assets/champions/${id}.png`);
 */

import Phaser from 'phaser';
import { cfgFor, ChampCfg, VfxSpec } from './championConfig';

type BaseState = 'idle' | 'walk';
type ShotName = 'attack' | 'cast' | 'hurt';
interface Shot { name: ShotName; t: number; dur: number; }

/** Events, auf die ChampionVfx (oder dein eigener VFX-Layer) hört. */
export const ChampEvents = {
  AttackHit: 'champ-attackhit',
  CastRelease: 'champ-castrelease',
  Hurt: 'champ-hurt',
} as const;

/** Payload aller Champ-Events. spec = passender VfxSpec aus der Config. */
export interface ChampVfxEvent {
  x: number;            // Ursprung (Mündung/Fokus) in Weltkoordinaten
  y: number;
  dir: number;          // +1 rechts, -1 links
  /**
   * Weltwinkel der Aktion in Radiant (0 = rechts, PI/2 = unten). Effekte
   * richten sich danach aus; ohne Angabe des Aufrufers steht er auf der
   * Blickrichtung, damit alte Aufrufe unverändert weiterlaufen.
   */
  angle: number;
  spec?: VfxSpec;
  champ: AnimatedChampion;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth  = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 2;
const lerp    = (a: number, b: number, t: number) => a + (b - a) * t;

function tintLerp(target: number, amt: number): number {
  const t = clamp01(amt);
  const r = Math.round(lerp(0xff, (target >> 16) & 0xff, t));
  const g = Math.round(lerp(0xff, (target >> 8) & 0xff, t));
  const b = Math.round(lerp(0xff, target & 0xff, t));
  return (r << 16) | (g << 8) | b;
}

interface Frame { dx: number; dy: number; sx: number; sy: number; rot: number; tint: number; }
const NEUTRAL = (): Frame => ({ dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, tint: 0xffffff });

export class AnimatedChampion extends Phaser.GameObjects.Image {
  readonly champId: string;
  private cc: ChampCfg;
  private homeX: number;
  private homeY: number;
  private faceSign = 1;
  private baseState: BaseState = 'idle';
  private shot: Shot | null = null;
  private shotFired = false;
  /** Per-cast VFX override (see cast()); cleared once the shot has emitted. */
  private castVfxOnce: VfxSpec | undefined;
  /** Per-shot aim angle in radians; cleared once the shot has emitted. */
  private shotAngle: number | undefined;
  /** Per-swing attack VFX override (see attack()); cleared once emitted. */
  private attackVfxOnce: VfxSpec | undefined;
  private clock = 0;
  /**
   * Display size multiplier. The animator rewrites scale every frame, so a base
   * size can't be set with a one-off setScale — this is folded into the frame
   * scale each tick. Lets the same 64px art render at each unit's radius.
   */
  private baseScale = 1;

  private readonly cfg = {
    idlePeriod: 1400, idleAmp: 0.035, idleBob: 1.5,
    walkPeriod: 480,  walkBob: 3, walkLean: 0.05, walkSquash: 0.06,
    attackDur: 300, lunge: 10,
    castDur: 520,
    hurtDur: 260, knockback: 8,
  };

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, id: string) {
    super(scene, x, y, texture);
    this.champId = id;
    this.cc = cfgFor(id);
    this.homeX = x;
    this.homeY = y;
    this.setOrigin(0.5, 60 / 64); // Fußlinie der normalisierten Sprites → Boden-Pivot

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    });
  }

  // ---- Steuerung ----
  setHome(x: number, y: number): this { this.homeX = x; this.homeY = y; return this; }
  /** Display size multiplier (folded into the animated scale each frame). */
  setBaseScale(s: number): this { this.baseScale = s; return this; }
  setBase(state: BaseState): this { this.baseState = state; return this; }
  face(dir: 'left' | 'right'): this {
    this.faceSign = dir === 'left' ? -1 : 1;
    this.setFlipX(dir === 'left');
    return this;
  }
  /**
   * `angle` (radians) aims this swing; omitted, it follows the facing.
   * `vfx` overrides the configured attack effect for this one swing.
   */
  attack(angle?: number, vfx?: VfxSpec): this {
    this.flushPendingCast();
    this.shotAngle = angle;
    this.attackVfxOnce = vfx;
    return this.startShot('attack', this.cc.attackDur ?? this.cfg.attackDur);
  }
  /**
   * `vfx` overrides this cast's effect spec for one shot — callers pass the
   * geometry derived from the ability's declared shape so the effect reaches
   * exactly as far as the ability does (see abilityVfx.ts). `angle` (radians)
   * aims it; omitted, it follows the facing.
   */
  cast(vfx?: VfxSpec, angle?: number): this {
    this.flushPendingCast();
    this.castVfxOnce = vfx;
    this.shotAngle = angle;
    return this.startShot('cast', this.cc.castDur ?? this.cfg.castDur);
  }
  hurt(): this   { return this.startShot('hurt',   this.cfg.hurtDur); }

  /** Für Object-Pooling: Zustand vollständig zurücksetzen (statt destroy/new). */
  reset(x?: number, y?: number): this {
    this.shot = null; this.shotFired = false; this.clock = 0;
    this.castVfxOnce = undefined; this.attackVfxOnce = undefined; this.shotAngle = undefined;
    this.baseState = 'idle';
    this.clearTint(); this.setScale(1).setRotation(0);
    if (x !== undefined && y !== undefined) { this.setHome(x, y); this.setPosition(x, y); }
    return this;
  }

  /** ID neu binden, wenn ein gepooltes Objekt für einen anderen Champion wiederverwendet wird. */
  rebind(id: string, texture: string): this {
    this.cc = cfgFor(id);
    (this as { champId: string }).champId = id;
    this.setTexture(texture);
    return this.reset();
  }

  private startShot(name: ShotName, dur: number): this {
    this.flushPendingCast();
    this.shot = { name, t: 0, dur }; this.shotFired = false; return this;
  }

  /**
   * Attack und Cast lösen ihr VFX erst in der Mitte der Animation aus (50%/55%).
   * Wird die Animation vorher ersetzt — im Kampf ständig, weil jeder Treffer die
   * hurt-Animation startet — ging der Effekt komplett verloren: die Aktion wirkte
   * im Code, war aber unsichtbar. Darum vor dem Wechsel nachholen.
   */
  private flushPendingCast(): void {
    if (!this.shot || this.shotFired) return;
    if (this.shot.name === 'cast' || this.shot.name === 'attack') this.maybeEmit(this.shot, true);
  }

  // ---- Loop ----
  private tick(_time: number, delta: number): void {
    this.clock += delta;
    if (this.shot) {
      this.shot.t += delta;
      this.maybeEmit(this.shot);
      if (this.shot.t >= this.shot.dur) this.shot = null;
    }

    const f = NEUTRAL();
    (this.baseState === 'walk' ? this.applyWalk : this.applyIdle).call(this, f);
    if (this.shot) this.applyShot(f, this.shot);

    const sign = this.faceSign;
    this.setPosition(this.homeX + f.dx * sign, this.homeY + f.dy);
    this.setScale(f.sx * this.baseScale, f.sy * this.baseScale);
    this.setRotation(f.rot * sign);
    if (f.tint === 0xffffff) this.clearTint(); else this.setTint(f.tint);
  }

  private maybeEmit(shot: Shot, force = false): void {
    if (this.shotFired) return;
    const at = shot.name === 'attack'
      ? (this.cc.attackStyle === 'recoil' ? 0.45 : 0.5)
      : shot.name === 'cast' ? 0.55 : 0.02;
    if (!force && shot.t / shot.dur < at) return;
    this.shotFired = true;
    const dir = this.faceSign;
    const payload: ChampVfxEvent = {
      x: this.x + dir * this.displayWidth * 0.45,
      y: this.y - this.displayHeight * 0.5,
      dir,
      angle: this.shotAngle ?? (dir > 0 ? 0 : Math.PI),
      spec: shot.name === 'cast'
        ? this.castVfxOnce ?? this.cc.castVfx
        : shot.name === 'attack' ? this.attackVfxOnce ?? this.cc.attackVfx : undefined,
      champ: this,
    };
    const evt = shot.name === 'attack' ? ChampEvents.AttackHit
      : shot.name === 'cast' ? ChampEvents.CastRelease : ChampEvents.Hurt;
    this.emit(evt, payload);
    if (shot.name === 'cast') this.castVfxOnce = undefined;
    if (shot.name === 'attack') this.attackVfxOnce = undefined;
    this.shotAngle = undefined;
  }

  // ---- Base-Loops ----
  private applyIdle(f: Frame): void {
    const amp = this.cc.idleAmp ?? this.cfg.idleAmp;
    const p = (this.clock / this.cfg.idlePeriod) * Math.PI * 2;
    const s = Math.sin(p);
    f.sy *= 1 + amp * s;
    f.sx *= 1 - amp * 0.6 * s;
    f.dy += this.cc.float ? Math.sin(p) * 3 : -this.cfg.idleBob * (0.5 + 0.5 * s);
    if (this.cc.jitter && Math.random() < 0.04) { f.dx += (Math.random() - 0.5) * 3; f.rot += (Math.random() - 0.5) * 0.06; }
  }

  private applyWalk(f: Frame): void {
    const bob = this.cc.walkBob ?? this.cfg.walkBob;
    const p = (this.clock / this.cfg.walkPeriod) * Math.PI * 2;
    f.dy += -bob * Math.abs(Math.sin(p));
    f.rot += this.cfg.walkLean * Math.sin(p);
    f.sy *= 1 - this.cfg.walkSquash * Math.abs(Math.cos(p));
    if (bob === 0) { f.dx += Math.sin(p) * 1.5; f.rot += 0.03 * Math.sin(p * 0.5); } // Gleiten (Schlängeln/Schweben)
  }

  // ---- One-Shots ----
  private applyShot(f: Frame, shot: Shot): void {
    const p = clamp01(shot.t / shot.dur);
    switch (shot.name) {
      case 'attack':
        if (this.cc.attackStyle === 'recoil') {
          // Zurücklehnen (spannen/anlegen) → kurzer Rückstoß nach Auslösen
          const draw = smooth(Math.min(p / 0.45, 1));
          let dx = -6 * draw;
          if (p > 0.45) dx += 4 * (1 - smooth((p - 0.45) / 0.25)) - 4;
          f.dx += dx;
          f.rot += -0.06 * draw;
          f.sx *= 1 + 0.04 * Math.sin(Math.PI * clamp01((p - 0.4) / 0.3));
        } else {
          const lunge = this.cc.lunge ?? this.cfg.lunge;
          let dx: number;
          if (p < 0.28)      dx = -lunge * 0.5 * smooth(p / 0.28);
          else if (p < 0.5)  dx = lerp(-lunge * 0.5, lunge, smooth((p - 0.28) / 0.22));
          else               dx = lunge * (1 - smooth((p - 0.5) / 0.5));
          f.dx += dx;
          f.sx *= 1 + 0.10 * Math.sin(Math.PI * clamp01((p - 0.28) / 0.4));
        }
        break;
      case 'cast':
        if (p < 0.5) {
          const w = smooth(p / 0.5);
          f.sx *= lerp(1, 1.10, w); f.sy *= lerp(1, 1.12, w);
          f.dy += lerp(0, 2, w);
          f.tint = tintLerp(0x66ccff, 0.5 * w);
        } else if (p < 0.7) {
          const w = smooth((p - 0.5) / 0.2);
          f.sx *= lerp(1.10, 0.94, w); f.sy *= lerp(1.12, 0.96, w);
          f.tint = tintLerp(0xffffff, 1 - w);
        } else {
          const w = smooth((p - 0.7) / 0.3);
          f.sx *= lerp(0.94, 1, w); f.sy *= lerp(0.96, 1, w);
        }
        break;
      case 'hurt': {
        const e = 1 - easeOut(p);
        f.dx += -this.cfg.knockback * e;
        f.rot += 0.08 * e * Math.sin(p * 40);
        f.tint = tintLerp(0xff4444, e);
        break;
      }
    }
  }
}
