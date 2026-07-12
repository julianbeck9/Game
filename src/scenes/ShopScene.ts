import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from '../config';
import { run, addItem, sellItem, removeItem, levelOf, levelUp } from '../core/run';
import { ItemDef, rollShop, MAX_ITEMS } from '../items/registry';
import { sfx } from '../core/sfx';
import { STR } from '../core/strings';

/** Between rounds, after the augment pick: spend the round's gold. */
export class ShopScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  private slotText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private ownedRow!: Phaser.GameObjects.Container;
  /** Verkaufs-/Aufwertungszustand: erster Tipp wählt, zweiter bestätigt. */
  private armedSell: string | null = null;
  private upgradeTarget: string | null = null;

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
    this.hintText = this.add
      .text(GAME_W / 2, GAME_H - 148, '', {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#a8d8ff',
      })
      .setOrigin(0.5);
    this.armedSell = null;
    this.upgradeTarget = null;
    this.ownedRow = this.add.container(0, 0);
    this.rebuildOwnedRow();
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

  /**
   * Owned-item row above the continue button: tap once to arm, tap again to
   * SELL (70% back). With full slots, "Aufwerten" mode: pick the item to
   * upgrade, then pay by giving another item away.
   */
  private rebuildOwnedRow(): void {
    this.ownedRow.removeAll(true);
    if (run.items.length === 0) {
      this.hintText.setText('');
      return;
    }
    const full = run.items.length >= MAX_ITEMS;
    const size = 88;
    const gap = 16;
    const total = run.items.length * size + (run.items.length - 1) * gap;
    const x0 = (GAME_W - total) / 2 + size / 2;
    const y = GAME_H - 220;
    this.hintText.setText(
      this.upgradeTarget
        ? 'Choose the item you GIVE UP for it'
        : full
          ? 'Your items: tap once = arm sell · twice = sell (70%) · button below: level up'
          : 'Your items: tap once = arm sell · tap twice = sell (70%)',
    );

    run.items.forEach((it, i) => {
      const x = x0 + i * (size + gap);
      const armed = this.armedSell === it.id;
      const g = this.add.graphics();
      g.fillStyle(armed ? 0x552222 : 0x14141f, 1);
      g.fillRoundedRect(x - size / 2, y - size / 2, size, size, 12);
      g.lineStyle(3, armed ? 0xff6a5e : it.color, 1);
      g.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 12);
      this.ownedRow.add(g);
      const glyph = this.add
        .text(x, y - 8, it.glyph, {
          fontFamily: 'Georgia, serif',
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#' + it.color.toString(16).padStart(6, '0'),
        })
        .setOrigin(0.5);
      this.ownedRow.add(glyph);
      const sub = this.add
        .text(x, y + 26, armed ? 'Sell?' : `★${levelOf(it.id)}`, {
          fontFamily: 'sans-serif',
          fontSize: '17px',
          color: armed ? '#ff9a8a' : '#8a94b0',
        })
        .setOrigin(0.5);
      this.ownedRow.add(sub);

      const zone = this.add
        .zone(x, y, size, size)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      this.ownedRow.add(zone);
      zone.on('pointerdown', () => {
        if (this.upgradeTarget) {
          // Aufwertung bezahlen: dieses Item geht, das Ziel steigt eine Stufe
          if (it.id === this.upgradeTarget) return;
          const target = run.items.find((o) => o.id === this.upgradeTarget);
          removeItem(it.id);
          if (target) levelUp(target.id);
          this.upgradeTarget = null;
          sfx.pick();
          this.refreshLabels();
          this.rebuildOwnedRow();
          return;
        }
        if (this.armedSell === it.id) {
          const refund = sellItem(it.id);
          this.armedSell = null;
          sfx.pick();
          this.refreshLabels();
          this.rebuildOwnedRow();
          this.hintText.setText(`Sold ${it.name}: +${refund} Gold`);
          return;
        }
        this.armedSell = it.id;
        this.rebuildOwnedRow();
      });

      // Voll (6/6): Aufwerten-Knopf unter jedem Item mit Stufe < 3
      if (full && !this.upgradeTarget && levelOf(it.id) < 3) {
        const up = this.add
          .text(x, y + 62, '⬆ Level Up', {
            fontFamily: 'sans-serif',
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#7ee08a',
          })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });
        up.on('pointerdown', () => {
          this.armedSell = null;
          this.upgradeTarget = it.id;
          this.rebuildOwnedRow();
        });
        this.ownedRow.add(up);
      }
    });
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
      this.rebuildOwnedRow();
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
