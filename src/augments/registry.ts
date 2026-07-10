import { AugmentDef } from './types';
import type { AbilityId } from '../core/events';

/**
 * THE augment registry. Augments are data + hooks only: they subscribe to
 * combat events and push modifiers through the stat pipeline. Adding augment
 * #31 means adding one entry here — never touching combat core code.
 */

// ---- Per-fight closure state (reset in onCombatInit) ----
let koenigsbannArmed = false;
let koenigsbannAbility: AbilityId | null = null;
let koenigsbannUntil = 0;

// #1 Blutzoll (Silber, Blut)
const blutzoll: AugmentDef = {
  id: 'blutzoll',
  name: 'Blutzoll',
  tier: 'silber',
  tags: ['Blut'],
  description: 'Deine Angriffe heilen dich um 4% des Schadens.',
  hooks: {
    autoHit: ({ dmg }, ctx) => ctx.player.heal(dmg * 0.04 * ctx.power(blutzoll)),
  },
};

// #3 Königsbann (Silber, Arkan)
const koenigsbann: AugmentDef = {
  id: 'koenigsbann',
  name: 'Königsbann',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Die erste Fähigkeit jedes Kampfes trifft doppelt.',
  onCombatInit: () => {
    koenigsbannArmed = true;
    koenigsbannAbility = null;
  },
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (!koenigsbannArmed) return;
      koenigsbannArmed = false;
      koenigsbannAbility = ability;
      koenigsbannUntil = ctx.combat.now + 2500;
    },
    abilityHit: ({ ability, target, dmg }, ctx) => {
      if (ability !== koenigsbannAbility || ctx.combat.now >= koenigsbannUntil) return;
      ctx.combat.dealDamage(ctx.player, target, dmg * ctx.power(koenigsbann), 'ability');
    },
  },
};

// #5 Sturmschritt (Silber, Sturm)
const sturmschritt: AugmentDef = {
  id: 'sturmschritt',
  name: 'Sturmschritt',
  tier: 'silber',
  tags: ['Sturm'],
  description: 'Nach jedem Dash: +50% Angriffstempo für 1,5s.',
  hooks: {
    dashEnd: (_p, ctx) => {
      ctx.player.stats.set({
        id: 'buff:sturmschritt',
        stat: 'attackSpeed',
        pct: 0.5 * ctx.power(sturmschritt),
        expiresAt: ctx.combat.now + 1500,
      });
    },
  },
};

// #6 Bollwerk (Silber, Ward)
const bollwerk: AugmentDef = {
  id: 'bollwerk',
  name: 'Bollwerk',
  tier: 'silber',
  tags: ['Ward'],
  description: 'Beginne jeden Kampf mit einem Schild (15% max. LP).',
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.player.addShield(ctx.player.maxHP * 0.15 * ctx.power(bollwerk));
    },
  },
};

// #7 Blutrausch (Silber, Blut)
const blutrausch: AugmentDef = {
  id: 'blutrausch',
  name: 'Blutrausch',
  tier: 'silber',
  tags: ['Blut'],
  description: '+3 Angriffsschaden pro Tötung — hält den ganzen Run.',
  onCombatInit: (ctx) => {
    applyBlutrausch(ctx);
  },
  hooks: {
    killWindow: (_p, ctx) => {
      ctx.run.memory.blutrauschStacks = (ctx.run.memory.blutrauschStacks ?? 0) + 1;
      applyBlutrausch(ctx);
    },
  },
};

function applyBlutrausch(ctx: Parameters<NonNullable<AugmentDef['onCombatInit']>>[0]): void {
  const stacks = ctx.run.memory.blutrauschStacks ?? 0;
  // Permanent run stacks: silver dampener applies, Blutmond's HP condition doesn't
  const dampen = ctx.run.flags.silverHalved ? 0.5 : 1;
  ctx.player.stats.set({ id: 'perm:blutrausch', stat: 'damage', flat: stacks * 3 * dampen });
}

export const AUGMENTS: AugmentDef[] = [blutzoll, koenigsbann, sturmschritt, bollwerk, blutrausch];

export function augmentById(id: string): AugmentDef | undefined {
  return AUGMENTS.find((a) => a.id === id);
}
