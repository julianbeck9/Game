import Phaser from 'phaser';
import { AugmentDef, Tier } from '../augments/types';
import { addAugment, run, MAX_AUGMENTS, levelOf, levelUp, removeAugment } from '../core/run';
import { GAME_W, GAME_H, COLORS } from '../config';
import { STR } from '../core/strings';
import { sfx } from '../core/sfx';

const TIER_COLOR: Record<Tier, number> = {
  silber: COLORS.silver,
  gold: COLORS.gold,
  prisma: COLORS.prisma,
};
const TIER_LABEL: Record<Tier, string> = {
  silber: 'Silber',
  gold: 'Gold',
  prisma: 'Prisma',
};

export interface PickSceneData {
  offers: AugmentDef[];
}

/** Between-rounds augment choice: 3 cards, pick 1 (tap or keys 1–3). */
export class PickScene extends Phaser.Scene {
  constructor() {
    super('pick');
  }

  create(data: PickSceneData): void {
    this.picked = false;
    this.phase = 'pick';
    const { offers } = data;

    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x06060c, 0.94);

    // 6/6 Augmente: statt neuer Angebote wird aufgewertet (Kosten: eins weggeben)
    if (run.augments.length >= MAX_AUGMENTS) {
      const upgradable = run.augments.filter((a) => levelOf(a.id) < 3);
      if (upgradable.length === 0) {
        // Alles auf Maximalstufe: direkt weiter
        this.time.delayedCall(50, () => this.routeOn());
        return;
      }
      this.add
        .text(GAME_W / 2, 96, 'Werte ein Augment auf', {
          fontFamily: 'Georgia, serif',
          fontSize: '64px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setShadow(0, 5, '#000000', 12, false, true);
      this.add
        .text(GAME_W / 2, 168, 'Slots voll (6/6) — Aufwertung kostet ein anderes Augment', {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          fontStyle: 'italic',
          color: '#a8b0c8',
        })
        .setOrigin(0.5);

      const picks: AugmentDef[] = [];
      const bag = [...upgradable];
      while (picks.length < 3 && bag.length > 0) {
        picks.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
      }
      const cardW = 460;
      const cardH = 560;
      const gap = 60;
      const total = picks.length * cardW + (picks.length - 1) * gap;
      const x0 = (GAME_W - total) / 2 + cardW / 2;
      picks.forEach((def, i) =>
        this.makeCard(def, x0 + i * (cardW + gap), GAME_H / 2 + 60, cardW, cardH, i, true),
      );
      return;
    }

    this.add
      .text(GAME_W / 2, 96, STR.pickAugment, {
        fontFamily: 'Georgia, serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#000000', 12, false, true);

    const cardW = 460;
    const cardH = 560;
    const gap = 60;
    const total = offers.length * cardW + (offers.length - 1) * gap;
    const x0 = (GAME_W - total) / 2 + cardW / 2;
    const y = GAME_H / 2 + 40;

    offers.forEach((def, i) => this.makeCard(def, x0 + i * (cardW + gap), y, cardW, cardH, i));

    // Current build, so the choice can be made in context
    if (run.augments.length > 0) {
      this.add
        .text(GAME_W / 2, GAME_H - 44, `Deine Augmente: ${run.augments.map((a) => `${a.name} ${'★'.repeat(levelOf(a.id))}`).join(' · ')}`, {
          fontFamily: 'sans-serif',
          fontSize: '25px',
          color: '#7a86a5',
          wordWrap: { width: GAME_W - 200 },
          align: 'center',
        })
        .setOrigin(0.5);
    }
  }

  /** Phase 2 des Aufwertens: eines der übrigen Augmente muss gehen. */
  private showDiscard(upgraded: AugmentDef): void {
    this.phase = 'discard';
    this.children.removeAll(true);
    this.picked = false;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x06060c, 0.94);
    this.add
      .text(GAME_W / 2, 96, 'Gib ein Augment weg', {
        fontFamily: 'Georgia, serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#ff9a8a',
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#000000', 12, false, true);
    this.add
      .text(GAME_W / 2, 168, `${upgraded.name} wurde auf Stufe ${levelOf(upgraded.id)} aufgewertet`, {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: '#7ee08a',
      })
      .setOrigin(0.5);

    const others = run.augments.filter((a) => a.id !== upgraded.id);
    const cardW = 280;
    const cardH = 340;
    const gap = 26;
    const total = others.length * cardW + (others.length - 1) * gap;
    const x0 = (GAME_W - total) / 2 + cardW / 2;
    others.forEach((def, i) => {
      const x = x0 + i * (cardW + gap);
      const y = GAME_H / 2 + 60;
      const tierColor = TIER_COLOR[def.tier];
      const bg = this.add
        .rectangle(x, y, cardW, cardH, 0x14141f, 1)
        .setStrokeStyle(3, tierColor, 1)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, y - cardH / 2 + 44, `${def.name} ${'★'.repeat(levelOf(def.id))}`, {
          fontFamily: 'Georgia, serif',
          fontSize: '27px',
          fontStyle: 'bold',
          color: '#ffffff',
          wordWrap: { width: cardW - 30 },
          align: 'center',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 20, def.description, {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: '#b8c0d4',
          wordWrap: { width: cardW - 34 },
          align: 'center',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + cardH / 2 - 32, 'Weggeben', {
          fontFamily: 'sans-serif',
          fontSize: '23px',
          fontStyle: 'bold',
          color: '#ff9a8a',
        })
        .setOrigin(0.5);
      bg.on('pointerover', () => bg.setFillStyle(0x2a1a1a));
      bg.on('pointerout', () => bg.setFillStyle(0x14141f));
      bg.on('pointerdown', () => {
        if (this.picked) return;
        this.picked = true;
        sfx.pick();
        removeAugment(def.id);
        this.time.delayedCall(180, () => this.routeOn());
      });
    });
  }

  /** Weiter im Rundenzyklus: Händler nur nach dem Zahltag (jede 2. Runde). */
  private routeOn(): void {
    const shopDay = (run.round - 1) % 2 === 0;
    this.scene.start(shopDay ? 'shop' : 'arena');
  }

  private makeCard(def: AugmentDef, x: number, y: number, w: number, h: number, index: number, upgrade = false): void {
    const tierColor = TIER_COLOR[def.tier];
    const zone = this.add.container(x, y + 60).setAlpha(0);

    const bg = this.add.rectangle(0, 0, w, h, 0x14141f, 1).setStrokeStyle(4, tierColor, 1);
    zone.add(bg);

    // Tier header band
    const band = this.add.rectangle(0, -h / 2 + 44, w - 8, 80, tierColor, def.tier === 'prisma' ? 0.16 : 0.1);
    zone.add(band);

    // Prisma shimmer: animated offset outline
    if (def.tier === 'prisma') {
      const shimmer = this.add.rectangle(0, 0, w + 18, h + 18, 0x000000, 0).setStrokeStyle(2, tierColor, 0.6);
      zone.add(shimmer);
      this.tweens.add({
        targets: shimmer,
        alpha: { from: 1, to: 0.35 },
        scaleX: { from: 1, to: 1.015 },
        scaleY: { from: 1, to: 1.015 },
        duration: 750,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Tier gem + label
    const gem = this.add.graphics();
    gem.fillStyle(tierColor, 1);
    gem.fillTriangle(-11, -4, 11, -4, 0, 14);
    gem.fillTriangle(-11, -4, 11, -4, 0, -16);
    gem.setPosition(-w / 2 + 44, -h / 2 + 44);
    zone.add(gem);
    zone.add(
      this.add
        .text(-w / 2 + 74, -h / 2 + 44, TIER_LABEL[def.tier], {
          fontFamily: 'sans-serif',
          fontSize: '30px',
          fontStyle: 'bold',
          color: '#' + tierColor.toString(16).padStart(6, '0'),
        })
        .setOrigin(0, 0.5),
    );

    zone.add(
      this.add
        .text(0, -h / 2 + 150, def.name, {
          fontFamily: 'Georgia, serif',
          fontSize: '48px',
          fontStyle: 'bold',
          color: '#ffffff',
          wordWrap: { width: w - 50 },
          align: 'center',
        })
        .setOrigin(0.5),
    );

    // Tag chips
    const tags = def.tags.length ? def.tags : ['—'];
    const chipW = 108;
    const totalW = tags.length * chipW + (tags.length - 1) * 12;
    tags.forEach((t, i) => {
      const cxOff = -totalW / 2 + chipW / 2 + i * (chipW + 12);
      const chip = this.add
        .rectangle(cxOff, -h / 2 + 218, chipW, 40, 0x232336, 1)
        .setStrokeStyle(2, 0x3a3a55, 1);
      chip.isStroked = true;
      zone.add(chip);
      zone.add(
        this.add
          .text(cxOff, -h / 2 + 218, t, {
            fontFamily: 'sans-serif',
            fontSize: '24px',
            color: '#9aa3bb',
          })
          .setOrigin(0.5),
      );
    });

    zone.add(
      this.add
        .text(0, 75, def.description, {
          fontFamily: 'sans-serif',
          fontSize: '32px',
          color: '#d8dce8',
          wordWrap: { width: w - 60 },
          align: 'center',
          lineSpacing: 9,
        })
        .setOrigin(0.5),
    );

    zone.add(
      this.add
        .text(0, h / 2 - 34, `${index + 1}`, {
          fontFamily: 'sans-serif',
          fontSize: '24px',
          color: '#5a6480',
        })
        .setOrigin(0.5),
    );

    // Staggered entrance
    this.tweens.add({
      targets: zone,
      y,
      alpha: 1,
      duration: 320,
      delay: index * 90,
      ease: 'Cubic.easeOut',
    });

    // Aufwertungs-Karten zeigen Stufe und den kommenden Sprung
    if (upgrade) {
      zone.add(
        this.add
          .text(0, h / 2 - 70, `Stufe ${levelOf(def.id)} → ${levelOf(def.id) + 1}  (Wirkung ×${(1 + 0.6 * levelOf(def.id)).toFixed(1)})`, {
            fontFamily: 'sans-serif',
            fontSize: '25px',
            fontStyle: 'bold',
            color: '#7ee08a',
          })
          .setOrigin(0.5),
      );
    }

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x1f1f30));
    bg.on('pointerout', () => bg.setFillStyle(0x14141f));
    bg.on('pointerdown', () => {
      this.tweens.add({ targets: zone, scaleX: 0.96, scaleY: 0.96, duration: 70, yoyo: true });
      if (upgrade) this.pickUpgrade(def);
      else this.pick(def);
    });
    this.input.keyboard?.addKey(['ONE', 'TWO', 'THREE'][index]).on('down', () => {
      if (upgrade) this.pickUpgrade(def);
      else this.pick(def);
    });
  }

  private phase: 'pick' | 'discard' = 'pick';

  private pickUpgrade(def: AugmentDef): void {
    if (this.picked || this.phase !== 'pick') return;
    this.picked = true;
    sfx.pick();
    levelUp(def.id);
    this.time.delayedCall(180, () => this.showDiscard(def));
  }

  private picked = false;

  private pick(def: AugmentDef): void {
    if (this.picked) return;
    this.picked = true;
    sfx.pick();
    addAugment(def);
    this.time.delayedCall(180, () => this.routeOn());
  }
}
