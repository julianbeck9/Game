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

    // Champion select cards: two rows of four
    const cardW = 430;
    const cardH = 330;
    const gapX = 26;
    const gapY = 24;
    const perRow = 4;
    const total = perRow * cardW + (perRow - 1) * gapX;
    const x0 = (GAME_W - total) / 2 + cardW / 2;
    const y0 = 520;
    CHAMPIONS.forEach((c, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      this.makeChampCard(c.id, x0 + col * (cardW + gapX), y0 + row * (cardH + gapY), cardW, cardH, i);
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

  /** Detail overlay: full kit (passive + Q/E/Dash) with a Play button. */
  private showDetail(index: number): void {
    const c = CHAMPIONS[index];
    const cx = GAME_W / 2;
    const layer = this.add.container(0, 0).setDepth(50);
    layer.add(this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, 0x06060c, 0.9));

    const panelW = 1180;
    const panelX = cx - panelW / 2;
    const g = this.add.graphics();
    g.fillStyle(0x11111c, 0.98);
    g.fillRoundedRect(panelX, 120, panelW, 840, 20);
    g.lineStyle(3, COLORS.player, 0.8);
    g.strokeRoundedRect(panelX, 120, panelW, 840, 20);
    layer.add(g);

    const sprite = this.add.image(panelX + 130, 250, `champ:${c.id}`).setScale(3.4);
    layer.add(sprite);
    layer.add(
      this.add
        .text(panelX + 260, 200, c.name, { fontFamily: 'Georgia, serif', fontSize: '54px', fontStyle: 'bold', color: '#ffffff' })
        .setOrigin(0, 0.5),
    );
    layer.add(
      this.add
        .text(panelX + 260, 252, `${c.tagline} · ${c.region} · ${c.ranged ? 'Ranged' : 'Melee'}`, {
          fontFamily: 'sans-serif', fontSize: '26px', fontStyle: 'italic', color: '#9aa3bb',
        })
        .setOrigin(0, 0.5),
    );

    const slots: [string, { name: string; desc: string }, number][] = [
      ['Passive', c.info.passive, 0xcc9bff],
      ['Q', c.info.q, 0xffc36a],
      ['E', c.info.e, 0xffe680],
      ['Dash / Space', c.info.dash, 0x6ab8ff],
    ];
    let yy = 350;
    for (const [key, info, col] of slots) {
      layer.add(
        this.add.text(panelX + 60, yy, `${key} — ${info.name}`, {
          fontFamily: 'sans-serif', fontSize: '30px', fontStyle: 'bold',
          color: '#' + col.toString(16).padStart(6, '0'),
        }),
      );
      const d = this.add.text(panelX + 60, yy + 40, info.desc, {
        fontFamily: 'sans-serif', fontSize: '24px', color: '#d0d6e4',
        wordWrap: { width: panelW - 120 }, lineSpacing: 5,
      });
      layer.add(d);
      yy += 52 + d.height + 22;
    }

    const play = this.add
      .rectangle(cx - 200, 900, 320, 78, 0x1a3a24, 1)
      .setStrokeStyle(3, 0x5fd06a, 1)
      .setInteractive({ useHandCursor: true });
    layer.add(play);
    layer.add(this.add.text(cx - 200, 900, `▶ Play ${c.name}`, { fontFamily: 'sans-serif', fontSize: '32px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    play.on('pointerdown', () => this.startFn(c.id));

    const back = this.add
      .rectangle(cx + 200, 900, 320, 78, 0x2a2a40, 1)
      .setStrokeStyle(3, 0x556, 1)
      .setInteractive({ useHandCursor: true });
    layer.add(back);
    layer.add(this.add.text(cx + 200, 900, 'Back', { fontFamily: 'sans-serif', fontSize: '32px', color: '#c8d0e4' }).setOrigin(0.5));
    back.on('pointerdown', () => layer.destroy());
  }

  private startFn!: (id: string) => void;

  private makeChampCard(id: string, x: number, y: number, w: number, h: number, index: number): void {
    const champ = CHAMPIONS[index];
    const zone = this.add.container(x, y).setDepth(10);

    const bg = this.add.rectangle(0, 0, w, h, 0x14141f, 1).setStrokeStyle(4, COLORS.player, 0.75);
    zone.add(bg);

    // Sprite links, Texte rechts — kompakter für zwei Reihen
    const sprite = this.add.image(-w / 2 + 78, -h / 2 + 92, `champ:${id}`).setScale(1.9);
    zone.add(sprite);
    this.tweens.add({
      targets: sprite,
      y: sprite.y - 6,
      duration: 900 + index * 120,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    zone.add(
      this.add
        .text(-w / 2 + 150, -h / 2 + 52, champ.name, {
          fontFamily: 'Georgia, serif',
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5),
    );
    zone.add(
      this.add
        .text(-w / 2 + 150, -h / 2 + 92, champ.tagline, {
          fontFamily: 'sans-serif',
          fontSize: '19px',
          fontStyle: 'italic',
          color: '#9aa3bb',
        })
        .setOrigin(0, 0.5),
    );
    zone.add(
      this.add
        .text(0, 30, champ.kitLine, {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: '#d8dce8',
          wordWrap: { width: w - 40 },
          align: 'center',
          lineSpacing: 5,
        })
        .setOrigin(0.5),
    );

    const statLine = `${champ.region} · HP ${champ.base.maxHP} · AD ${champ.base.damage} · ${champ.ranged ? 'Ranged' : 'Melee'}`;
    zone.add(
      this.add
        .text(0, h / 2 - 52, statLine, {
          fontFamily: 'sans-serif',
          fontSize: '18px',
          color: '#7a86a5',
        })
        .setOrigin(0.5),
    );
    zone.add(
      this.add
        .text(0, h / 2 - 26, 'Tap to view abilities', {
          fontFamily: 'sans-serif',
          fontSize: '17px',
          color: '#6a9ad0',
        })
        .setOrigin(0.5),
    );

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x1f1f30));
    bg.on('pointerout', () => bg.setFillStyle(0x14141f));
    bg.on('pointerdown', () => this.showDetail(index));
    const key = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'][index];
    if (key) this.input.keyboard?.addKey(key).on('down', () => this.showDetail(index));
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
