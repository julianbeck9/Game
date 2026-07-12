import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from '../config';
import { run, levelOf } from '../core/run';
import type { Player } from '../entities/Player';
import type { Tier } from '../augments/types';
import { drawStatIcon, IconKey } from '../core/icons';

const TIER_COLOR: Record<Tier, number> = {
  silber: COLORS.silver,
  gold: COLORS.gold,
  prisma: COLORS.prisma,
};

/**
 * Pausable overlay: every number and effect in one place — live champion
 * stats, owned augments and items with their full descriptions and levels.
 * Opened from the arena HUD (☰ / TAB), closes back into the paused fight.
 */
export class BuildScene extends Phaser.Scene {
  constructor() {
    super('build');
  }

  create(): void {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x06060c, 0.92);

    this.add
      .text(GAME_W / 2, 54, 'Build & Stats', {
        fontFamily: 'Georgia, serif',
        fontSize: '54px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const arena = this.scene.get('arena') as Phaser.Scene & { player?: Player };
    const p = arena.player;

    // ---- Left: live stats with icons ----
    const sx = 116;
    let sy = 150;
    this.panel(40, 120, 480, 850);
    this.add.text(76, sy, 'Stats', this.h2()).setOrigin(0, 0.5);
    sy += 56;
    if (p) {
      const s = p.stats;
      const rows: [IconKey, string, string][] = [
        ['maxHP', 'Health', `${Math.round(p.hp)} / ${Math.round(p.maxHP)}`],
        ['damage', 'Attack Damage', `${s.get('damage').toFixed(1)}`],
        ['abilityPower', 'Ability Power', `${s.get('abilityPower').toFixed(1)}`],
        ['attackSpeed', 'Attack Speed', `${s.get('attackSpeed').toFixed(2)} / s`],
        ['critChance', 'Crit Chance', `${Math.round(s.get('critChance') * 100)}%`],
        ['armor', 'Armor', `${Math.round(s.get('armor'))}`],
        ['magicResist', 'Magic Resist', `${Math.round(s.get('magicResist'))}`],
        ['abilityHaste', 'Ability Haste', `${Math.round(s.get('abilityHaste'))}`],
        ['abilityDamage', 'Ability Damage', `${Math.round(s.get('abilityDamage') * 100)}%`],
        ['moveSpeed', 'Move Speed', `${Math.round(s.get('moveSpeed'))}`],
        ['lifesteal', 'Life Steal', `${Math.round(s.get('lifesteal') * 100)}%`],
        ['attackRange', 'Range', `${Math.round(s.get('attackRange'))}`],
        ['gold', 'Gold', `${run.gold}`],
      ];
      const ig = this.add.graphics();
      for (const [icon, label, value] of rows) {
        drawStatIcon(ig, icon, 76, sy, 26);
        this.add
          .text(sx, sy, label, { fontFamily: 'sans-serif', fontSize: '26px', color: '#8a94b0' })
          .setOrigin(0, 0.5);
        this.add
          .text(492, sy, value, {
            fontFamily: 'sans-serif',
            fontSize: '27px',
            fontStyle: 'bold',
            color: '#e8ecf8',
          })
          .setOrigin(1, 0.5);
        sy += 52;
      }
    }

    // ---- Middle: augments ----
    this.panel(560, 120, 660, 850);
    this.add.text(600, 150, `Augments (${run.augments.length} / 6)`, this.h2()).setOrigin(0, 0.5);
    let ay = 208;
    for (const a of run.augments) {
      const lvl = levelOf(a.id);
      const color = TIER_COLOR[a.tier];
      this.add
        .text(600, ay, `${a.name} ${'★'.repeat(lvl)}`, {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          fontStyle: 'bold',
          color: '#' + color.toString(16).padStart(6, '0'),
        })
        .setOrigin(0, 0);
      const desc = this.add.text(600, ay + 34, a.description, {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#b8c0d4',
        wordWrap: { width: 580 },
        lineSpacing: 4,
      });
      ay += 44 + desc.height + 14;
      if (ay > 920) break;
    }
    if (run.augments.length === 0) {
      this.add.text(600, 210, '— none yet —', { fontFamily: 'sans-serif', fontSize: '24px', color: '#5a6480' });
    }

    // ---- Right: items ----
    this.panel(1260, 120, 620, 850);
    this.add.text(1300, 150, `Items (${run.items.length} / 6)`, this.h2()).setOrigin(0, 0.5);
    let iy = 208;
    for (const it of run.items) {
      const lvl = levelOf(it.id);
      this.add
        .text(1300, iy, `${it.glyph} ${it.name} ${'★'.repeat(lvl)}`, {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          fontStyle: 'bold',
          color: '#' + it.color.toString(16).padStart(6, '0'),
        })
        .setOrigin(0, 0);
      const desc = this.add.text(1300, iy + 34, it.description, {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#b8c0d4',
        wordWrap: { width: 540 },
        lineSpacing: 4,
      });
      iy += 44 + desc.height + 14;
      if (iy > 920) break;
    }
    if (run.items.length === 0) {
      this.add.text(1300, 210, '— none yet —', { fontFamily: 'sans-serif', fontSize: '24px', color: '#5a6480' });
    }

    // ---- Close ----
    const btn = this.add
      .rectangle(GAME_W / 2, GAME_H - 52, 360, 76, 0x2a2a40, 1)
      .setStrokeStyle(3, 0xa8d8ff, 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(GAME_W / 2, GAME_H - 52, 'Back to Battle', {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const close = () => {
      this.scene.stop();
      this.scene.resume('arena');
    };
    btn.on('pointerdown', close);
    this.input.keyboard?.addKey('TAB').on('down', close);
    this.input.keyboard?.addKey('ESC').on('down', close);
  }

  private panel(x: number, y: number, w: number, h: number): void {
    const g = this.add.graphics();
    g.fillStyle(0x11111c, 0.95);
    g.fillRoundedRect(x, y, w, h, 16);
    g.lineStyle(2, 0x3a3a55, 0.9);
    g.strokeRoundedRect(x, y, w, h, 16);
  }

  private h2(): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: 'Georgia, serif', fontSize: '34px', fontStyle: 'bold', color: '#ffffff' };
  }
}
