import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from '../config';
import { STR } from '../core/strings';
import { newRun, run } from '../core/run';
import { initAudio } from '../core/sfx';
import { crown, shade, spawnEmber, updateAndDrawEmbers, Ember } from '../core/draw';
import { CHAMPIONS, CHAMP_IMAGE_KEYS, ensureChampionTextures } from '../champions/registry';
import { addFullscreenButton } from '../core/fullscreen';
import { MAP_IMAGE_KEYS } from '../core/maps';
import { isAdmin } from '../core/admin';

export class MenuScene extends Phaser.Scene {
  private embers: Ember[] = [];
  private emberGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('menu');
  }

  preload(): void {
    // Region background art — loaded once up front so the arena has it ready.
    for (const key of MAP_IMAGE_KEYS) {
      this.load.image(`map:${key}`, `maps/${key}.png`);
    }
    // Champion sprites (PNG) — loaded under the same key the renderer expects.
    for (const id of CHAMP_IMAGE_KEYS) {
      this.load.image(`champ:${id}`, `champs/${id}.png`);
    }
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

    // Champion select: a compact portrait grid (roster is large now).
    const perRow = 9;
    const tileW = 190;
    const tileH = 168;
    const gapX = 12;
    const gapY = 12;
    const total = perRow * tileW + (perRow - 1) * gapX;
    const x0 = (GAME_W - total) / 2 + tileW / 2;
    const y0 = 400 + tileH / 2;
    CHAMPIONS.forEach((c, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      // centre the shorter last row
      const inRow = Math.min(perRow, CHAMPIONS.length - row * perRow);
      const rowOff = ((perRow - inRow) * (tileW + gapX)) / 2;
      this.makeChampTile(i, x0 + col * (tileW + gapX) + rowOff, y0 + row * (tileH + gapY), tileW, tileH);
    });

    addFullscreenButton(this, GAME_W - 56, 56);

    // Admin tools (Map Editor + Balance tuner) — only shown in admin mode.
    // Turn on once by opening the site with ?admin in the URL.
    if (isAdmin()) {
      const adm = this.add
        .rectangle(GAME_W - 150, GAME_H - 44, 250, 60, 0x1e2a44, 1)
        .setStrokeStyle(3, 0x6a8ac0, 1)
        .setDepth(20)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(GAME_W - 150, GAME_H - 44, '⚙  Admin', {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          fontStyle: 'bold',
          color: '#cfe0ff',
        })
        .setOrigin(0.5)
        .setDepth(21);
      adm.on('pointerdown', () => this.scene.start('admin'));
    }

    const start = (championId: string) => {
      initAudio();
      newRun();
      run.champion = championId;
      // Open with a starter shop (buy boots / basic gear before round 1)
      this.scene.start('shop');
    };
    this.startFn = start;
    this.input.keyboard?.once('keydown-ENTER', () => start(CHAMPIONS[0].id));
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

    const sprite = this.add.image(panelX + 130, 250, `champ:${c.id}`);
    sprite.setScale(sprite.height > 0 ? Math.min(4, 190 / sprite.height) : 3.4);
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

  private makeChampTile(index: number, x: number, y: number, w: number, h: number): void {
    const champ = CHAMPIONS[index];
    const zone = this.add.container(x, y).setDepth(10);
    const roleColor = (champ.scales ?? ['ad']).includes('ap') ? 0xb07aff : COLORS.player;

    const bg = this.add.rectangle(0, 0, w, h, 0x14141f, 1).setStrokeStyle(3, roleColor, 0.7);
    zone.add(bg);

    const sprite = this.add.image(0, -14, `champ:${champ.id}`);
    if (sprite.height > 0) sprite.setScale(Math.min(2.4, 104 / sprite.height));
    zone.add(sprite);
    this.tweens.add({ targets: sprite, y: sprite.y - 5, duration: 900 + index * 60, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    zone.add(
      this.add
        .text(0, h / 2 - 34, champ.name, { fontFamily: 'Georgia, serif', fontSize: '25px', fontStyle: 'bold', color: '#ffffff' })
        .setOrigin(0.5),
    );
    zone.add(
      this.add
        .text(0, h / 2 - 12, `${champ.ranged ? 'Ranged' : 'Melee'}${(champ.scales ?? []).includes('ap') ? ' · AP' : ''}`, {
          fontFamily: 'sans-serif', fontSize: '15px', color: '#8a93ab',
        })
        .setOrigin(0.5),
    );

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x22223a));
    bg.on('pointerout', () => bg.setFillStyle(0x14141f));
    bg.on('pointerdown', () => this.showDetail(index));
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
