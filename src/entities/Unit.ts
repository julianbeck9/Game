import Phaser from 'phaser';
import { StatBlock } from '../core/stats';
import { COLORS } from '../config';
import { clampToArena, resolvePillars } from '../core/geometry';

export type Team = 'player' | 'enemy';

export abstract class Unit {
  x: number;
  y: number;
  radius = 26;
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

  /** Displaced movement (dashes, knockbacks) with pillar/arena resolution. */
  moveBy(dx: number, dy: number): void {
    const p1 = resolvePillars(this.x + dx, this.y + dy, this.radius);
    const p2 = clampToArena(p1.x, p1.y, this.radius);
    this.x = p2.x;
    this.y = p2.y;
  }

  abstract update(time: number, dt: number): void;

  draw(): void {
    const g = this.gfx;
    g.clear();
    if (!this.alive) return;
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

  protected drawHpBar(g: Phaser.GameObjects.Graphics): void {
    const w = this.radius * 2.4;
    const h = 7;
    const x = this.x - w / 2;
    const y = this.y - this.radius - 18;
    g.fillStyle(COLORS.hpBack, 0.9);
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(this.team === 'player' ? COLORS.hpGreen : COLORS.hpRed, 1);
    g.fillRect(x, y, w * Phaser.Math.Clamp(this.hpPct, 0, 1), h);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
