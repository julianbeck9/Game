import Phaser from 'phaser';
import { Unit } from './Unit';
import { StatBlock, StatName } from '../core/stats';
import { Combat } from '../core/combat';
import { norm, len, dist, Vec } from '../core/geometry';
import { COLORS } from '../config';
import { shadedDisc } from '../core/draw';
import { AnimatedChampion } from '../champions/AnimatedChampion';
import type { AbilityShape } from '../champions/types';
import { cfgFor } from '../champions/championConfig';
import { specForShape } from '../champions/abilityVfx';

export interface EnemyAbilitySpec {
  id: string;
  cd: number; // ms
  /** May the bot start winding this up right now? */
  condition: (e: Enemy, d: number) => boolean;
  telegraphMs: number;
  drawTelegraph: (e: Enemy, g: Phaser.GameObjects.Graphics, progress: number) => void;
  execute: (e: Enemy) => void;
  /**
   * Declared shape of the ability, same truth layer the playable kits use.
   * Drives the cast VFX so a rival's effect matches what it actually hits —
   * without it the champion sprite plays a wind-up and draws nothing.
   */
  shape?: AbilityShape;
}

export interface EnemyConfig {
  name: string;
  kind: 'haescher' | 'schuetze' | 'waechter' | 'usurpator' | 'diener' | 'hexer' | 'berserker' | 'speermaid';
  radius: number;
  color: number;
  darkColor: number;
  stats: Partial<Record<StatName, number>>;
  /** Distance the bot tries to hold to its target. */
  preferredRange: number;
  rangeBand: number;
  /** Delay before reacting to a threatening skillshot; shrinks in later rounds. */
  reactionMs: number;
  dodgeChance: number;
  /** Melee swing (if set): { range, dmg, interval } */
  melee?: { range: number; dmg: number; intervalMs: number };
  /** Ranged auto (if set): { range, dmg, intervalMs, projSpeed } */
  rangedAuto?: { range: number; dmg: number; intervalMs: number; projSpeed: number };
  abilities: EnemyAbilitySpec[];
  /** 0..1: higher = shorter pauses between actions, more forward pressure. */
  aggression: number;
  /** Passive regen as fraction of max HP per second (boss Blut augments). */
  regenPctPerSec?: number;
  /** Shown to the player at round start (Usurpator's visible augments). */
  visibleAugments?: string[];
  /** Rival champions render a baked champion sprite instead of a plain disc. */
  championSprite?: string;
}

interface Lunge {
  dir: Vec;
  speed: number;
  remaining: number;
  onImpact: (e: Enemy, target: Unit) => void;
  hit: boolean;
}

/**
 * Shared bot brain: range-keeping, strafing, skillshot dodging with reaction
 * delay, telegraphed abilities, brief low-HP retreats.
 */
export class Enemy extends Unit {
  cfg: EnemyConfig;
  /** Extra state abilities can use (e.g. Wächter's minions-spawned flag). */
  memory: Record<string, number> = {};

  facing: Vec = { x: 0, y: 1 };
  private telegraphGfx: Phaser.GameObjects.Graphics;
  /** Rival champions render a self-animating sprite; monster enemies draw a disc. */
  private sprite?: AnimatedChampion;
  /** Last-frame position, to detect movement for the walk/idle loop. */
  private animX = 0;
  private animY = 0;
  private telegraphing: EnemyAbilitySpec | null = null;
  private telegraphStart = 0;
  private telegraphUntil = 0;
  /** Locked aim at telegraph start — sidestepping the windup dodges it. */
  telegraphAim: Vec = { x: 0, y: 1 };
  private lunge: Lunge | null = null;

  private abilityReadyAt = new Map<string, number>();
  private nextSwingAt = 0;
  private strafeSign = 1;
  private strafeSwitchAt = 0;
  /** Personal flank slot on a ring around the target — squads surround, not queue. */
  private surroundAngle = 0;
  private dodgeUntil = 0;
  private dodgeDir: Vec = { x: 0, y: 0 };
  private threatSince = 0;
  private threatRoll = -1;
  private retreatUntil = 0;
  private retreatCdUntil = 0;

  constructor(
    scene: Phaser.Scene,
    public combat: Combat,
    x: number,
    y: number,
    cfg: EnemyConfig,
  ) {
    super(scene, x, y, 'enemy', new StatBlock({ ...cfg.stats }));
    this.cfg = cfg;
    this.radius = cfg.radius;
    this.telegraphGfx = scene.add.graphics().setDepth(5);
    if (cfg.championSprite && scene.textures.exists(`champ:${cfg.championSprite}`)) {
      this.sprite = new AnimatedChampion(scene, x, y, `champ:${cfg.championSprite}`, cfg.championSprite);
      scene.add.existing(this.sprite);
      this.sprite.setDepth(11).setBaseScale((this.radius * 3.1) / 64);
      combat.champVfx.bind(this.sprite);
    }
    this.animX = x;
    this.animY = y;
    for (const a of cfg.abilities) {
      // Stagger initial ability use a little so fights don't open with a windup
      this.abilityReadyAt.set(a.id, combat.now + 600 + Math.random() * 800);
    }
    // Spread the squad: everyone claims a different approach angle, so they
    // flank and surround instead of walking in from one side in a line.
    const t0 = combat.botTarget();
    this.surroundAngle = Math.atan2(y - t0.y, x - t0.x) + (Math.random() - 0.5) * 2.8;
  }

  get target(): Unit {
    return this.combat.botTarget();
  }

  get isBoss(): boolean {
    return this.cfg.kind === 'usurpator';
  }

  startLunge(l: Lunge): void {
    this.lunge = l;
  }

  isCasting(): boolean {
    return this.telegraphing !== null || this.lunge !== null;
  }

  update(time: number, dt: number): void {
    this.telegraphGfx.clear();
    if (!this.alive) return;
    this.stats.update(time);

    if (this.cfg.regenPctPerSec) this.heal(this.maxHP * this.cfg.regenPctPerSec * dt);

    // Crowd control: stunned/knocked-up bots can't move, cast or attack.
    if (time < this.ctrlUntil) {
      this.telegraphing = null;
      this.lunge = null;
      return;
    }

    const t = this.target;
    if (!t.alive) return;
    const d = dist(this.x, this.y, t.x, t.y);
    this.facing = norm(t.x - this.x, t.y - this.y);
    this.trackVelocity(time);

    // 1) Committed actions first
    if (this.lunge) {
      this.advanceLunge(dt);
      return;
    }
    if (this.telegraphing) {
      const prog = (time - this.telegraphStart) / (this.telegraphUntil - this.telegraphStart);
      this.telegraphing.drawTelegraph(this, this.telegraphGfx, Math.min(1, prog));
      if (time >= this.telegraphUntil) {
        const spec = this.telegraphing;
        this.telegraphing = null;
        spec.execute(this);
      }
      return; // stand still during windup
    }

    // 2) Movement decision
    const mv = this.decideMovement(time, d);
    if (mv) this.moveBy(mv.x * dt, mv.y * dt);

    // 3) Abilities (only when not mid-dodge)
    if (time >= this.dodgeUntil) this.tryAbilities(time, d);

    // 4) Basic attack
    this.tryBasicAttack(time, d);
  }

  // ---- Movement ----

  private decideMovement(time: number, d: number): Vec | null {
    const speed = this.stats.get('moveSpeed');
    const t = this.target;

    // Active dodge wins
    if (time < this.dodgeUntil) {
      return { x: this.dodgeDir.x * speed * 1.25, y: this.dodgeDir.y * speed * 1.25 };
    }
    this.checkThreats(time);
    if (time < this.dodgeUntil) {
      return { x: this.dodgeDir.x * speed * 1.25, y: this.dodgeDir.y * speed * 1.25 };
    }

    // Never loiter in the player's damage zones (poison clouds, fire trails …)
    for (const h of this.combat.hazards) {
      if (h.team !== 'player') continue;
      if (dist(this.x, this.y, h.x, h.y) < h.r + this.radius + 6) {
        const away = norm(this.x - h.x, this.y - h.y);
        return this.withSeparation({ x: away.x * speed * 1.1, y: away.y * speed * 1.1 });
      }
    }

    // Brief retreat at low HP
    if (this.hpPct < 0.3 && time >= this.retreatCdUntil && time >= this.retreatUntil) {
      this.retreatUntil = time + 1100;
      this.retreatCdUntil = time + 7000;
    }
    if (time < this.retreatUntil) {
      const away = norm(this.x - t.x, this.y - t.y);
      return this.withSeparation({ x: away.x * speed, y: away.y * speed });
    }

    // Range keeping + strafe
    const toT = norm(t.x - this.x, t.y - this.y);
    const inner = this.cfg.preferredRange - this.cfg.rangeBand;
    const outer = this.cfg.preferredRange + this.cfg.rangeBand;

    if (time >= this.strafeSwitchAt) {
      this.strafeSign = Math.random() < 0.5 ? -1 : 1;
      this.strafeSwitchAt = time + 700 + Math.random() * 1000;
    }
    const perp = { x: -toT.y * this.strafeSign, y: toT.x * this.strafeSign };

    if (d > outer) {
      // Head for your own flank slot on a ring around the target, so the
      // squad closes in from several directions at once.
      const slot = {
        x: t.x + Math.cos(this.surroundAngle) * this.cfg.preferredRange,
        y: t.y + Math.sin(this.surroundAngle) * this.cfg.preferredRange,
      };
      const toSlot = norm(slot.x - this.x, slot.y - this.y);
      return this.withSeparation({
        x: (toSlot.x * 0.75 + toT.x * 0.25) * speed,
        y: (toSlot.y * 0.75 + toT.y * 0.25) * speed,
      });
    }
    // Near the band: the slot follows the live orbit position
    this.surroundAngle = Math.atan2(this.y - t.y, this.x - t.x);
    if (d < inner) {
      return this.withSeparation({
        x: (-toT.x * 0.8 + perp.x * 0.45) * speed,
        y: (-toT.y * 0.8 + perp.y * 0.45) * speed,
      });
    }
    // In band: strafe
    return this.withSeparation({ x: perp.x * speed * 0.75, y: perp.y * speed * 0.75 });
  }

  /** Soft push away from stacked allies — no more enemy piles on one pixel. */
  private withSeparation(v: Vec): Vec {
    let sx = 0;
    let sy = 0;
    for (const u of this.combat.units) {
      if (u === this || !u.alive || u.team !== 'enemy') continue;
      const dd = dist(this.x, this.y, u.x, u.y);
      const min = this.radius + u.radius + 24;
      if (dd < min && dd > 0.01) {
        const f = (min - dd) / min;
        sx += ((this.x - u.x) / dd) * f;
        sy += ((this.y - u.y) / dd) * f;
      }
    }
    if (sx === 0 && sy === 0) return v;
    const speed = this.stats.get('moveSpeed');
    return { x: v.x + sx * speed * 0.9, y: v.y + sy * speed * 0.9 };
  }

  /** Watch for player skillshots on a collision course; sidestep after a reaction delay. */
  private checkThreats(time: number): void {
    let threat: { perp: Vec } | null = null;
    for (const p of this.combat.projectiles) {
      if (p.team !== 'enemy' && !p.isHoming) {
        const bp = { x: this.x - p.x, y: this.y - p.y };
        const along = bp.x * p.dir.x + bp.y * p.dir.y;
        if (along <= 0 || along > 520) continue;
        const offX = bp.x - p.dir.x * along;
        const offY = bp.y - p.dir.y * along;
        if (len(offX, offY) < this.radius + p.radius + 30) {
          const side = offX * -p.dir.y + offY * p.dir.x >= 0 ? 1 : -1;
          threat = { perp: { x: -p.dir.y * side, y: p.dir.x * side } };
          break;
        }
      }
    }
    if (!threat) {
      this.threatSince = 0;
      this.threatRoll = -1;
      return;
    }
    if (this.threatSince === 0) {
      this.threatSince = time;
      this.threatRoll = Math.random();
    }
    if (this.threatRoll < this.cfg.dodgeChance && time - this.threatSince >= this.cfg.reactionMs) {
      this.dodgeDir = threat.perp;
      this.dodgeUntil = time + 320;
      this.threatSince = 0;
      this.threatRoll = -1;
    }
  }

  private advanceLunge(dt: number): void {
    const l = this.lunge!;
    const step = Math.min(l.speed * dt, l.remaining);
    this.moveBy(l.dir.x * step, l.dir.y * step);
    l.remaining -= step;

    const t = this.target;
    if (!l.hit && t.alive && dist(this.x, this.y, t.x, t.y) <= this.radius + t.radius + 8) {
      l.hit = true;
      l.onImpact(this, t);
      l.remaining = Math.min(l.remaining, 30);
    }
    if (l.remaining <= 0.5) this.lunge = null;
  }

  // ---- Attacks ----

  private tryAbilities(time: number, d: number): void {
    for (const a of this.cfg.abilities) {
      const ready = (this.abilityReadyAt.get(a.id) ?? 0) <= time;
      if (!ready || !a.condition(this, d)) continue;
      this.abilityReadyAt.set(a.id, time + a.cd);
      this.telegraphing = a;
      this.telegraphStart = time;
      this.telegraphUntil = time + a.telegraphMs;
      const t = this.target;
      this.telegraphAim = norm(t.x - this.x, t.y - this.y);
      // wind-up/cast animation, aimed at the telegraphed direction, with an
      // effect sized to what the ability actually hits (see abilityVfx.ts)
      if (this.sprite) {
        const cfg = cfgFor(this.sprite.champId);
        this.sprite.cast(
          specForShape(cfg.castVfx, a.shape, cfg.attackVfx?.color ?? this.cfg.color),
          Math.atan2(this.telegraphAim.y, this.telegraphAim.x),
        );
      }
      return;
    }
  }

  private tryBasicAttack(time: number, d: number): void {
    const t = this.target;
    if (this.cfg.melee && d <= this.cfg.melee.range + t.radius && time >= this.nextSwingAt) {
      this.nextSwingAt = time + this.cfg.melee.intervalMs;
      this.combat.dealDamage(this, t, this.cfg.melee.dmg * this.dmgScale(), 'auto');
      this.memory.swingAt = time; // for the monster-disc swing flash
      this.sprite?.attack(Math.atan2(t.y - this.y, t.x - this.x));
    }
    if (this.cfg.rangedAuto && d <= this.cfg.rangedAuto.range && time >= this.nextSwingAt) {
      const r = this.cfg.rangedAuto;
      this.nextSwingAt = time + r.intervalMs;
      this.sprite?.attack(Math.atan2(t.y - this.y, t.x - this.x));
      // Non-homing, lightly lead the target so it's a dodgeable straight shot
      const lead = Math.min(0.35, d / r.projSpeed / 2);
      const aimX = t.x + this.predVX(t) * lead;
      const aimY = t.y + this.predVY(t) * lead;
      this.combat.spawnProjectile({
        x: this.x,
        y: this.y,
        dirX: aimX - this.x,
        dirY: aimY - this.y,
        speed: r.projSpeed,
        radius: 9,
        color: COLORS.enemyProj,
        team: 'enemy',
        maxDist: r.range + 260,
        onHit: (u) => this.combat.dealDamage(this, u, r.dmg * this.dmgScale(), 'auto'),
      });
    }
  }

  // Rough per-frame velocity estimate of a unit, for shot leading
  private lastSeen = new Map<Unit, { x: number; y: number; vx: number; vy: number; t: number }>();
  private predVX(u: Unit): number {
    return this.lastSeen.get(u)?.vx ?? 0;
  }
  private predVY(u: Unit): number {
    return this.lastSeen.get(u)?.vy ?? 0;
  }
  private trackVelocity(time: number): void {
    const u = this.target;
    const prev = this.lastSeen.get(u);
    if (prev && time > prev.t) {
      const dts = (time - prev.t) / 1000;
      this.lastSeen.set(u, { x: u.x, y: u.y, vx: (u.x - prev.x) / dts, vy: (u.y - prev.y) / dts, t: time });
    } else {
      this.lastSeen.set(u, { x: u.x, y: u.y, vx: 0, vy: 0, t: time });
    }
  }

  /** Damage scale from the stat pipeline ('damage' base 1 = spec values). */
  dmgScale(): number {
    const s = this.stats.get('damage');
    return s === 0 ? 1 : s;
  }

  // ---- Rendering ----

  /** Play the hurt reaction on the champion sprite (routed from combat). */
  notifyHurt(): void {
    if (this.alive) this.sprite?.hurt();
  }

  protected drawBody(g: Phaser.GameObjects.Graphics): void {
    // Grounding drop shadow so the unit reads as standing on the map (3D feel)
    g.fillStyle(0x000000, 0.32);
    g.fillEllipse(this.x + 2, this.y + this.radius * 0.92, this.radius * 2.1, this.radius * 0.68);

    // Boss aura: slow-pulsing ring so the Usurpator dominates the frame
    if (this.isBoss) {
      const pulse = Math.sin(this.combat.now / 300) * 3;
      g.lineStyle(3, this.cfg.color, 0.45);
      g.strokeCircle(this.x, this.y, this.radius + 12 + pulse);
      g.fillStyle(this.cfg.color, 0.08);
      g.fillCircle(this.x, this.y, this.radius + 12 + pulse);
    }

    const swinging = this.memory.swingAt && this.combat.now - this.memory.swingAt < 120;

    // Rival champions render their self-animating sprite inside an enemy-red ring
    if (this.sprite) {
      const now = this.combat.now;
      const pulse = Math.sin(now / 260) * 2;
      g.lineStyle(3, 0xff5a4a, 0.7);
      g.strokeCircle(this.x, this.y, this.radius + 6 + pulse);
      g.fillStyle(0xff3a2a, 0.1);
      g.fillCircle(this.x, this.y, this.radius + 6 + pulse);

      // Drive the animated sprite: walk when it moved this frame, else idle.
      const moved = Math.hypot(this.x - this.animX, this.y - this.animY);
      this.animX = this.x;
      this.animY = this.y;
      this.sprite.setHome(this.x, this.y + this.radius * 1.356);
      this.sprite.face(this.facing.x < 0 ? 'left' : 'right');
      this.sprite.setBase(moved > 0.6 ? 'walk' : 'idle');
      this.drawInsignia(g);
      return;
    }

    shadedDisc(g, this.x, this.y, this.radius, swinging ? 0xffffff : this.cfg.color);

    // Facing wedge
    const f = this.facing;
    g.fillStyle(this.cfg.darkColor, 1);
    g.fillTriangle(
      this.x + f.x * (this.radius + 6), this.y + f.y * (this.radius + 6),
      this.x + f.x * (this.radius - 5) - f.y * 7, this.y + f.y * (this.radius - 5) + f.x * 7,
      this.x + f.x * (this.radius - 5) + f.y * 7, this.y + f.y * (this.radius - 5) - f.x * 7,
    );

    this.drawInsignia(g);
  }

  /** Archetype marking so enemies read at a glance. */
  protected drawInsignia(g: Phaser.GameObjects.Graphics): void {
    g.lineStyle(3, this.cfg.darkColor, 1);
    switch (this.cfg.kind) {
      case 'haescher': // X slashes
        g.beginPath();
        g.moveTo(this.x - 10, this.y - 10);
        g.lineTo(this.x + 10, this.y + 10);
        g.moveTo(this.x + 10, this.y - 10);
        g.lineTo(this.x - 10, this.y + 10);
        g.strokePath();
        break;
      case 'schuetze': // dot + ring (an eye)
        g.strokeCircle(this.x, this.y, 10);
        g.fillStyle(this.cfg.darkColor, 1);
        g.fillCircle(this.x, this.y, 4);
        break;
      case 'waechter': // square shield
        g.strokeRect(this.x - 9, this.y - 9, 18, 18);
        break;
      case 'usurpator': // jagged crown
        g.fillStyle(0x222222, 1);
        {
          const cy = this.y - 4;
          g.fillTriangle(this.x - 14, cy + 8, this.x - 4, cy + 8, this.x - 9, cy - 6);
          g.fillTriangle(this.x - 5, cy + 8, this.x + 5, cy + 8, this.x, cy - 9);
          g.fillTriangle(this.x + 4, cy + 8, this.x + 14, cy + 8, this.x + 9, cy - 6);
        }
        break;
      case 'diener': // small dash
        g.beginPath();
        g.moveTo(this.x - 6, this.y);
        g.lineTo(this.x + 6, this.y);
        g.strokePath();
        break;
      case 'hexer': // crescent moon
        g.fillStyle(this.cfg.darkColor, 1);
        g.fillCircle(this.x, this.y, 10);
        g.fillStyle(this.cfg.color, 1);
        g.fillCircle(this.x + 5, this.y - 3, 8);
        break;
    }
  }

  destroy(): void {
    this.telegraphGfx.destroy();
    this.sprite?.destroy();
    super.destroy();
  }
}
