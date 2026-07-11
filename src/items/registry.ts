import { AugmentDef, AugmentCtx } from '../augments/types';
import { procDamage, enemiesWithin, slowUnit, unitCounterAdd } from '../augments/helpers';

/**
 * Items: purchasable stat packages with optional passives. Technically they
 * are augment defs (stat mods through the pipeline, passives through hooks),
 * so the AugmentManager activates them each combat with zero extra plumbing.
 *
 * The catalog adapts the well-known shop roster: same stat relationships
 * (flat values rescaled — HP ÷10, AD/AP ÷3, armor/MR/percentages/haste 1:1),
 * costs mapped onto our gold economy (Budget ~300 · Kern ~700 · Luxus 1100).
 * Every name, text and implementation is this game's own.
 */
export interface ItemDef extends AugmentDef {
  cost: number;
  glyph: string;
  color: number;
}

function item(def: Omit<ItemDef, 'tier' | 'tags'>): ItemDef {
  return { ...def, tier: 'gold', tags: [] };
}

// ---------------------------------------------------------------------------
// BUDGET (~300 Gold) — erste Einkäufe nach dem ersten Zahltag
// ---------------------------------------------------------------------------

const BUDGET: ItemDef[] = [
  item({
    id: 'it_windsohlen',
    name: 'Windsohlen',
    cost: 280,
    glyph: 'W',
    color: 0xbfeef8,
    description: '+18% Tempo',
    statMods: [{ stat: 'moveSpeed', pct: 0.18 }],
  }),
  item({
    id: 'it_waechterhorn',
    name: 'Wächterhorn',
    cost: 300,
    glyph: 'H',
    color: 0xc9b98a,
    description: '+15 max. LP · blockt 2 Schaden von jedem Treffer',
    statMods: [{ stat: 'maxHP', flat: 15 }],
    hooks: {
      damageTaken: ({ dmg }, ctx) => ctx.player.heal(Math.min(dmg, 2)),
    },
  }),
  item({
    id: 'it_waechterklinge',
    name: 'Wächterklinge',
    cost: 330,
    glyph: 'K',
    color: 0xc0c8d8,
    description: '+10 AD · +15 max. LP · +15 Fähigkeitentempo',
    statMods: [
      { stat: 'damage', flat: 10 },
      { stat: 'maxHP', flat: 15 },
      { stat: 'abilityHaste', flat: 15 },
    ],
  }),
  item({
    id: 'it_waechterkugel',
    name: 'Wächterkugel',
    cost: 320,
    glyph: 'O',
    color: 0xbf8aff,
    description: '+17 AP · +15 max. LP',
    statMods: [
      { stat: 'abilityPower', flat: 17 },
      { stat: 'maxHP', flat: 15 },
    ],
  }),
  item({
    id: 'it_waechterhammer',
    name: 'Wächterhammer',
    cost: 320,
    glyph: 'M',
    color: 0xd8a070,
    description: '+8 AD · +15 max. LP · +5% Lebensraub',
    statMods: [
      { stat: 'damage', flat: 8 },
      { stat: 'maxHP', flat: 15 },
      { stat: 'lifesteal', flat: 0.05 },
    ],
  }),
  item({
    id: 'it_sporensohlen',
    name: 'Sporensohlen',
    cost: 360,
    glyph: 'S',
    color: 0xd8d0a0,
    description: '+40% Angriffstempo · +13% Tempo · +5% Lebensraub',
    statMods: [
      { stat: 'attackSpeed', pct: 0.4 },
      { stat: 'moveSpeed', pct: 0.13 },
      { stat: 'lifesteal', flat: 0.05 },
    ],
  }),
  item({
    id: 'it_panzerstiefel',
    name: 'Panzerstiefel',
    cost: 340,
    glyph: 'P',
    color: 0x9fb4cc,
    description: '+35 Rüstung · +13% Tempo',
    statMods: [
      { stat: 'armor', flat: 35 },
      { stat: 'moveSpeed', pct: 0.13 },
    ],
  }),
  item({
    id: 'it_kettenschuhe',
    name: 'Kettenschuhe',
    cost: 330,
    glyph: 'C',
    color: 0x8adfff,
    description: '+30 Magieresistenz · +13% Tempo',
    statMods: [
      { stat: 'magicResist', flat: 30 },
      { stat: 'moveSpeed', pct: 0.13 },
    ],
  }),
  item({
    id: 'it_seelendieb',
    name: 'Seelendieb',
    cost: 350,
    glyph: '✦',
    color: 0xcc66ff,
    description: '+7 AP · +10 LP · Tötungen: +1,7 AP dauerhaft (max. 25); ab 10: +10% Tempo',
    statMods: [
      { stat: 'abilityPower', flat: 7 },
      { stat: 'maxHP', flat: 10 },
    ],
    onCombatInit: (ctx) => applySeelendieb(ctx),
    hooks: {
      killWindow: (_p, ctx) => {
        ctx.run.memory.itSeeleStacks = Math.min(25, (ctx.run.memory.itSeeleStacks ?? 0) + 1);
        applySeelendieb(ctx);
      },
    },
  }),
];

function applySeelendieb(ctx: AugmentCtx): void {
  const st = ctx.run.memory.itSeeleStacks ?? 0;
  ctx.player.stats.set({ id: 'perm:itseele-ap', stat: 'abilityPower', flat: st * 1.7 });
  if (st >= 10) ctx.player.stats.set({ id: 'perm:itseele-ms', stat: 'moveSpeed', pct: 0.1 });
}

// ---------------------------------------------------------------------------
// KERN (~600–800 Gold) — die großen Kaufentscheidungen
// ---------------------------------------------------------------------------

const KERN: ItemDef[] = [
  item({
    id: 'it_dornenwall',
    name: 'Dornenwall',
    cost: 640,
    glyph: '♠',
    color: 0x88cc88,
    description: '+30 LP · +60 Rüstung · Angreifer erleiden 3 + 15% Rüstung als magischen Schaden',
    statMods: [
      { stat: 'maxHP', flat: 30 },
      { stat: 'armor', flat: 60 },
    ],
    hooks: {
      damageTaken: ({ source }, ctx) => {
        if (!source || !source.alive) return;
        const thorns = 3 + 0.15 * ctx.player.stats.get('armor');
        ctx.combat.dealDamage(ctx.player, source, thorns, 'reflect', 'magisch');
      },
    },
  }),
  item({
    id: 'it_unendlichkeit',
    name: 'Unendlichkeitsschneide',
    cost: 780,
    glyph: '∞',
    color: 0xffd24a,
    description: '+25 AD · +25% Kritchance · Angriffe: +25% Bonus × Kritchance',
    statMods: [
      { stat: 'damage', flat: 25 },
      { stat: 'critChance', flat: 0.25 },
    ],
    hooks: {
      autoHit: ({ target, dmg }, ctx) => {
        if (!target.alive) return;
        const c = Math.min(1, ctx.player.stats.get('critChance'));
        procDamage(ctx, target, dmg * 0.25 * c, 'physisch');
      },
    },
  }),
  item({
    id: 'it_blutduerster',
    name: 'Blutdürster',
    cost: 720,
    glyph: 'B',
    color: 0xe05070,
    description: '+23 AD · +18% Lebensraub · Überheilung wird zu Schild (bis 20% max. LP)',
    statMods: [
      { stat: 'damage', flat: 23 },
      { stat: 'lifesteal', flat: 0.18 },
    ],
    onUpdate: (dt, ctx) => {
      const p = ctx.player;
      if (p.hpPct >= 0.995 && p.shield < p.maxHP * 0.2) {
        p.shield = Math.min(p.maxHP * 0.2, p.shield + p.maxHP * 0.03 * dt);
      }
    },
  }),
  item({
    id: 'it_rabenhut',
    name: 'Rabenhut',
    cost: 780,
    glyph: '♜',
    color: 0x9f5fff,
    description: '+22 AP · erhöht deine gesamte Fähigkeitsstärke um 30%',
    statMods: [
      { stat: 'abilityPower', flat: 22 },
      { stat: 'abilityPower', pct: 0.3 },
    ],
  }),
  item({
    id: 'it_leerenstab',
    name: 'Leerenstab',
    cost: 680,
    glyph: '∅',
    color: 0xb388ff,
    description: '+22 AP · Fähigkeiten: +15% als wahrer Schaden',
    statMods: [{ stat: 'abilityPower', flat: 22 }],
    hooks: {
      abilityHit: ({ target, dmg }, ctx) => {
        if (target.alive) procDamage(ctx, target, dmg * 0.15, 'wahr');
      },
    },
  }),
  item({
    id: 'it_basiliskenzahn',
    name: 'Basiliskenzahn',
    cost: 700,
    glyph: 'Z',
    color: 0x88ffaa,
    description: '+23 AP · +45% Angriffstempo · Angriffe: +2 (+20% AP) magischer Schaden',
    statMods: [
      { stat: 'abilityPower', flat: 23 },
      { stat: 'attackSpeed', pct: 0.45 },
    ],
    hooks: {
      autoHit: ({ target }, ctx) => {
        if (!target.alive) return;
        procDamage(ctx, target, 2 + 0.2 * ctx.player.stats.get('abilityPower'), 'magisch');
      },
    },
  }),
  item({
    id: 'it_lichklinge',
    name: 'Lichklinge',
    cost: 720,
    glyph: 'L',
    color: 0x9fd8ff,
    description: '+27 AP · +10% Tempo · +20 Haste · Nach einer Fähigkeit: nächster Angriff +75% AP magisch',
    statMods: [
      { stat: 'abilityPower', flat: 27 },
      { stat: 'moveSpeed', pct: 0.1 },
      { stat: 'abilityHaste', flat: 20 },
    ],
    hooks: {
      abilityCast: (_p, ctx) => {
        ctx.run.memory.itLichArmed = 1;
      },
      autoHit: ({ target }, ctx) => {
        if (!ctx.run.memory.itLichArmed || !target.alive) return;
        ctx.run.memory.itLichArmed = 0;
        ctx.combat.flashLine(ctx.player.x, ctx.player.y, target.x, target.y, 0x9fd8ff);
        procDamage(ctx, target, 0.75 * ctx.player.stats.get('abilityPower'), 'magisch');
      },
    },
  }),
  item({
    id: 'it_lavamantel',
    name: 'Lavamantel',
    cost: 660,
    glyph: 'F',
    color: 0xff7722,
    description: '+35 LP · +40 Rüstung · Gegner in deiner Nähe (350) brennen: 2 + 0,5% deiner max. LP pro Sekunde',
    statMods: [
      { stat: 'maxHP', flat: 35 },
      { stat: 'armor', flat: 40 },
    ],
    onUpdate: (_dt, ctx) => {
      if ((ctx.run.memory.itLavaNext ?? 0) > ctx.combat.now) return;
      ctx.run.memory.itLavaNext = ctx.combat.now + 1000;
      for (const u of enemiesWithin(ctx, ctx.player.x, ctx.player.y, 350)) {
        ctx.combat.addBurn(u, 2 + ctx.player.maxHP * 0.005, 1100);
      }
    },
  }),
  item({
    id: 'it_geistermaske',
    name: 'Geistermaske',
    cost: 640,
    glyph: 'G',
    color: 0x88ddcc,
    description: '+30 LP · +40 MR · +10 Haste · Lebensraub wirkt 30% stärker',
    statMods: [
      { stat: 'maxHP', flat: 30 },
      { stat: 'magicResist', flat: 40 },
      { stat: 'abilityHaste', flat: 10 },
      { stat: 'lifesteal', pct: 0.3 },
    ],
  }),
  item({
    id: 'it_warmherz',
    name: 'Warmherz',
    cost: 700,
    glyph: '♥',
    color: 0x7ee08a,
    description: '+65 max. LP · Nach 3s ohne erlittenen Schaden: regeneriere 2% max. LP pro Sekunde',
    statMods: [{ stat: 'maxHP', flat: 65 }],
    hooks: {
      damageTaken: (_p, ctx) => {
        ctx.run.memory.itWarmLast = ctx.combat.now;
      },
    },
    onUpdate: (dt, ctx) => {
      if (ctx.combat.now - (ctx.run.memory.itWarmLast ?? 0) < 3000) return;
      ctx.player.heal(ctx.player.maxHP * 0.02 * dt);
    },
  }),
  item({
    id: 'it_schwarzbeil',
    name: 'Schwarzbeil',
    cost: 700,
    glyph: '⚒',
    color: 0xaa4444,
    description: '+13 AD · +35 LP · +20 Haste · phys. Treffer: −6% Rüstung (5 Stapel) und +6% Tempo (2s)',
    statMods: [
      { stat: 'damage', flat: 13 },
      { stat: 'maxHP', flat: 35 },
      { stat: 'abilityHaste', flat: 20 },
    ],
    hooks: {
      damageDealt: ({ target, type }, ctx) => {
        if (type === 'other' || type === 'burn' || !target.alive) return;
        const stacks = unitCounterAdd(target, 'itcleaver', 1, 5);
        target.stats.set({
          id: 'debuff:itcleaver',
          stat: 'armor',
          pct: -0.06 * stacks,
          expiresAt: ctx.combat.now + 6000,
        });
        ctx.player.stats.set({
          id: 'buff:itcleaver-ms',
          stat: 'moveSpeed',
          pct: 0.06,
          expiresAt: ctx.combat.now + 2000,
        });
      },
    },
  }),
  item({
    id: 'it_koenigsklinge',
    name: 'Klinge des gefallenen Königs',
    cost: 750,
    glyph: '†',
    color: 0x66dd88,
    description: '+13 AD · +25% Angriffstempo · +10% Lebensraub · Angriffe: +6% aktueller LP des Ziels phys.',
    statMods: [
      { stat: 'damage', flat: 13 },
      { stat: 'attackSpeed', pct: 0.25 },
      { stat: 'lifesteal', flat: 0.1 },
    ],
    hooks: {
      autoHit: ({ target }, ctx) => {
        if (!target.alive) return;
        procDamage(ctx, target, target.hp * 0.06, 'physisch');
      },
    },
  }),
  item({
    id: 'it_phantomtaenzer',
    name: 'Phantomtänzer',
    cost: 700,
    glyph: '♪',
    color: 0xaadfff,
    description: '+60% Angriffstempo · +25% Kritchance · +8% Tempo',
    statMods: [
      { stat: 'attackSpeed', pct: 0.6 },
      { stat: 'critChance', flat: 0.25 },
      { stat: 'moveSpeed', pct: 0.08 },
    ],
  }),
  item({
    id: 'it_sturmklinge',
    name: 'Sturmklinge',
    cost: 700,
    glyph: '⚡',
    color: 0xffee88,
    description: '+15 AD · +15 AP · +30% AS · Jeder 4. Angriff: Kettenblitz (12 magisch, bis zu 3 Ziele)',
    statMods: [
      { stat: 'damage', flat: 15 },
      { stat: 'abilityPower', flat: 15 },
      { stat: 'attackSpeed', pct: 0.3 },
    ],
    onCombatInit: (ctx) => {
      ctx.run.memory.itSturmCount = 0;
    },
    hooks: {
      autoHit: ({ target }, ctx) => {
        ctx.run.memory.itSturmCount = (ctx.run.memory.itSturmCount ?? 0) + 1;
        if (ctx.run.memory.itSturmCount < 4 || !target.alive) return;
        ctx.run.memory.itSturmCount = 0;
        let from = target;
        const hit = new Set([target]);
        procDamage(ctx, target, 12, 'magisch');
        for (let i = 0; i < 2; i++) {
          let next: typeof target | null = null;
          let best = 450;
          for (const u of ctx.combat.units) {
            if (!u.alive || u.team !== 'enemy' || hit.has(u)) continue;
            const d = Math.hypot(u.x - from.x, u.y - from.y);
            if (d < best) {
              best = d;
              next = u;
            }
          }
          if (!next) break;
          ctx.combat.flashLine(from.x, from.y, next.x, next.y, 0xffee88);
          procDamage(ctx, next, 12, 'magisch');
          hit.add(next);
          from = next;
        }
      },
    },
  }),
  item({
    id: 'it_runenbogen',
    name: 'Runenbogen',
    cost: 720,
    glyph: '⇶',
    color: 0xbbeeff,
    description: '+45% AS · +25% Kritchance · Angriffe feuern Bolzen auf bis zu 2 weitere Gegner (30% AD)',
    statMods: [
      { stat: 'attackSpeed', pct: 0.45 },
      { stat: 'critChance', flat: 0.25 },
    ],
    hooks: {
      autoHit: ({ target }, ctx) => {
        const others = ctx.combat.units
          .filter((u) => u.alive && u.team === 'enemy' && u !== target)
          .sort(
            (a, b) =>
              Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y),
          )
          .slice(0, 2);
        const dmg = ctx.player.stats.get('damage') * 0.3;
        for (const u of others) {
          if (Math.hypot(u.x - target.x, u.y - target.y) > 550) continue;
          ctx.combat.spawnProjectile({
            x: ctx.player.x,
            y: ctx.player.y,
            dirX: u.x - ctx.player.x,
            dirY: u.y - ctx.player.y,
            speed: 1000,
            radius: 6,
            color: 0xbbeeff,
            team: 'player',
            homing: u,
            maxDist: 800,
            onHit: (hitU) => procDamage(ctx, hitU, dmg, 'physisch'),
          });
        }
      },
    },
  }),
  item({
    id: 'it_rasende',
    name: 'Rasende Klinge',
    cost: 700,
    glyph: 'R',
    color: 0xff9955,
    description: '+7 AD · +8 AP · +25% AS · Angriffe: +4 magisch und +8% AS bis Rundenende (max. 4 Stapel)',
    statMods: [
      { stat: 'damage', flat: 7 },
      { stat: 'abilityPower', flat: 8 },
      { stat: 'attackSpeed', pct: 0.25 },
    ],
    onCombatInit: (ctx) => {
      ctx.run.memory.itRasendeStacks = 0;
    },
    hooks: {
      autoHit: ({ target }, ctx) => {
        if (target.alive) procDamage(ctx, target, 4, 'magisch');
        ctx.run.memory.itRasendeStacks = Math.min(4, (ctx.run.memory.itRasendeStacks ?? 0) + 1);
        ctx.player.stats.set({
          id: 'dyn:itrasende',
          stat: 'attackSpeed',
          pct: 0.08 * (ctx.run.memory.itRasendeStacks ?? 0),
        });
      },
    },
  }),
  item({
    id: 'it_witzende',
    name: 'Witzende',
    cost: 680,
    glyph: 'X',
    color: 0x66ccff,
    description: '+45 MR · +50% Angriffstempo · Angriffe: +5 magischer Schaden',
    statMods: [
      { stat: 'magicResist', flat: 45 },
      { stat: 'attackSpeed', pct: 0.5 },
    ],
    hooks: {
      autoHit: ({ target }, ctx) => {
        if (target.alive) procDamage(ctx, target, 5, 'magisch');
      },
    },
  }),
  item({
    id: 'it_frostherz',
    name: 'Frostherz',
    cost: 700,
    glyph: '❄',
    color: 0x99ddff,
    description: '+75 Rüstung · +20 Haste · Aura (450): Gegner greifen 20% langsamer an',
    statMods: [
      { stat: 'armor', flat: 75 },
      { stat: 'abilityHaste', flat: 20 },
    ],
    onUpdate: (_dt, ctx) => {
      for (const u of enemiesWithin(ctx, ctx.player.x, ctx.player.y, 450)) {
        u.stats.set({
          id: 'debuff:itfrostherz',
          stat: 'attackSpeed',
          pct: -0.2,
          expiresAt: ctx.combat.now + 300,
        });
      }
    },
  }),
  item({
    id: 'it_steinwall',
    name: 'Steinwall',
    cost: 690,
    glyph: '▣',
    color: 0xaa9977,
    description: '+30 LP · +65 Rüstung · Alle 10s: Gegner im Umkreis (350) −70% Tempo für 2s',
    statMods: [
      { stat: 'maxHP', flat: 30 },
      { stat: 'armor', flat: 65 },
    ],
    onUpdate: (_dt, ctx) => {
      if ((ctx.run.memory.itSteinNext ?? 0) > ctx.combat.now) return;
      const targets = enemiesWithin(ctx, ctx.player.x, ctx.player.y, 350);
      if (targets.length === 0) return;
      ctx.run.memory.itSteinNext = ctx.combat.now + 10000;
      ctx.combat.ring(ctx.player.x, ctx.player.y, 0xaa9977, 350);
      for (const u of targets) slowUnit(ctx, u, 'itsteinwall', 0.7, 2000);
    },
  }),
  item({
    id: 'it_frostzepter',
    name: 'Frostzepter',
    cost: 660,
    glyph: '¥',
    color: 0x88bbff,
    description: '+23 AP · +35 LP · Fähigkeitstreffer verlangsamen um 30% (1s)',
    statMods: [
      { stat: 'abilityPower', flat: 23 },
      { stat: 'maxHP', flat: 35 },
    ],
    hooks: {
      abilityHit: ({ target }, ctx) => {
        if (target.alive) slowUnit(ctx, target, 'itfrostzepter', 0.3, 1000);
      },
    },
  }),
  item({
    id: 'it_schattenflamme',
    name: 'Schattenflamme',
    cost: 700,
    glyph: '🔥',
    color: 0x7766aa,
    description: '+25 AP · Fähigkeiten gegen Gegner unter 40% LP: +20% magischer Schaden',
    statMods: [{ stat: 'abilityPower', flat: 25 }],
    hooks: {
      abilityHit: ({ target, dmg }, ctx) => {
        if (!target.alive || target.hpPct >= 0.4) return;
        procDamage(ctx, target, dmg * 0.2, 'magisch');
      },
    },
  }),
  item({
    id: 'it_spaltklinge',
    name: 'Spaltklinge',
    cost: 720,
    glyph: '◊',
    color: 0xcc88aa,
    description: '+25 AP · +30 LP · +8% Lebensraub · Im Kampf: +2% Schaden/s (bis +10%)',
    statMods: [
      { stat: 'abilityPower', flat: 25 },
      { stat: 'maxHP', flat: 30 },
      { stat: 'lifesteal', flat: 0.08 },
    ],
    hooks: {
      damageDealt: (_p, ctx) => {
        ctx.run.memory.itSpaltLast = ctx.combat.now;
      },
    },
    onUpdate: (dt, ctx) => {
      const inCombat = ctx.combat.now - (ctx.run.memory.itSpaltLast ?? 0) < 3000;
      const cur = ctx.run.memory.itSpaltStacks ?? 0;
      ctx.run.memory.itSpaltStacks = inCombat ? Math.min(0.1, cur + 0.02 * dt) : 0;
      const v = ctx.run.memory.itSpaltStacks ?? 0;
      ctx.player.stats.set({ id: 'dyn:itspalt-d', stat: 'damage', pct: v });
      ctx.player.stats.set({ id: 'dyn:itspalt-a', stat: 'abilityDamage', pct: v });
    },
  }),
  item({
    id: 'it_todestanz',
    name: 'Todestanz',
    cost: 760,
    glyph: '☠',
    color: 0xdd6666,
    description: '+18 AD · +45 Rüstung · +15 Haste · 30% Schaden wird über 3s gestundet · Tötungen heilen 15% max. LP',
    statMods: [
      { stat: 'damage', flat: 18 },
      { stat: 'armor', flat: 45 },
      { stat: 'abilityHaste', flat: 15 },
    ],
    onCombatInit: (ctx) => {
      ctx.run.memory.itTanzPool = 0;
    },
    hooks: {
      damageTaken: ({ dmg }, ctx) => {
        if (itTanzTicking) return;
        const store = dmg * 0.3;
        ctx.run.memory.itTanzPool = (ctx.run.memory.itTanzPool ?? 0) + store;
        ctx.player.heal(store);
      },
      killWindow: (_p, ctx) => {
        ctx.run.memory.itTanzPool = 0; // die Schuld ist beglichen
        ctx.player.heal(ctx.player.maxHP * 0.15);
      },
    },
    onUpdate: (dt, ctx) => {
      const pool = ctx.run.memory.itTanzPool ?? 0;
      if (pool <= 0 || !ctx.player.alive) return;
      const tick = Math.min(pool, (pool / 3) * dt + 0.2 * dt);
      ctx.run.memory.itTanzPool = pool - tick;
      ctx.run.memory.itTanzAcc = (ctx.run.memory.itTanzAcc ?? 0) + tick;
      if ((ctx.run.memory.itTanzNext ?? 0) <= ctx.combat.now && (ctx.run.memory.itTanzAcc ?? 0) > 0.5) {
        ctx.run.memory.itTanzNext = ctx.combat.now + 500;
        const amount = ctx.run.memory.itTanzAcc ?? 0;
        ctx.run.memory.itTanzAcc = 0;
        itTanzTicking = true;
        ctx.combat.dealDamage(null, ctx.player, amount, 'other', 'wahr');
        itTanzTicking = false;
      }
    },
  }),
  item({
    id: 'it_riesenfaust',
    name: 'Riesenfaust',
    cost: 720,
    glyph: '✊',
    color: 0xddaa66,
    description: '+30 LP · +45% deines Basis-AD · Unter 30% LP: Schild (60% max. LP), 1× pro Runde',
    statMods: [{ stat: 'maxHP', flat: 30 }],
    onCombatInit: (ctx) => {
      ctx.run.memory.itFaustUsed = 0;
    },
    onUpdate: (_dt, ctx) => {
      ctx.player.stats.set({
        id: 'dyn:itfaust-ad',
        stat: 'damage',
        flat: ctx.player.stats.getBase('damage') * 0.45,
      });
      if (!ctx.run.memory.itFaustUsed && ctx.player.alive && ctx.player.hpPct < 0.3) {
        ctx.run.memory.itFaustUsed = 1;
        ctx.player.addShield(ctx.player.maxHP * 0.6);
        ctx.combat.announce('Riesenfaust!', '#ddaa66');
      }
    },
  }),
  item({
    id: 'it_kriegsspeer',
    name: 'Kriegsspeer',
    cost: 680,
    glyph: '↟',
    color: 0xd0d4e0,
    description: '+15 AD · +35 LP · +25 Fähigkeitentempo',
    statMods: [
      { stat: 'damage', flat: 15 },
      { stat: 'maxHP', flat: 35 },
      { stat: 'abilityHaste', flat: 25 },
    ],
  }),
  item({
    id: 'it_sanduhr',
    name: 'Goldene Sanduhr',
    cost: 780,
    glyph: '⌛',
    color: 0xffcc66,
    description: '+25 AP · +45 Rüstung · Unter 30% LP: 2s unverwundbar (1× pro Runde)',
    statMods: [
      { stat: 'abilityPower', flat: 25 },
      { stat: 'armor', flat: 45 },
    ],
    onCombatInit: (ctx) => {
      ctx.run.memory.itUhrUsed = 0;
    },
    onUpdate: (_dt, ctx) => {
      if (ctx.run.memory.itUhrUsed || !ctx.player.alive || ctx.player.hpPct >= 0.3) return;
      ctx.run.memory.itUhrUsed = 1;
      const granted = ctx.player.maxHP * 3;
      ctx.player.addShield(granted);
      ctx.combat.announce('Sanduhr!', '#ffcc66');
      ctx.combat.delay(2000, () => {
        ctx.player.shield = Math.max(0, ctx.player.shield - granted);
      });
    },
  }),
  item({
    id: 'it_schutzengel',
    name: 'Schutzengel',
    cost: 850,
    glyph: '✝',
    color: 0xffffff,
    description: '+18 AD · +45 Rüstung · Einmal pro Run: Stirbst du, kämpfst du weiter',
    statMods: [
      { stat: 'damage', flat: 18 },
      { stat: 'armor', flat: 45 },
    ],
    ruleFlags: { revives: 1 },
  }),
  item({
    id: 'it_kollektor',
    name: 'Kollektor',
    cost: 720,
    glyph: '$',
    color: 0xffd24a,
    description: '+11 AD · +25% Kritchance · Gegner unter 5% LP werden hingerichtet · Tötungen: +8 Gold',
    statMods: [
      { stat: 'damage', flat: 11 },
      { stat: 'critChance', flat: 0.25 },
    ],
    hooks: {
      damageDealt: ({ target }, ctx) => {
        if (!target.alive || target.team !== 'enemy' || target.isBoss) return;
        if (target.hpPct <= 0.05) {
          ctx.combat.dealDamage(ctx.player, target, target.hp + target.shield, 'other');
          ctx.combat.announce('Eingesammelt!', '#ffd24a');
        }
      },
      killWindow: (_p, ctx) => {
        ctx.run.gold += 8;
        ctx.run.goldEarned += 8;
      },
    },
  }),
  item({
    id: 'it_nachtschneide',
    name: 'Nachtschneide',
    cost: 660,
    glyph: '☾',
    color: 0x8888cc,
    description: '+14 AD · +35 LP · Alle 20s negiert ein Schleier den nächsten erlittenen Treffer',
    statMods: [
      { stat: 'damage', flat: 14 },
      { stat: 'maxHP', flat: 35 },
    ],
    hooks: {
      roundStart: (_p, ctx) => {
        ctx.run.memory.itNachtReady = 1;
      },
      damageTaken: ({ dmg }, ctx) => {
        if (!ctx.run.memory.itNachtReady) return;
        ctx.run.memory.itNachtReady = 0;
        ctx.player.heal(dmg);
        ctx.combat.delay(20000, () => {
          ctx.run.memory.itNachtReady = 1;
        });
      },
    },
  }),
  item({
    id: 'it_herzstahl',
    name: 'Herzstahl',
    cost: 750,
    glyph: '♦',
    color: 0xff8899,
    description: '+70 max. LP · Alle 8s: nächster Angriff +3% max. LP phys. und +2 max. LP dauerhaft',
    statMods: [{ stat: 'maxHP', flat: 70 }],
    onCombatInit: (ctx) => {
      ctx.run.memory.itHerzReady = 1;
      ctx.player.stats.set({
        id: 'perm:itherz',
        stat: 'maxHP',
        flat: ctx.run.memory.itHerzHP ?? 0,
      });
    },
    hooks: {
      autoHit: ({ target }, ctx) => {
        if (!ctx.run.memory.itHerzReady || !target.alive) return;
        ctx.run.memory.itHerzReady = 0;
        procDamage(ctx, target, ctx.player.maxHP * 0.03, 'physisch');
        ctx.run.memory.itHerzHP = (ctx.run.memory.itHerzHP ?? 0) + 2;
        ctx.player.stats.set({ id: 'perm:itherz', stat: 'maxHP', flat: ctx.run.memory.itHerzHP ?? 0 });
        ctx.combat.ring(ctx.player.x, ctx.player.y, 0xff8899, 60);
        ctx.combat.delay(8000, () => {
          ctx.run.memory.itHerzReady = 1;
        });
      },
    },
  }),
  item({
    id: 'it_titanenaxt',
    name: 'Titanenaxt',
    cost: 720,
    glyph: 'T',
    color: 0xcc9966,
    description: '+45 LP · +15 AD · Angriffe treffen den Umkreis (200) für 1,5% deiner max. LP',
    statMods: [
      { stat: 'maxHP', flat: 45 },
      { stat: 'damage', flat: 15 },
    ],
    hooks: {
      autoHit: ({ target }, ctx) => {
        const dmg = ctx.player.maxHP * 0.015;
        for (const u of enemiesWithin(ctx, target.x, target.y, 200)) {
          if (u !== target) procDamage(ctx, u, dmg, 'physisch');
        }
      },
    },
  }),
  item({
    id: 'it_raubtierhydra',
    name: 'Raubtierhydra',
    cost: 750,
    glyph: '龍',
    color: 0xdd7755,
    description: '+23 AD · +15% Lebensraub · +15 Haste · Angriffe treffen den Umkreis (250) für 40% AD',
    statMods: [
      { stat: 'damage', flat: 23 },
      { stat: 'lifesteal', flat: 0.15 },
      { stat: 'abilityHaste', flat: 15 },
    ],
    hooks: {
      autoHit: ({ target }, ctx) => {
        const dmg = ctx.player.stats.get('damage') * 0.4;
        for (const u of enemiesWithin(ctx, target.x, target.y, 250)) {
          if (u !== target) procDamage(ctx, u, dmg, 'physisch');
        }
      },
    },
  }),
];

let itTanzTicking = false;

// ---------------------------------------------------------------------------
// LUXUS
// ---------------------------------------------------------------------------

const LUXUS: ItemDef[] = [
  item({
    id: 'it_goldspatel',
    name: 'Goldener Kochlöffel',
    cost: 1100,
    glyph: '★',
    color: 0xffe9a0,
    description: 'Von allem etwas: +8 AD · +8 AP · +20 LP · +15% AS · +10 Rüstung & MR · +10 Haste · +10% Krit · +6% Tempo · +5% Lebensraub',
    statMods: [
      { stat: 'damage', flat: 8 },
      { stat: 'abilityPower', flat: 8 },
      { stat: 'maxHP', flat: 20 },
      { stat: 'attackSpeed', pct: 0.15 },
      { stat: 'armor', flat: 10 },
      { stat: 'magicResist', flat: 10 },
      { stat: 'abilityHaste', flat: 10 },
      { stat: 'critChance', flat: 0.1 },
      { stat: 'moveSpeed', pct: 0.06 },
      { stat: 'lifesteal', flat: 0.05 },
    ],
  }),
];

export const ITEMS: ItemDef[] = [...BUDGET, ...KERN, ...LUXUS];

export function itemById(id: string): ItemDef | undefined {
  return ITEMS.find((i) => i.id === id);
}

/** Shop offer: 6 distinct random items, cheap ones early, big ones later. */
export function rollShop(round: number, count = 6): ItemDef[] {
  const pool = ITEMS.filter((i) => (round <= 3 ? i.cost <= 400 : true));
  const offers: ItemDef[] = [];
  const bag = [...pool];
  // Ab Runde 4: mindestens 2 Budget-Angebote, damit kleines Gold nie verfällt
  if (round > 3) {
    const cheap = ITEMS.filter((i) => i.cost <= 400);
    for (let i = 0; i < 2 && cheap.length > 0; i++) {
      const pick = cheap.splice(Math.floor(Math.random() * cheap.length), 1)[0];
      offers.push(pick);
      bag.splice(bag.indexOf(pick), 1);
    }
  }
  while (offers.length < count && bag.length > 0) {
    offers.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  }
  return offers;
}

export const MAX_ITEMS = 6;
