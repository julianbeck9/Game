import Phaser from 'phaser';
import { AugmentDef, Tier } from '../augments/types';
import { addAugment, run, MAX_AUGMENTS, levelOf, levelUp, removeAugment } from '../core/run';
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

/** A slot on the pick screen: add a new augment, or level up an owned one. */
interface Offer {
  kind: 'new' | 'level';
  def: AugmentDef;
  rerolled: boolean;
}

export interface PickSceneData {
  offers: AugmentDef[];
}

/**
 * Between-rounds augment choice. Three slots — once you own 2+ augments one
 * slot instead offers an OWNED augment to level up. Every slot can be
 * rerolled once. A Silber→Gold trade lets you drop a silver augment for a
 * fresh gold-tier pick.
 */
export class PickScene extends Phaser.Scene {
  private picked = false;
  private mode: 'select' | 'tradeRemove' | 'tradePick' = 'select';
  private offers: Offer[] = [];
  private tradeGold: AugmentDef[] = [];
  private tradeRerolled: boolean[] = [];
  private offerRound = 1;

  constructor() {
    super('pick');
  }

  create(data: PickSceneData): void {
    this.picked = false;
    this.mode = 'select';
    this.offerRound = Math.max(1, run.round - 1);
    this.buildOffers(data.offers ?? []);
    this.bindKeys();
    this.render();
  }

  // ---- Offer generation ----

  private buildOffers(seed: AugmentDef[]): void {
    const upgradable = run.augments.filter((a) => levelOf(a.id) < 3);

    if (run.augments.length >= MAX_AUGMENTS) {
      // Slots full: every card levels an owned augment
      const shuffled = [...upgradable].sort(() => Math.random() - 0.5).slice(0, 3);
      this.offers = shuffled.map((def) => ({ kind: 'level', def, rerolled: false }));
      return;
    }

    this.offers = seed.slice(0, 3).map((def) => ({ kind: 'new' as const, def, rerolled: false }));
    // Once you have a build going, one slot lets you deepen it instead
    if (run.augments.length >= 2 && upgradable.length > 0) {
      const def = upgradable[Math.floor(Math.random() * upgradable.length)];
      const slot = Math.floor(Math.random() * this.offers.length);
      this.offers[slot] = { kind: 'level', def, rerolled: false };
    }
  }

  private excludeSet(extra?: string): Set<string> {
    const s = new Set<string>();
    for (const o of this.offers) s.add(o.def.id);
    if (extra) s.add(extra);
    return s;
  }

  // ---- Actions ----

  private pickSlot(i: number): void {
    if (this.picked || this.mode !== 'select') return;
    const o = this.offers[i];
    if (!o) return;
    this.picked = true;
    sfx.pick();
    if (o.kind === 'level') levelUp(o.def.id);
    else addAugment(o.def);
    this.time.delayedCall(180, () => this.routeOn());
  }

  private rerollSlot(i: number): void {
    if (this.mode !== 'select') return;
    const cur = this.offers[i];
    if (!cur || cur.rerolled) return;
    const exclude = this.excludeSet();

    if (cur.kind === 'level') {
      // Prefer a different owned augment to level; else fall back to a new one
      const others = run.augments.filter((a) => levelOf(a.id) < 3 && !exclude.has(a.id));
      if (others.length > 0) {
        const def = others[Math.floor(Math.random() * others.length)];
        this.offers[i] = { kind: 'level', def, rerolled: true };
      } else {
        const def = rollOneOffer(this.offerRound, exclude);
        if (!def) return;
        this.offers[i] = { kind: 'new', def, rerolled: true };
      }
    } else {
      const def = rollOneOffer(this.offerRound, exclude);
      if (!def) return;
      this.offers[i] = { kind: 'new', def, rerolled: true };
    }
    sfx.cast();
    this.render();
  }

  private routeOn(): void {
    // Der Händler öffnet nur nach dem Zahltag (jede 2. Runde); run.round wurde
    // in endFight bereits erhöht, die gespielte Runde ist also run.round - 1.
    const shopDay = (run.round - 1) % 2 === 0;
    this.scene.start(shopDay ? 'shop' : 'arena');
  }

  // ---- Rendering ----

  private bindKeys(): void {
    this.input.keyboard?.on('keydown-ONE', () => this.onKey(0));
    this.input.keyboard?.on('keydown-TWO', () => this.onKey(1));
    this.input.keyboard?.on('keydown-THREE', () => this.onKey(2));
  }

  private onKey(i: number): void {
    if (this.mode === 'select') this.pickSlot(i);
    else if (this.mode === 'tradePick') this.pickTradeGold(i);
    else if (this.mode === 'tradeRemove') {
      const silvers = run.augments.filter((a) => a.tier === 'silber');
      if (silvers[i]) this.doTradeRemove(silvers[i].id);
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
      .text(GAME_W / 2, 90, text, {
        fontFamily: 'Georgia, serif',
        fontSize: '60px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#000000', 12, false, true);
    if (sub) {
      this.add
        .text(GAME_W / 2, 156, sub, {
          fontFamily: 'sans-serif',
          fontSize: '27px',
          fontStyle: 'italic',
          color: subColor,
        })
        .setOrigin(0.5);
    }
  }

  private renderSelect(): void {
    const full = run.augments.length >= MAX_AUGMENTS;
    this.title(
      full ? 'Level up an Augment' : 'Choose an Augment',
      full ? 'Slots full (6/6) — every card levels one of your augments' : undefined,
    );

    if (this.offers.length === 0) {
      // Nothing to level and nothing to add: allow a graceful continue
      this.add
        .text(GAME_W / 2, GAME_H / 2, 'Everything is max level — onward', {
          fontFamily: 'sans-serif',
          fontSize: '30px',
          color: '#a8b0c8',
        })
        .setOrigin(0.5);
      this.continueButton();
      this.tradeButton();
      return;
    }

    const cardW = 460;
    const cardH = 560;
    const gap = 60;
    const total = this.offers.length * cardW + (this.offers.length - 1) * gap;
    const x0 = (GAME_W - total) / 2 + cardW / 2;
    const y = GAME_H / 2 + 40;
    this.offers.forEach((o, i) => this.makeCard(o, x0 + i * (cardW + gap), y, cardW, cardH, i));

    this.tradeButton();

    if (run.augments.length > 0) {
      this.add
        .text(
          GAME_W / 2,
          GAME_H - 40,
          `Your augments: ${run.augments.map((a) => `${a.name} ${'★'.repeat(levelOf(a.id))}`).join(' · ')}`,
          {
            fontFamily: 'sans-serif',
            fontSize: '23px',
            color: '#7a86a5',
            wordWrap: { width: GAME_W - 200 },
            align: 'center',
          },
        )
        .setOrigin(0.5);
    }
  }

  /** Silber→Gold: drop a silver augment for a fresh gold pick. */
  private tradeButton(): void {
    if (!run.augments.some((a) => a.tier === 'silber')) return;
    const y = GAME_H - 108;
    const btn = this.add
      .rectangle(GAME_W / 2, y, 560, 66, 0x2a2440, 1)
      .setStrokeStyle(3, COLORS.gold, 0.9)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(GAME_W / 2, y, '♻  Trade a Silver augment for a Gold pick', {
        fontFamily: 'sans-serif',
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#f5c542',
      })
      .setOrigin(0.5);
    btn.on('pointerdown', () => {
      if (this.picked) return;
      this.mode = 'tradeRemove';
      this.render();
    });
  }

  private continueButton(): void {
    const btn = this.add
      .rectangle(GAME_W / 2, GAME_H - 108, 360, 76, 0x2a2a40, 1)
      .setStrokeStyle(3, COLORS.player, 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(GAME_W / 2, GAME_H - 108, 'Continue', {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    btn.on('pointerdown', () => {
      if (this.picked) return;
      this.picked = true;
      this.routeOn();
    });
  }

  private renderTradeRemove(): void {
    this.title('Which Silver augment do you give up?', 'A Gold pick follows', '#f5c542');
    const silvers = run.augments.filter((a) => a.tier === 'silber');
    const cardW = 300;
    const cardH = 360;
    const gap = 26;
    const perRow = Math.min(silvers.length, 5);
    const total = perRow * cardW + (perRow - 1) * gap;
    const x0 = (GAME_W - total) / 2 + cardW / 2;
    silvers.forEach((def, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = x0 + col * (cardW + gap);
      const y = GAME_H / 2 - 20 + row * (cardH + 24);
      const bg = this.add
        .rectangle(x, y, cardW, cardH, 0x14141f, 1)
        .setStrokeStyle(3, COLORS.silver, 1)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, y - cardH / 2 + 44, `${def.name} ${'★'.repeat(levelOf(def.id))}`, {
          fontFamily: 'Georgia, serif',
          fontSize: '28px',
          fontStyle: 'bold',
          color: '#ffffff',
          wordWrap: { width: cardW - 30 },
          align: 'center',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 30, def.description, {
          fontFamily: 'sans-serif',
          fontSize: '21px',
          color: '#b8c0d4',
          wordWrap: { width: cardW - 34 },
          align: 'center',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + cardH / 2 - 32, 'Trade in', {
          fontFamily: 'sans-serif',
          fontSize: '23px',
          fontStyle: 'bold',
          color: '#f5c542',
        })
        .setOrigin(0.5);
      bg.on('pointerover', () => bg.setFillStyle(0x231f14));
      bg.on('pointerout', () => bg.setFillStyle(0x14141f));
      bg.on('pointerdown', () => this.doTradeRemove(def.id));
    });

    // Abort back to the normal selection
    const back = this.add
      .rectangle(GAME_W / 2, GAME_H - 90, 260, 64, 0x2a2a40, 1)
      .setStrokeStyle(3, 0x556, 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(GAME_W / 2, GAME_H - 90, 'Back', {
        fontFamily: 'sans-serif',
        fontSize: '26px',
        color: '#c8d0e4',
      })
      .setOrigin(0.5);
    back.on('pointerdown', () => {
      this.mode = 'select';
      this.render();
    });
  }

  private doTradeRemove(silverId: string): void {
    if (this.picked) return;
    sfx.pick();
    removeAugment(silverId);
    // Roll a gold-tier selection
    this.tradeGold = [];
    this.tradeRerolled = [false, false, false];
    const exclude = new Set<string>();
    while (this.tradeGold.length < 3) {
      const def = rollOneOffer(this.offerRound, exclude, { tiers: ['gold'], allowPrisma: false });
      if (!def) break;
      this.tradeGold.push(def);
      exclude.add(def.id);
    }
    this.mode = 'tradePick';
    this.render();
  }

  private renderTradePick(): void {
    this.title('Choose your Gold augment', undefined);
    if (this.tradeGold.length === 0) {
      this.continueButton();
      return;
    }
    const cardW = 460;
    const cardH = 560;
    const gap = 60;
    const total = this.tradeGold.length * cardW + (this.tradeGold.length - 1) * gap;
    const x0 = (GAME_W - total) / 2 + cardW / 2;
    const y = GAME_H / 2 + 40;
    this.tradeGold.forEach((def, i) => {
      const o: Offer = { kind: 'new', def, rerolled: this.tradeRerolled[i] };
      this.makeCard(o, x0 + i * (cardW + gap), y, cardW, cardH, i, true);
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
    const def = rollOneOffer(this.offerRound, exclude, { tiers: ['gold'], allowPrisma: false });
    if (!def) return;
    this.tradeGold[i] = def;
    this.tradeRerolled[i] = true;
    sfx.cast();
    this.render();
  }

  // ---- Card ----

  private makeCard(o: Offer, x: number, y: number, w: number, h: number, index: number, trade = false): void {
    const def = o.def;
    const tierColor = TIER_COLOR[def.tier];
    const isLevel = o.kind === 'level';

    const bg = this.add.rectangle(x, y, w, h, 0x14141f, 1).setStrokeStyle(4, isLevel ? 0x7ee08a : tierColor, 1);

    // Tier band
    this.add.rectangle(x, y - h / 2 + 44, w - 8, 80, isLevel ? 0x7ee08a : tierColor, isLevel ? 0.12 : 0.1);
    this.add
      .text(x - w / 2 + 30, y - h / 2 + 44, isLevel ? 'Level Up' : TIER_LABEL[def.tier], {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: isLevel ? '#7ee08a' : '#' + tierColor.toString(16).padStart(6, '0'),
      })
      .setOrigin(0, 0.5);

    // Name (+ stars for level cards)
    this.add
      .text(x, y - h / 2 + 150, isLevel ? `${def.name} ${'★'.repeat(levelOf(def.id))}` : def.name, {
        fontFamily: 'Georgia, serif',
        fontSize: '46px',
        fontStyle: 'bold',
        color: '#ffffff',
        wordWrap: { width: w - 60 },
        align: 'center',
      })
      .setOrigin(0.5);

    // Tag chips
    const tags = def.tags.length ? def.tags : ['—'];
    const chipW = 108;
    const totalW = tags.length * chipW + (tags.length - 1) * 12;
    tags.forEach((t, i) => {
      const cxOff = x - totalW / 2 + chipW / 2 + i * (chipW + 12);
      this.add.rectangle(cxOff, y - h / 2 + 220, chipW, 40, 0x232336, 1).setStrokeStyle(2, 0x3a3a55, 1);
      this.add
        .text(cxOff, y - h / 2 + 220, t, { fontFamily: 'sans-serif', fontSize: '24px', color: '#9aa3bb' })
        .setOrigin(0.5);
    });

    this.add
      .text(x, y + 70, def.description, {
        fontFamily: 'sans-serif',
        fontSize: '31px',
        color: '#d8dce8',
        wordWrap: { width: w - 60 },
        align: 'center',
        lineSpacing: 9,
      })
      .setOrigin(0.5);

    if (isLevel) {
      this.add
        .text(
          x,
          y + h / 2 - 74,
          `Level ${levelOf(def.id)} → ${levelOf(def.id) + 1}   (effect ×${(1 + 0.6 * levelOf(def.id)).toFixed(1)})`,
          { fontFamily: 'sans-serif', fontSize: '25px', fontStyle: 'bold', color: '#7ee08a' },
        )
        .setOrigin(0.5);
    }

    // Slot number
    this.add
      .text(x, y + h / 2 - 34, `${index + 1}`, { fontFamily: 'sans-serif', fontSize: '24px', color: '#5a6480' })
      .setOrigin(0.5);

    // Reroll button (once per slot)
    const rx = x + w / 2 - 40;
    const ry = y - h / 2 + 40;
    const used = o.rerolled;
    const rBg = this.add.circle(rx, ry, 26, used ? 0x1a1a24 : 0x2a3550, 1).setStrokeStyle(2, used ? 0x33384a : 0x6a9ad0, 1);
    this.add
      .text(rx, ry, '⟳', {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: used ? '#44485a' : '#a8d8ff',
      })
      .setOrigin(0.5);
    if (!used) {
      rBg.setInteractive({ useHandCursor: true });
      rBg.on('pointerdown', () => (trade ? this.rerollTradeGold(index) : this.rerollSlot(index)));
    }

    // Pick — whole card
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x1f1f30));
    bg.on('pointerout', () => bg.setFillStyle(0x14141f));
    bg.on('pointerdown', () => (trade ? this.pickTradeGold(index) : this.pickSlot(index)));
  }
}
