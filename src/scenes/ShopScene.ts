import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from '../config';
import { run, addItem } from '../core/run';
import { ItemDef, rollShop, MAX_ITEMS } from '../items/registry';
import { sfx } from '../core/sfx';
import { STR } from '../core/strings';

/** Between rounds, after the augment pick: spend the round's gold. */
export class ShopScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  private slotText!: Phaser.GameObjects.Text;

  constructor() {
    super('shop');
  }

  create(): void {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x06060c, 0.94);
    this.add
      .text(GAME_W / 2, 88, STR.shopTitle, {
        fontFamily: 'Georgia, serif',
        fontSize: '58px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#000000', 12, false, true);

    this.goldText = this.add
      .text(GAME_W / 2, 156, '', {
        fontFamily: 'sans-serif',
        fontSize: '36px',
        fontStyle: 'bold',
        color: '#ffd24a',
      })
      .setOrigin(0.5);
    this.slotText = this.add
      .text(GAME_W / 2, 200, '', {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#7a86a5',
      })
      .setOrigin(0.5);
    this.refreshLabels();

    const offers = rollShop(run.round);
    const cardW = 285;
    const cardH = 420;
    const gap = 18;
    const total = offers.length * cardW + (offers.length - 1) * gap;
    const x0 = (GAME_W - total) / 2 + cardW / 2;
    const y = GAME_H / 2 + 90;
    offers.forEach((it, i) => this.makeItemCard(it, x0 + i * (cardW + gap), y, cardW, cardH));

    // Continue button
    const btn = this.add
      .rectangle(GAME_W / 2, GAME_H - 74, 420, 92, 0x2a2a40, 1)
      .setStrokeStyle(4, COLORS.player, 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(GAME_W / 2, GAME_H - 74, STR.shopContinue, {
        fontFamily: 'sans-serif',
        fontSize: '36px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const go = () => this.scene.start('arena');
    btn.on('pointerdown', go);
    this.input.keyboard?.once('keydown-ENTER', go);
    this.input.keyboard?.once('keydown-SPACE', go);
  }

  private refreshLabels(): void {
    this.goldText.setText(`⬤ ${run.gold} Gold`);
    this.slotText.setText(`Items: ${run.items.length} / ${MAX_ITEMS}`);
  }

  private makeItemCard(it: ItemDef, x: number, y: number, w: number, h: number): void {
    const zone = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, w, h, 0x14141f, 1).setStrokeStyle(3, 0x3a3a55, 1);
    zone.add(bg);

    // Glyph tile
    const tile = this.add.graphics();
    tile.fillStyle(it.color, 0.18);
    tile.fillRoundedRect(-44, -h / 2 + 28, 88, 88, 14);
    tile.lineStyle(3, it.color, 1);
    tile.strokeRoundedRect(-44, -h / 2 + 28, 88, 88, 14);
    zone.add(tile);
    zone.add(
      this.add
        .text(0, -h / 2 + 72, it.glyph, {
          fontFamily: 'Georgia, serif',
          fontSize: '52px',
          fontStyle: 'bold',
          color: '#' + it.color.toString(16).padStart(6, '0'),
        })
        .setOrigin(0.5),
    );

    zone.add(
      this.add
        .text(0, -h / 2 + 160, it.name, {
          fontFamily: 'sans-serif',
          fontSize: '30px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );
    zone.add(
      this.add
        .text(0, -h / 2 + 245, it.description, {
          fontFamily: 'sans-serif',
          fontSize: '23px',
          color: '#d8dce8',
          wordWrap: { width: w - 36 },
          align: 'center',
          lineSpacing: 6,
        })
        .setOrigin(0.5),
    );

    const costText = this.add
      .text(0, h / 2 - 42, `${it.cost} Gold`, {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#ffd24a',
      })
      .setOrigin(0.5);
    zone.add(costText);

    let bought = false;
    const tryBuy = () => {
      if (bought) return;
      if (run.gold < it.cost || run.items.length >= MAX_ITEMS) {
        this.tweens.add({ targets: zone, x: x + 8, duration: 50, yoyo: true, repeat: 2 });
        return;
      }
      bought = true;
      addItem(it);
      sfx.pick();
      this.refreshLabels();
      bg.setFillStyle(0x0d1a10);
      bg.setStrokeStyle(3, 0x44dd66, 1);
      costText.setText(STR.shopBought).setColor('#7ee08a');
    };
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => !bought && bg.setFillStyle(0x1f1f30));
    bg.on('pointerout', () => !bought && bg.setFillStyle(0x14141f));
    bg.on('pointerdown', tryBuy);
  }
}
