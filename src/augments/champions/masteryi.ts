import type { AugmentDef, AugmentCtx } from '../types';

import { unitCounterAdd, unitCounterGet } from '../helpers';

/**
 * Champion augments for Master Yi — the on-hit DPS.
 *
 * He is the one champion whose abilities exist to serve his attacks rather
 * than replace them, so the lanes argue about what an attack should carry and
 * what the downtime between fights is for.
 *
 * BUILD LANES:
 *
 *   On-Hit   — every swing carries a rider (Whetted Steel, Sunder, Flurry).
 *              Wants attack speed; scales with time spent standing still.
 *   Strike   — Alpha Strike is the run (Sevenfold, Blink Back).
 *              Wants you crossing the field, which costs attack uptime.
 *   Wuju     — the true-damage window is the build (Deep Cut, Highlander).
 *              Does nothing at all while Wuju Style is on cooldown.
 *   Meditate — the channel is a real choice (Iron Will). Worthless if you never
 *              stand still, which is exactly what the Strike lane wants.
 *
 * He is also the sim's strongest champion by a distance (median round 13 to
 * Lux's 2), so nothing here adds raw damage without asking for something back.
 */

function apAdUnit(ctx: AugmentCtx): number {
  const p = ctx.player;
  return (0.5 * p.stats.get('damage') + 25) * p.stats.get('abilityDamage');
}

// ---------------------------------------------------------------- On-Hit

const geschliffenerStahl: AugmentDef = {
  id: 'yi_geschliffener_stahl',
  name: 'Whetted Steel',
  tier: 'silber',
  tags: ['Arkan'],
  champion: 'masteryi',
  description: 'Every 3rd attack on the same enemy deals 120% bonus damage.',
  hooks: {
    autoHit: ({ target }, ctx) => {
      if (!target.alive) return;
      const n = unitCounterAdd(target, 'yiWhet', 1);
      if (n % 3 !== 0) return;
      ctx.combat.dealDamage(ctx.player, target, apAdUnit(ctx) * 1.2 * ctx.power(geschliffenerStahl), 'ability', 'physisch');
    },
  },
};

const zermalmen: AugmentDef = {
  id: 'yi_zermalmen',
  name: 'Sunder',
  tier: 'gold',
  tags: ['Arkan'],
  champion: 'masteryi',
  description: 'Your attacks shred 6 armor from their target, stacking to 5.',
  hooks: {
    autoHit: ({ target }, ctx) => {
      if (!target.alive) return;
      const stacks = unitCounterAdd(target, 'yiSunder', 1, 5);
      target.stats.set({
        id: 'yi:sunder',
        stat: 'armor',
        flat: -6 * stacks * ctx.power(zermalmen),
        expiresAt: ctx.combat.now + 4000,
      });
    },
  },
};

const wirbel: AugmentDef = {
  id: 'yi_wirbel',
  name: 'Flurry',
  tier: 'gold',
  tags: ['Arkan'],
  champion: 'masteryi',
  description: 'Double Strike hits a third time, and each kill grants 12% attack speed for the round (max 5).',
  hooks: {
    enemyDeath: (_e, ctx) => {
      const p = ctx.player;
      const n = Math.min(5, unitCounterAdd(p, 'yiFlurry', 1, 5));
      p.stats.set({ id: 'yi:flurry', stat: 'attackSpeed', pct: 0.12 * n * ctx.power(wirbel) });
    },
  },
  onCombatInit: (ctx) => {
    unitCounterAdd(ctx.player, 'yiFlurry', -unitCounterGet(ctx.player, 'yiFlurry'));
    ctx.player.stats.remove('yi:flurry');
  },
};

// ---------------------------------------------------------------- Strike

const siebenfach: AugmentDef = {
  id: 'yi_siebenfach',
  name: 'Sevenfold',
  tier: 'prisma',
  tags: ['Sturm'],
  champion: 'masteryi',
  description: 'Alpha Strike resets on a kill and deals +45%.',
  hooks: {
    enemyDeath: (_e, ctx) => {
      ctx.player.reduceCooldown('Dash', 99999);
    },
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Dash' || !target.alive) return;
      ctx.combat.dealDamage(ctx.player, target, apAdUnit(ctx) * 0.45 * ctx.power(siebenfach), 'ability', 'physisch');
    },
  },
};

const rueckblende: AugmentDef = {
  id: 'yi_rueckblende',
  name: 'Blink Back',
  tier: 'silber',
  tags: ['Sturm'],
  champion: 'masteryi',
  description: 'Alpha Strike leaves you untargetable 0.8s longer and refreshes your next attack instantly.',
  hooks: {
    dashStart: (_e, ctx) => {
      const p = ctx.player;
      p.invulnUntil = Math.max(p.invulnUntil, ctx.combat.now + 800 * ctx.power(rueckblende));
      p.resetAutoAttack();
    },
  },
};

// ---------------------------------------------------------------- Wuju

const tieferSchnitt: AugmentDef = {
  id: 'yi_tiefer_schnitt',
  name: 'Deep Cut',
  tier: 'gold',
  tags: ['Blut'],
  champion: 'masteryi',
  description: 'While Wuju Style is active, your attacks deal a further 8% of the target\'s current health as true damage.',
  hooks: {
    autoHit: ({ target }, ctx) => {
      const p = ctx.player;
      if (!target.alive || (p.memory.wujuUntil ?? 0) <= ctx.combat.now) return;
      ctx.combat.dealDamage(p, target, target.hp * 0.08 * ctx.power(tieferSchnitt), 'ability', 'wahr');
    },
  },
};

const hochlaender: AugmentDef = {
  id: 'yi_hochlaender',
  name: 'Highlander',
  tier: 'prisma',
  tags: ['Blut'],
  champion: 'masteryi',
  description: 'A kill while Wuju Style is active extends it by 2s and grants 25% move speed for 2s.',
  hooks: {
    enemyDeath: (_e, ctx) => {
      const p = ctx.player;
      if ((p.memory.wujuUntil ?? 0) <= ctx.combat.now) return;
      p.memory.wujuUntil = (p.memory.wujuUntil ?? 0) + 2000 * ctx.power(hochlaender);
      p.stats.set({ id: 'yi:highlander', stat: 'moveSpeed', pct: 0.25, expiresAt: ctx.combat.now + 2000 });
    },
  },
};

// ---------------------------------------------------------------- Meditate

const eisernerWille: AugmentDef = {
  id: 'yi_eiserner_wille',
  name: 'Iron Will',
  tier: 'gold',
  tags: ['Blut'],
  champion: 'masteryi',
  description: 'Meditate also grants a shield worth 18% of your maximum health, and comes back 30% faster.',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'Q') return;
      const p = ctx.player;
      p.addShield(p.maxHP * 0.18 * ctx.power(eisernerWille));
      p.reduceCooldown('Q', 1800 * ctx.power(eisernerWille));
    },
  },
};

export const MASTERYI_AUGMENTS: AugmentDef[] = [
  geschliffenerStahl,
  zermalmen,
  wirbel,
  siebenfach,
  rueckblende,
  tieferSchnitt,
  hochlaender,
  eisernerWille,
];

