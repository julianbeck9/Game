import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from '../config';
import { STR } from '../core/strings';
import { newRun } from '../core/run';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    const cx = GAME_W / 2;

    // Crown emblem
    const g = this.add.graphics();
    const cy = GAME_H / 2 - 240;
    g.fillStyle(COLORS.player, 1);
    g.fillTriangle(cx - 90, cy + 50, cx - 30, cy + 50, cx - 60, cy - 40);
    g.fillTriangle(cx - 35, cy + 50, cx + 35, cy + 50, cx, cy - 65);
    g.fillTriangle(cx + 30, cy + 50, cx + 90, cy + 50, cx + 60, cy - 40);
    g.fillRect(cx - 90, cy + 50, 180, 22);

    this.add
      .text(cx, GAME_H / 2 - 60, STR.title, {
        fontFamily: 'sans-serif',
        fontSize: '96px',
        fontStyle: 'bold',
        color: '#ffd24a',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, GAME_H / 2 + 50, STR.runFlavor, {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        fontStyle: 'italic',
        color: '#a8b0c8',
        align: 'center',
        wordWrap: { width: 1100 },
      })
      .setOrigin(0.5);

    const btn = this.add
      .rectangle(cx, GAME_H / 2 + 210, 440, 110, 0x2a2a40, 1)
      .setStrokeStyle(4, COLORS.player, 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, GAME_H / 2 + 210, STR.start, {
        fontFamily: 'sans-serif',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const start = () => {
      newRun();
      this.scene.start('arena');
    };
    btn.on('pointerdown', start);
    this.input.keyboard?.once('keydown', start);
  }
}
