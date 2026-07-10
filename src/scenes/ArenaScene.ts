import Phaser from 'phaser';
import { Combat } from '../core/combat';
import { EventBus, DamageType } from '../core/events';
import { Unit } from '../entities/Unit';
import { Player } from '../entities/Player';
import { spawnEnemy } from '../entities/enemies';
import { Projectile, ProjectileOpts } from '../entities/Projectile';
import { roundSpec, lossCost, MAX_ROUND } from '../core/rounds';
import { Joystick } from '../ui/Joystick';
import { AbilityButton } from '../ui/AbilityButton';
import { AugmentManager } from '../augments/AugmentManager';
import { rollOffers } from '../augments/offers';
import { run } from '../core/run';
import { dist, Vec } from '../core/geometry';
import { ARENA_X, ARENA_Y, ARENA_R, PILLARS, COLORS, GAME_W, GAME_H, ABILITIES } from '../config';
import { STR } from '../core/strings';

export class ArenaScene extends Phaser.Scene implements Combat {
  readonly bus = new EventBus();
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  player!: Player;

  private augments!: AugmentManager;
  private joystick!: Joystick;
  private buttons: AbilityButton[] = [];
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private projGfx!: Phaser.GameObjects.Graphics;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private aimPreview: Vec | null = null;

  constructor() {
    super('arena');
  }

  private fightState: 'fighting' | 'won' | 'lost' = 'fighting';

  /** Combat.now — scene clock in ms (Phaser's `time` is the clock plugin itself). */
  get now(): number {
    return this.time.now;
  }

  get playerUnit(): Unit {
    return this.player;
  }

  create(): void {
    // Scene restarts reuse the instance — reset state
    this.units = [];
    this.projectiles = [];
    this.buttons = [];
    this.fightState = 'fighting';
    this.aimPreview = null;
    this.bus.clear();

    this.drawArenaFloor();

    this.player = new Player(this, this, ARENA_X, ARENA_Y + 360);
    this.units.push(this.player);

    const spec = roundSpec(run.round);
    const spots: [number, number][] =
      spec.enemies.length === 1
        ? [[ARENA_X, ARENA_Y - 360]]
        : [
            [ARENA_X - 240, ARENA_Y - 320],
            [ARENA_X + 240, ARENA_Y - 320],
          ];
    spec.enemies.forEach((cfg, i) => {
      const [x, y] = spots[i % spots.length];
      this.units.push(spawnEnemy(this, this, x, y, cfg));
    });

    this.projGfx = this.add.graphics().setDepth(9);
    this.aimGfx = this.add.graphics().setDepth(8);
    this.input.addPointer(3);
    this.joystick = new Joystick(this);
    this.createButtons();
    this.setupKeyboard();

    // Augments plug in before the round starts so roundStart hooks fire
    this.augments = new AugmentManager(this, this.player);
    this.augments.init();
    this.events.once('shutdown', () => this.augments.destroy());

    this.createHud(spec.boss, spec.title);
    this.bus.emit('roundStart', undefined);
  }

  private createHud(boss: boolean, title: string): void {
    const style = { fontFamily: 'sans-serif', fontSize: '32px', color: '#c8d0e8' };
    this.add.text(30, 24, `${STR.round} ${run.round} / ${MAX_ROUND}`, style).setDepth(100);
    this.add
      .text(GAME_W - 30, 24, `${STR.life}: ${run.runHP}`, { ...style, color: '#7ee08a' })
      .setOrigin(1, 0)
      .setDepth(100);

    // Round intro banner
    const banner = this.add
      .text(ARENA_X, ARENA_Y - 80, title, {
        fontFamily: 'sans-serif',
        fontSize: '84px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(150)
      .setAlpha(0);
    const sub = boss
      ? this.add
          .text(ARENA_X, ARENA_Y + 10, STR.usurpatorComes, {
            fontFamily: 'sans-serif',
            fontSize: '38px',
            fontStyle: 'italic',
            color: '#ff9a8a',
            stroke: '#000000',
            strokeThickness: 6,
          })
          .setOrigin(0.5)
          .setDepth(150)
          .setAlpha(0)
      : null;
    this.tweens.add({
      targets: sub ? [banner, sub] : banner,
      alpha: 1,
      duration: 350,
      yoyo: true,
      hold: 1300,
      onComplete: () => {
        banner.destroy();
        sub?.destroy();
      },
    });
  }

  private createButtons(): void {
    const bx = GAME_W - 190;
    const by = GAME_H - 190;
    this.buttons.push(
      // Dash — biggest, corner anchor
      new AbilityButton(this, {
        x: bx + 60,
        y: by + 60,
        r: 84,
        label: '⇢',
        color: 0x4488dd,
        onCast: () => this.player.dash(),
        getCooldownPct: () => this.player.cooldownPct('Dash'),
      }),
      // Q — aimable
      new AbilityButton(this, {
        x: bx - 150,
        y: by + 40,
        r: 68,
        label: 'Q',
        color: 0xcc8833,
        aimable: true,
        onCast: (dir) => this.player.castQ(dir ?? undefined),
        onAimPreview: (dir) => (this.aimPreview = dir),
        getCooldownPct: () => this.player.cooldownPct('Q'),
      }),
      // E
      new AbilityButton(this, {
        x: bx + 40,
        y: by - 150,
        r: 68,
        label: 'E',
        color: 0xbbaa33,
        onCast: () => this.player.castE(),
        getCooldownPct: () => this.player.cooldownPct('E'),
      }),
    );
  }

  private setupKeyboard(): void {
    const kb = this.input.keyboard!;
    this.keys = {
      W: kb.addKey('W'),
      A: kb.addKey('A'),
      S: kb.addKey('S'),
      D: kb.addKey('D'),
    };
    // Desktop: Q aims toward the mouse cursor, E self-cast, Space dash
    kb.addKey('Q').on('down', () => {
      const p = this.input.activePointer;
      this.player.castQ({ x: p.worldX - this.player.x, y: p.worldY - this.player.y });
    });
    kb.addKey('E').on('down', () => this.player.castE());
    kb.addKey('SPACE').on('down', () => this.player.dash());
  }

  // ---- Combat API ----

  spawnProjectile(opts: ProjectileOpts): Projectile {
    const p = new Projectile(opts);
    this.projectiles.push(p);
    return p;
  }

  dealDamage(source: Unit | null, target: Unit, amount: number, type: DamageType): number {
    if (!target.alive || amount <= 0) return 0;
    const prevPct = target.hpPct;
    const dealt = Math.min(amount, target.hp + target.shield);
    target.applyDamage(amount);

    if (source === this.player) {
      run.totalDamageDealt += dealt;
      this.bus.emit('damageDealt', { target, dmg: dealt, type });
      const ls = this.player.stats.get('lifesteal');
      if (ls > 0 && type !== 'reflect') this.player.heal(dealt * ls);
    }
    if (target === this.player) {
      const melee = source !== null && dist(source.x, source.y, target.x, target.y) < 120;
      this.bus.emit('damageTaken', { source, dmg: dealt, melee });
      // Threshold events (Zweiter Wind etc.): fire when crossing downward
      for (const pct of [0.5, 0.15]) {
        if (prevPct > pct && this.player.hpPct <= pct && this.player.alive) {
          this.bus.emit('playerHpThreshold', { pct });
        }
      }
    }
    if (!target.alive && target.team === 'enemy') {
      run.kills++;
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

    if (this.fightState === 'fighting') {
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
      this.augments.update(dt);

      for (const p of this.projectiles) p.update(dt, this.units);
      this.projectiles = this.projectiles.filter((p) => p.alive);

      this.checkFightEnd();
    }

    this.render();
  }

  private checkFightEnd(): void {
    if (!this.player.alive) {
      this.endFight(false);
    } else if (this.units.every((u) => u.team === 'player' || !u.alive)) {
      this.endFight(true);
    }
  }

  private endFight(win: boolean): void {
    this.fightState = win ? 'won' : 'lost';
    this.bus.emit('roundEnd', { win });
    this.projectiles = [];

    this.add
      .text(ARENA_X, ARENA_Y - 60, win ? STR.victory : STR.defeat, {
        fontFamily: 'sans-serif',
        fontSize: '110px',
        fontStyle: 'bold',
        color: win ? '#ffd24a' : '#e05555',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(200);

    if (win) {
      if (run.round >= MAX_ROUND) {
        this.time.delayedCall(1400, () => this.scene.start('end', { victory: true }));
        return;
      }
      // Augment pick after each won round R1–R7; offers gate on the round just won
      const offers = rollOffers(run.round);
      run.round++;
      this.time.delayedCall(1300, () => this.scene.start('pick', { offers }));
    } else {
      run.runHP -= lossCost(run.round);
      if (run.runHP <= 0) {
        run.runHP = 0;
        this.time.delayedCall(1400, () => this.scene.start('end', { victory: false }));
        return;
      }
      this.add
        .text(ARENA_X, ARENA_Y + 50, `−${lossCost(run.round)} ${STR.life} · ${STR.retry}`, {
          fontFamily: 'sans-serif',
          fontSize: '36px',
          color: '#ccccdd',
        })
        .setOrigin(0.5)
        .setDepth(200);
      // Same round again, run-HP reduced
      this.time.delayedCall(600, () => {
        this.input.once('pointerdown', () => this.scene.restart());
        this.input.keyboard?.once('keydown', () => this.scene.restart());
      });
    }
  }

  private render(): void {
    for (const u of this.units) u.draw();

    this.projGfx.clear();
    for (const p of this.projectiles) {
      this.projGfx.fillStyle(p.color, 1);
      this.projGfx.fillCircle(p.x, p.y, p.radius);
    }

    this.aimGfx.clear();
    if (this.aimPreview) {
      const px = this.player.x;
      const py = this.player.y;
      this.aimGfx.lineStyle(5, COLORS.playerProj, 0.55);
      this.aimGfx.beginPath();
      this.aimGfx.moveTo(px, py);
      this.aimGfx.lineTo(px + this.aimPreview.x * ABILITIES.Q.range, py + this.aimPreview.y * ABILITIES.Q.range);
      this.aimGfx.strokePath();
    }

    this.joystick.draw();
    for (const b of this.buttons) b.draw();
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
