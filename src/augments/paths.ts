import type { AugmentDef, RuleFlags, Tag } from './types';

/**
 * Paths (SCHLACHTPLAN 3.2): the five tags stop being labels and start carrying
 * the build.
 *
 * Every augment and every item wears one or two tags. Owning 2 / 4 / 6 of one
 * tag lights that path's step — the Brotato set and the Isaac transformation,
 * in one ladder:
 *
 *   2  a number you can feel        (stats)
 *   4  a rule that changes          (rule flags — a different verb)
 *   6  a visible transformation     (an aura on the champion + a mechanic)
 *
 * No step is a proc ("on hit: extra damage") — the plan forbids new ones.
 *
 * Steps are activated by the AugmentManager next to the owned augments, at
 * face value (no tier multiplier), and their flags are folded in by
 * run.recomputeDerived after everything else — by max, never by overwrite, so
 * a path can only add to what an item or augment already gave.
 */

export const PATH_STEPS = [2, 4, 6] as const;
export const PATH_TAGS: Tag[] = ['Blut', 'Sturm', 'Arkan', 'Ward', 'Bruch'];

export const PATH_COLOR: Record<Tag, number> = {
  Blut: 0xe0475a,
  Sturm: 0x6ad8ff,
  Arkan: 0xb08cff,
  Ward: 0xffd27a,
  Bruch: 0xff8a3a,
};

export interface PathStep {
  at: 2 | 4 | 6;
  name: string;
  description: string;
  def: AugmentDef;
}

function step(tag: Tag, at: 2 | 4 | 6, name: string, description: string, rest: Partial<AugmentDef> = {}): PathStep {
  return {
    at, name, description,
    def: { id: `path:${tag}:${at}`, name, description, tier: 'gold', tags: [], ...rest },
  };
}

export const PATHS: Record<Tag, PathStep[]> = {
  // Blut: trade health for power.
  Blut: [
    step('Blut', 2, 'Bloodied', '+10% attack damage, +4% life steal.', {
      statMods: [{ stat: 'damage', pct: 0.1 }, { stat: 'lifesteal', flat: 0.04 }],
    }),
    step('Blut', 4, 'Red Harvest', 'Every takedown restores 6 health.', { ruleFlags: { healPerKill: 6 } }),
    step('Blut', 6, 'Blood Price', 'Red aura. +1% damage for every 2% health missing (up to +40%), +6% life steal.', {
      statMods: [{ stat: 'lifesteal', flat: 0.06 }],
      onUpdate: (_dt, ctx) => {
        const p = ctx.player;
        const missing = p.maxHP > 0 ? 1 - p.hp / p.maxHP : 0;
        p.stats.set({ id: 'path:bloodprice', stat: 'damage', pct: Math.min(0.4, missing / 2) });
      },
    }),
  ],
  // Sturm: never stop moving.
  Sturm: [
    step('Sturm', 2, 'Tailwind', '+8% move speed, +10% attack speed.', {
      statMods: [{ stat: 'moveSpeed', pct: 0.08 }, { stat: 'attackSpeed', pct: 0.1 }],
    }),
    step('Sturm', 4, 'Second Wind', 'One more dash charge.', { ruleFlags: { dashCharges: 2 } }),
    step('Sturm', 6, 'Tempest', 'Storm aura. You attack while moving, and every dash leaves burning wind (25/s).', {
      ruleFlags: { attackWhileMoving: true, dashFireTrail: 25 },
    }),
  ],
  // Arkan: abilities over autos.
  Arkan: [
    step('Arkan', 2, 'Focus', '10% shorter cooldowns, +10% ability damage.', {
      statMods: [{ stat: 'cooldown', pct: -0.1 }, { stat: 'abilityDamage', pct: 0.1 }],
    }),
    step('Arkan', 4, 'Recursion', 'Takedowns reset Q.', { ruleFlags: { qResetOnKill: true } }),
    step('Arkan', 6, 'Echo', 'Violet aura. Every Q casts itself a second time, 0.3s later.', {
      hooks: {
        abilityCast: ({ ability }, ctx) => {
          if (ability !== 'Q') return;
          const p = ctx.player;
          const d = { ...p.lastQDir };
          ctx.combat.delay(300, () => {
            if (p.alive) p.fireQ(d);
          });
        },
      },
    }),
  ],
  // Ward: be hard to kill.
  Ward: [
    step('Ward', 2, 'Plated', '+12 armor, +12 magic resist.', {
      statMods: [{ stat: 'armor', flat: 12 }, { stat: 'magicResist', flat: 12 }],
    }),
    step('Ward', 4, 'Aegis', 'Start every round with a shield of 20% max health.', { ruleFlags: { shieldPerRound: 0.2 } }),
    step('Ward', 6, 'Bulwark', 'Golden aura. While any shield holds, you take 25% less damage. Round shield 30%.', {
      ruleFlags: { wardedReduction: 0.25, shieldPerRound: 0.3 },
    }),
  ],
  // Bruch: break things open.
  Bruch: [
    step('Bruch', 2, 'Keen', '+8% crit chance, +8% attack damage.', {
      statMods: [{ stat: 'critChance', flat: 0.08 }, { stat: 'damage', pct: 0.08 }],
    }),
    step('Bruch', 4, 'Executioner', 'Enemies left under 10% health by a hit die outright.', { ruleFlags: { executeBelow: 0.1 } }),
    step('Bruch', 6, 'Shatter', 'Ember aura. Crits deal 250% instead of 175%, and +10% crit chance.', {
      statMods: [{ stat: 'critChance', flat: 0.1 }],
      ruleFlags: { critDamage: 2.5 },
    }),
  ],
};

/** Steps lit by these tag counts, lowest first. */
export function activePathSteps(counts: Record<Tag, number>): PathStep[] {
  const out: PathStep[] = [];
  for (const tag of PATH_TAGS) for (const s of PATHS[tag]) if (counts[tag] >= s.at) out.push(s);
  return out;
}

/** The next threshold for a count (2, 4 or 6), or null once all three are lit. */
export function nextPathStep(count: number): number | null {
  return PATH_STEPS.find((s) => s > count) ?? null;
}

/** Card label for one more of `tag`: "+1 Sturm (3/4)", with a "!" when it lights a step. */
export function pathGainLabel(tag: Tag, count: number): string {
  const n = count + 1;
  const next = nextPathStep(count);
  if (next === null) return `+1 ${tag} (${n})`;
  return `+1 ${tag} (${n}/${next})${n === next ? '!' : ''}`;
}

/** Highest lit step (0, 2, 4 or 6). */
export function pathLevel(count: number): number {
  return [...PATH_STEPS].reverse().find((s) => count >= s) ?? 0;
}

/**
 * Fold a step's flags into the run's: numbers by max, switches by or. A path
 * never lowers what an item or augment already set (an item's 15% execute
 * stays 15% when Bruch 4 offers 10%).
 */
export function mergePathFlags(flags: RuleFlags, add: Partial<RuleFlags>): void {
  const f = flags as unknown as Record<string, number | boolean>;
  for (const [k, v] of Object.entries(add)) {
    if (typeof v === 'boolean') f[k] = (f[k] as boolean) || v;
    else if (typeof v === 'number') f[k] = Math.max(f[k] as number, v);
  }
}
