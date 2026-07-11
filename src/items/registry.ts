import { AugmentDef } from '../augments/types';

/**
 * Items: purchasable stat packages with optional passives. Technically they
 * are augment defs (stat mods through the pipeline, passives through hooks),
 * so the AugmentManager activates them each combat with zero extra plumbing.
 * Names and text are this game's own; concepts nod to familiar shop staples.
 */
export interface ItemDef extends AugmentDef {
  cost: number;
  glyph: string;
  color: number;
}

function item(def: Omit<ItemDef, 'tier' | 'tags'>): ItemDef {
  return { ...def, tier: 'gold', tags: [] };
}

export const ITEMS: ItemDef[] = [
  item({
    id: 'it_langschwert',
    name: 'Langschwert',
    cost: 350,
    glyph: 'S',
    color: 0xc0c8d8,
    description: '+8 Angriffsschaden',
    statMods: [{ stat: 'damage', flat: 8 }],
  }),
  item({
    id: 'it_dolch',
    name: 'Dolch',
    cost: 350,
    glyph: 'D',
    color: 0xd8d0a0,
    description: '+18% Angriffstempo',
    statMods: [{ stat: 'attackSpeed', pct: 0.18 }],
  }),
  item({
    id: 'it_kettenweste',
    name: 'Kettenweste',
    cost: 350,
    glyph: 'K',
    color: 0x9fb4cc,
    description: '+16 Rüstung',
    statMods: [{ stat: 'armor', flat: 16 }],
  }),
  item({
    id: 'it_magiemantel',
    name: 'Magiemantel',
    cost: 350,
    glyph: 'M',
    color: 0x8adfff,
    description: '+16 Magieresistenz',
    statMods: [{ stat: 'magicResist', flat: 16 }],
  }),
  item({
    id: 'it_riesenguertel',
    name: 'Riesengürtel',
    cost: 400,
    glyph: 'G',
    color: 0xe07070,
    description: '+50 max. LP',
    statMods: [{ stat: 'maxHP', flat: 50 }],
  }),
  item({
    id: 'it_zauberkern',
    name: 'Zauberkern',
    cost: 400,
    glyph: 'Z',
    color: 0xbf8aff,
    description: '+25 Fähigkeitsstärke',
    statMods: [{ stat: 'abilityPower', flat: 25 }],
  }),
  item({
    id: 'it_vampirzepter',
    name: 'Vampirzepter',
    cost: 800,
    glyph: 'V',
    color: 0xe05070,
    description: '+10 Angriffsschaden · +8% Lebensraub',
    statMods: [
      { stat: 'damage', flat: 10 },
      { stat: 'lifesteal', flat: 0.08 },
    ],
  }),
  item({
    id: 'it_ewigklinge',
    name: 'Ewigklinge',
    cost: 1200,
    glyph: 'E',
    color: 0xffd24a,
    description: '+20 Angriffsschaden · +20% Kritchance',
    statMods: [
      { stat: 'damage', flat: 20 },
      { stat: 'critChance', flat: 0.2 },
    ],
  }),
  item({
    id: 'it_phantomschritt',
    name: 'Phantomschritt',
    cost: 1000,
    glyph: 'P',
    color: 0xaadfff,
    description: '+35% Angriffstempo · +6% Tempo',
    statMods: [
      { stat: 'attackSpeed', pct: 0.35 },
      { stat: 'moveSpeed', pct: 0.06 },
    ],
  }),
  item({
    id: 'it_dornenharnisch',
    name: 'Dornenharnisch',
    cost: 900,
    glyph: 'H',
    color: 0x88cc88,
    description: '+30 Rüstung · Nahkampf-Angreifer erleiden 12% zurück',
    statMods: [{ stat: 'armor', flat: 30 }],
    hooks: {
      damageTaken: ({ source, dmg, melee }, ctx) => {
        if (!melee || !source || !source.alive) return;
        ctx.combat.dealDamage(ctx.player, source, dmg * 0.12, 'reflect');
      },
    },
  }),
  item({
    id: 'it_glutpanzer',
    name: 'Glutpanzer',
    cost: 1000,
    glyph: 'F',
    color: 0xff7722,
    description: '+45 LP · +12 Rüstung · versengt Gegner in deiner Nähe',
    statMods: [
      { stat: 'maxHP', flat: 45 },
      { stat: 'armor', flat: 12 },
    ],
    onUpdate: (_dt, ctx) => {
      if ((ctx.run.memory.glutNextAt ?? 0) > ctx.combat.now) return;
      ctx.run.memory.glutNextAt = ctx.combat.now + 500;
      for (const u of ctx.combat.units) {
        if (!u.alive || u.team !== 'enemy') continue;
        if (Math.hypot(u.x - ctx.player.x, u.y - ctx.player.y) > 180) continue;
        ctx.combat.addBurn(u, 4, 600);
      }
    },
  }),
  item({
    id: 'it_arkanbuch',
    name: 'Arkanbuch',
    cost: 800,
    glyph: 'A',
    color: 0x9f9fff,
    description: '+25 Fähigkeitentempo · +15 Fähigkeitsstärke',
    statMods: [
      { stat: 'abilityHaste', flat: 25 },
      { stat: 'abilityPower', flat: 15 },
    ],
  }),
  item({
    id: 'it_windlaeufer',
    name: 'Windläufer',
    cost: 900,
    glyph: 'W',
    color: 0xbfeef8,
    description: '+10 Angriffsschaden · Treffer geben +12% Tempo (1,5s)',
    statMods: [{ stat: 'damage', flat: 10 }],
    hooks: {
      autoHit: (_p, ctx) => {
        ctx.player.stats.set({
          id: 'buff:windlaeufer',
          stat: 'moveSpeed',
          pct: 0.12,
          expiresAt: ctx.combat.now + 1500,
        });
      },
    },
  }),
  item({
    id: 'it_schutzamulett',
    name: 'Schutzamulett',
    cost: 800,
    glyph: 'O',
    color: 0x88bbff,
    description: '+10 Rüstung & MR · Rundenstart: Schild (10% max. LP)',
    statMods: [
      { stat: 'armor', flat: 10 },
      { stat: 'magicResist', flat: 10 },
    ],
    hooks: {
      roundStart: (_p, ctx) => ctx.player.addShield(ctx.player.maxHP * 0.1),
    },
  }),
];

export function itemById(id: string): ItemDef | undefined {
  return ITEMS.find((i) => i.id === id);
}

/** Shop offer: 6 distinct random items, cheap ones early, big ones later. */
export function rollShop(round: number, count = 6): ItemDef[] {
  const pool = ITEMS.filter((i) => (round <= 2 ? i.cost <= 500 : true));
  const offers: ItemDef[] = [];
  const bag = [...pool];
  while (offers.length < count && bag.length > 0) {
    offers.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  }
  return offers;
}

export const MAX_ITEMS = 6;
