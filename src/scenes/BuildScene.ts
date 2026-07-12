import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from '../config';
import { run } from '../core/run';
import type { Player } from '../entities/Player';
import type { Tier } from '../augments/types';
import { drawStatIcon, IconKey } from '../core/icons';
import { drawItemIcon } from '../items/icons';
import { previewStats } from '../core/preview';
import { championById } from '../champions/registry';

const TIER_COLOR: Record<Tier, number> = {
  silber: COLORS.silver,
  gold: COLORS.gold,
  prisma: COLORS.prisma,
};

interface BuildSceneData {
  /** Scene that opened this overlay ('arena' or 'shop'); resumed on close. */
  from?: string;
}

/**
 * Pausable overlay: every number and effect in one place — champion stats,
 * owned augments and items with full descriptions. Opened from the arena HUD
 * (☰ / TAB) over a paused fight, or from the shop (uses a static preview).
 */
export class BuildScene extends Phaser.Scene {
  private from = 'arena';

  constructor() {
    super('build');
  }

  create(data: BuildSceneData): void {
    this.from = data?.from ?? 'arena';
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
    const livePlayer = this.from === 'arena' ? arena.player : undefined;
    const s = livePlayer ? livePlayer.stats : previewStats();
    const hp = livePlayer ? livePlayer.hp : s.get('maxHP');

    // ---- Left: live stats with icons ----
    const sx = 116;
    let sy = 138;
    this.panel(40, 108, 480, 640);
    this.add.text(76, sy, 'Stats', this.h2()).setOrigin(0, 0.5);
    sy += 48;
    {
      const amp = Math.round(s.get('abilityDamage') * 100);
      const rows: ([IconKey, string, string] | null)[] = [
        ['maxHP', 'Health', `${Math.round(hp)} / ${Math.round(s.get('maxHP'))}`],
        ['damage', 'Attack Damage', `${s.get('damage').toFixed(1)}`],
        ['abilityPower', 'Ability Power', `${s.get('abilityPower').toFixed(1)}`],
        ['attackSpeed', 'Attack Speed', `${s.get('attackSpeed').toFixed(2)} / s`],
        ['critChance', 'Crit Chance', `${Math.round(s.get('critChance') * 100)}%`],
        ['armor', 'Armor', `${Math.round(s.get('armor'))}`],
        ['magicResist', 'Magic Resist', `${Math.round(s.get('magicResist'))}`],
        ['abilityHaste', 'Ability Haste', `${Math.round(s.get('abilityHaste'))}`],
        // Ability Amp is a global spell multiplier — only worth showing when it's not the 100% default
        amp !== 100 ? (['abilityDamage', 'Ability Amp', `${amp}%`] as [IconKey, string, string]) : null,
        ['moveSpeed', 'Move Speed', `${Math.round(s.get('moveSpeed'))}`],
        ['lifesteal', 'Life Steal', `${Math.round(s.get('lifesteal') * 100)}%`],
        ['attackRange', 'Range', `${Math.round(s.get('attackRange'))}`],
        ['gold', 'Gold', `${run.gold}`],
      ];
      const ig = this.add.graphics();
      for (const row of rows) {
        if (!row) continue;
        const [icon, label, value] = row;
        drawStatIcon(ig, icon, 76, sy, 26);
        this.add
          .text(sx, sy, label, { fontFamily: 'sans-serif', fontSize: '26px', color: '#8a94b0' })
          .setOrigin(0, 0.5);
        this.add
          .text(492, sy, value, {
            fontFamily: 'sans-serif',
            fontSize: '26px',
            fontStyle: 'bold',
            color: '#e8ecf8',
          })
          .setOrigin(1, 0.5);
        sy += 42;
      }
    }

    // ---- Middle: augments ----
    this.panel(560, 108, 660, 640);
    this.add.text(600, 138, `Augments (${run.augments.length} / 6)`, this.h2()).setOrigin(0, 0.5);
    let ay = 190;
    for (const a of run.augments) {
      const color = TIER_COLOR[a.tier];
      this.add
        .text(600, ay, a.name, {
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
      if (ay > 720) break;
    }
    if (run.augments.length === 0) {
      this.add.text(600, 210, '— none yet —', { fontFamily: 'sans-serif', fontSize: '24px', color: '#5a6480' });
    }

    // ---- Right: items ----
    this.panel(1260, 108, 620, 640);
    this.add.text(1300, 138, `Items (${run.items.length} / 6)`, this.h2()).setOrigin(0, 0.5);
    let iy = 190;
    const iconG = this.add.graphics();
    for (const it of run.items) {
      drawItemIcon(iconG, it.icon ?? 'orb', 1316, iy + 12, 40, it.color);
      this.add
        .text(1350, iy, it.name, {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          fontStyle: 'bold',
          color: '#' + it.color.toString(16).padStart(6, '0'),
        })
        .setOrigin(0, 0);
      const desc = this.add.text(1350, iy + 34, it.description, {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#b8c0d4',
        wordWrap: { width: 500 },
        lineSpacing: 4,
      });
      iy += 50 + desc.height + 14;
      if (iy > 720) break;
    }
    if (run.items.length === 0) {
      this.add.text(1300, 210, '— none yet —', { fontFamily: 'sans-serif', fontSize: '24px', color: '#5a6480' });
    }

    // ---- Bottom: champion kit (view your abilities during the round) ----
    const champ = championById(run.champion);
    this.panel(40, 764, GAME_W - 80, 232);
    this.add.text(76, 792, `${champ.name} — Abilities`, this.h2()).setOrigin(0, 0.5);
    const slots: [string, { name: string; desc: string }, number][] = [
      ['Passive', champ.info.passive, 0xcc9bff],
      ['Q', champ.info.q, 0xffc36a],
      ['E', champ.info.e, 0xffe680],
      ['Space', champ.info.dash, 0x6ab8ff],
    ];
    const colW = (GAME_W - 120) / 4;
    slots.forEach(([key, info, col], i) => {
      const cx = 76 + i * colW;
      this.add.text(cx, 832, `${key} · ${info.name}`, {
        fontFamily: 'sans-serif', fontSize: '23px', fontStyle: 'bold',
        color: '#' + col.toString(16).padStart(6, '0'), wordWrap: { width: colW - 24 },
      });
      this.add.text(cx, 872, info.desc, {
        fontFamily: 'sans-serif', fontSize: '19px', color: '#c8d0e0',
        wordWrap: { width: colW - 24 }, lineSpacing: 3,
      });
    });

    // ---- Close ----
    const btn = this.add
      .rectangle(GAME_W / 2, GAME_H - 40, 360, 62, 0x2a2a40, 1)
      .setStrokeStyle(3, 0xa8d8ff, 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(GAME_W / 2, GAME_H - 40, this.from === 'shop' ? 'Back to Shop' : 'Back to Battle', {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const close = () => {
      this.scene.stop();
      this.scene.resume(this.from);
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
