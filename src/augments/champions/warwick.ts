import type { AugmentDef, AugmentCtx } from '../types';
import type { Unit } from '../../entities/Unit';
import { unitCounterAdd } from '../helpers';

/**
 * Champion augments for Warwick — the sustain bruiser.
 *
 * He is the roster's answer to "healing should be earned": his passive already
 * pays him for attacking wounded prey. The lanes argue about what the health is
 * bought with — chasing, standing in the fight, or the leap itself.
 *
 * BUILD LANES:
 *
 *   Hunt    — the chase is the run (Scent of Blood, Relentless).
 *             Pays for picking off the weak; nothing against a full-health line.
 *   Thirst  — sustain through volume (Gorge, Blood Frenzy).
 *             Wants long fights, which the Hunt lane tries to avoid.
 *   Howl    — the shield and fear carry (Terrify, Alpha).
 *   Jaws    — the leap is the weapon (Deep Bite, Second Wind).
 *
 * Scent of Blood and Gorge are the fork: one wants targets already wounded, the
 * other wants as many bodies as possible for as long as possible.
 */

function enemiesNear(ctx: AugmentCtx, x: number, y: number, r: number): Unit[] {
  return ctx.combat.units.filter((u) => u.alive && u.team === 'enemy' && Math.hypot(u.x - x, u.y - y) <= r);
}

// ---------------------------------------------------------------- Hunt

const blutgeruch: AugmentDef = {
  id: 'ww_blutgeruch',
  name: 'Scent of Blood',
  tier: 'gold',
  tags: ['Blut'],
  champion: 'warwick',
  description: 'Your attacks deal +45% to enemies below half health, and heal you for 25% of that.',
  hooks: {
    autoHit: ({ target }, ctx) => {
      if (!target.alive || target.hpPct >= 0.5) return;
      const p = ctx.player;
      const dmg = 0.45 * p.stats.get('damage') * ctx.power(blutgeruch);
      const dealt = ctx.combat.dealDamage(p, target, dmg, 'ability', 'physisch');
      p.heal(dealt * 0.25);
    },
  },
};

const unerbittlich: AugmentDef = {
  id: 'ww_unerbittlich',
  name: 'Relentless',
  tier: 'silber',
  tags: ['Sturm'],
  champion: 'warwick',
  description: 'Blood Hunt lasts twice as long and its speed bonus is doubled while a wounded enemy is nearby.',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'Q') return;
      const p = ctx.player;
      const wounded = enemiesNear(ctx, p.x, p.y, 700).some((u) => u.hpPct < 0.5);
      if (!wounded) return;
      p.stats.set({
        id: 'ww:relentless',
        stat: 'moveSpeed',
        pct: 0.3 * ctx.power(unerbittlich),
        expiresAt: ctx.combat.now + 6000,
      });
    },
  },
};

// ---------------------------------------------------------------- Thirst

const verschlingen: AugmentDef = {
  id: 'ww_verschlingen',
  name: 'Gorge',
  tier: 'gold',
  tags: ['Blut'],
  champion: 'warwick',
  description: 'Every 4th attack heals you for 6% of your maximum health.',
  hooks: {
    autoHit: ({ target }, ctx) => {
      if (!target.alive) return;
      const p = ctx.player;
      const n = unitCounterAdd(p, 'wwGorge', 1);
      if (n % 4 !== 0) return;
      p.heal(p.maxHP * 0.06 * ctx.power(verschlingen));
      ctx.combat.ring(p.x, p.y, 0xcc2222, 55);
      ctx.combat.procAt(p.x, p.y - 50, 'GORGE', '#ff7777');
    },
  },
};

const blutrausch: AugmentDef = {
  id: 'ww_blutrausch',
  name: 'Blood Frenzy',
  tier: 'prisma',
  tags: ['Blut'],
  champion: 'warwick',
  description: 'Every heal you receive also grants 5% attack speed for 3s, stacking to 8.',
  onUpdate: (_dt, ctx) => {
    const p = ctx.player;
    const prev = ctx.run.memory.wwLastHp ?? p.hp;
    if (p.hp > prev + 0.5) {
      const n = Math.min(8, (ctx.run.memory.wwFrenzy ?? 0) + 1);
      ctx.run.memory.wwFrenzy = n;
      p.stats.set({
        id: 'ww:frenzy',
        stat: 'attackSpeed',
        pct: 0.05 * n * ctx.power(blutrausch),
        expiresAt: ctx.combat.now + 3000,
      });
    }
    ctx.run.memory.wwLastHp = p.hp;
  },
  onCombatInit: (ctx) => {
    ctx.run.memory.wwFrenzy = 0;
    ctx.run.memory.wwLastHp = ctx.player.hp;
  },
};

// ---------------------------------------------------------------- Howl

const schrecken: AugmentDef = {
  id: 'ww_schrecken',
  name: 'Terrify',
  tier: 'gold',
  tags: ['Sturm'],
  champion: 'warwick',
  description: 'Primal Howl also stuns everything it reaches for 0.9s.',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'E') return;
      const p = ctx.player;
      for (const u of enemiesNear(ctx, p.x, p.y, 260)) {
        u.ctrlUntil = Math.max(u.ctrlUntil, ctx.combat.now + 900 * ctx.power(schrecken));
      }
      ctx.combat.ring(p.x, p.y, 0x999999, 260);
    },
  },
};

const alphatier: AugmentDef = {
  id: 'ww_alphatier',
  name: 'Alpha',
  tier: 'silber',
  tags: ['Blut'],
  champion: 'warwick',
  description: 'While Primal Howl\'s shield holds, you deal +25% and take 20% less.',
  onUpdate: (_dt, ctx) => {
    const p = ctx.player;
    const shielded = p.shield > 0;
    const on = !!p.memory.wwAlpha;
    if (shielded && !on) {
      p.memory.wwAlpha = 1;
      p.stats.set({ id: 'ww:alphaDmg', stat: 'damage', pct: 0.25 * ctx.power(alphatier) });
      p.stats.set({ id: 'ww:alphaArm', stat: 'armor', flat: 40 * ctx.power(alphatier) });
    } else if (!shielded && on) {
      p.memory.wwAlpha = 0;
      p.stats.remove('ww:alphaDmg');
      p.stats.remove('ww:alphaArm');
    }
  },
};

// ---------------------------------------------------------------- Jaws

const tieferBiss: AugmentDef = {
  id: 'ww_tiefer_biss',
  name: 'Deep Bite',
  tier: 'gold',
  tags: ['Sturm'],
  champion: 'warwick',
  description: 'Jaws of the Beast heals for the full damage instead of half, and refunds 40% of its cooldown on a kill.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Dash' || !target) return;
      const p = ctx.player;
      p.heal(0.5 * (0.6 * p.stats.get('damage') + 45) * ctx.power(tieferBiss));
    },
    enemyDeath: (_e, ctx) => {
      ctx.player.reduceCooldown('Dash', 2400 * ctx.power(tieferBiss));
    },
  },
};

const zweiterAtem: AugmentDef = {
  id: 'ww_zweiter_atem',
  name: 'Second Wind',
  tier: 'prisma',
  tags: ['Blut'],
  champion: 'warwick',
  description: 'Below 40% health you heal for 60% more and gain 30% attack speed.',
  onUpdate: (_dt, ctx) => {
    const p = ctx.player;
    const low = p.hpPct < 0.4;
    const on = !!p.memory.wwSecond;
    if (low && !on) {
      p.memory.wwSecond = 1;
      p.stats.set({ id: 'ww:second', stat: 'attackSpeed', pct: 0.3 * ctx.power(zweiterAtem) });
      p.stats.set({ id: 'ww:secondLs', stat: 'lifesteal', pct: 0.6 * ctx.power(zweiterAtem) });
    } else if (!low && on) {
      p.memory.wwSecond = 0;
      p.stats.remove('ww:second');
      p.stats.remove('ww:secondLs');
    }
  },
};

export const WARWICK_AUGMENTS: AugmentDef[] = [
  blutgeruch,
  unerbittlich,
  verschlingen,
  blutrausch,
  schrecken,
  alphatier,
  tieferBiss,
  zweiterAtem,
];
