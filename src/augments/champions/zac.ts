import type { AugmentDef, AugmentCtx } from '../types';
import type { Unit } from '../../entities/Unit';

/**
 * Champion augments for Zac — the engage tank.
 *
 * Zac's identity in the roadmap is **earned healing**: he is the champion who
 * gets his health back by working for it, not by having lifesteal. His kit
 * already has the two hooks that matter — a self-centred pulse and a passive
 * that reforms him once per fight — so the lanes argue about how the health
 * comes back and what the size of the body is for.
 *
 * BUILD LANES:
 *
 *   Blob     — healing you have to walk to (Split Cell, Rich Harvest).
 *              Rewards standing in the middle and moving between fights.
 *   Bulk     — the health bar itself is the weapon (Mass Matters, Heavy Landing).
 *              Wants max HP; does nothing for a squishy build.
 *   Engage   — the slingshot is the run (Terminal Velocity, Rebound).
 *              Wants you starting fights, which Bulk's slowness fights against.
 *   Reform   — the second life is the build (Second Culture, Unmaking). Dead
 *              weight in a fight you never nearly lose.
 */

function enemiesNear(ctx: AugmentCtx, x: number, y: number, r: number): Unit[] {
  return ctx.combat.units.filter((u) => u.alive && u.team === 'enemy' && Math.hypot(u.x - x, u.y - y) <= r);
}

// ---------------------------------------------------------------- Blob

const zellteilung: AugmentDef = {
  id: 'zac_zellteilung',
  name: 'Split Cell',
  tier: 'gold',
  tags: ['Blut'],
  champion: 'zac',
  description: 'Unstable Pulse drops a blob for every enemy it hits. Walking over one heals you for 5% of max health.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      // The heal has to be walked to — that is the whole point of the champion.
      ctx.combat.addHazard({
        x: target.x, y: target.y, r: 34, until: ctx.combat.now + 6000,
        dps: 0, team: 'enemy', color: 0x66dd66,
      });
      ctx.combat.delay(0, () => {
        ctx.run.memory.zacBlobs = (ctx.run.memory.zacBlobs ?? 0) + 1;
      });
    },
  },
  onUpdate: (_dt, ctx) => {
    // Collect: any harmless green marker close enough to stand on.
    const p = ctx.player;
    for (const h of ctx.combat.hazards) {
      if (h.dps !== 0 || h.color !== 0x66dd66 || h.until <= ctx.combat.now) continue;
      if (Math.hypot(p.x - h.x, p.y - h.y) > h.r + p.radius) continue;
      h.until = 0;
      p.heal(p.maxHP * 0.05 * ctx.power(zellteilung));
      ctx.combat.ring(p.x, p.y, 0x66dd66, 60);
    }
  },
};

const reicheErnte: AugmentDef = {
  id: 'zac_reiche_ernte',
  name: 'Rich Harvest',
  tier: 'silber',
  tags: ['Blut'],
  champion: 'zac',
  description: 'Unstable Pulse heals you for 3% of max health per enemy it catches.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      const p = ctx.player;
      p.heal(p.maxHP * 0.03 * ctx.power(reicheErnte));
    },
  },
};

// ---------------------------------------------------------------- Bulk

const masseZaehlt: AugmentDef = {
  id: 'zac_masse_zaehlt',
  name: 'Mass Matters',
  tier: 'gold',
  tags: ['Blut'],
  champion: 'zac',
  description: 'Unstable Pulse deals bonus damage equal to 4% of your maximum health.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      const p = ctx.player;
      ctx.combat.dealDamage(p, target, p.maxHP * 0.04 * ctx.power(masseZaehlt) * p.stats.get('abilityDamage'), 'ability', 'magisch');
    },
  },
};

const schwereLandung: AugmentDef = {
  id: 'zac_schwere_landung',
  name: 'Heavy Landing',
  tier: 'silber',
  tags: ['Blut'],
  champion: 'zac',
  description: 'Elastic Slingshot deals bonus damage equal to 6% of your maximum health, and stuns for 0.5s longer.',
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Dash' || !target.alive) return;
      const p = ctx.player;
      ctx.combat.dealDamage(p, target, p.maxHP * 0.06 * ctx.power(schwereLandung) * p.stats.get('abilityDamage'), 'ability', 'magisch');
      target.ctrlUntil = Math.max(target.ctrlUntil, ctx.combat.now + 500);
    },
  },
};

// ---------------------------------------------------------------- Engage

const endgeschwindigkeit: AugmentDef = {
  id: 'zac_endgeschwindigkeit',
  name: 'Terminal Velocity',
  tier: 'gold',
  tags: ['Sturm'],
  champion: 'zac',
  description: 'Elastic Slingshot also knocks up everything within 220 of where you land.',
  hooks: {
    dashStart: (_e, ctx) => {
      const p = ctx.player;
      ctx.combat.delay(180, () => {
        ctx.combat.ring(p.x, p.y, 0x66dd66, 220);
        for (const u of enemiesNear(ctx, p.x, p.y, 220)) {
          u.ctrlUntil = Math.max(u.ctrlUntil, ctx.combat.now + 700 * ctx.power(endgeschwindigkeit));
        }
      });
    },
  },
};

const rueckprall: AugmentDef = {
  id: 'zac_rueckprall',
  name: 'Rebound',
  tier: 'prisma',
  tags: ['Sturm'],
  champion: 'zac',
  description: 'Elastic Slingshot refunds 60% of its cooldown if it hits two or more enemies.',
  hooks: {
    dashStart: (_e, ctx) => {
      const p = ctx.player;
      ctx.combat.delay(200, () => {
        if (enemiesNear(ctx, p.x, p.y, 230).length < 2) return;
        p.reduceCooldown('Dash', 3600 * ctx.power(rueckprall));
      });
    },
  },
};

// ---------------------------------------------------------------- Reform

const zweiteKultur: AugmentDef = {
  id: 'zac_zweite_kultur',
  name: 'Second Culture',
  tier: 'gold',
  tags: ['Blut'],
  champion: 'zac',
  description: 'Cell Division brings you back at 45% health instead of 20%, and clears everything around you.',
  hooks: {
    playerHpThreshold: ({ pct }, ctx) => {
      if (pct > 0.15) return;
      const p = ctx.player;
      p.heal(p.maxHP * 0.25 * ctx.power(zweiteKultur));
      ctx.combat.ring(p.x, p.y, 0x66dd66, 260);
      for (const u of enemiesNear(ctx, p.x, p.y, 260)) {
        u.ctrlUntil = Math.max(u.ctrlUntil, ctx.combat.now + 600);
      }
    },
  },
};

const entwerdung: AugmentDef = {
  id: 'zac_entwerdung',
  name: 'Unmaking',
  tier: 'prisma',
  tags: ['Blut'],
  champion: 'zac',
  description: 'Below 30% health you take 35% less damage and Unstable Pulse costs no cooldown.',
  onUpdate: (_dt, ctx) => {
    const p = ctx.player;
    const low = p.hpPct < 0.3;
    const on = !!p.memory.zacUnmaking;
    if (low && !on) {
      p.memory.zacUnmaking = 1;
      p.stats.set({ id: 'zac:unmaking', stat: 'armor', flat: 60 * ctx.power(entwerdung) });
      p.stats.set({ id: 'zac:unmaking2', stat: 'magicResist', flat: 60 * ctx.power(entwerdung) });
    } else if (!low && on) {
      p.memory.zacUnmaking = 0;
      p.stats.remove('zac:unmaking');
      p.stats.remove('zac:unmaking2');
    }
    if (low) p.reduceCooldown('Q', 9999);
  },
};

export const ZAC_AUGMENTS: AugmentDef[] = [
  zellteilung,
  reicheErnte,
  masseZaehlt,
  schwereLandung,
  endgeschwindigkeit,
  rueckprall,
  zweiteKultur,
  entwerdung,
];
