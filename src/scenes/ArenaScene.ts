import Phaser from 'phaser';
import { Combat } from '../core/combat';
import { EventBus, DamageType } from '../core/events';
import { Unit } from '../entities/Unit';
import { Player } from '../entities/Player';
import { Dummy } from '../entities/Dummy';
import { Projectile, ProjectileOpts } from '../entities/Projectile';
import { Joystick } from '../ui/Joystick';
import { dist } from '../core/geometry';
import { ARENA_X, ARENA_Y, ARENA_R, PILLARS, COLORS } from '../config';
import { STR } from '../core/strings';

export class ArenaScene extends Phaser.Scene implements Combat {
  readonly bus = new EventBus();
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  player!: Player;

  private joystick!: Joystick;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private projGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('arena');
  }

  /** Combat.now — scene clock in ms (Phaser's `time` is the clock plugin itself). */
  get now(): number {
    return this.time.now;
  }

  create(): void {
    this.drawArenaFloor();

    this.player = new Player(this, this, ARENA_X, ARENA_Y + 360);
    this.units.push(this.player);
    this.units.push(new Dummy(this, ARENA_X, ARENA_Y - 220));

    this.projGfx = this.add.graphics().setDepth(9);
    this.joystick = new Joystick(this);
    this.input.addPointer(3);

    const kb = this.input.keyboard!;
    this.keys = {
      W: kb.addKey('W'),
      A: kb.addKey('A'),
      S: kb.addKey('S'),
      D: kb.addKey('D'),
    };

    this.add
      .text(ARENA_X, 40, STR.trainingHint, {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: '#8899bb',
      })
      .setOrigin(0.5)
      .setDepth(100);

    this.bus.emit('roundStart', undefined);
  }

  // ---- Combat API ----

  spawnProjectile(opts: ProjectileOpts): Projectile {
    const p = new Projectile(opts);
    this.projectiles.push(p);
    return p;
  }

  dealDamage(source: Unit | null, target: Unit, amount: number, type: DamageType): number {
    if (!target.alive || amount <= 0) return 0;
    const dealt = Math.min(amount, target.hp);
    target.applyDamage(amount);

    if (source === this.player) {
      this.bus.emit('damageDealt', { target, dmg: dealt, type });
    }
    if (target === this.player) {
      const melee = source !== null && dist(source.x, source.y, target.x, target.y) < 120;
      this.bus.emit('damageTaken', { source, dmg: dealt, melee });
    }
    if (!target.alive && target.team === 'enemy') {
      this.bus.emit('enemyDeath', { enemy: target });
      this.bus.emit('killWindow', { victim: target });
    }
    return dealt;
  }

  nearestEnemy(of: Unit, maxDist = Infinity): Unit | null {
    let best: Unit | null = null;
    let bestD = maxDist;
    for (const u of this.units) {
      if (!u.alive || u.team === of.team) continue;
      const d = dist(of.x, of.y, u.x, u.y);
      if (d <= bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  // ---- Frame loop ----

  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;

    // Movement input: joystick wins, else WASD
    let mv = this.joystick.vec;
    if (!this.joystick.active) {
      mv = {
        x: (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0),
        y: (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0),
      };
    }
    this.player.move(dt, mv);

    for (const u of this.units) u.update(time, dt);

    for (const p of this.projectiles) p.update(dt, this.units);
    this.projectiles = this.projectiles.filter((p) => p.alive);

    // Render
    for (const u of this.units) u.draw();
    this.projGfx.clear();
    for (const p of this.projectiles) {
      this.projGfx.fillStyle(p.color, 1);
      this.projGfx.fillCircle(p.x, p.y, p.radius);
    }
    this.joystick.draw();
  }

  private drawArenaFloor(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(COLORS.arenaFloor, 1);
    g.fillCircle(ARENA_X, ARENA_Y, ARENA_R);
    g.lineStyle(6, COLORS.arenaLine, 1);
    g.strokeCircle(ARENA_X, ARENA_Y, ARENA_R);
    // Subtle inner ring for depth
    g.lineStyle(2, COLORS.arenaLine, 0.4);
    g.strokeCircle(ARENA_X, ARENA_Y, ARENA_R * 0.65);

    for (const p of PILLARS) {
      g.fillStyle(COLORS.pillar, 1);
      g.fillCircle(p.x, p.y, p.r);
      g.lineStyle(4, COLORS.pillarLine, 1);
      g.strokeCircle(p.x, p.y, p.r);
    }
  }
}
