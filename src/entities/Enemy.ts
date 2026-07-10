import Phaser from 'phaser';
import { Unit } from './Unit';
import { StatBlock, StatName } from '../core/stats';
import { Combat } from '../core/combat';
import { clampToArena, resolvePillars, norm, len, dist, Vec } from '../core/geometry';
import { COLORS } from '../config';

export interface EnemyAbilitySpec {
  id: string;
  cd: number; // ms
  /** May the bot start winding this up right now? */
  condition: (e: Enemy, d: number) => boolean;
  telegraphMs: number;
  drawTelegraph: (e: Enemy, g: Phaser.GameObjects.Graphics, progress: number) => void;
  execute: (e: Enemy) => void;
}

export interface EnemyConfig {
  name: string;
  kind: 'haescher' | 'schuetze' | 'waechter' | 'usurpator' | 'diener';
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
    for (const a of cfg.abilities) {
      // Stagger initial ability use a little so fights don't open with a windup
      this.abilityReadyAt.set(a.id, combat.now + 600 + Math.random() * 800);
    }
  }

  get target(): Unit {
    return this.combat.playerUnit;
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

    const t = this.target;
    if (!t.alive) return;
    const d = dist(this.x, this.y, t.x, t.y);
    this.facing = norm(t.x - this.x, t.y - this.y);

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

    // Brief retreat at low HP
    if (this.hpPct < 0.3 && time >= this.retreatCdUntil && time >= this.retreatUntil) {
      this.retreatUntil = time + 1100;
      this.retreatCdUntil = time + 7000;
    }
    if (time < this.retreatUntil) {
      const away = norm(this.x - t.x, this.y - t.y);
      return { x: away.x * speed, y: away.y * speed };
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
      // Close in, drifting sideways a bit
      return {
        x: (toT.x * 0.9 + perp.x * 0.35) * speed,
        y: (toT.y * 0.9 + perp.y * 0.35) * speed,
      };
    }
    if (d < inner) {
      return {
        x: (-toT.x * 0.8 + perp.x * 0.45) * speed,
        y: (-toT.y * 0.8 + perp.y * 0.45) * speed,
      };
    }
    // In band: strafe
    return { x: perp.x * speed * 0.75, y: perp.y * speed * 0.75 };
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

  moveBy(dx: number, dy: number): void {
    const p1 = resolvePillars(this.x + dx, this.y + dy, this.radius);
    const p2 = clampToArena(p1.x, p1.y, this.radius);
    this.x = p2.x;
    this.y = p2.y;
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
      return;
    }
  }

  private tryBasicAttack(time: number, d: number): void {
    const t = this.target;
    if (this.cfg.melee && d <= this.cfg.melee.range + t.radius && time >= this.nextSwingAt) {
      this.nextSwingAt = time + this.cfg.melee.intervalMs;
      this.combat.dealDamage(this, t, this.cfg.melee.dmg * this.dmgScale(), 'auto');
      this.memory.swingAt = time; // for the swing flash visual
    }
    if (this.cfg.rangedAuto && d <= this.cfg.rangedAuto.range && time >= this.nextSwingAt) {
      const r = this.cfg.rangedAuto;
      this.nextSwingAt = time + r.intervalMs;
      this.combat.spawnProjectile({
        x: this.x,
        y: this.y,
        dirX: t.x - this.x,
        dirY: t.y - this.y,
        speed: r.projSpeed,
        radius: 8,
        color: COLORS.enemyProj,
        team: 'enemy',
        homing: t,
        maxDist: r.range + 200,
        onHit: (u) => this.combat.dealDamage(this, u, r.dmg * this.dmgScale(), 'auto'),
      });
    }
  }

  /** Damage scale from the stat pipeline ('damage' base 1 = spec values). */
  dmgScale(): number {
    const s = this.stats.get('damage');
    return s === 0 ? 1 : s;
  }

  // ---- Rendering ----

  protected drawBody(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(this.cfg.darkColor, 1);
    g.fillCircle(this.x, this.y, this.radius + 3);
    // Melee swing flash
    const swinging = this.memory.swingAt && this.combat.now - this.memory.swingAt < 120;
    g.fillStyle(swinging ? 0xffffff : this.cfg.color, 1);
    g.fillCircle(this.x, this.y, this.radius);

    this.drawInsignia(g);

    // Facing tick
    g.lineStyle(4, this.cfg.darkColor, 1);
    g.beginPath();
    g.moveTo(this.x, this.y);
    g.lineTo(this.x + this.facing.x * (this.radius - 4), this.y + this.facing.y * (this.radius - 4));
    g.strokePath();
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
    }
  }

  destroy(): void {
    this.telegraphGfx.destroy();
    super.destroy();
  }
}
