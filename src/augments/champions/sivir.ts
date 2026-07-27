import type { AugmentDef, AugmentCtx } from '../types';
import type { Unit } from '../../entities/Unit';
import { COLORS } from '../../config';

/**
 * Champion augments for Sivir.
 *
 * These are deliberately NOT stat sticks. A generic pool of "+8% attack damage"
 * picks makes every run play the same, because nothing you pick changes what
 * you actually do with your hands. These change the ability itself: the Q
 * becomes a fan, or a ricochet, or something that pays its own cooldown back
 * when you land it — so the pick changes how you aim and position for the rest
 * of the run.
 *
 * They hook the existing combat events rather than rewriting kits.ts, so a
 * champion's kit stays one readable piece of code and the augment is the
 * add-on. Every one is gated to `champion: 'sivir'` and never offered elsewhere.
 *
 * BUILD LANES. The point is not ten good picks, it is picks that disagree with
 * each other, so there is no single correct list to take every run:
 *
 *   Blade   — the Q carries the run (Fan Throw, Backhand, Twin Cast)
 *   On-Hit  — autos carry it, the Q feeds them (Quickdraw, Whetstone)
 *   Crit    — dead weight at 0% crit, best in the run (Keen Edge, Hot Streak)
 *   Ward    — the Spell Shield becomes offence (Warding Wave)
 *   Roam    — the dash is a weapon (Blade Storm, Ricochet Edge)
 *
 * Crit is deliberately the sharpest fork: Keen Edge and Hot Streak do literally
 * nothing without crit chance bought from the shop, so taking them is a bet on
 * a build rather than a free upgrade.
 */

/** Blade damage shared by the Q riders: scales off AD like the base boomerang. */
function bladeDamage(ctx: AugmentCtx, factor: number): number {
  const p = ctx.player;
  return (0.45 * p.stats.get('damage')) * factor * p.stats.get('abilityDamage');
}

function rotate(v: { x: number; y: number }, rad: number): { x: number; y: number } {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** Spawn one extra Sivir blade along `dir`. */
function throwBlade(
  ctx: AugmentCtx,
  dir: { x: number; y: number },
  dmg: number,
  opts: { boomerang?: boolean; maxDist?: number; ignore?: Unit } = {},
): void {
  const p = ctx.player;
  ctx.combat.spawnProjectile({
    x: p.x + dir.x * (p.radius + 6),
    y: p.y + dir.y * (p.radius + 6),
    dirX: dir.x,
    dirY: dir.y,
    speed: 1050,
    radius: 11,
    color: COLORS.playerProj,
    team: 'player',
    maxHits: 2,
    maxDist: opts.maxDist ?? 560,
    spin: true,
    ignore: opts.ignore,
    boomerangTo: opts.boomerang ? p : undefined,
    onHit: (u: Unit) => {
      const dealt = ctx.combat.dealDamage(p, u, dmg, 'ability', 'physisch');
      ctx.combat.bus.emit('abilityHit', { ability: 'Q', target: u, dmg: dealt });
    },
  });
}

// Fächerwurf — the Q stops being one line and becomes an area you sweep.
const faecherwurf: AugmentDef = {
  id: 'siv_faecherwurf',
  name: 'Fan Throw',
  tier: 'silber',
  tags: ['Sturm'],
  champion: 'sivir',
  description: 'Your Boomerang Blade throws two more blades at ±16°, each for 55% damage.',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'Q') return;
      const d = ctx.player.lastQDir;
      const dmg = bladeDamage(ctx, 0.55 * ctx.power(faecherwurf));
      const spread = (16 * Math.PI) / 180;
      throwBlade(ctx, rotate(d, spread), dmg);
      throwBlade(ctx, rotate(d, -spread), dmg);
    },
  },
};

// Rückhand — rewards actually landing the skillshot instead of holding it.
const rueckhand: AugmentDef = {
  id: 'siv_rueckhand',
  name: 'Backhand',
  tier: 'gold',
  tags: ['Sturm'],
  champion: 'sivir',
  description: 'Every enemy your Boomerang Blade hits refunds 0.9s of its cooldown.',
  hooks: {
    abilityHit: ({ ability }, ctx) => {
      if (ability !== 'Q') return;
      ctx.player.reduceCooldown('Q', 900 * ctx.power(rueckhand));
    },
  },
};

// Prellklinge — turns a straight-line skillshot into crowd clearing.
const prellklinge: AugmentDef = {
  id: 'siv_prellklinge',
  name: 'Ricochet Edge',
  tier: 'gold',
  tags: ['Sturm'],
  champion: 'sivir',
  description: 'Blade hits ricochet a splinter to the nearest other enemy for 45% damage.',
  onCombatInit: (ctx) => {
    ctx.run.memory.sivRicochetAt = 0;
  },
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      // One splinter per 250ms, so a piercing throw can't chain into a storm.
      const now = ctx.combat.now;
      if (now < (ctx.run.memory.sivRicochetAt ?? 0)) return;
      ctx.run.memory.sivRicochetAt = now + 250;
      let best: Unit | null = null;
      let bestD = 460;
      for (const u of ctx.combat.units) {
        if (!u.alive || u.team !== 'enemy' || u === target) continue;
        const d = Math.hypot(u.x - target.x, u.y - target.y);
        if (d < bestD) {
          bestD = d;
          best = u;
        }
      }
      if (!best) return;
      const dir = { x: (best.x - target.x) / bestD, y: (best.y - target.y) / bestD };
      const dmg = bladeDamage(ctx, 0.45 * ctx.power(prellklinge));
      ctx.combat.spawnProjectile({
        x: target.x,
        y: target.y,
        dirX: dir.x,
        dirY: dir.y,
        speed: 900,
        radius: 9,
        color: COLORS.playerProj,
        team: 'player',
        maxHits: 1,
        maxDist: bestD + 40,
        spin: true,
        ignore: target,
        onHit: (u: Unit) => ctx.combat.dealDamage(ctx.player, u, dmg, 'ability', 'physisch'),
      });
    },
  },
};

// Bannwelle — the Spell Shield stops being purely defensive.
const bannwelle: AugmentDef = {
  id: 'siv_bannwelle',
  name: 'Warding Wave',
  tier: 'gold',
  tags: ['Ward'],
  champion: 'sivir',
  description: 'Raising your Spell Shield blasts enemies within 300 for 90 magic damage.',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'E') return;
      const p = ctx.player;
      const dmg = (90 + 0.3 * p.stats.get('damage')) * p.stats.get('abilityDamage') * ctx.power(bannwelle);
      ctx.combat.ring(p.x, p.y, 0x88ccff, 300);
      for (const u of ctx.combat.units) {
        if (!u.alive || u.team !== 'enemy') continue;
        if (Math.hypot(u.x - p.x, u.y - p.y) <= 300 + u.radius) {
          ctx.combat.dealDamage(p, u, dmg, 'ability', 'magisch');
        }
      }
    },
  },
};

// Klingenwirbel — the dash becomes an offensive tool, not just an escape.
const klingenwirbel: AugmentDef = {
  id: 'siv_klingenwirbel',
  name: 'Blade Storm',
  tier: 'prisma',
  tags: ['Sturm'],
  champion: 'sivir',
  description: 'Your Ricochet Step scatters six blades outward, each for 50% damage.',
  hooks: {
    dashStart: (_p, ctx) => {
      const dmg = bladeDamage(ctx, 0.5 * ctx.power(klingenwirbel));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        throwBlade(ctx, { x: Math.cos(a), y: Math.sin(a) }, dmg, { maxDist: 420 });
      }
    },
  },
};

// Doppelwurf — the payoff pick: the Q simply happens twice.
const doppelwurf: AugmentDef = {
  id: 'siv_doppelwurf',
  name: 'Twin Cast',
  tier: 'prisma',
  tags: ['Sturm'],
  champion: 'sivir',
  description: 'Your Boomerang Blade is thrown a second time shortly after, for 70% damage.',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'Q') return;
      const d = { ...ctx.player.lastQDir };
      const dmg = bladeDamage(ctx, 0.7 * ctx.power(doppelwurf));
      ctx.combat.delay(190, () => {
        if (!ctx.player.alive) return;
        throwBlade(ctx, d, dmg, { boomerang: true, maxDist: 640 });
      });
    },
  },
};

// --- On-Hit lane -----------------------------------------------------------

// Schnellzug — Q into instant auto; rewards attack speed rather than haste.
const schnellzug: AugmentDef = {
  id: 'siv_schnellzug',
  name: 'Quickdraw',
  tier: 'silber',
  tags: ['Sturm'],
  champion: 'sivir',
  description: 'Casting Boomerang Blade resets your attack timer — the next auto fires at once.',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability === 'Q') ctx.player.resetAutoAttack();
    },
  },
};

// Klingenschliff — every third auto throws a blade; wants attack speed, not AD.
const klingenschliff: AugmentDef = {
  id: 'siv_klingenschliff',
  name: 'Whetstone',
  tier: 'gold',
  tags: ['Sturm'],
  champion: 'sivir',
  description: 'Every 3rd auto-attack flings a blade at your target for 40% damage.',
  onCombatInit: (ctx) => {
    ctx.run.memory.sivWhet = 0;
  },
  hooks: {
    autoHit: ({ target }, ctx) => {
      ctx.run.memory.sivWhet = (ctx.run.memory.sivWhet ?? 0) + 1;
      if (ctx.run.memory.sivWhet < 3 || !target.alive) return;
      ctx.run.memory.sivWhet = 0;
      const p = ctx.player;
      const d = Math.hypot(target.x - p.x, target.y - p.y) || 1;
      throwBlade(
        ctx,
        { x: (target.x - p.x) / d, y: (target.y - p.y) / d },
        bladeDamage(ctx, 0.4 * ctx.power(klingenschliff)),
        { maxDist: d + 60 },
      );
    },
  },
};

// --- Crit lane -------------------------------------------------------------
// Both of these are worth nothing at 0% crit. That is the point: they are a bet
// on buying crit in the shop, not a pick you take because it was offered.

// Schneidkante — blades can crit at all, which they normally cannot.
const schneidkante: AugmentDef = {
  id: 'siv_schneidkante',
  name: 'Keen Edge',
  tier: 'gold',
  tags: ['Bruch'],
  champion: 'sivir',
  description: 'Your Boomerang Blade can critically strike (it normally cannot) for +75% damage.',
  // Rides `abilityHit`, which BOTH the champion's own Q and the augment blades
  // emit. An earlier version rolled the crit inside the augment's own blade
  // spawner, so it did nothing at all unless you also owned a blade augment —
  // the base Q never went through that path.
  hooks: {
    abilityHit: ({ ability, target, dmg }, ctx) => {
      if (ability !== 'Q' || !target.alive || dmg <= 0) return;
      if (Math.random() >= ctx.player.stats.get('critChance')) return;
      const bonus = dmg * 0.75 * ctx.power(schneidkante);
      const dealt = ctx.combat.dealDamage(ctx.player, target, bonus, 'ability', 'physisch');
      ctx.combat.ring(target.x, target.y, 0xffd24a, 34);
      ctx.combat.bus.emit('critHit', { target, dmg: dealt });
    },
  },
};

// Glückssträhne — turns crit rate into Q uptime.
const gluecksstraehne: AugmentDef = {
  id: 'siv_gluecksstraehne',
  name: 'Hot Streak',
  tier: 'prisma',
  tags: ['Bruch'],
  champion: 'sivir',
  description: 'Each critical strike refunds 0.6s of your Boomerang Blade cooldown.',
  hooks: {
    critHit: (_p, ctx) => {
      ctx.player.reduceCooldown('Q', 600 * ctx.power(gluecksstraehne));
    },
  },
};

export const SIVIR_AUGMENTS: AugmentDef[] = [
  // Blade
  faecherwurf,
  rueckhand,
  doppelwurf,
  // On-Hit
  schnellzug,
  klingenschliff,
  // Crit
  schneidkante,
  gluecksstraehne,
  // Ward
  bannwelle,
  // Roam
  prellklinge,
  klingenwirbel,
];
