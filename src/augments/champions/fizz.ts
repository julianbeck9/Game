import type { AugmentDef, AugmentCtx } from '../types';
import type { Unit } from '../../entities/Unit';
import { unitCounterAdd, unitCounterGet } from '../helpers';

/**
 * Champion augments for Fizz — fourth on the Sivir pattern.
 *
 * Fizz is the assassin: the kit is about getting in, killing one thing, and
 * getting out again. His Q is a leap, his dash makes him briefly untargetable,
 * and both are movement as much as damage. So the lanes argue about what the
 * commitment is *for*.
 *
 * BUILD LANES:
 *
 *   Lunge     — the leap is the weapon (Tide Rider, Undertow, Reef Break).
 *               Wants you diving repeatedly; leaves you standing in the middle.
 *   Strike    — the empowered attack is the payoff (Barbed Point, Low Tide).
 *               Wants you next to one target long enough to actually swing.
 *   Trickster — the untargetable hop is the build (Slippery, Mirage, Riptide).
 *               Wants you leaving fights, which the Strike lane cannot afford.
 *   Predator  — finish what you started (Blood in the Water). Worthless against
 *               a healthy target and best when something is nearly dead.
 *
 * The sharp fork is Strike vs Trickster: one pays you to stand and hit, the
 * other pays you to disappear the moment you arrive.
 */

function enemiesNear(ctx: AugmentCtx, x: number, y: number, r: number): Unit[] {
  return ctx.combat.units.filter((u) => u.alive && u.team === 'enemy' && Math.hypot(u.x - x, u.y - y) <= r);
}

function apUnit(ctx: AugmentCtx): number {
  const p = ctx.player;
  return (0.5 * p.stats.get('abilityPower') + 40) * p.stats.get('abilityDamage');
}

// ---------------------------------------------------------------- Lunge

// Tide Rider — a kill means you never stop moving.
const gezeitenreiter: AugmentDef = {
  id: 'fiz_gezeitenreiter',
  name: 'Tide Rider',
  tier: 'gold',
  tags: ['Sturm'],
  champion: 'fizz',
  description: 'Killing an enemy resets Trident Lunge.',
  hooks: {
    enemyDeath: (_e, ctx) => {
      ctx.player.reduceCooldown('Q', 99999);
      ctx.combat.ring(ctx.player.x, ctx.player.y, 0x66ccff, 90);
    },
  },
};

// Undertow — the slam drags the group together instead of scattering it.
const sog: AugmentDef = {
  id: 'fiz_sog',
  name: 'Undertow',
  tier: 'gold',
  tags: ['Sturm'],
  champion: 'fizz',
  description: 'Trident Lunge pulls everything it hits 90 units toward your landing point.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      const p = ctx.player;
      const dx = p.x - target.x;
      const dy = p.y - target.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = Math.min(90 * ctx.power(sog), Math.max(0, d - 40));
      target.moveBy((dx / d) * pull, (dy / d) * pull);
    },
  },
};

// Reef Break — the more it catches, the harder it lands.
const riffbruch: AugmentDef = {
  id: 'fiz_riffbruch',
  name: 'Reef Break',
  tier: 'silber',
  tags: ['Sturm'],
  champion: 'fizz',
  description: 'Trident Lunge deals +22% for every enemy beyond the first that it catches.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      const n = enemiesNear(ctx, ctx.player.x, ctx.player.y, 145).length;
      if (n < 2) return;
      ctx.combat.dealDamage(ctx.player, target, apUnit(ctx) * 0.22 * (n - 1) * ctx.power(riffbruch), 'ability', 'magisch');
    },
  },
};

// ---------------------------------------------------------------- Strike

// Barbed Point — the empowered strike keeps working after it lands.
const widerhaken: AugmentDef = {
  id: 'fiz_widerhaken',
  name: 'Barbed Point',
  tier: 'gold',
  tags: ['Arkan'],
  champion: 'fizz',
  description: 'Seastone Trident also burns its target for 40% of the hit over 3s.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'E' || !target.alive) return;
      ctx.combat.addBurn(target, (apUnit(ctx) * 0.4 * ctx.power(widerhaken)) / 3, 3000);
    },
  },
};

// Low Tide — staying in melee is what pays.
const niedrigwasser: AugmentDef = {
  id: 'fiz_niedrigwasser',
  name: 'Low Tide',
  tier: 'silber',
  tags: ['Arkan'],
  champion: 'fizz',
  description: 'Each attack on the same enemy deals 8% more than the last, up to +40%. Switching targets resets it.',
  hooks: {
    autoHit: ({ target }, ctx) => {
      if (!target.alive) return;
      const p = ctx.player;
      const last = ctx.run.memory.fizLastTarget;
      const id = ctx.combat.units.indexOf(target) + 1;
      if (last !== id) {
        ctx.run.memory.fizLastTarget = id;
        unitCounterAdd(target, 'fizStack', -unitCounterGet(target, 'fizStack'));
        return;
      }
      const stacks = unitCounterAdd(target, 'fizStack', 1, 5);
      const dmg = 0.08 * stacks * p.stats.get('damage') * ctx.power(niedrigwasser);
      ctx.combat.dealDamage(p, target, dmg, 'ability', 'magisch');
    },
  },
  onCombatInit: (ctx) => {
    ctx.run.memory.fizLastTarget = 0;
  },
};

// ---------------------------------------------------------------- Trickster

// Slippery — the hop stops being an escape and becomes a rhythm.
const glitschig: AugmentDef = {
  id: 'fiz_glitschig',
  name: 'Slippery',
  tier: 'silber',
  tags: ['Sturm'],
  champion: 'fizz',
  description: 'Playful Trickster comes back 35% faster and leaves you 45% faster for 2s.',
  hooks: {
    dashStart: (_e, ctx) => {
      const p = ctx.player;
      p.stats.set({
        id: 'fiz:slip',
        stat: 'moveSpeed',
        pct: 0.45 * ctx.power(glitschig),
        expiresAt: ctx.combat.now + 2000,
      });
      p.reduceCooldown('Dash', 1600 * ctx.power(glitschig));
    },
  },
};

// Mirage — vanishing hurts whatever was chasing you.
const trugbild: AugmentDef = {
  id: 'fiz_trugbild',
  name: 'Mirage',
  tier: 'gold',
  tags: ['Sturm'],
  champion: 'fizz',
  description: 'Playful Trickster detonates where you left, damaging and slowing everything nearby.',
  hooks: {
    dashStart: (_e, ctx) => {
      const p = ctx.player;
      const x = p.x;
      const y = p.y;
      ctx.combat.delay(220, () => {
        ctx.combat.ring(x, y, 0x66ccff, 150);
        for (const u of enemiesNear(ctx, x, y, 150)) {
          ctx.combat.dealDamage(p, u, apUnit(ctx) * 0.55 * ctx.power(trugbild), 'ability', 'magisch');
          u.stats.set({ id: 'fiz:mirage', stat: 'moveSpeed', pct: -0.4, expiresAt: ctx.combat.now + 1500 });
        }
      });
    },
  },
};

// Riptide — being untargetable becomes an offensive window, not a retreat.
const springflut: AugmentDef = {
  id: 'fiz_springflut',
  name: 'Riptide',
  tier: 'prisma',
  tags: ['Sturm'],
  champion: 'fizz',
  description: 'While untargetable after Playful Trickster, your abilities deal +80%.',
  onUpdate: (_dt, ctx) => {
    const p = ctx.player;
    const hidden = ctx.combat.now < p.invulnUntil;
    const on = !!p.memory.fizRiptide;
    if (hidden && !on) {
      p.memory.fizRiptide = 1;
      p.stats.set({ id: 'fiz:riptide', stat: 'abilityDamage', pct: 0.8 * ctx.power(springflut) });
    } else if (!hidden && on) {
      p.memory.fizRiptide = 0;
      p.stats.remove('fiz:riptide');
    }
  },
};

// ---------------------------------------------------------------- Predator

// Blood in the Water — nothing at full health, decisive at low.
const blutImWasser: AugmentDef = {
  id: 'fiz_blut_im_wasser',
  name: 'Blood in the Water',
  tier: 'prisma',
  tags: ['Blut'],
  champion: 'fizz',
  description: 'Your abilities deal +90% to enemies below 35% health. Nothing above it.',
  hooks: {
    abilityHit: ({ target }, ctx) => {
      if (!target.alive || target.hpPct >= 0.35) return;
      ctx.combat.dealDamage(ctx.player, target, apUnit(ctx) * 0.9 * ctx.power(blutImWasser), 'ability', 'magisch');
    },
  },
};

export const FIZZ_AUGMENTS: AugmentDef[] = [
  // Lunge
  gezeitenreiter,
  sog,
  riffbruch,
  // Strike
  widerhaken,
  niedrigwasser,
  // Trickster
  glitschig,
  trugbild,
  springflut,
  // Predator
  blutImWasser,
];
