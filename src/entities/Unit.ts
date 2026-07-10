import Phaser from 'phaser';
import { StatBlock } from '../core/stats';
import { COLORS } from '../config';

export type Team = 'player' | 'enemy';

export abstract class Unit {
  x: number;
  y: number;
  radius = 26;
  team: Team;
  hp: number;
  alive = true;
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

  /** Raw HP change; damage routing/events live in the combat core, not here. */
  applyDamage(amount: number): void {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  heal(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHP, this.hp + amount);
  }

  abstract update(time: number, dt: number): void;

  draw(): void {
    const g = this.gfx;
    g.clear();
    if (!this.alive) return;
    this.drawBody(g);
    this.drawHpBar(g);
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
