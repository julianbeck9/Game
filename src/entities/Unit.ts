import Phaser from 'phaser';
import { StatBlock } from '../core/stats';
import { COLORS, UNIT_RADIUS } from '../config';
import { clampToArena, walkStep } from '../core/geometry';

export type Team = 'player' | 'enemy';

export abstract class Unit {
  x: number;
  y: number;
  radius = UNIT_RADIUS;
  team: Team;
  hp: number;
  shield = 0;
  alive = true;
  /** Stacking damage-over-time (burn system). Ticked by the combat core. */
  burns: { dps: number; until: number }[] = [];
  /** Fractional DoT accumulator so ticks apply whole damage points. */
  dotAcc = 0;
  /** Juice: white flash on recently-hit units. */
  hitFlashUntil = 0;
  /** Juice: accumulated healing waiting to be shown as a floating number. */
  healDisplayAcc = 0;
  /** Crowd control: while now < ctrlUntil the unit is stunned (bots can't act). */
  ctrlUntil = 0;
  stats: StatBlock;
  gfx: Phaser.GameObjects.Graphics;

  constructor(
    protected scene: Phaser.Scene,
    x: number,
    y: number,
    team: Team,
    stats: StatBlock,
  ) {
    this.x = x;
    this.y = y;
    this.team = team;
    this.stats = stats;
    this.hp = stats.get('maxHP');
    this.gfx = scene.add.graphics().setDepth(10);
  }

  /** Set the frame a death is first seen; 0 while alive. See `drawDeath`. */
  private diedAt = 0;
  /** Trailing health readout for the damage-lag bar. See `drawHpBar`. */
  private hpLag = 1;

  get maxHP(): number {
    return this.stats.get('maxHP');
  }

  get hpPct(): number {
    return this.hp / this.maxHP;
  }

  /** Execute-resistance etc. (Usurpator overrides). */
  get isBoss(): boolean {
    return false;
  }

  /** Raw HP change; damage routing/events live in the combat core, not here. */
  applyDamage(amount: number): void {
    if (!this.alive) return;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
    }
    if (amount <= 0) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  addShield(amount: number): void {
    if (!this.alive || amount <= 0) return;
    this.shield += amount;
  }

  heal(amount: number): void {
    if (!this.alive) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHP, this.hp + amount);
    this.healDisplayAcc += this.hp - before;
  }

  /**
   * Displaced movement with pillar/arena resolution. By default it also blocks
   * impassable terrain (water/lava), solid walls, and painted collision.
   * Dashes/leaps (overTerrain=true) phase through ALL of it — the only thing
   * that still stops them is the arena boundary.
   */
  moveBy(dx: number, dy: number, overTerrain = false): void {
    const r = this.radius;
    // Dashes phase through all collision; only the arena bounds hold them in.
    if (overTerrain) {
      const p = clampToArena(this.x + dx, this.y + dy, r);
      this.x = p.x;
      this.y = p.y;
      return;
    }
    // Substepping, collider order and wall sliding all live in walkStep so they
    // stay unit-testable without a Phaser scene (see test/core/geometry.test.ts).
    const p = walkStep(this.x, this.y, r, dx, dy);
    this.x = p.x;
    this.y = p.y;
  }

  abstract update(time: number, dt: number): void;

  /** Play a hit reaction on the champion sprite (overridden by Player/Enemy). */
  notifyHurt(): void {}

  draw(): void {
    const g = this.gfx;
    g.clear();
    if (!this.alive) {
      // Stamped on first observation rather than in applyDamage: units are
      // also killed directly elsewhere (the leash despawn sets alive = false
      // without routing through damage) and would otherwise skip the collapse.
      if (this.diedAt === 0) this.diedAt = this.scene.time.now;
      this.drawDeath(g, this.scene.time.now - this.diedAt);
      return;
    }
    this.diedAt = 0;
    g.setAlpha(1);
    // Ground shadow + team ring. The maps are high-detail painted art and the
    // champions are ~28px on top of it, which made units genuinely hard to
    // FIND during a fight — the first real playtest lost track of the player
    // repeatedly (B3). A dark pool plus a team-coloured contact ring separates
    // the cast from the background at any size, without touching UNIT_SCALE and
    // therefore without changing a single hitbox.
    const fy = this.y + this.radius * 0.72;
    const fw = this.radius * 2.1;
    const fh = this.radius * 0.9;
    // Soft-edged: three nested pools rather than one flat disc. A hard rim was
    // fine when the whole arena was fitted into the window and the shadow was
    // a dozen pixels wide; magnified by the camera zoom it read as a sticker
    // under the character instead of as contact with the ground.
    for (const [k, a] of [
      [1.34, 0.1],
      [1.15, 0.15],
      [1.0, 0.26],
    ] as const) {
      g.fillStyle(0x000000, a);
      g.fillEllipse(this.x, fy, fw * k, fh * k);
    }
    // Dark keyline under the team colour, because the maps span sand, snow and
    // stone: a gold ring alone disappears on Shurima and a red one on the Blood
    // Pit. The black underlay makes the marker read on any of them.
    g.lineStyle(5, 0x000000, 0.55);
    g.strokeEllipse(this.x, fy, fw, fh);
    const isPlayer = this.team === 'player';
    g.lineStyle(isPlayer ? 3 : 2, isPlayer ? 0xffffff : COLORS.enemy, isPlayer ? 0.95 : 0.8);
    g.strokeEllipse(this.x, fy, fw, fh);
    if (isPlayer) {
      // Second, tighter gold ring: "that one is me" at a glance in a melee.
      g.lineStyle(2, COLORS.player, 0.9);
      g.strokeEllipse(this.x, fy, fw * 0.72, fh * 0.72);
    }
    this.drawBody(g);
    if (this.scene.time.now < this.hitFlashUntil) {
      g.fillStyle(0xffffff, 0.55);
      g.fillCircle(this.x, this.y, this.radius);
    }
    if (this.shield > 0) {
      g.lineStyle(4, COLORS.shield, 0.8);
      g.strokeCircle(this.x, this.y, this.radius + 7);
    }
    this.drawHpBar(g);
    // Burn stack pips
    if (this.burns.length > 0) {
      g.fillStyle(COLORS.burn, 1);
      const n = Math.min(this.burns.length, 10);
      for (let i = 0; i < n; i++) {
        g.fillCircle(this.x - (n - 1) * 6 + i * 12, this.y - this.radius - 30, 4);
      }
    }
  }

  protected abstract drawBody(g: Phaser.GameObjects.Graphics): void;

  /**
   * How long a corpse takes to go. Short on purpose: a body that lingers reads
   * as a bug in a fight this dense, and the kill's own particle burst is
   * already covering the moment.
   */
  private static readonly DEATH_MS = 360;

  /**
   * Sink and fade.
   *
   * Rival champions have an `AnimatedChampion` sprite that collapses on its
   * own, but ordinary enemies are Graphics-drawn and their `draw()` simply
   * returned once `alive` went false — so they blinked out of existence, and
   * only the particle burst covered the gap. Every unit now settles into the
   * floor while the shadow spreads and thins, which is what a body does.
   *
   * `drawBody` is reused rather than reimplemented, offset downward and drawn
   * through a fading Graphics alpha, so each unit type keeps its own look on
   * the way out instead of collapsing into a generic disc.
   */
  protected drawDeath(g: Phaser.GameObjects.Graphics, age: number): void {
    if (age >= Unit.DEATH_MS) {
      g.setAlpha(1);
      return;
    }
    const p = Phaser.Math.Clamp(age / Unit.DEATH_MS, 0, 1);
    const e = 1 - (1 - p) * (1 - p);

    // Alpha is SET here and deliberately not restored at the end of the call.
    // A Graphics' alpha is a property of the whole object read at render time,
    // not per-command state baked into the buffer: an earlier version of this
    // faded, drew, then reset to 1 before returning, so the only value that
    // ever reached the screen was 1 and the fade was invisible. The alive path
    // in `draw` puts it back to 1.
    g.setAlpha(1 - e);

    // The shadow widens and thins as the body settles onto it.
    const fy = this.y + this.radius * 0.72;
    const fw = this.radius * 2.1 * (1 + 0.5 * e);
    const fh = this.radius * 0.9 * (1 + 0.3 * e);
    g.fillStyle(0x000000, 0.3 * (1 - 0.5 * e));
    g.fillEllipse(this.x, fy, fw, fh);

    const oy = this.y;
    this.y += this.radius * 0.45 * e;
    this.drawBody(g);
    this.y = oy;
  }

  protected drawHpBar(g: Phaser.GameObjects.Graphics): void {
    const pct = Phaser.Math.Clamp(this.hpPct, 0, 1);
    const w = this.radius * 2.4;
    const h = 7;
    const x = this.x - w / 2;
    const y = this.y - this.radius - 18;
    const r = h / 2;

    // Damage lag: a pale ghost bar that drains toward the real value over a
    // few frames. Without it a hit only moves an edge, and at any speed the
    // eye cannot tell a scratch from a third of the bar. Healing snaps up
    // instead of lagging — a ghost bar running the other way reads as damage.
    const dt = Math.min(50, this.scene.game.loop.delta) / 1000;
    if (this.hpLag < pct) this.hpLag = pct;
    else this.hpLag += (pct - this.hpLag) * (1 - Math.exp(-5 * dt));

    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, r + 2);
    g.fillStyle(COLORS.hpBack, 0.9);
    g.fillRoundedRect(x, y, w, h, r);
    if (this.hpLag > pct + 0.002) {
      g.fillStyle(0xffe9a8, 0.85);
      g.fillRoundedRect(x, y, w * this.hpLag, h, r);
    }
    g.fillStyle(this.team === 'player' ? COLORS.hpGreen : COLORS.hpRed, 1);
    g.fillRoundedRect(x, y, w * pct, h, r);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
