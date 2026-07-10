import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from '../config';
import { STR } from '../core/strings';
import { run } from '../core/run';
import { sfx } from '../core/sfx';

export interface EndSceneData {
  victory: boolean;
}

/** Run over: victory or defeat, with a run summary. */
export class EndScene extends Phaser.Scene {
  constructor() {
    super('end');
  }

  create(data: EndSceneData): void {
    const cx = GAME_W / 2;
    const v = data.victory;
    if (v) sfx.victory();
    else sfx.defeat();

    this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, 0x06060c, 1);

    this.add
      .text(cx, 150, v ? STR.crownIsYours : STR.defeat, {
        fontFamily: 'sans-serif',
        fontSize: '92px',
        fontStyle: 'bold',
        color: v ? '#ffd24a' : '#e05555',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 250, v ? STR.victoryFlavor : STR.defeatFlavor, {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        fontStyle: 'italic',
        color: '#a8b0c8',
        align: 'center',
        wordWrap: { width: 1200 },
      })
      .setOrigin(0.5);

    // Run summary
    const lines = [
      `Runden geschafft: ${v ? 8 : run.round - 1} / 8`,
      `Gesamtschaden: ${Math.round(run.totalDamageDealt)}`,
      `Tötungen: ${run.kills}`,
      '',
      'Augmente:',
      run.augments.length ? run.augments.map((a) => `• ${a.name}`).join('\n') : '— keine —',
    ];
    this.add
      .text(cx, GAME_H / 2 + 80, lines.join('\n'), {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        color: '#d8dce8',
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5);

    const btn = this.add
      .rectangle(cx, GAME_H - 110, 460, 100, 0x2a2a40, 1)
      .setStrokeStyle(4, v ? COLORS.player : COLORS.enemy, 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, GAME_H - 110, STR.retry, {
        fontFamily: 'sans-serif',
        fontSize: '38px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const again = () => this.scene.start('menu');
    btn.on('pointerdown', again);
    this.time.delayedCall(800, () => this.input.keyboard?.once('keydown', again));
  }
}
