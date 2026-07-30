import type { AugmentDef, AugmentCtx } from '../types';
import type { Unit } from '../../entities/Unit';
import { unitCounterAdd, unitCounterGet } from '../helpers';

/**
 * Champion augments for Blitzcrank — third champion on the Sivir pattern.
 *
 * His hook is the most distinctive button in the roster: a skillshot that
 * *moves the enemy* rather than damaging it. Everything here takes a side on
 * what that hook is for, and the lanes are written so that no single list is
 * correct every run.
 *
 * BUILD LANES:
 *
 *   Hook   — the grab carries the run (Overdrive Coil, Salvage Claw, Winch).
 *            Wants you fishing for picks; punishing when you miss.
 *   Fist   — the empowered auto is the payoff (Piston Drive, Live Wire).
 *            Wants targets standing next to you, which the Hook lane undoes.
 *   Field  — Static Field is the damage (Tesla Coil, Overcharge). Wants a
 *            crowd hugging you, so it disagrees with pulling one enemy out.
 *   Grit   — the shield is the build (Riot Plating, Failsafe). Dead weight in
 *            a run where you are never brought low.
 *
 * The Hook/Field split is the sharpest: a hook drags exactly one enemy out of
 * its group and into you, while Field wants the whole group already there.
 */

function enemiesNear(ctx: AugmentCtx, x: number, y: number, r: number): Unit[] {
  return ctx.combat.units.filter((u) => u.alive && u.team === 'enemy' && Math.hypot(u.x - x, u.y - y) <= r);
}

// ---------------------------------------------------------------- Hook

// Overdrive Coil — a landed hook is a licence to keep hooking.
const ueberspannung: AugmentDef = {
  id: 'blz_ueberspannung',
  name: 'Overdrive Coil',
  tier: 'gold',
  tags: ['Sturm'],
  champion: 'blitzcrank',
  description: 'Landing Rocket Grab refunds 45% of its cooldown. Missing it adds 1.5s.',
  hooks: {
    abilityHit: ({ ability }, ctx) => {
      if (ability !== 'Dash') return;
      ctx.player.reduceCooldown('Dash', 4000 * ctx.power(ueberspannung));
    },
  },
};

// Salvage Claw — the grab drags the whole group, not one body.
const bergungsklaue: AugmentDef = {
  id: 'blz_bergungsklaue',
  name: 'Salvage Claw',
  tier: 'prisma',
  tags: ['Sturm'],
  champion: 'blitzcrank',
  description: 'Rocket Grab also drags every other enemy within 220 of your victim halfway to you.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Dash' || !target.alive) return;
      const p = ctx.player;
      for (const u of enemiesNear(ctx, target.x, target.y, 220)) {
        if (u === target) continue;
        const dx = p.x - u.x;
        const dy = p.y - u.y;
        const d = Math.hypot(dx, dy) || 1;
        const pull = Math.max(0, d - 110) * 0.5 * ctx.power(bergungsklaue);
        u.moveBy((dx / d) * pull, (dy / d) * pull);
      }
      ctx.combat.ring(target.x, target.y, 0xffcc33, 220);
    },
  },
};

// Winch — a hooked enemy cannot simply walk back out.
const seilwinde: AugmentDef = {
  id: 'blz_seilwinde',
  name: 'Winch',
  tier: 'silber',
  tags: ['Sturm'],
  champion: 'blitzcrank',
  description: 'Enemies you grab are slowed by 55% for 2.5s after landing.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Dash' || !target.alive) return;
      target.stats.set({
        id: 'blz:winch',
        stat: 'moveSpeed',
        pct: -0.55 * ctx.power(seilwinde),
        expiresAt: ctx.combat.now + 2500,
      });
    },
  },
};

// ---------------------------------------------------------------- Fist

// Piston Drive — Power Fist stops being a one-off.
const kolbenantrieb: AugmentDef = {
  id: 'blz_kolbenantrieb',
  name: 'Piston Drive',
  tier: 'gold',
  tags: ['Arkan'],
  champion: 'blitzcrank',
  description: 'Power Fist empowers your next two attacks instead of one.',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'Q') return;
      // The kit clears its flag on the first empowered hit; re-arm once.
      unitCounterAdd(ctx.player, 'blzFistExtra', 1, 1);
    },
    autoHit: (_e, ctx) => {
      const p = ctx.player;
      if (p.memory.blitzFist) return; // the kit's own charge is still loaded
      if (unitCounterGet(p, 'blzFistExtra') <= 0) return;
      unitCounterAdd(p, 'blzFistExtra', -1);
      p.memory.blitzFist = 1;
    },
  },
};

// Live Wire — the fist chains into whoever is standing nearby.
const starkstrom: AugmentDef = {
  id: 'blz_starkstrom',
  name: 'Live Wire',
  tier: 'gold',
  tags: ['Arkan'],
  champion: 'blitzcrank',
  description: 'Power Fist arcs to the two nearest enemies for 55% damage and briefly stuns them.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      const p = ctx.player;
      const near = enemiesNear(ctx, target.x, target.y, 300)
        .filter((u) => u !== target)
        .slice(0, 2);
      const dmg = (0.55 * (0.5 * p.stats.get('damage') + 40)) * ctx.power(starkstrom) * p.stats.get('abilityDamage');
      for (const u of near) {
        ctx.combat.dealDamage(p, u, dmg, 'ability', 'magisch');
        u.ctrlUntil = Math.max(u.ctrlUntil, ctx.combat.now + 350);
        ctx.combat.flashLine(target.x, target.y, u.x, u.y, 0x66ccff);
      }
    },
  },
};

// ---------------------------------------------------------------- Field

// Tesla Coil — Static Field stops being a button and becomes a heartbeat.
const teslaspule: AugmentDef = {
  id: 'blz_teslaspule',
  name: 'Tesla Coil',
  tier: 'gold',
  tags: ['Blut'],
  champion: 'blitzcrank',
  description: 'Static Field also fires by itself every 3s, at 60% damage.',
  onUpdate: (_dt, ctx) => {
    const p = ctx.player;
    const now = ctx.combat.now;
    if (now < (ctx.run.memory.blzCoilAt ?? 0)) return;
    ctx.run.memory.blzCoilAt = now + 3000;
    const targets = enemiesNear(ctx, p.x, p.y, 220);
    if (targets.length === 0) return;
    const dmg = (0.6 * (45 + 0.2 * p.stats.get('abilityPower'))) * ctx.power(teslaspule) * p.stats.get('abilityDamage');
    ctx.combat.ring(p.x, p.y, 0x66ccff, 220);
    for (const u of targets) ctx.combat.dealDamage(p, u, dmg, 'ability', 'magisch');
  },
  onCombatInit: (ctx) => {
    ctx.run.memory.blzCoilAt = 0;
  },
};

// Overcharge — reward for standing in the middle of everything.
const ueberladung: AugmentDef = {
  id: 'blz_ueberladung',
  name: 'Overcharge',
  tier: 'silber',
  tags: ['Blut'],
  champion: 'blitzcrank',
  description: 'Static Field deals +25% for each enemy it catches.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'E' || !target.alive) return;
      const p = ctx.player;
      const n = enemiesNear(ctx, p.x, p.y, 225).length;
      if (n < 2) return;
      const dmg = (0.25 * n * (45 + 0.2 * p.stats.get('abilityPower'))) * ctx.power(ueberladung) * p.stats.get('abilityDamage');
      ctx.combat.dealDamage(p, target, dmg, 'ability', 'magisch');
    },
  },
};

// ---------------------------------------------------------------- Grit

// Riot Plating — the passive shield becomes a recurring wall.
const aufruhrpanzerung: AugmentDef = {
  id: 'blz_aufruhrpanzerung',
  name: 'Riot Plating',
  tier: 'gold',
  tags: ['Blut'],
  champion: 'blitzcrank',
  description: 'Mana Barrier recharges every 12s instead of once per round, and shields 60% more.',
  onUpdate: (_dt, ctx) => {
    const p = ctx.player;
    const now = ctx.combat.now;
    if (!p.memory.manaBar) return; // not spent yet; the kit still owns it
    if (now < (ctx.run.memory.blzPlateAt ?? 0)) {
      return;
    }
    ctx.run.memory.blzPlateAt = now + 12000;
    p.memory.manaBar = 0;
  },
  hooks: {
    // The extra thickness rides on top of whatever the kit granted.
    playerHpThreshold: (_e, ctx) => {
      const p = ctx.player;
      p.addShield(p.maxHP * 0.09 * ctx.power(aufruhrpanzerung));
    },
  },
  onCombatInit: (ctx) => {
    ctx.run.memory.blzPlateAt = 0;
  },
};

// Failsafe — turns the shield into a threat instead of a cushion.
const notabschaltung: AugmentDef = {
  id: 'blz_notabschaltung',
  name: 'Failsafe',
  tier: 'prisma',
  tags: ['Blut'],
  champion: 'blitzcrank',
  description: 'When Mana Barrier triggers, discharge Static Field at double damage and stun everything around you for 1s.',
  hooks: {
    playerHpThreshold: (_e, ctx) => {
      const p = ctx.player;
      const dmg = (2 * (45 + 0.2 * p.stats.get('abilityPower'))) * ctx.power(notabschaltung) * p.stats.get('abilityDamage');
      ctx.combat.ring(p.x, p.y, 0xffffff, 260);
      for (const u of enemiesNear(ctx, p.x, p.y, 260)) {
        ctx.combat.dealDamage(p, u, dmg, 'ability', 'magisch');
        u.ctrlUntil = Math.max(u.ctrlUntil, ctx.combat.now + 1000);
      }
    },
  },
};

export const BLITZCRANK_AUGMENTS: AugmentDef[] = [
  // Hook
  ueberspannung,
  bergungsklaue,
  seilwinde,
  // Fist
  kolbenantrieb,
  starkstrom,
  // Field
  teslaspule,
  ueberladung,
  // Grit
  aufruhrpanzerung,
  notabschaltung,
];
