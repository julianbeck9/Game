import type { AugmentDef, AugmentCtx } from '../types';
import type { Unit } from '../../entities/Unit';
import { unitCounterAdd, unitCounterGet } from '../helpers';
import {
  KARTHUS_DEFILE_R,
  KARTHUS_DEFILE_SELF_DPS,
  KARTHUS_SOLO_MULT,
} from '../../champions/kits';

/**
 * Champion augments for Karthus — the second champion built to the Sivir
 * pattern (see augments/champions/sivir.ts for the reasoning in full).
 *
 * Karthus's kit already asks a question every cast: drop the circle where the
 * enemy IS, or where it is going? Leave the aura running and bleed, or flick it
 * off and play safe? These augments take sides in those questions rather than
 * making the numbers bigger.
 *
 * BUILD LANES, written to disagree with each other:
 *
 *   Precision  — one target only, hit harder (Perfect Pitch, Grave Accuracy,
 *                Cold Read). Actively worse if you drop Q into a crowd.
 *   Zone       — cover ground, punish standing still (Wake, Creeping Barrage,
 *                Scorched Earth). Wants many enemies, hates Precision's rules.
 *   Defile     — the aura is the build (Unbroken Hymn, Communion, Black Lung).
 *                Two of these are dead weight unless Defile is actually on.
 *   Last Stand — the four seconds after death are the payoff (Encore, Second
 *                Verse). Worthless in a run where you never get hit.
 *
 * Precision and Zone are a genuine fork: Perfect Pitch pays for catching
 * exactly one enemy, Creeping Barrage pays for catching several, and no build
 * gets both. Defile's lane is the Keen Edge of this champion — Unbroken Hymn
 * and Black Lung do nothing at all if you never toggle the aura on.
 */

/** Is Karthus's Defile aura currently running? */
function defileOn(ctx: AugmentCtx): boolean {
  return !!ctx.player.memory.defile;
}

function enemiesWithinOf(ctx: AugmentCtx, x: number, y: number, r: number): Unit[] {
  return ctx.combat.units.filter((u) => u.alive && u.team === 'enemy' && Math.hypot(u.x - x, u.y - y) <= r);
}

// ---------------------------------------------------------------- Precision

// Perfect Pitch — sharpens the kit's own solo bonus into the whole build.
const reinerTon: AugmentDef = {
  id: 'kar_reiner_ton',
  name: 'Perfect Pitch',
  tier: 'gold',
  tags: ['Arkan'],
  champion: 'karthus',
  description:
    'Lay Waste that catches exactly one enemy deals a further +45% damage. Catching two or more deals 20% less.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      const crowd = enemiesWithinOf(ctx, target.x, target.y, 92).length;
      const p = ctx.player;
      // Applied as a delta on top of the hit that already landed, so the kit
      // keeps owning the base solo rule and this only sharpens the fork: more
      // for a clean single hit, less for spraying into a pile. The penalty is
      // dealt as healing back to the target rather than negative damage, which
      // dealDamage ignores.
      const amp = p.stats.get('abilityDamage');
      const unit = (0.45 * p.stats.get('abilityPower') + 30) * amp;
      if (crowd <= 1) {
        ctx.combat.dealDamage(p, target, unit * 0.45 * ctx.power(reinerTon), 'ability', 'magisch');
      } else {
        target.heal(unit * 0.2);
      }
    },
  },
};

// Grave Accuracy — a landed solo hit pays its own cooldown back.
const grabesgenauigkeit: AugmentDef = {
  id: 'kar_grabesgenauigkeit',
  name: 'Grave Accuracy',
  tier: 'silber',
  tags: ['Arkan'],
  champion: 'karthus',
  description: 'Lay Waste that catches exactly one enemy refunds 0.5s of its cooldown.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      if (enemiesWithinOf(ctx, target.x, target.y, 92).length > 1) return;
      ctx.player.reduceCooldown('Q', 500 * ctx.power(grabesgenauigkeit));
    },
  },
};

// Cold Read — rewards leading a target rather than dropping Q on top of one.
const kaltgelesen: AugmentDef = {
  id: 'kar_kaltgelesen',
  name: 'Cold Read',
  tier: 'prisma',
  tags: ['Arkan'],
  champion: 'karthus',
  description:
    'Lay Waste marks whoever it hits for 3s. Your next Lay Waste on a marked enemy deals +70% and clears the mark.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      const now = ctx.combat.now;
      // Mark expiry lives in the shared per-unit counter store, which is keyed
      // by a WeakMap and dies with the round — so no state survives into the
      // next run (the module-state leak noted in HANDOVER §1.8).
      const markedUntil = unitCounterGet(target, 'karMark');
      if (markedUntil > now) {
        unitCounterAdd(target, 'karMark', -markedUntil); // clear
        const p = ctx.player;
        const dmg = (0.7 * (0.4 * p.stats.get('abilityPower') + 45)) * ctx.power(kaltgelesen) * p.stats.get('abilityDamage');
        ctx.combat.dealDamage(p, target, dmg, 'ability', 'magisch');
        ctx.combat.ring(target.x, target.y, 0xffd24a, 90);
      } else {
        unitCounterAdd(target, 'karMark', now + 3000 - markedUntil);
      }
    },
  },
};

// ---------------------------------------------------------------- Zone

// Wake — every Lay Waste leaves the ground burning for a moment.
const kielwasser: AugmentDef = {
  id: 'kar_kielwasser',
  name: 'Wake',
  tier: 'gold',
  tags: ['Sturm'],
  champion: 'karthus',
  description: 'Lay Waste leaves a burning patch for 2s where it lands.',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'Q') return;
      const p = ctx.player;
      // abilityCast carries no direction, so read the one the Q itself just
      // stored — same value fireQ used, no second guess at where it went.
      const d = p.lastQDir;
      const x = p.x + d.x * 700;
      const y = p.y + d.y * 700;
      ctx.combat.delay(350, () => {
        ctx.combat.addHazard({
          x, y, r: 95, until: ctx.combat.now + 2000,
          dps: (10 + 0.2 * p.stats.get('abilityPower')) * ctx.power(kielwasser) * p.stats.get('abilityDamage'),
          team: 'player', color: 0x8866cc,
        });
      });
    },
  },
};

// Creeping Barrage — the direct answer to Perfect Pitch, and its opposite.
const kriechendesSperrfeuer: AugmentDef = {
  id: 'kar_sperrfeuer',
  name: 'Creeping Barrage',
  tier: 'gold',
  tags: ['Sturm'],
  champion: 'karthus',
  description: 'Lay Waste deals +18% for every enemy it catches beyond the first.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      const crowd = enemiesWithinOf(ctx, target.x, target.y, 92).length;
      if (crowd < 2) return;
      const p = ctx.player;
      const dmg =
        (0.18 * (crowd - 1) * (0.4 * p.stats.get('abilityPower') + 45)) *
        ctx.power(kriechendesSperrfeuer) *
        p.stats.get('abilityDamage');
      ctx.combat.dealDamage(p, target, dmg, 'ability', 'magisch');
    },
  },
};

// Scorched Earth — the Spectral Slide trail becomes a real zoning tool.
const verbrannteErde: AugmentDef = {
  id: 'kar_verbrannte_erde',
  name: 'Scorched Earth',
  tier: 'silber',
  tags: ['Sturm'],
  champion: 'karthus',
  description: 'Your Spectral Slide trail lasts 3s longer and burns twice as hard.',
  hooks: {
    dashStart: (_e, ctx) => {
      const p = ctx.player;
      ctx.combat.addHazard({
        x: p.x, y: p.y, r: 100, until: ctx.combat.now + 3000,
        dps: (12 + 0.25 * p.stats.get('abilityPower')) * ctx.power(verbrannteErde) * p.stats.get('abilityDamage'),
        team: 'player', color: 0xaa66ff,
      });
    },
  },
};

// ---------------------------------------------------------------- Defile

// Unbroken Hymn — dead weight with the aura off; the lane's Keen Edge.
const ungebrochenerChoral: AugmentDef = {
  id: 'kar_choral',
  name: 'Unbroken Hymn',
  tier: 'gold',
  tags: ['Blut'],
  champion: 'karthus',
  description: 'While Defile is running, it reaches 35% further and drains 30% harder. Nothing otherwise.',
  onUpdate: (dt, ctx) => {
    if (!defileOn(ctx)) return;
    const p = ctx.player;
    const extraR = KARTHUS_DEFILE_R * 0.35;
    const inner = enemiesWithinOf(ctx, p.x, p.y, KARTHUS_DEFILE_R);
    const outer = enemiesWithinOf(ctx, p.x, p.y, KARTHUS_DEFILE_R + extraR);
    const amp = p.stats.get('abilityDamage');
    const base = (26 + 0.18 * p.stats.get('abilityPower')) * amp * dt * ctx.power(ungebrochenerChoral);
    // Extra bite on those already inside, plus full drain out to the new edge.
    for (const u of inner) ctx.combat.dealDamage(p, u, base * 0.3, 'ability', 'magisch');
    for (const u of outer) if (!inner.includes(u)) ctx.combat.dealDamage(p, u, base, 'ability', 'magisch');
  },
};

// Communion — turns Defile's self-cost into the thing that keeps you alive.
const kommunion: AugmentDef = {
  id: 'kar_kommunion',
  name: 'Communion',
  tier: 'prisma',
  tags: ['Blut'],
  champion: 'karthus',
  description: 'Defile heals you for 60% of the damage it drains.',
  onUpdate: (dt, ctx) => {
    if (!defileOn(ctx)) return;
    const p = ctx.player;
    const n = enemiesWithinOf(ctx, p.x, p.y, KARTHUS_DEFILE_R).length;
    if (n === 0) return;
    const drained = (26 + 0.18 * p.stats.get('abilityPower')) * p.stats.get('abilityDamage') * dt * n;
    p.heal(drained * 0.6 * ctx.power(kommunion));
  },
};

// Black Lung — pay more to hurt more. Also dead with the aura off.
const schwarzeLunge: AugmentDef = {
  id: 'kar_schwarze_lunge',
  name: 'Black Lung',
  tier: 'silber',
  tags: ['Blut'],
  champion: 'karthus',
  description: 'Defile costs you 80% more health, and drains 55% harder.',
  onUpdate: (dt, ctx) => {
    if (!defileOn(ctx)) return;
    const p = ctx.player;
    const amp = p.stats.get('abilityDamage');
    const extra = (26 + 0.18 * p.stats.get('abilityPower')) * amp * dt * 0.55 * ctx.power(schwarzeLunge);
    for (const u of enemiesWithinOf(ctx, p.x, p.y, KARTHUS_DEFILE_R)) {
      ctx.combat.dealDamage(p, u, extra, 'ability', 'magisch');
    }
    p.hp = Math.max(1, p.hp - KARTHUS_DEFILE_SELF_DPS * 0.8 * dt);
  },
};

// ---------------------------------------------------------------- Last Stand

// Encore — the four seconds after the killing blow become the best of the run.
const zugabe: AugmentDef = {
  id: 'kar_zugabe',
  name: 'Encore',
  tier: 'prisma',
  tags: ['Blut'],
  champion: 'karthus',
  description: 'While Death Defied is running, your abilities deal +120% and Lay Waste has no cooldown.',
  onUpdate: (_dt, ctx) => {
    const p = ctx.player;
    const defying = p.undyingUntil > ctx.combat.now;
    const active = !!p.memory.karEncore;
    if (defying && !active) {
      p.memory.karEncore = 1;
      p.stats.set({ id: 'kar:encore', stat: 'abilityDamage', pct: 1.2 * ctx.power(zugabe) });
      ctx.combat.announce('Encore!', '#ffd24a');
    }
    if (defying) p.reduceCooldown('Q', 9999);
    if (!defying && active) {
      p.memory.karEncore = 0;
      p.stats.remove('kar:encore');
    }
  },
};

// Second Verse — a second reprieve, at a price you pay up front.
const zweiteStrophe: AugmentDef = {
  id: 'kar_zweite_strophe',
  name: 'Second Verse',
  tier: 'gold',
  tags: ['Blut'],
  champion: 'karthus',
  description: 'Death Defied can trigger a second time each run, but you start every round at 80% health.',
  statMods: [{ stat: 'maxHP', pct: -0.2 }],
  onCombatInit: (ctx) => {
    // Refund the once-per-run flag exactly once, at the start of a round.
    if (ctx.run.memory.karSecondVerseUsed) return;
    if (ctx.run.memory.karthusDefied) {
      ctx.run.memory.karthusDefied = 0;
      ctx.run.memory.karSecondVerseUsed = 1;
    }
  },
};

export const KARTHUS_AUGMENTS: AugmentDef[] = [
  // Precision
  reinerTon,
  grabesgenauigkeit,
  kaltgelesen,
  // Zone
  kielwasser,
  kriechendesSperrfeuer,
  verbrannteErde,
  // Defile
  ungebrochenerChoral,
  kommunion,
  schwarzeLunge,
  // Last Stand
  zugabe,
  zweiteStrophe,
];

/** Shared with the kit so a lane that doubles the solo bonus knows its base. */
export const KARTHUS_SOLO_BASE = KARTHUS_SOLO_MULT;
