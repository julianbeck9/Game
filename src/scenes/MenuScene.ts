import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from '../config';
import { STR } from '../core/strings';
import { newRun, run } from '../core/run';
import { initAudio } from '../core/sfx';
import { crown, shade, spawnEmber, updateAndDrawEmbers, Ember } from '../core/draw';
import { CHAMPIONS, ensureChampionTextures } from '../champions/registry';
import { addFullscreenButton } from '../core/fullscreen';

export class MenuScene extends Phaser.Scene {
  private embers: Ember[] = [];
  private emberGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('menu');
  }

  create(): void {
    this.embers = [];
    ensureChampionTextures(this);
    const cx = GAME_W / 2;

    // Faint arena silhouette in the background — where the story will happen
    const bg = this.add.graphics();
    bg.fillStyle(0x12121e, 0.6);
    bg.fillCircle(cx, GAME_H / 2, 470);
    bg.lineStyle(3, 0x8a6a2a, 0.25);
    bg.strokeCircle(cx, GAME_H / 2, 470);

    this.emberGfx = this.add.graphics().setDepth(5);

    // Crown emblem with shading
    const g = this.add.graphics().setDepth(10);
    const cy = 118;
    crown(g, cx + 3, cy + 32, 130, 0x7a5a10, 1);
    crown(g, cx, cy + 29, 126, COLORS.player, 1);
    crown(g, cx - 2, cy + 27, 120, shade(COLORS.player, 0.3), 0.5);
    for (const off of [-38, 0, 38]) {
      g.fillStyle(0xe03c3c, 1);
      g.fillCircle(cx + off, cy + 41, 5);
    }

    this.add
      .text(cx, 218, STR.title, {
        fontFamily: 'Georgia, serif',
        fontSize: '84px',
        fontStyle: 'bold',
        color: '#ffd24a',
        stroke: '#3a2a08',
        strokeThickness: 9,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setShadow(0, 7, '#000000', 16, false, true);

    this.add
      .text(cx, 300, STR.chooseChampion, {
        fontFamily: 'Georgia, serif',
        fontSize: '32px',
        fontStyle: 'italic',
        color: '#a8b0c8',
      })
      .setOrigin(0.5)
      .setDepth(10);

    // Champion select cards (compact row)
    const cardW = 348;
    const cardH = 500;
    const gap = 22;
    const total = CHAMPIONS.length * cardW + (CHAMPIONS.length - 1) * gap;
    const x0 = (GAME_W - total) / 2 + cardW / 2;
    const y = GAME_H / 2 + 170;
    CHAMPIONS.forEach((c, i) => {
      this.makeChampCard(c.id, x0 + i * (cardW + gap), y, cardW, cardH, i);
    });

    addFullscreenButton(this, GAME_W - 56, 56);

    const start = (championId: string) => {
      initAudio();
      newRun();
      run.champion = championId;
      this.scene.start('arena');
    };
    this.startFn = start;
    this.input.keyboard?.once('keydown-ENTER', () => start('koenig'));
  }

  private startFn!: (id: string) => void;

  private makeChampCard(id: string, x: number, y: number, w: number, h: number, index: number): void {
    const champ = CHAMPIONS[index];
    const zone = this.add.container(x, y).setDepth(10);

    const bg = this.add.rectangle(0, 0, w, h, 0x14141f, 1).setStrokeStyle(4, COLORS.player, 0.75);
    zone.add(bg);

    const sprite = this.add.image(0, -h / 2 + 130, `champ:${id}`).setScale(2.9);
    zone.add(sprite);
    this.tweens.add({
      targets: sprite,
      y: sprite.y - 8,
      duration: 900 + index * 120,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    zone.add(
      this.add
        .text(0, -h / 2 + 232, champ.name, {
          fontFamily: 'Georgia, serif',
          fontSize: '38px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );
    zone.add(
      this.add
        .text(0, -h / 2 + 276, champ.tagline, {
          fontFamily: 'sans-serif',
          fontSize: '21px',
          fontStyle: 'italic',
          color: '#9aa3bb',
        })
        .setOrigin(0.5),
    );
    zone.add(
      this.add
        .text(0, -h / 2 + 356, champ.kitLine, {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: '#d8dce8',
          wordWrap: { width: w - 44 },
          align: 'center',
          lineSpacing: 7,
        })
        .setOrigin(0.5),
    );

    const statLine = `LP ${champ.base.maxHP} · AD ${champ.base.damage} · ${champ.ranged ? 'Fernkampf' : 'Nahkampf'}`;
    zone.add(
      this.add
        .text(0, h / 2 - 38, statLine, {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: '#7a86a5',
        })
        .setOrigin(0.5),
    );

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x1f1f30));
    bg.on('pointerout', () => bg.setFillStyle(0x14141f));
    bg.on('pointerdown', () => this.startFn(id));
    this.input.keyboard?.addKey(['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][index]).on('down', () => this.startFn(id));
  }

  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.emberGfx.clear();
    if (Math.random() < dt * 6) {
      this.embers.push(
        spawnEmber(time, GAME_W / 2 + (Math.random() - 0.5) * 1200, GAME_H - 60, COLORS.torch),
      );
    }
    this.embers = updateAndDrawEmbers(this.emberGfx, this.embers, time, dt);
  }
}
