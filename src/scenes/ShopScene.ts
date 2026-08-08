import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from '../config';
import { run, addItem, sellItem, upgradeItem } from '../core/run';
import { ItemDef, rollShop, MAX_ITEMS, blockedByUnique } from '../items/registry';
import { drawItemIcon } from '../items/icons';
import { starLabel, starUpgradeCost, starsOf, MAX_STARS } from '../items/stars';
import { sfx } from '../core/sfx';
import { STR } from '../core/strings';

/** Between rounds, after the augment pick: spend the round's gold. */
export class ShopScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  private slotText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private ownedRow!: Phaser.GameObjects.Container;
  /** Tapping an owned item opens this panel (forge / sell); null when closed. */
  private actionPanel: Phaser.GameObjects.Container | null = null;
  /**
   * This shop's offers paired with the exact callback the card's own tap runs.
   * The sim harness (scripts/sim.mjs) buys through these, so a simulated
   * purchase goes down the same path as a player's — including the gold, the
   * unique-boots rule and the slot cap — instead of a parallel copy that could
   * drift from what the shop actually does.
   */
  cards: { item: ItemDef; buy: () => void }[] = [];

  constructor() {
    super('shop');
  }

  create(): void {
    this.actionPanel = null;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x06060c, 0.94);
    this.add
      .text(GAME_W / 2, 80, STR.shopTitle, {
        fontFamily: 'Georgia, serif',
        fontSize: '58px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#000000', 12, false, true);

    this.goldText = this.add
      .text(GAME_W / 2, 146, '', { fontFamily: 'sans-serif', fontSize: '36px', fontStyle: 'bold', color: '#ffd24a' })
      .setOrigin(0.5);
    this.slotText = this.add
      .text(GAME_W / 2, 188, '', { fontFamily: 'sans-serif', fontSize: '24px', color: '#7a86a5' })
      .setOrigin(0.5);
    this.hintText = this.add
      .text(GAME_W / 2, GAME_H - 152, '', { fontFamily: 'sans-serif', fontSize: '24px', color: '#a8d8ff' })
      .setOrigin(0.5);
    this.ownedRow = this.add.container(0, 0);
    this.rebuildOwnedRow();
    this.refreshLabels();

    // Build & Stats button (opens the TAB overlay over the shop)
    const buildBtn = this.add
      .rectangle(160, 80, 240, 58, 0x0a0a14, 0.9)
      .setStrokeStyle(2, 0x3a3a55, 0.9)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(160, 80, '☰ Build & Stats', { fontFamily: 'sans-serif', fontSize: '25px', color: '#a8d8ff' })
      .setOrigin(0.5);
    const openBuild = () => {
      if (this.scene.isPaused('shop')) return;
      this.scene.launch('build', { from: 'shop' });
      this.scene.pause('shop');
    };
    buildBtn.on('pointerdown', openBuild);
    this.input.keyboard?.on('keydown-TAB', openBuild);

    const offers = rollShop(run.round);
    this.cards = [];
    const cardW = 285;
    const cardH = 420;
    const gap = 18;
    const total = offers.length * cardW + (offers.length - 1) * gap;
    const x0 = (GAME_W - total) / 2 + cardW / 2;
    const y = GAME_H / 2 + 70;
    offers.forEach((it, i) => this.makeItemCard(it, x0 + i * (cardW + gap), y, cardW, cardH));

    const btn = this.add
      .rectangle(GAME_W / 2, GAME_H - 74, 420, 88, 0x2a2a40, 1)
      .setStrokeStyle(4, COLORS.player, 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(GAME_W / 2, GAME_H - 74, STR.shopContinue, {
        fontFamily: 'sans-serif',
        fontSize: '34px',
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

  /** Owned-item row: tap an item to open its forge/sell panel. */
  private rebuildOwnedRow(): void {
    this.ownedRow.removeAll(true);
    if (run.items.length === 0) {
      this.hintText.setText('');
      return;
    }
    const size = 92;
    const gap = 16;
    const total = run.items.length * size + (run.items.length - 1) * gap;
    const x0 = (GAME_W - total) / 2 + size / 2;
    const y = GAME_H - 230;
    this.hintText.setText('Your items — tap one to forge it up a star or sell it');

    const g = this.add.graphics();
    this.ownedRow.add(g);
    run.items.forEach((it, i) => {
      const x = x0 + i * (size + gap);
      const stars = starsOf(it);
      g.fillStyle(0x14141f, 1);
      g.fillRoundedRect(x - size / 2, y - size / 2, size, size, 12);
      // A forged item wears a golden frame — readable at a glance in the row.
      g.lineStyle(stars > 1 ? 4 : 3, stars > 1 ? 0xffd24a : it.color, 1);
      g.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 12);
      drawItemIcon(g, it.icon ?? 'orb', x, y - 6, 52, it.color);
      if (stars > 1) {
        this.ownedRow.add(
          this.add
            .text(x, y - size / 2 + 12, starLabel(stars), {
              fontFamily: 'sans-serif',
              fontSize: '18px',
              fontStyle: 'bold',
              color: '#ffd24a',
            })
            .setOrigin(0.5),
        );
      }
      this.ownedRow.add(
        this.add
          .text(x, y + 30, it.name, {
            fontFamily: 'sans-serif',
            fontSize: '13px',
            color: '#8a94b0',
            wordWrap: { width: size + 8 },
            align: 'center',
          })
          .setOrigin(0.5),
      );

      const zone = this.add.zone(x, y, size, size).setOrigin(0.5).setInteractive({ useHandCursor: true });
      this.ownedRow.add(zone);
      zone.on('pointerdown', () => this.openItemActions(it));
    });
  }

  /**
   * Forge/sell panel for one owned item. Replaces the old tap-to-arm,
   * tap-again-to-sell flow, which sold items by accident and left no room for
   * a second action.
   */
  private openItemActions(it: ItemDef): void {
    this.closeItemActions();
    const panel = this.add.container(0, 0).setDepth(50);
    this.actionPanel = panel;

    // Dim backdrop; clicking it cancels.
    const dim = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.72)
      .setInteractive();
    dim.on('pointerdown', () => this.closeItemActions());
    panel.add(dim);

    const w = 720;
    const h = 400;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    panel.add(
      this.add.rectangle(cx, cy, w, h, 0x14141f, 1).setStrokeStyle(3, it.color, 1).setInteractive(),
    );
    const stars = starsOf(it);
    panel.add(
      this.add
        .text(cx, cy - h / 2 + 44, `${it.name}  ${starLabel(stars)}`, {
          fontFamily: 'sans-serif',
          fontSize: '32px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(cx, cy - h / 2 + 104, it.description, {
          fontFamily: 'sans-serif',
          fontSize: '19px',
          color: '#8a94b0',
          wordWrap: { width: w - 70 },
          align: 'center',
        })
        .setOrigin(0.5, 0),
    );

    const cost = starUpgradeCost(it);
    const maxed = cost === null;
    const affordable = cost !== null && run.gold >= cost;
    const forgeLabel = maxed
      ? `Already ${starLabel(MAX_STARS)} — fully forged`
      : `★ Forge to ${starLabel(stars + 1)} — ${cost} Gold`;
    this.panelButton(panel, cx, cy + 62, w - 90, forgeLabel, affordable, 0x3a2f10, 0xffd24a, () => {
      if (!upgradeItem(it.id)) return;
      sfx.pick();
      this.refreshLabels();
      this.rebuildOwnedRow();
      this.closeItemActions();
      this.hintText.setText(`Forged ${it.name} to ${starLabel(stars + 1)}`);
    });

    panel.add(
      this.add
        .text(cx, cy + h / 2 - 18, 'tap outside to cancel', {
          fontFamily: 'sans-serif',
          fontSize: '17px',
          color: '#55596a',
        })
        .setOrigin(0.5),
    );

    const refund = Math.round(it.cost * 0.7);
    this.panelButton(panel, cx, cy + 140, w - 90, `Sell — +${refund} Gold`, true, 0x3a1f1f, 0xff6a5e, () => {
      const got = sellItem(it.id);
      sfx.pick();
      this.refreshLabels();
      this.rebuildOwnedRow();
      this.closeItemActions();
      this.hintText.setText(`Sold ${it.name}: +${got} Gold`);
    });
  }

  private panelButton(
    panel: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    label: string,
    enabled: boolean,
    fill: number,
    stroke: number,
    onTap: () => void,
  ): void {
    const bg = this.add
      .rectangle(x, y, w, 62, enabled ? fill : 0x191922, 1)
      .setStrokeStyle(2, enabled ? stroke : 0x33384a, 1);
    panel.add(bg);
    panel.add(
      this.add
        .text(x, y, label, {
          fontFamily: 'sans-serif',
          fontSize: '25px',
          fontStyle: 'bold',
          color: enabled ? '#ffffff' : '#55596a',
        })
        .setOrigin(0.5),
    );
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', onTap);
    }
  }

  private closeItemActions(): void {
    this.actionPanel?.destroy(true);
    this.actionPanel = null;
  }

  private makeItemCard(it: ItemDef, x: number, y: number, w: number, h: number): void {
    const zone = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, w, h, 0x14141f, 1).setStrokeStyle(3, 0x3a3a55, 1);
    zone.add(bg);

    // 16-bit icon tile
    const tile = this.add.graphics();
    tile.fillStyle(it.color, 0.14);
    tile.fillRoundedRect(-48, -h / 2 + 24, 96, 96, 14);
    tile.lineStyle(3, it.color, 1);
    tile.strokeRoundedRect(-48, -h / 2 + 24, 96, 96, 14);
    drawItemIcon(tile, it.icon ?? 'orb', 0, -h / 2 + 72, 72, it.color);
    zone.add(tile);

    zone.add(
      this.add
        .text(0, -h / 2 + 150, it.name, { fontFamily: 'sans-serif', fontSize: '29px', fontStyle: 'bold', color: '#ffffff' })
        .setOrigin(0.5),
    );
    zone.add(
      this.add
        .text(0, -h / 2 + 240, it.description, {
          fontFamily: 'sans-serif',
          fontSize: '23px',
          color: '#d8dce8',
          wordWrap: { width: w - 36 },
          align: 'center',
          lineSpacing: 6,
        })
        .setOrigin(0.5),
    );

    const ownsBoots = blockedByUnique(it);
    const costText = this.add
      .text(0, h / 2 - 42, ownsBoots ? 'Owned' : `${it.cost} Gold`, {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: ownsBoots ? '#7a86a5' : '#ffd24a',
      })
      .setOrigin(0.5);
    zone.add(costText);

    let bought = ownsBoots;
    const tryBuy = () => {
      if (bought) return;
      // Unique items (boots) can only be owned once
      const dupUnique = blockedByUnique(it);
      if (dupUnique || run.gold < it.cost || run.items.length >= MAX_ITEMS) {
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
    this.cards.push({ item: it, buy: tryBuy });
  }
}
