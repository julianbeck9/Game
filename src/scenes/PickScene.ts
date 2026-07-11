import Phaser from 'phaser';
import { AugmentDef, Tier } from '../augments/types';
import { addAugment, run } from '../core/run';
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
    const { offers } = data;

    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x06060c, 0.94);
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
        .text(GAME_W / 2, GAME_H - 44, `Deine Augmente: ${run.augments.map((a) => a.name).join(' · ')}`, {
          fontFamily: 'sans-serif',
          fontSize: '25px',
          color: '#7a86a5',
          wordWrap: { width: GAME_W - 200 },
          align: 'center',
        })
        .setOrigin(0.5);
    }
  }

  private makeCard(def: AugmentDef, x: number, y: number, w: number, h: number, index: number): void {
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

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x1f1f30));
    bg.on('pointerout', () => bg.setFillStyle(0x14141f));
    bg.on('pointerdown', () => {
      this.tweens.add({ targets: zone, scaleX: 0.96, scaleY: 0.96, duration: 70, yoyo: true });
      this.pick(def);
    });
    this.input.keyboard?.addKey(['ONE', 'TWO', 'THREE'][index]).on('down', () => this.pick(def));
  }

  private picked = false;

  private pick(def: AugmentDef): void {
    if (this.picked) return;
    this.picked = true;
    sfx.pick();
    addAugment(def);
    this.time.delayedCall(180, () => this.scene.start('shop'));
  }
}
