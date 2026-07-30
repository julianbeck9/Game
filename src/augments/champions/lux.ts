import type { AugmentDef, AugmentCtx } from '../types';
import type { Unit } from '../../entities/Unit';

/**
 * Champion augments for Lux — the burst mage.
 *
 * Her kit is the longest skillshot in the roster plus a mark that a follow-up
 * hit detonates. That is already a two-step rhythm, so the lanes argue about
 * which half of it carries: the beam that has to land, the mark that has to be
 * cashed, the barrier that lets you stand still long enough to do either.
 *
 * BUILD LANES:
 *
 *   Beam    — Light Binding is the run (Refraction, Lance, Long Focus).
 *             Wants you at maximum range, and rewards not missing.
 *   Mark    — Illumination is the run (Overexposure, Chain Light).
 *             Wants a second hit on the same target, so it argues with Beam's
 *             habit of firing at whatever is furthest away.
 *   Barrier — the shield is offence (Hard Light, Afterglow).
 *   Zone    — the blink field does the work (Event Horizon).
 *
 * Lux is the sim's weakest champion by a wide margin (median round 2 against
 * Master Yi's 13), so these lean on making her *land* things rather than on
 * raw numbers — the failure mode being measured is dying before casting twice.
 */

function enemiesNear(ctx: AugmentCtx, x: number, y: number, r: number): Unit[] {
  return ctx.combat.units.filter((u) => u.alive && u.team === 'enemy' && Math.hypot(u.x - x, u.y - y) <= r);
}

function apUnit(ctx: AugmentCtx): number {
  const p = ctx.player;
  return (0.5 * p.stats.get('abilityPower') + 45) * p.stats.get('abilityDamage');
}

// ---------------------------------------------------------------- Beam

const brechung: AugmentDef = {
  id: 'lux_brechung',
  name: 'Refraction',
  tier: 'gold',
  tags: ['Arkan'],
  champion: 'lux',
  description: 'Light Binding splits on its first hit, firing two shorter beams diagonally onward.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      const p = ctx.player;
      if (ctx.combat.now < (ctx.run.memory.luxSplitAt ?? 0)) return;
      ctx.run.memory.luxSplitAt = ctx.combat.now + 200;
      const base = Math.atan2(target.y - p.y, target.x - p.x);
      for (const off of [-0.5, 0.5]) {
        const a = base + off;
        ctx.combat.spawnProjectile({
          x: target.x, y: target.y, dirX: Math.cos(a), dirY: Math.sin(a),
          speed: 1000, radius: 11, color: 0xfff0a0, team: 'player',
          maxHits: 1, maxDist: 320,
          onHit: (u: Unit) => ctx.combat.dealDamage(p, u, apUnit(ctx) * 0.5 * ctx.power(brechung), 'ability', 'magisch'),
        });
      }
    },
  },
  onCombatInit: (ctx) => {
    ctx.run.memory.luxSplitAt = 0;
  },
};

const lanze: AugmentDef = {
  id: 'lux_lanze',
  name: 'Lance',
  tier: 'silber',
  tags: ['Arkan'],
  champion: 'lux',
  description: 'Light Binding roots 1s longer and refunds 1.2s of its cooldown per enemy hit.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      target.ctrlUntil = Math.max(target.ctrlUntil, ctx.combat.now + 1000 * ctx.power(lanze));
      ctx.player.reduceCooldown('Q', 1200 * ctx.power(lanze));
    },
  },
};

const langeBrennweite: AugmentDef = {
  id: 'lux_lange_brennweite',
  name: 'Long Focus',
  tier: 'gold',
  tags: ['Arkan'],
  champion: 'lux',
  description: 'Light Binding deals +50% to enemies more than 400 away. Nothing extra up close.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      const p = ctx.player;
      if (Math.hypot(target.x - p.x, target.y - p.y) < 400) return;
      ctx.combat.dealDamage(p, target, apUnit(ctx) * 0.5 * ctx.power(langeBrennweite), 'ability', 'magisch');
    },
  },
};

// ---------------------------------------------------------------- Mark

const ueberbelichtung: AugmentDef = {
  id: 'lux_ueberbelichtung',
  name: 'Overexposure',
  tier: 'gold',
  tags: ['Arkan'],
  champion: 'lux',
  description: 'Popping Illumination also detonates for 65% damage to everything within 180.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      // The kit pops the mark through the Q slot on an auto-attack.
      if (ability !== 'Q' || !target.alive) return;
      const p = ctx.player;
      const splash = enemiesNear(ctx, target.x, target.y, 180).filter((u) => u !== target);
      if (splash.length === 0) return;
      ctx.combat.ring(target.x, target.y, 0xfff0a0, 180);
      for (const u of splash) {
        ctx.combat.dealDamage(p, u, apUnit(ctx) * 0.65 * ctx.power(ueberbelichtung), 'ability', 'magisch');
      }
    },
  },
};

const kettenlicht: AugmentDef = {
  id: 'lux_kettenlicht',
  name: 'Chain Light',
  tier: 'prisma',
  tags: ['Arkan'],
  champion: 'lux',
  description: 'Your attacks deal +35% to any enemy that is currently marked by Illumination.',
  hooks: {
    autoHit: ({ target }, ctx) => {
      if (!target.alive) return;
      const p = ctx.player;
      ctx.combat.dealDamage(p, target, 0.35 * p.stats.get('damage') * ctx.power(kettenlicht), 'ability', 'magisch');
    },
  },
};

// ---------------------------------------------------------------- Barrier

const hartlicht: AugmentDef = {
  id: 'lux_hartlicht',
  name: 'Hard Light',
  tier: 'gold',
  tags: ['Blut'],
  champion: 'lux',
  description: 'Prismatic Barrier also damages and knocks back everything around you when it goes up.',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'E') return;
      const p = ctx.player;
      ctx.combat.ring(p.x, p.y, 0xfff0a0, 240);
      for (const u of enemiesNear(ctx, p.x, p.y, 240)) {
        ctx.combat.dealDamage(p, u, apUnit(ctx) * 0.6 * ctx.power(hartlicht), 'ability', 'magisch');
        const dx = u.x - p.x;
        const dy = u.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        u.moveBy((dx / d) * 110, (dy / d) * 110);
      }
    },
  },
};

const nachglut: AugmentDef = {
  id: 'lux_nachglut',
  name: 'Afterglow',
  tier: 'silber',
  tags: ['Blut'],
  champion: 'lux',
  description: 'While Prismatic Barrier still holds any shield, your abilities deal +30%.',
  onUpdate: (_dt, ctx) => {
    const p = ctx.player;
    const shielded = p.shield > 0;
    const on = !!p.memory.luxAfterglow;
    if (shielded && !on) {
      p.memory.luxAfterglow = 1;
      p.stats.set({ id: 'lux:afterglow', stat: 'abilityDamage', pct: 0.3 * ctx.power(nachglut) });
    } else if (!shielded && on) {
      p.memory.luxAfterglow = 0;
      p.stats.remove('lux:afterglow');
    }
  },
};

// ---------------------------------------------------------------- Zone

const ereignishorizont: AugmentDef = {
  id: 'lux_ereignishorizont',
  name: 'Event Horizon',
  tier: 'prisma',
  tags: ['Sturm'],
  champion: 'lux',
  description: 'Singularity Step leaves a field that also burns, and roots anything standing in it after 1s.',
  hooks: {
    dashStart: (_e, ctx) => {
      const p = ctx.player;
      const x = p.x;
      const y = p.y;
      ctx.combat.addHazard({
        x, y, r: 190, until: ctx.combat.now + 3000,
        dps: apUnit(ctx) * 0.35 * ctx.power(ereignishorizont), team: 'player', color: 0xfff0a0,
      });
      ctx.combat.delay(1000, () => {
        for (const u of enemiesNear(ctx, x, y, 190)) {
          u.ctrlUntil = Math.max(u.ctrlUntil, ctx.combat.now + 900);
        }
      });
    },
  },
};

export const LUX_AUGMENTS: AugmentDef[] = [
  brechung,
  lanze,
  langeBrennweite,
  ueberbelichtung,
  kettenlicht,
  hartlicht,
  nachglut,
  ereignishorizont,
];
