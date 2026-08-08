import { AugmentDef, AugmentCtx } from '../augments/types';
import { procDamage, enemiesWithin, slowUnit, unitCounterAdd } from '../augments/helpers';
import type { ItemIconKind } from './icons';
// Laufzeit-sicher: core/run importiert von hier nur Typen (wird wegkompiliert)
import { run } from '../core/run';
import { isDeleted } from '../core/balance';
import { augmentFitsChampion } from '../augments/eligibility';

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
  /** 16-bit thematic icon; defaults per category if omitted. */
  icon?: ItemIconKind;
  /**
   * Mutual-exclusion group. Owning one item from a group bars every other item
   * in it — all four boots share `'boots'`, so a run wears one pair, not four.
   *
   * This was a boolean, and every check compared `o.id === it.id`, so it only
   * ever stopped a *second copy of the same* item. Owning Wind Boots left the
   * other three pairs in the pool, and they kept taking up slots in a six-slot
   * shop marked "Owned" — the docstring on `rollShop` claimed they were
   * filtered out, which was simply not true of the code beneath it.
   */
  unique?: string;
  /** Star rank 1..3 (see items/stars.ts). Absent means an unforged ★1 item. */
  stars?: number;
  /** Pristine ★1 snapshot, so each forge derives from the base, not a scaled copy. */
  baseItem?: ItemDef;
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
    icon: 'boots',
    unique: 'boots',
    name: 'Wind Boots',
    cost: 280,
    glyph: 'W',
    color: 0xbfeef8,
    description: '+18% move speed',
    statMods: [{ stat: 'moveSpeed', pct: 0.18 }],
  }),
  item({
    id: 'it_sporensohlen',
    icon: 'boots',
    unique: 'boots',
    name: 'Spur Boots',
    cost: 340,
    glyph: 'S',
    color: 0xd8d0a0,
    description: '+40% attack speed · +13% move speed · +5% life steal',
    statMods: [
      { stat: 'attackSpeed', pct: 0.4 },
      { stat: 'moveSpeed', pct: 0.13 },
      { stat: 'lifesteal', flat: 0.05 },
    ],
  }),
  item({
    id: 'it_panzerstiefel',
    icon: 'boots',
    unique: 'boots',
    name: 'Plated Boots',
    cost: 340,
    glyph: 'P',
    color: 0x9fb4cc,
    description: '+35 armor · +13% move speed',
    statMods: [
      { stat: 'armor', flat: 35 },
      { stat: 'moveSpeed', pct: 0.13 },
    ],
  }),
  item({
    id: 'it_kettenschuhe',
    icon: 'boots',
    unique: 'boots',
    name: 'Mercury Boots',
    cost: 330,
    glyph: 'C',
    color: 0x8adfff,
    description: '+30 magic resist · +13% move speed',
    statMods: [
      { stat: 'magicResist', flat: 30 },
      { stat: 'moveSpeed', pct: 0.13 },
    ],
  }),
  item({
    id: 'it_seelendieb',
    icon: 'moon',
    needs: ['ap'], // whole payload is AP scaling — dead weight for an AD kit (B11)
    name: 'Soulstealer',
    cost: 350,
    glyph: '✦',
    color: 0xcc66ff,
    description: '+7 AP · +10 HP · takedowns: +1.7 AP permanently (max 25); at 10: +10% move speed',
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
    icon: 'thorns',
    name: 'Thornwall',
    cost: 640,
    glyph: '♠',
    color: 0x88cc88,
    description: '+30 HP · +60 armor · attackers take 3 + 15% of armor as magic damage',
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
    icon: 'sword',
    name: 'Infinity Edge',
    cost: 780,
    glyph: '∞',
    color: 0xffd24a,
    description: '+25 AD · +25% crit chance · attacks: +25% bonus × crit chance',
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
    icon: 'sword',
    name: 'Bloodthirster',
    cost: 720,
    glyph: 'B',
    color: 0xe05070,
    description: '+23 AD · +18% life steal · overheal becomes a shield (up to 20% max HP)',
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
    icon: 'tome',
    needs: ['ap'], // +22 AP and +30% of total AP — literally nothing without AP (B11)
    name: 'Deathcap',
    cost: 780,
    glyph: '♜',
    color: 0x9f5fff,
    description: '+22 AP · increases your total ability power by 30%',
    statMods: [
      { stat: 'abilityPower', flat: 22 },
      { stat: 'abilityPower', pct: 0.3 },
    ],
  }),
  item({
    id: 'it_leerenstab',
    icon: 'staff',
    needs: ['ap'], // AP stat stick; its true-damage rider rides on that AP (B11)
    name: 'Void Staff',
    cost: 680,
    glyph: '∅',
    color: 0xb388ff,
    description: '+22 AP · abilities: +15% as true damage',
    statMods: [{ stat: 'abilityPower', flat: 22 }],
    hooks: {
      abilityHit: ({ target, dmg }, ctx) => {
        if (target.alive) procDamage(ctx, target, dmg * 0.15, 'wahr');
      },
    },
  }),
  item({
    id: 'it_basiliskenzahn',
    icon: 'fang',
    name: 'Basilisk Fang',
    cost: 700,
    glyph: 'Z',
    color: 0x88ffaa,
    description: '+23 AP · +45% attack speed · attacks: +2 (+20% AP) magic damage',
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
    icon: 'wand',
    name: 'Lich Blade',
    cost: 720,
    glyph: 'L',
    color: 0x9fd8ff,
    description: '+27 AP · +10% move speed · +20 haste · after an ability: next attack +75% AP magic',
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
    icon: 'flame',
    name: 'Lava Cloak',
    cost: 660,
    glyph: 'F',
    color: 0xff7722,
    description: '+35 HP · +40 armor · enemies near you (350) burn: 2 + 0.5% of your max HP per second',
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
    icon: 'cloak',
    name: 'Spirit Visage',
    cost: 640,
    glyph: 'G',
    color: 0x88ddcc,
    description: '+30 HP · +40 MR · +10 haste · life steal is 30% stronger',
    statMods: [
      { stat: 'maxHP', flat: 30 },
      { stat: 'magicResist', flat: 40 },
      { stat: 'abilityHaste', flat: 10 },
      { stat: 'lifesteal', pct: 0.3 },
    ],
  }),
  item({
    id: 'it_warmherz',
    icon: 'heart',
    name: 'Warmheart',
    cost: 700,
    glyph: '♥',
    color: 0x7ee08a,
    description: '+65 max HP · after 3s without taking damage: regenerate 2% max HP per second',
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
    icon: 'axe',
    name: 'Black Cleaver',
    cost: 700,
    glyph: '⚒',
    color: 0xaa4444,
    description: '+13 AD · +35 HP · +20 haste · physical hits: −6% armor (5 stacks) and +6% move speed (2s)',
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
    icon: 'sword',
    name: "Blade of the Fallen King",
    cost: 750,
    glyph: '†',
    color: 0x66dd88,
    description: "+13 AD · +25% attack speed · +10% life steal · attacks: +6% of target's current HP as physical",
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
    icon: 'dagger',
    name: 'Phantom Dancer',
    cost: 700,
    glyph: '♪',
    color: 0xaadfff,
    description: '+60% attack speed · +25% crit chance · +8% move speed',
    statMods: [
      { stat: 'attackSpeed', pct: 0.6 },
      { stat: 'critChance', flat: 0.25 },
      { stat: 'moveSpeed', pct: 0.08 },
    ],
  }),
  item({
    id: 'it_sturmklinge',
    icon: 'sword',
    name: 'Storm Blade',
    cost: 700,
    glyph: '⚡',
    color: 0xffee88,
    description: '+15 AD · +15 AP · +30% AS · every 4th attack: chain lightning (12 magic, up to 3 targets)',
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
    icon: 'bow',
    name: 'Rune Bow',
    cost: 720,
    glyph: '⇶',
    color: 0xbbeeff,
    description: '+45% AS · +25% crit chance · attacks fire bolts at up to 2 other enemies (30% AD)',
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
    icon: 'dagger',
    name: 'Rageblade',
    cost: 700,
    glyph: 'R',
    color: 0xff9955,
    description: '+7 AD · +8 AP · +25% AS · attacks: +4 magic and +8% AS until end of round (max 4 stacks)',
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
    icon: 'staff',
    name: "Wit's End",
    cost: 680,
    glyph: 'X',
    color: 0x66ccff,
    description: '+45 MR · +50% attack speed · attacks: +5 magic damage',
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
    icon: 'frost',
    name: 'Frozen Heart',
    cost: 700,
    glyph: '❄',
    color: 0x99ddff,
    description: '+75 armor · +20 haste · aura (450): enemies attack 20% slower',
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
    icon: 'plate',
    name: 'Stone Wall',
    cost: 690,
    glyph: '▣',
    color: 0xaa9977,
    description: '+30 HP · +65 armor · every 10s: enemies within 350 are slowed −70% for 2s',
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
    icon: 'wand',
    name: 'Frost Scepter',
    cost: 660,
    glyph: '¥',
    color: 0x88bbff,
    description: '+23 AP · +35 HP · ability hits slow by 30% (1s)',
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
    icon: 'flame',
    needs: ['ap'], // AP plus a magic-damage execute bonus — both AP-only (B11)
    name: 'Shadowflame',
    cost: 700,
    glyph: '🔥',
    color: 0x7766aa,
    description: '+25 AP · abilities vs enemies below 40% HP: +20% magic damage',
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
    icon: 'staff',
    name: 'Riftmaker',
    cost: 720,
    glyph: '◊',
    color: 0xcc88aa,
    description: '+25 AP · +30 HP · +8% life steal · in combat: +2% damage/s (up to +10%)',
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
    icon: 'axe',
    name: "Death's Dance",
    cost: 760,
    glyph: '☠',
    color: 0xdd6666,
    description: '+18 AD · +45 armor · +15 haste · 30% of damage is deferred over 3s · takedowns heal 15% max HP',
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
    icon: 'gauntlet',
    name: "Giant's Fist",
    cost: 720,
    glyph: '✊',
    color: 0xddaa66,
    description: '+30 HP · +45% of your base AD · below 30% HP: shield (60% max HP), once per round',
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
        ctx.combat.announce("Giant's Fist!", '#ddaa66');
      }
    },
  }),
  item({
    id: 'it_kriegsspeer',
    icon: 'spear',
    name: 'War Spear',
    cost: 680,
    glyph: '↟',
    color: 0xd0d4e0,
    description: '+15 AD · +35 HP · +25 ability haste',
    statMods: [
      { stat: 'damage', flat: 15 },
      { stat: 'maxHP', flat: 35 },
      { stat: 'abilityHaste', flat: 25 },
    ],
  }),
  item({
    id: 'it_sanduhr',
    icon: 'hourglass',
    name: 'Golden Hourglass',
    cost: 780,
    glyph: '⌛',
    color: 0xffcc66,
    description: '+25 AP · +45 armor · below 30% HP: 2s invulnerable (once per round)',
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
      ctx.combat.announce('Hourglass!', '#ffcc66');
      ctx.combat.delay(2000, () => {
        ctx.player.shield = Math.max(0, ctx.player.shield - granted);
      });
    },
  }),
  item({
    id: 'it_schutzengel',
    icon: 'cross',
    name: 'Guardian Angel',
    cost: 850,
    glyph: '✝',
    color: 0xffffff,
    description: '+18 AD · +45 armor · once per run: on death, keep fighting',
    statMods: [
      { stat: 'damage', flat: 18 },
      { stat: 'armor', flat: 45 },
    ],
    ruleFlags: { revives: 1 },
  }),
  item({
    id: 'it_kollektor',
    icon: 'coin',
    name: 'The Collector',
    cost: 720,
    glyph: '$',
    color: 0xffd24a,
    description: '+11 AD · +25% crit chance · enemies below 5% HP are executed · takedowns: +8 gold',
    statMods: [
      { stat: 'damage', flat: 11 },
      { stat: 'critChance', flat: 0.25 },
    ],
    hooks: {
      damageDealt: ({ target }, ctx) => {
        if (!target.alive || target.team !== 'enemy' || target.isBoss) return;
        if (target.hpPct <= 0.05) {
          ctx.combat.dealDamage(ctx.player, target, target.hp + target.shield, 'other');
          ctx.combat.announce('Collected!', '#ffd24a');
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
    icon: 'dagger',
    name: 'Nightblade',
    cost: 660,
    glyph: '☾',
    color: 0x8888cc,
    description: '+14 AD · +35 HP · every 20s a veil negates the next hit you take',
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
    icon: 'heart',
    name: 'Heartsteel',
    cost: 750,
    glyph: '♦',
    color: 0xff8899,
    description: '+70 max HP · every 8s: next attack +3% max HP physical and +2 max HP permanently',
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
    icon: 'axe',
    name: "Titan's Axe",
    cost: 720,
    glyph: 'T',
    color: 0xcc9966,
    description: '+45 HP · +15 AD · attacks hit the area (200) for 1.5% of your max HP',
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
    icon: 'fang',
    name: 'Ravenous Hydra',
    cost: 750,
    glyph: '龍',
    color: 0xdd7755,
    description: '+23 AD · +15% life steal · +15 haste · attacks hit the area (250) for 40% AD',
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

// Rule-changing items. The catalogue was stat packages with damage riders; a
// playtest wanted items to alter play the way the new prismatic augments do.
// Both below change a decision (when to dash / who to hit) rather than a number.
const LUXUS: ItemDef[] = [
  item({
    // Dash fires Q too — fuses the escape button and the damage button.
    id: 'it_sturmschritt',
    icon: 'boots',
    name: 'Stormstep Greaves',
    cost: 1100,
    glyph: '»',
    color: 0x7fd8ff,
    description: '+12% move speed · your dash also casts Q in the dash direction',
    statMods: [{ stat: 'moveSpeed', pct: 0.12 }],
    ruleFlags: { dashCastsQ: true },
  }),
  item({
    // Execute threshold — rewrites target priority: finish the wounded, not the nearest.
    id: 'it_witwenmacher',
    icon: 'sword',
    name: 'Widowmaker',
    cost: 1100,
    glyph: '†',
    color: 0xff6a8a,
    description: '+18 AD · hits that leave an enemy below 15% health kill them outright',
    statMods: [{ stat: 'damage', flat: 18 }],
    ruleFlags: { executeBelow: 0.15 },
  }),
  item({
    id: 'it_goldspatel',
    icon: 'star',
    name: 'Golden Spatula',
    cost: 1100,
    glyph: '★',
    color: 0xffe9a0,
    description: 'A bit of everything: +8 AD · +8 AP · +20 HP · +15% AS · +10 armor & MR · +10 haste · +10% crit · +6% move speed · +5% life steal',
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

/**
 * Shop offer: 6 distinct random items. Owned items (and already-owned boots)
 * never appear, and neither do items this champion cannot use.
 *
 * The champion gate closes B11: augment offers have always run through
 * `augmentFitsChampion`, but the shop rolled the whole pool blind, so Sivir —
 * pure AD — was offered Soulstealer for 350 of her 350 starting gold. Items are
 * AugmentDefs, so they carry the same `needs` tag and reuse the same check
 * rather than a parallel heuristic.
 *
 * Only items whose *entire* payload is AP scaling are tagged. Deliberately left
 * offerable: Golden Hourglass (invulnerability), Frost Scepter (ability slow)
 * and Lich Blade (move speed + haste) all carry value independent of AP, and
 * gating them would remove real choices instead of dead ones. Move that line by
 * adding or removing `needs: ['ap']` — nothing else needs touching.
 */
/**
 * True when the run already owns something from this item's exclusion group —
 * the check that makes `unique` mean "one pair of boots" rather than "not this
 * exact pair twice". Shared by the offer roll and the buy button so the shop
 * cannot show an item it would then refuse to sell.
 */
export function blockedByUnique(it: ItemDef): boolean {
  return !!it.unique && run.items.some((o) => o.unique === it.unique);
}

export function rollShop(round: number, count = 6): ItemDef[] {
  const owned = (id: string) => run.items.some((it) => it.id === id);
  // The pre-round-1 starter shop only stocks cheap gear (boots, basic pieces)
  const pool = ITEMS.filter(
    (i) =>
      !owned(i.id) &&
      !blockedByUnique(i) &&
      !isDeleted(i.id) &&
      (round <= 2 ? i.cost <= 400 : true) &&
      augmentFitsChampion(i, run.champion),
  );
  const offers: ItemDef[] = [];
  const bag = [...pool];
  // From round 3 on: at least 2 budget offers so small gold is never wasted
  if (round > 2) {
    const cheap = pool.filter((i) => i.cost <= 400);
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
