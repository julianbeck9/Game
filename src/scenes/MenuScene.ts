import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from '../config';
import { STR } from '../core/strings';
import { newRun } from '../core/run';
import { initAudio } from '../core/sfx';
import { crown, shade, spawnEmber, updateAndDrawEmbers, Ember } from '../core/draw';

export class MenuScene extends Phaser.Scene {
  private embers: Ember[] = [];
  private emberGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('menu');
  }

  create(): void {
    this.embers = [];
    const cx = GAME_W / 2;

    // Faint arena silhouette in the background — where the story will happen
    const bg = this.add.graphics();
    bg.fillStyle(0x12121e, 0.6);
    bg.fillCircle(cx, GAME_H / 2, 460);
    bg.lineStyle(3, 0x8a6a2a, 0.25);
    bg.strokeCircle(cx, GAME_H / 2, 460);
    bg.lineStyle(1, 0x3a3a55, 0.4);
    bg.strokeCircle(cx, GAME_H / 2, 300);

    this.emberGfx = this.add.graphics().setDepth(5);

    // Crown emblem with shading
    const g = this.add.graphics().setDepth(10);
    const cy = GAME_H / 2 - 250;
    crown(g, cx + 4, cy + 44, 190, 0x7a5a10, 1); // shadow pass
    crown(g, cx, cy + 40, 184, COLORS.player, 1);
    crown(g, cx - 3, cy + 37, 176, shade(COLORS.player, 0.3), 0.5);
    // Jewels on the band
    for (const off of [-55, 0, 55]) {
      g.fillStyle(0xe03c3c, 1);
      g.fillCircle(cx + off, cy + 58, 7);
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(cx + off - 2, cy + 56, 2.5);
    }

    this.add
      .text(cx, GAME_H / 2 - 55, STR.title, {
        fontFamily: 'Georgia, serif',
        fontSize: '104px',
        fontStyle: 'bold',
        color: '#ffd24a',
        stroke: '#3a2a08',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setShadow(0, 8, '#000000', 18, false, true);

    this.add
      .text(cx, GAME_H / 2 + 55, STR.runFlavor, {
        fontFamily: 'Georgia, serif',
        fontSize: '32px',
        fontStyle: 'italic',
        color: '#a8b0c8',
        align: 'center',
        wordWrap: { width: 1100 },
      })
      .setOrigin(0.5)
      .setDepth(10);

    const btn = this.add
      .rectangle(cx, GAME_H / 2 + 220, 460, 112, 0x2a2210, 1)
      .setStrokeStyle(4, COLORS.player, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    const btnText = this.add
      .text(cx, GAME_H / 2 + 220, STR.start, {
        fontFamily: 'sans-serif',
        fontSize: '42px',
        fontStyle: 'bold',
        color: '#ffe9a8',
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.tweens.add({
      targets: [btn, btnText],
      scaleX: 1.045,
      scaleY: 1.045,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(cx, GAME_H - 46, '8 Runden · 30 Augmente · Eine Krone', {
        fontFamily: 'sans-serif',
        fontSize: '26px',
        color: '#5a6480',
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setDepth(10);

    const start = () => {
      initAudio();
      newRun();
      this.scene.start('arena');
    };
    btn.on('pointerdown', start);
    this.input.keyboard?.once('keydown', start);
  }

  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.emberGfx.clear();
    if (Math.random() < dt * 6) {
      this.embers.push(
        spawnEmber(time, GAME_W / 2 + (Math.random() - 0.5) * 900, GAME_H - 60, COLORS.torch),
      );
    }
    this.embers = updateAndDrawEmbers(this.emberGfx, this.embers, time, dt);
  }
}
