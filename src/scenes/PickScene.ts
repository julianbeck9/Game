import Phaser from 'phaser';
import { AugmentDef, Tier } from '../augments/types';
import { addAugment, run, MAX_AUGMENTS, removeAugment } from '../core/run';
import { rollOneOffer } from '../augments/offers';
import { GAME_W, GAME_H, COLORS } from '../config';
import { sfx } from '../core/sfx';

const TIER_COLOR: Record<Tier, number> = {
  silber: COLORS.silver,
  gold: COLORS.gold,
  prisma: COLORS.prisma,
};
const TIER_LABEL: Record<Tier, string> = {
  silber: 'Silver',
  gold: 'Gold',
  prisma: 'Prisma',
};

interface Offer {
  def: AugmentDef;
  rerolled: boolean;
}

export interface PickSceneData {
  offers: AugmentDef[];
}

/**
 * Between-rounds augment choice: three new augment slots, each rerollable
 * once (button sits UNDER the card so it can't be misclicked as a pick).
 * Trade buttons let you drop a Silver for a Gold pick, or a Gold for a
 * Prisma pick. No leveling.
 */
export class PickScene extends Phaser.Scene {
  private picked = false;
  private mode: 'select' | 'tradeRemove' | 'tradePick' = 'select';
  private offers: Offer[] = [];
  private tradeGold: AugmentDef[] = [];
  private tradeRerolled: boolean[] = [];
  private tradeFrom: Tier = 'silber';
  private tradeTo: Tier = 'gold';
  private offerRound = 1;

  constructor() {
    super('pick');
  }

  create(data: PickSceneData): void {
    this.picked = false;
    this.mode = 'select';
    this.offerRound = Math.max(1, run.round - 1);
    this.offers = (data.offers ?? []).slice(0, 3).map((def) => ({ def, rerolled: false }));
    this.bindKeys();
    this.render();
  }

  private excludeSet(): Set<string> {
    const s = new Set<string>();
    for (const o of this.offers) s.add(o.def.id);
    return s;
  }

  private pickSlot(i: number): void {
    if (this.picked || this.mode !== 'select') return;
    const o = this.offers[i];
    if (!o || run.augments.length >= MAX_AUGMENTS) return;
    this.picked = true;
    sfx.pick();
    addAugment(o.def);
    this.time.delayedCall(180, () => this.routeOn());
  }

  private rerollSlot(i: number): void {
    if (this.mode !== 'select') return;
    const cur = this.offers[i];
    if (!cur || cur.rerolled) return;
    const def = rollOneOffer(this.offerRound, this.excludeSet());
    if (!def) return;
    this.offers[i] = { def, rerolled: true };
    sfx.cast();
    this.render();
  }

  private routeOn(): void {
    const shopDay = (run.round - 1) % 2 === 0;
    this.scene.start(shopDay ? 'shop' : 'arena');
  }

  private bindKeys(): void {
    this.input.keyboard?.on('keydown-ONE', () => this.onKey(0));
    this.input.keyboard?.on('keydown-TWO', () => this.onKey(1));
    this.input.keyboard?.on('keydown-THREE', () => this.onKey(2));
  }

  private onKey(i: number): void {
    if (this.mode === 'select') this.pickSlot(i);
    else if (this.mode === 'tradePick') this.pickTradeGold(i);
    else if (this.mode === 'tradeRemove') {
      const pool = run.augments.filter((a) => a.tier === this.tradeFrom);
      if (pool[i]) this.doTradeRemove(pool[i].id);
    }
  }

  private render(): void {
    this.children.removeAll(true);
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x06060c, 0.94);
    if (this.mode === 'tradeRemove') return this.renderTradeRemove();
    if (this.mode === 'tradePick') return this.renderTradePick();
    this.renderSelect();
  }

  private title(text: string, sub?: string, subColor = '#a8b0c8'): void {
    this.add
      .text(GAME_W / 2, 84, text, {
        fontFamily: 'Georgia, serif', fontSize: '58px', fontStyle: 'bold', color: '#ffffff',
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#000000', 12, false, true);
    if (sub) {
      this.add
        .text(GAME_W / 2, 146, sub, { fontFamily: 'sans-serif', fontSize: '26px', fontStyle: 'italic', color: subColor })
        .setOrigin(0.5);
    }
  }

  private renderSelect(): void {
    const full = run.augments.length >= MAX_AUGMENTS;
    this.title(
      'Choose an Augment',
      full ? 'Slots full (6/6) — trade up or continue' : undefined,
    );

    if (!full) {
      const cardW = 460, cardH = 560, gap = 60;
      const total = this.offers.length * cardW + (this.offers.length - 1) * gap;
      const x0 = (GAME_W - total) / 2 + cardW / 2;
      const y = GAME_H / 2 + 20;
      this.offers.forEach((o, i) => this.makeCard(o, x0 + i * (cardW + gap), y, cardW, cardH, i));
    } else {
      this.add
        .text(GAME_W / 2, GAME_H / 2, 'Your augment slots are full.', {
          fontFamily: 'sans-serif', fontSize: '30px', color: '#a8b0c8',
        })
        .setOrigin(0.5);
    }

    this.tradeButtons();
    if (full) this.continueButton();

    if (run.augments.length > 0) {
      this.add
        .text(GAME_W / 2, GAME_H - 34, `Your augments: ${run.augments.map((a) => a.name).join(' · ')}`, {
          fontFamily: 'sans-serif', fontSize: '22px', color: '#7a86a5',
          wordWrap: { width: GAME_W - 200 }, align: 'center',
        })
        .setOrigin(0.5);
    }
  }

  /** Silver→Gold and Gold→Prisma upgrade buttons. */
  private tradeButtons(): void {
    const hasSilver = run.augments.some((a) => a.tier === 'silber');
    const hasGold = run.augments.some((a) => a.tier === 'gold');
    const buttons: [string, number, Tier, Tier][] = [];
    if (hasSilver) buttons.push(['♻  Trade a Silver for a Gold pick', COLORS.gold, 'silber', 'gold']);
    if (hasGold) buttons.push(['♻  Trade a Gold for a Prisma pick', COLORS.prisma, 'gold', 'prisma']);
    if (buttons.length === 0) return;
    const y0 = GAME_H - 128;
    buttons.forEach(([label, col, from, to], i) => {
      const x = buttons.length === 1 ? GAME_W / 2 : GAME_W / 2 + (i === 0 ? -300 : 300);
      const btn = this.add
        .rectangle(x, y0, 560, 60, 0x241f36, 1)
        .setStrokeStyle(3, col, 0.9)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, y0, label, {
          fontFamily: 'sans-serif', fontSize: '24px', fontStyle: 'bold',
          color: '#' + col.toString(16).padStart(6, '0'),
        })
        .setOrigin(0.5);
      btn.on('pointerdown', () => {
        if (this.picked) return;
        this.tradeFrom = from;
        this.tradeTo = to;
        this.mode = 'tradeRemove';
        this.render();
      });
    });
  }

  private continueButton(): void {
    const btn = this.add
      .rectangle(GAME_W / 2, GAME_H - 60, 320, 66, 0x2a2a40, 1)
      .setStrokeStyle(3, COLORS.player, 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(GAME_W / 2, GAME_H - 60, 'Continue', { fontFamily: 'sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    btn.on('pointerdown', () => {
      if (this.picked) return;
      this.picked = true;
      this.routeOn();
    });
  }

  private renderTradeRemove(): void {
    const fromLabel = TIER_LABEL[this.tradeFrom];
    const toLabel = TIER_LABEL[this.tradeTo];
    this.title(`Which ${fromLabel} augment do you give up?`, `A ${toLabel} pick follows`, '#f5c542');
    const pool = run.augments.filter((a) => a.tier === this.tradeFrom);
    const cardW = 300, cardH = 340, gap = 26;
    const perRow = Math.min(pool.length, 5);
    const total = perRow * cardW + (perRow - 1) * gap;
    const x0 = (GAME_W - total) / 2 + cardW / 2;
    pool.forEach((def, i) => {
      const col = i % perRow, row = Math.floor(i / perRow);
      const x = x0 + col * (cardW + gap);
      const y = GAME_H / 2 - 20 + row * (cardH + 24);
      const tc = TIER_COLOR[def.tier];
      const bg = this.add.rectangle(x, y, cardW, cardH, 0x14141f, 1).setStrokeStyle(3, tc, 1).setInteractive({ useHandCursor: true });
      this.add.text(x, y - cardH / 2 + 44, def.name, {
        fontFamily: 'Georgia, serif', fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
        wordWrap: { width: cardW - 30 }, align: 'center',
      }).setOrigin(0.5);
      this.add.text(x, y + 30, def.description, {
        fontFamily: 'sans-serif', fontSize: '21px', color: '#b8c0d4', wordWrap: { width: cardW - 34 }, align: 'center',
      }).setOrigin(0.5);
      this.add.text(x, y + cardH / 2 - 32, 'Trade in', { fontFamily: 'sans-serif', fontSize: '23px', fontStyle: 'bold', color: '#f5c542' }).setOrigin(0.5);
      bg.on('pointerover', () => bg.setFillStyle(0x231f14));
      bg.on('pointerout', () => bg.setFillStyle(0x14141f));
      bg.on('pointerdown', () => this.doTradeRemove(def.id));
    });
    const back = this.add.rectangle(GAME_W / 2, GAME_H - 80, 260, 60, 0x2a2a40, 1).setStrokeStyle(3, 0x556677, 1).setInteractive({ useHandCursor: true });
    this.add.text(GAME_W / 2, GAME_H - 80, 'Back', { fontFamily: 'sans-serif', fontSize: '26px', color: '#c8d0e4' }).setOrigin(0.5);
    back.on('pointerdown', () => { this.mode = 'select'; this.render(); });
  }

  private doTradeRemove(id: string): void {
    if (this.picked) return;
    sfx.pick();
    removeAugment(id);
    this.tradeGold = [];
    this.tradeRerolled = [false, false, false];
    const exclude = new Set<string>();
    while (this.tradeGold.length < 3) {
      const def = rollOneOffer(this.offerRound, exclude, { tiers: [this.tradeTo], allowPrisma: this.tradeTo === 'prisma', forced: true });
      if (!def) break;
      this.tradeGold.push(def);
      exclude.add(def.id);
    }
    this.mode = 'tradePick';
    this.render();
  }

  private renderTradePick(): void {
    this.title(`Choose your ${TIER_LABEL[this.tradeTo]} augment`);
    if (this.tradeGold.length === 0) { this.continueButton(); return; }
    const cardW = 460, cardH = 560, gap = 60;
    const total = this.tradeGold.length * cardW + (this.tradeGold.length - 1) * gap;
    const x0 = (GAME_W - total) / 2 + cardW / 2;
    const y = GAME_H / 2 + 20;
    this.tradeGold.forEach((def, i) => {
      this.makeCard({ def, rerolled: this.tradeRerolled[i] }, x0 + i * (cardW + gap), y, cardW, cardH, i, true);
    });
  }

  private pickTradeGold(i: number): void {
    if (this.picked || this.mode !== 'tradePick') return;
    const def = this.tradeGold[i];
    if (!def) return;
    this.picked = true;
    sfx.pick();
    addAugment(def);
    this.time.delayedCall(180, () => this.routeOn());
  }

  private rerollTradeGold(i: number): void {
    if (this.tradeRerolled[i]) return;
    const exclude = new Set(this.tradeGold.map((d) => d.id));
    const def = rollOneOffer(this.offerRound, exclude, { tiers: [this.tradeTo], allowPrisma: this.tradeTo === 'prisma', forced: true });
    if (!def) return;
    this.tradeGold[i] = def;
    this.tradeRerolled[i] = true;
    sfx.cast();
    this.render();
  }

  private makeCard(o: Offer, x: number, y: number, w: number, h: number, index: number, trade = false): void {
    const def = o.def;
    const tierColor = TIER_COLOR[def.tier];

    const bg = this.add.rectangle(x, y, w, h, 0x14141f, 1).setStrokeStyle(4, tierColor, 1);
    this.add.rectangle(x, y - h / 2 + 44, w - 8, 80, tierColor, def.tier === 'prisma' ? 0.16 : 0.1);
    this.add.text(x - w / 2 + 30, y - h / 2 + 44, TIER_LABEL[def.tier], {
      fontFamily: 'sans-serif', fontSize: '28px', fontStyle: 'bold',
      color: '#' + tierColor.toString(16).padStart(6, '0'),
    }).setOrigin(0, 0.5);

    this.add.text(x, y - h / 2 + 150, def.name, {
      fontFamily: 'Georgia, serif', fontSize: '46px', fontStyle: 'bold', color: '#ffffff',
      wordWrap: { width: w - 60 }, align: 'center',
    }).setOrigin(0.5);

    const tags = def.tags.length ? def.tags : ['—'];
    const chipW = 108;
    const totalW = tags.length * chipW + (tags.length - 1) * 12;
    tags.forEach((t, i) => {
      const cxOff = x - totalW / 2 + chipW / 2 + i * (chipW + 12);
      this.add.rectangle(cxOff, y - h / 2 + 220, chipW, 40, 0x232336, 1).setStrokeStyle(2, 0x3a3a55, 1);
      this.add.text(cxOff, y - h / 2 + 220, t, { fontFamily: 'sans-serif', fontSize: '24px', color: '#9aa3bb' }).setOrigin(0.5);
    });

    this.add.text(x, y + 40, def.description, {
      fontFamily: 'sans-serif', fontSize: '30px', color: '#d8dce8', wordWrap: { width: w - 60 }, align: 'center', lineSpacing: 9,
    }).setOrigin(0.5);

    this.add.text(x, y + h / 2 - 34, `${index + 1}`, { fontFamily: 'sans-serif', fontSize: '24px', color: '#5a6480' }).setOrigin(0.5);

    // Pick — the whole card
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x1f1f30));
    bg.on('pointerout', () => bg.setFillStyle(0x14141f));
    bg.on('pointerdown', () => (trade ? this.pickTradeGold(index) : this.pickSlot(index)));

    // Reroll — UNDER the card, clearly separated so it can't be misclicked
    const ry = y + h / 2 + 34;
    const used = o.rerolled;
    const rBtn = this.add
      .rectangle(x, ry, w - 40, 52, used ? 0x191922 : 0x243050, 1)
      .setStrokeStyle(2, used ? 0x33384a : 0x6a9ad0, 1);
    this.add.text(x, ry, used ? 'reroll used' : '⟳  Reroll', {
      fontFamily: 'sans-serif', fontSize: '24px', fontStyle: 'bold',
      color: used ? '#44485a' : '#a8d8ff',
    }).setOrigin(0.5);
    if (!used) {
      rBtn.setInteractive({ useHandCursor: true });
      rBtn.on('pointerdown', () => (trade ? this.rerollTradeGold(index) : this.rerollSlot(index)));
    }
  }
}
