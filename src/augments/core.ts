import { AugmentDef } from './types';
import { procDamage, enemiesWithin } from './helpers';

/**
 * The augment pool, rebuilt from nothing.
 *
 * What it replaces: ~180 augments ported from a competitive arena mode. That
 * catalogue failed on three counts at once, and the owner's verdict was blunt
 * — "die augments sind eh alle arsch".
 *
 *  1. **Wrong game.** Every number was small because it had to be fair against
 *     another player. This is single-player: the opposition is a curve we set,
 *     so a pick is allowed to break the run in the player's favour.
 *  2. **Wrong shape.** 167 of 180 were "on event X, deal extra damage" — a
 *     wide catalogue in which every choice was the same choice at a different
 *     magnitude. Only 13 changed a rule.
 *  3. **Wrong size.** 71 were bound to specific champion ids, all of which are
 *     being retired with the League-derived roster.
 *
 * The rebuild inverts all three. Roughly twenty augments instead of a hundred
 * and eighty, every one of which either changes a rule or moves a number far
 * enough to feel. A pick screen shows three of these, six times in a run, so
 * each card has to be worth reading — the old pool's problem was never that it
 * lacked options, it was that almost none of them were decisions.
 *
 * Rule flags do the heavy lifting because the combat core already reads them
 * (see RuleFlags in ./types) and never checks augment identity, so an augment
 * stays a piece of data rather than a special case in the fight loop.
 *
 * Tiers mean power, not complexity: Silver bends a fight, Gold bends a build,
 * Prisma bends the run.
 */

// ---------------------------------------------------------------- Silver
// Bends a fight. Always useful, never the reason you win.

const schnittfolge: AugmentDef = {
  id: 'schnittfolge',
  name: 'Cutting Sequence',
  tier: 'silber',
  tags: ['Sturm'],
  description: 'Your attacks arc to 1 nearby enemy for 55% damage.',
  ruleFlags: { autoChain: 1 },
};

const brandspur: AugmentDef = {
  id: 'brandspur',
  name: 'Ember Trail',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Your dash leaves burning ground for 2.6s (28 damage per second).',
  ruleFlags: { dashFireTrail: 28 },
};

const brecheisen: AugmentDef = {
  id: 'brecheisen',
  name: 'Crowbar',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Your hits shove enemies away from you.',
  ruleFlags: { knockbackOnHit: 46 },
};

const aderlass: AugmentDef = {
  id: 'aderlass',
  name: 'Bloodletting',
  tier: 'silber',
  tags: ['Blut'],
  description: 'Takedowns restore 14 health.',
  ruleFlags: { healPerKill: 14 },
};

const wachhaltung: AugmentDef = {
  id: 'wachhaltung',
  name: 'Standing Guard',
  tier: 'silber',
  tags: ['Ward'],
  description: 'Start every round with a shield worth 20% of your maximum health.',
  ruleFlags: { shieldPerRound: 0.2 },
};

const kurzschluss: AugmentDef = {
  id: 'kurzschluss',
  name: 'Short Circuit',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Your Q recharges twice as fast.',
  ruleFlags: { qCdMult: 0.5 },
};

const nachhall: AugmentDef = {
  id: 'nachhall',
  name: 'Aftershock',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Ability hits detonate for 40 magic damage around the target.',
  hooks: {
    abilityHit: ({ target }, ctx) => {
      if (!target.alive) return;
      ctx.combat.ring(target.x, target.y, 0xffaa55, 110);
      for (const u of enemiesWithin(ctx, target.x, target.y, 110)) {
        procDamage(ctx, u, 40 * ctx.power(nachhall), 'magisch');
      }
    },
  },
};

// ---------------------------------------------------------------- Gold
// Bends a build. Changes what you reach for and how you move.

const kronjagd: AugmentDef = {
  id: 'kronjagd',
  name: 'Crown Hunt',
  tier: 'gold',
  tags: ['Sturm'],
  description: 'Takedowns reset your Q.',
  ruleFlags: { qResetOnKill: true },
};

const sturmbock: AugmentDef = {
  id: 'sturmbock',
  name: 'Battering Charge',
  tier: 'gold',
  tags: ['Sturm', 'Bruch'],
  description: 'Your dash deals 70 damage to every enemy it passes through.',
  ruleFlags: { dashDamage: 70 },
};

const kettenschlag: AugmentDef = {
  id: 'kettenschlag',
  name: 'Chain Strike',
  tier: 'gold',
  tags: ['Sturm'],
  description: 'Your attacks arc to 3 nearby enemies for 55% damage.',
  ruleFlags: { autoChain: 3 },
};

const doppeltritt: AugmentDef = {
  id: 'doppeltritt',
  name: 'Second Wind',
  tier: 'gold',
  tags: ['Sturm'],
  description: '+1 dash charge, and your dash recharges twice as fast.',
  ruleFlags: { dashCharges: 2, dashCdMult: 0.5 },
};

const unantastbar: AugmentDef = {
  id: 'unantastbar',
  name: 'Untouchable',
  tier: 'gold',
  tags: ['Ward'],
  description: 'You take no damage while dashing.',
  ruleFlags: { dashIFrames: true },
};

const richtstatt: AugmentDef = {
  id: 'richtstatt',
  name: 'Headsman',
  tier: 'gold',
  tags: ['Blut', 'Bruch'],
  description: 'Hits that leave an enemy below 12% health kill them outright.',
  ruleFlags: { executeBelow: 0.12 },
};

const gluthauch: AugmentDef = {
  id: 'gluthauch',
  name: 'Everburn',
  tier: 'gold',
  tags: ['Blut'],
  description: 'Burns never expire, and ability hits set the target alight.',
  ruleFlags: { burnForever: true },
  hooks: {
    abilityHit: ({ target }, ctx) => {
      if (target.alive) ctx.combat.addBurn(target, 9 * ctx.power(gluthauch), 4000);
    },
  },
};

const trotz: AugmentDef = {
  id: 'trotz',
  name: 'Spite',
  tier: 'gold',
  tags: ['Blut', 'Ward'],
  description: 'The lower your health, the harder you hit — up to +80% damage at 1 health.',
  onUpdate: (_dt, ctx) => {
    const missing = 1 - Math.max(0, Math.min(1, ctx.player.hpPct));
    ctx.player.stats.set({
      id: 'dyn:trotz',
      stat: 'damage',
      pct: 0.8 * missing * ctx.power(trotz),
    });
  },
};

// ---------------------------------------------------------------- Prisma
// Bends the run. You build around these, or they save it.

const phoenixherz: AugmentDef = {
  id: 'phoenixherz',
  name: 'Phoenix Heart',
  tier: 'prisma',
  tags: ['Ward'],
  description:
    'Once per run: lethal damage instead revives you at full health with a shield, blasting nearby enemies away.',
  ruleFlags: { revives: 1 },
};

const nadeloehr: AugmentDef = {
  id: 'nadeloehr',
  name: 'Needle’s Eye',
  tier: 'prisma',
  tags: ['Ward'],
  description: 'Below 30% health the world slows to 40% for 2.6s while you keep full speed (16s cooldown).',
  ruleFlags: { clutchSlowmo: true },
};

const kronlos: AugmentDef = {
  id: 'kronlos',
  name: 'Crownless',
  tier: 'prisma',
  tags: ['Arkan', 'Bruch'],
  description: 'You can no longer auto-attack. In return: +70% ability amp and +60 ability haste.',
  ruleFlags: { noAutoAttacks: true },
  statMods: [
    { stat: 'abilityDamage', pct: 0.7 },
    { stat: 'abilityHaste', flat: 60 },
  ],
};

const sturmschritt: AugmentDef = {
  id: 'sturmschritt',
  name: 'Stormstep',
  tier: 'prisma',
  tags: ['Sturm', 'Arkan'],
  description: 'Your dash also casts Q in the dash direction.',
  ruleFlags: { dashCastsQ: true },
};

const gleichmut: AugmentDef = {
  id: 'gleichmut',
  name: 'Even Keel',
  tier: 'prisma',
  tags: ['Arkan'],
  description: 'Q and E both recharge three times as fast.',
  ruleFlags: { qCdMult: 1 / 3, eCdMult: 1 / 3 },
};

const raubbau: AugmentDef = {
  id: 'raubbau',
  name: 'Strip Mine',
  tier: 'prisma',
  tags: ['Blut', 'Bruch'],
  description: 'Halve your maximum health. Double your damage.',
  statMods: [
    { stat: 'maxHP', pct: -0.5 },
    { stat: 'damage', pct: 1.0 },
    { stat: 'abilityDamage', pct: 1.0 },
  ],
};

/**
 * The whole pool. Deliberately short: three cards are shown six times in a
 * run, so eighteen entries means a player sees a meaningful share of what
 * exists — and every entry can be tuned, because there are few enough to hold
 * in your head at once.
 */
export const CORE_AUGMENTS: AugmentDef[] = [
  // silver
  schnittfolge,
  brandspur,
  brecheisen,
  aderlass,
  wachhaltung,
  kurzschluss,
  nachhall,
  // gold
  kronjagd,
  sturmbock,
  kettenschlag,
  doppeltritt,
  unantastbar,
  richtstatt,
  gluthauch,
  trotz,
  // prisma
  phoenixherz,
  nadeloehr,
  kronlos,
  sturmschritt,
  gleichmut,
  raubbau,
];
