import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from '../config';
import { STR } from '../core/strings';
import { run } from '../core/run';
import { sfx } from '../core/sfx';
import { crown, spawnEmber, updateAndDrawEmbers, Ember } from '../core/draw';

export interface EndSceneData {
  victory: boolean;
}

/** Run over: victory or defeat, with a run summary. */
export class EndScene extends Phaser.Scene {
  private embers: Ember[] = [];
  private emberGfx!: Phaser.GameObjects.Graphics;
  private victory = false;

  constructor() {
    super('end');
  }

  create(data: EndSceneData): void {
    this.embers = [];
    const cx = GAME_W / 2;
    const v = (this.victory = data.victory);
    if (v) sfx.victory();
    else sfx.defeat();

    this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, 0x06060c, 1);
    this.emberGfx = this.add.graphics().setDepth(5);

    if (v) {
      const g = this.add.graphics().setDepth(9);
      crown(g, cx, 96, 130, COLORS.player, 1);
    }

    this.add
      .text(cx, 168, v ? STR.crownIsYours : STR.defeat, {
        fontFamily: 'Georgia, serif',
        fontSize: '92px',
        fontStyle: 'bold',
        color: v ? '#ffd24a' : '#e05555',
        stroke: v ? '#3a2a08' : '#2a0808',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setShadow(0, 6, '#000000', 16, false, true);

    this.add
      .text(cx, 262, v ? STR.victoryFlavor : STR.defeatFlavor, {
        fontFamily: 'Georgia, serif',
        fontSize: '30px',
        fontStyle: 'italic',
        color: '#a8b0c8',
        align: 'center',
        wordWrap: { width: 1200 },
      })
      .setOrigin(0.5)
      .setDepth(10);

    // Stats panel
    const panel = this.add.graphics().setDepth(9);
    const pw = 760;
    const ph = 350;
    const py = GAME_H / 2 + 40;
    panel.fillStyle(0x11111c, 1);
    panel.fillRoundedRect(cx - pw / 2, py - ph / 2, pw, ph, 18);
    panel.lineStyle(3, v ? COLORS.gold : 0x553344, 0.9);
    panel.strokeRoundedRect(cx - pw / 2, py - ph / 2, pw, ph, 18);

    const rows: [string, string][] = [
      ['Runde erreicht', `${run.round} / 12`],
      ['Gesamtschaden', `${Math.round(run.totalDamageDealt)}`],
      ['Größter Treffer', `${Math.round(run.maxHit)}`],
      ['Tötungen', `${run.kills}`],
      ['Gold verdient', `${run.goldEarned}`],
    ];
    rows.forEach(([label, value], i) => {
      const ry = py - ph / 2 + 44 + i * 62;
      this.add
        .text(cx - pw / 2 + 60, ry, label, { fontFamily: 'sans-serif', fontSize: '30px', color: '#8a94b0' })
        .setOrigin(0, 0.5)
        .setDepth(10);
      this.add
        .text(cx + pw / 2 - 60, ry, value, {
          fontFamily: 'sans-serif',
          fontSize: '32px',
          fontStyle: 'bold',
          color: '#e8ecf8',
        })
        .setOrigin(1, 0.5)
        .setDepth(10);
    });

    // Augment chips
    const augs = run.augments.length ? run.augments.map((a) => a.name) : ['— keine Augmente —'];
    this.add
      .text(cx, py + ph / 2 + 46, augs.join('  ·  '), {
        fontFamily: 'sans-serif',
        fontSize: '27px',
        color: '#b8a86a',
        align: 'center',
        wordWrap: { width: GAME_W - 300 },
      })
      .setOrigin(0.5)
      .setDepth(10);

    const btn = this.add
      .rectangle(cx, GAME_H - 92, 460, 100, 0x2a2a40, 1)
      .setStrokeStyle(4, v ? COLORS.player : COLORS.enemy, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    this.add
      .text(cx, GAME_H - 92, STR.retry, {
        fontFamily: 'sans-serif',
        fontSize: '38px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(11);

    const again = () => this.scene.start('menu');
    btn.on('pointerdown', again);
    this.time.delayedCall(800, () => this.input.keyboard?.once('keydown', again));
  }

  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.emberGfx.clear();
    if (this.victory && Math.random() < dt * 10) {
      this.embers.push(
        spawnEmber(time, GAME_W / 2 + (Math.random() - 0.5) * 1400, GAME_H - 40, COLORS.gold),
      );
    }
    this.embers = updateAndDrawEmbers(this.emberGfx, this.embers, time, dt);
  }
}
