import Phaser from 'phaser';
import { AugmentDef, Tier } from '../augments/types';
import { addAugment } from '../core/run';
import { sfx } from '../core/sfx';
import { GAME_W, GAME_H, COLORS } from '../config';
import { STR } from '../core/strings';

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

    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x06060c, 0.92);
    this.add
      .text(GAME_W / 2, 110, STR.pickAugment, {
        fontFamily: 'sans-serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const cardW = 460;
    const cardH = 560;
    const gap = 60;
    const total = offers.length * cardW + (offers.length - 1) * gap;
    const x0 = (GAME_W - total) / 2 + cardW / 2;
    const y = GAME_H / 2 + 60;

    offers.forEach((def, i) => this.makeCard(def, x0 + i * (cardW + gap), y, cardW, cardH, i));
  }

  private makeCard(def: AugmentDef, x: number, y: number, w: number, h: number, index: number): void {
    const tierColor = TIER_COLOR[def.tier];
    const zone = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, w, h, 0x14141f, 1).setStrokeStyle(5, tierColor, 1);
    zone.add(bg);

    // Prisma shimmer: second offset outline
    if (def.tier === 'prisma') {
      zone.add(this.add.rectangle(0, 0, w + 16, h + 16, 0x000000, 0).setStrokeStyle(2, tierColor, 0.5));
    }

    zone.add(
      this.add
        .text(0, -h / 2 + 56, TIER_LABEL[def.tier], {
          fontFamily: 'sans-serif',
          fontSize: '30px',
          color: '#' + tierColor.toString(16).padStart(6, '0'),
        })
        .setOrigin(0.5),
    );
    zone.add(
      this.add
        .text(0, -h / 2 + 130, def.name, {
          fontFamily: 'sans-serif',
          fontSize: '46px',
          fontStyle: 'bold',
          color: '#ffffff',
          wordWrap: { width: w - 50 },
          align: 'center',
        })
        .setOrigin(0.5),
    );
    zone.add(
      this.add
        .text(0, -h / 2 + 195, def.tags.join(' · ') || '—', {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          color: '#9aa3bb',
        })
        .setOrigin(0.5),
    );
    zone.add(
      this.add
        .text(0, 60, def.description, {
          fontFamily: 'sans-serif',
          fontSize: '32px',
          color: '#d8dce8',
          wordWrap: { width: w - 60 },
          align: 'center',
          lineSpacing: 8,
        })
        .setOrigin(0.5),
    );

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x1f1f30));
    bg.on('pointerout', () => bg.setFillStyle(0x14141f));
    bg.on('pointerdown', () => this.pick(def));
    this.input.keyboard?.addKey(['ONE', 'TWO', 'THREE'][index]).on('down', () => this.pick(def));
  }

  private picked = false;

  private pick(def: AugmentDef): void {
    if (this.picked) return;
    this.picked = true;
    sfx.pick();
    addAugment(def);
    this.scene.start('arena');
  }
}
