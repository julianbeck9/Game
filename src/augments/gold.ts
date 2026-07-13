import { AugmentDef, AugmentCtx } from './types';
import type { Unit } from '../entities/Unit';
import { pp, ppDmg, msPct, procDamage, procActive, slowUnit, unitLockReady, statRolls, grantRandomAugment, poolRef } from './helpers';
import { augmentFitsChampion } from './eligibility';

/**
 * GOLD — spürbare Machtsprünge. Gleiche Herkunft wie Silber: bekannte
 * Arena-Konzepte, eigene Namen/Texte, Referenzzahlen skaliert übernommen.
 */

// Beilwurf (Konzept: automatische Axt mit Verlangsamung + Panzerbruch)
const beilwurf: AugmentDef = {
  id: 'beilwurf',
  name: 'Axe Throw',
  tier: 'gold',
  tags: ['Bruch'],
  description: 'Every 12s an axe flies to the nearest enemy: 8–22 (+40% AD) physical, 25% slow (1.5s), −20% armor & MR (4s).',
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.beilNext ?? 0) > ctx.combat.now) return;
    const t = ctx.combat.nearestEnemy(ctx.player, 950);
    if (!t) return;
    ctx.run.memory.beilNext = ctx.combat.now + 12000;
    const dmg = (ppDmg(ctx, 60, 180) + 0.4 * ctx.player.stats.get('damage')) * ctx.power(beilwurf);
    ctx.combat.spawnProjectile({
      x: ctx.player.x,
      y: ctx.player.y,
      dirX: t.x - ctx.player.x,
      dirY: t.y - ctx.player.y,
      speed: 900,
      radius: 10,
      color: 0xd0d4e0,
      team: 'player',
      homing: t,
      maxDist: 1100,
      onHit: (hit) => {
        ctx.combat.dealDamage(ctx.player, hit, dmg, 'ability', 'physisch');
        slowUnit(ctx, hit, 'beilwurf', 0.25, 1500);
        hit.stats.set({ id: 'debuff:beil-r', stat: 'armor', pct: -0.2, expiresAt: ctx.combat.now + 4000 });
        hit.stats.set({ id: 'debuff:beil-m', stat: 'magicResist', pct: -0.2, expiresAt: ctx.combat.now + 4000 });
      },
    });
  },
};

// Verstärkerkern (Konzept: Zusatz-Effekte schlagen härter zu)
const verstaerkerkern: AugmentDef = {
  id: 'verstaerkerkern',
  name: 'Amplifier Core',
  tier: 'gold',
  tags: ['Arkan', 'Bruch'],
  description: 'Your burn, thorn and proc effects deal +20% damage (as true damage).',
  hooks: {
    damageDealt: ({ target, dmg, type }, ctx) => {
      if (procActive() || !target.alive) return;
      if (type !== 'burn' && type !== 'reflect') return;
      procDamage(ctx, target, dmg * 0.2 * ctx.power(verstaerkerkern), 'wahr');
    },
  },
};

// Großhirn (Konzept: AP-Schild zu Rundenbeginn)
const grosshirn: AugmentDef = {
  id: 'grosshirn',
  name: 'Big Brain',
  tier: 'gold',
  tags: ['Ward', 'Arkan'],
  needs: ['ap'],
  description: 'Start each fight with a shield equal to 300% of your ability power.',
  hooks: {
    roundStart: (_p, ctx) =>
      ctx.player.addShield(Math.max(10, ctx.player.stats.get('abilityPower') * 3) * ctx.power(grosshirn)),
  },
};

// Erster Streich (Konzept: Q-Fokus — Haste)
const ersterStreich: AugmentDef = {
  id: 'ersterstreich',
  name: 'First Strike',
  tier: 'gold',
  tags: ['Arkan'],
  description: 'Your Q ability recharges twice as fast.',
  ruleFlags: { qCdMult: 0.5 },
};

// Letzter Schliff (Konzept: E-Fokus — Haste)
const letzterSchliff: AugmentDef = {
  id: 'letzterschliff',
  name: 'Finishing Touch',
  tier: 'gold',
  tags: ['Arkan'],
  description: 'Your E ability recharges twice as fast.',
  ruleFlags: { eCdMult: 0.5 },
};

// Himmelsleib (Konzept: viel LP, etwas weniger Schaden)
const himmelsleib: AugmentDef = {
  id: 'himmelsleib',
  name: 'Celestial Body',
  tier: 'gold',
  tags: ['Ward'],
  description: '+100 max HP, but −10% damage.',
  statMods: [
    { stat: 'maxHP', flat: 100 },
    { stat: 'damage', pct: -0.1 },
    { stat: 'abilityDamage', pct: -0.1 },
  ],
};

// Trommelfeuer (Konzept: kritische Treffer beschleunigen)
const trommelfeuer: AugmentDef = {
  id: 'trommelfeuer',
  name: 'Drumfire',
  tier: 'gold',
  tags: ['Sturm'],
  description: '+25% crit chance. Critical hits: +6% attack speed for 6s (up to 10 stacks).',
  statMods: [{ stat: 'critChance', flat: 0.25 }],
  onCombatInit: (ctx) => {
    ctx.run.memory.trommelStacks = 0;
  },
  hooks: {
    autoHit: (_p, ctx) => {
      if (Math.random() >= Math.min(1, ctx.player.stats.get('critChance'))) return;
      ctx.run.memory.trommelStacks = Math.min(10, (ctx.run.memory.trommelStacks ?? 0) + 1);
      ctx.run.memory.trommelUntil = ctx.combat.now + 6000;
    },
  },
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.trommelUntil ?? 0) < ctx.combat.now) ctx.run.memory.trommelStacks = 0;
    ctx.player.stats.set({
      id: 'dyn:trommelfeuer',
      stat: 'attackSpeed',
      pct: 0.06 * (ctx.run.memory.trommelStacks ?? 0) * ctx.power(trommelfeuer),
    });
  },
};

// Morgenröte (Konzept: einmalige Notheilung)
const morgenroete: AugmentDef = {
  id: 'morgenroete',
  name: 'Dawnbringer',
  tier: 'gold',
  tags: ['Ward', 'Blut'],
  description: 'The first time you drop below 60% HP, heal 25% max HP over 3s.',
  onCombatInit: (ctx) => {
    ctx.run.memory.morgenUsed = 0;
    ctx.run.memory.morgenUntil = 0;
  },
  onUpdate: (dt, ctx) => {
    if (!ctx.run.memory.morgenUsed && ctx.player.alive && ctx.player.hpPct < 0.6) {
      ctx.run.memory.morgenUsed = 1;
      ctx.run.memory.morgenUntil = ctx.combat.now + 3000;
      ctx.combat.announce('Dawnbringer!', '#ffd9a0');
    }
    if ((ctx.run.memory.morgenUntil ?? 0) > ctx.combat.now) {
      ctx.player.heal(((ctx.player.maxHP * 0.25) / 3) * dt * ctx.power(morgenroete));
    }
  },
};

// Fluchklinge (Konzept: Treffer laden dauerhaften On-Hit-Schaden auf)
const fluchklinge: AugmentDef = {
  id: 'fluchklinge',
  name: 'Curse Blade',
  tier: 'gold',
  tags: ['Blut', 'Bruch'],
  description: 'Attacks gather curse power (2/hit, max 40 per round). Permanently: +20% of it as magic on-hit damage.',
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.run.memory.fluchRound = 0;
    },
    autoHit: ({ target }, ctx) => {
      if ((ctx.run.memory.fluchRound ?? 0) < 40) {
        ctx.run.memory.fluchRound = (ctx.run.memory.fluchRound ?? 0) + 2;
        ctx.run.memory.fluchTotal = (ctx.run.memory.fluchTotal ?? 0) + 2 * (ctx.run.memory.stackMult ?? 1);
      }
      const onHit = (ctx.run.memory.fluchTotal ?? 0) * 0.2 * ctx.power(fluchklinge);
      if (onHit > 0 && target.alive) procDamage(ctx, target, onHit, 'magisch');
    },
  },
};

// Goldsegen (Konzept: sofortiges Gold)
const goldsegen: AugmentDef = {
  id: 'goldsegen',
  name: 'Gold Blessing',
  tier: 'gold',
  tags: [],
  description: 'Instantly +400 gold.',
  onCombatInit: (ctx) => {
    if (ctx.run.memory.goldsegenDone) return;
    ctx.run.memory.goldsegenDone = 1;
    ctx.run.gold += 400;
    ctx.run.goldEarned += 400;
    ctx.combat.announce('+400 Gold!', '#ffd24a');
  },
};

// Zweitschlag (Konzept: Krits lösen Treffer-Effekte erneut aus)
let zweitschlagLock = false;
const zweitschlag: AugmentDef = {
  id: 'zweitschlag',
  name: 'Second Strike',
  tier: 'gold',
  tags: ['Sturm'],
  description: '+25% crit chance. Critical hits trigger on-hit effects a second time.',
  statMods: [{ stat: 'critChance', flat: 0.25 }],
  hooks: {
    autoHit: ({ target, dmg }, ctx) => {
      if (zweitschlagLock || !target.alive) return;
      if (Math.random() >= Math.min(1, ctx.player.stats.get('critChance'))) return;
      zweitschlagLock = true;
      ctx.combat.bus.emit('autoHit', { target, dmg: dmg * ctx.power(zweitschlag) });
      zweitschlagLock = false;
    },
  },
};

// Geisterklinge (Konzept: Fähigkeiten tragen Treffer-Effekte)
let geisterklingeLock = false;
const geisterklinge: AugmentDef = {
  id: 'geisterklinge',
  name: 'Ghostblade',
  tier: 'gold',
  tags: ['Arkan'],
  description: 'Ability hits trigger your on-hit effects (1s cooldown per target).',
  hooks: {
    abilityHit: ({ target, dmg }, ctx) => {
      if (geisterklingeLock || !target.alive) return;
      if (!unitLockReady(target, 'geisterklinge', ctx.combat.now, 1000)) return;
      geisterklingeLock = true;
      ctx.combat.bus.emit('autoHit', { target, dmg: dmg * ctx.power(geisterklinge) });
      geisterklingeLock = false;
    },
  },
};

// Fanghaken (Konzept: automatischer Haken zieht heran)
const fanghaken: AugmentDef = {
  id: 'fanghaken',
  name: 'Grappling Hook',
  tier: 'gold',
  tags: ['Bruch', 'Ward'],
  description: 'Every 12s a hook drags the nearest enemy to you and roots them for 1s.',
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.hakenNext ?? 0) > ctx.combat.now) return;
    const t = ctx.combat.nearestEnemy(ctx.player, 700);
    if (!t) return;
    ctx.run.memory.hakenNext = ctx.combat.now + 12000;
    ctx.combat.flashLine(ctx.player.x, ctx.player.y, t.x, t.y, 0xffcc66);
    const d = Math.max(30, Math.hypot(t.x - ctx.player.x, t.y - ctx.player.y));
    const pull = Math.max(0, d - 120);
    t.moveBy(((ctx.player.x - t.x) / d) * pull, ((ctx.player.y - t.y) / d) * pull);
    slowUnit(ctx, t, 'fanghaken', 1.0, 1000 * ctx.power(fanghaken));
  },
};

// Brandhieb (Konzept: On-Hit-Brand nach max. LP, stapelnd)
const brandhieb: AugmentDef = {
  id: 'brandhieb',
  name: 'Searing Strike',
  tier: 'gold',
  tags: ['Bruch'],
  description: "Attacks ignite: 3% of the target's max HP over 5s, stacks and refreshes.",
  hooks: {
    autoHit: ({ target }, ctx) => {
      if (!target.alive) return;
      ctx.combat.addBurn(target, (target.maxHP * 0.03 * ctx.power(brandhieb)) / 5, 5000);
    },
  },
};

// Blitzschritt (Konzept: Dash-Ladungen)
const blitzschritt: AugmentDef = {
  id: 'blitzschritt',
  name: 'Lightning Step',
  tier: 'gold',
  tags: ['Sturm'],
  description: '+1 dash charge (2 total).',
  ruleFlags: { dashCharges: 2 },
};

// Jagdfieber (Konzept: Tötungen machen schnell)
const jagdfieber: AugmentDef = {
  id: 'jagdfieber',
  name: 'Hunt Fever',
  tier: 'gold',
  tags: ['Sturm', 'Blut'],
  description: 'Takedowns: +100% move speed and +30% attack speed for 8s.',
  hooks: {
    killWindow: (_p, ctx) => {
      const p = ctx.power(jagdfieber);
      ctx.player.stats.set({
        id: 'buff:jagdfieber-ms',
        stat: 'moveSpeed',
        pct: 1.0 * p,
        expiresAt: ctx.combat.now + 8000,
      });
      ctx.player.stats.set({
        id: 'buff:jagdfieber-as',
        stat: 'attackSpeed',
        pct: 0.3 * p,
        expiresAt: ctx.combat.now + 8000,
      });
    },
  },
};

// Wechselspiel (Konzept: Angriff und Fähigkeit verstärken einander)
const wechselspiel: AugmentDef = {
  id: 'wechselspiel',
  name: 'Interplay',
  tier: 'gold',
  tags: ['Arkan', 'Sturm'],
  description: 'Attacks: next ability +20%. Abilities: next attack +20%.',
  onCombatInit: (ctx) => {
    ctx.run.memory.wsAbilityBoost = 0;
    ctx.run.memory.wsAutoBoost = 0;
  },
  hooks: {
    autoHit: ({ target, dmg }, ctx) => {
      if (ctx.run.memory.wsAutoBoost && target.alive) {
        ctx.run.memory.wsAutoBoost = 0;
        procDamage(ctx, target, dmg * 0.2 * ctx.power(wechselspiel), 'physisch');
      }
      ctx.run.memory.wsAbilityBoost = 1;
    },
    abilityHit: ({ target, dmg }, ctx) => {
      if (ctx.run.memory.wsAbilityBoost && target.alive) {
        ctx.run.memory.wsAbilityBoost = 0;
        procDamage(ctx, target, dmg * 0.2 * ctx.power(wechselspiel), 'magisch');
      }
      ctx.run.memory.wsAutoBoost = 1;
    },
  },
};

// Volltreffer (Konzept: massive Kritchance)
const volltreffer: AugmentDef = {
  id: 'volltreffer',
  name: 'Bullseye',
  tier: 'gold',
  tags: ['Sturm', 'Bruch'],
  description: '+50% crit chance.',
  statMods: [{ stat: 'critChance', flat: 0.5 }],
};

// Gewitterhieb (Konzept: Angriffstempo-Schwelle belohnt)
const gewitterhieb: AugmentDef = {
  id: 'gewitterhieb',
  name: 'Thunderstrike',
  tier: 'gold',
  tags: ['Sturm'],
  description: '+20% attack speed. At 3.0+ attacks/s: attacks deal +5 magic damage.',
  statMods: [{ stat: 'attackSpeed', pct: 0.2 }],
  hooks: {
    autoHit: ({ target }, ctx) => {
      if (!target.alive || ctx.player.stats.get('attackSpeed') < 3) return;
      procDamage(ctx, target, 5 * ctx.power(gewitterhieb), 'magisch');
    },
  },
};

// Arkanpfeile (Konzept: Fähigkeitsschaden feuert wahre Geschosse)
const arkanpfeile: AugmentDef = {
  id: 'arkanpfeile',
  name: 'Arcane Arrows',
  tier: 'gold',
  tags: ['Arkan'],
  description: "Ability hits: 3 missiles of 0.3–1% of the target's max HP as true damage (6s cooldown).",
  hooks: {
    abilityHit: ({ target }, ctx) => {
      if (!target.alive) return;
      if (!unitLockReady(target, 'arkanpfeile', ctx.combat.now, 6000)) return;
      const dist = Math.hypot(target.x - ctx.player.x, target.y - ctx.player.y);
      const pctHP = 0.003 + Math.min(0.007, dist / 100000);
      const dmg = target.maxHP * pctHP * ctx.power(arkanpfeile);
      for (let i = 0; i < 3; i++) {
        ctx.combat.delay(i * 120, () => {
          if (!target.alive) return;
          ctx.combat.spawnProjectile({
            x: ctx.player.x,
            y: ctx.player.y,
            dirX: target.x - ctx.player.x,
            dirY: target.y - ctx.player.y,
            speed: 1100,
            radius: 6,
            color: 0xcc99ff,
            team: 'player',
            homing: target,
            maxDist: 1200,
            onHit: (hit) => procDamage(ctx, hit, dmg, 'wahr'),
          });
        });
      }
    },
  },
};

// Zauberschütze (Konzept: AP fließt in Angriffe)
const zauberschuetze: AugmentDef = {
  id: 'zauberschuetze',
  name: 'Spellslinger',
  tier: 'gold',
  tags: ['Arkan', 'Sturm'],
  needs: ['ap'],
  description: 'Attacks deal an extra 75% of your ability power as physical damage.',
  hooks: {
    autoHit: ({ target }, ctx) => {
      const ap = ctx.player.stats.get('abilityPower');
      if (ap <= 0 || !target.alive) return;
      procDamage(ctx, target, ap * 0.75 * ctx.power(zauberschuetze), 'physisch');
    },
  },
};

// Wurfholz (Konzept: automatischer Bumerang)
const wurfholz: AugmentDef = {
  id: 'wurfholz',
  name: 'Throwing Wood',
  tier: 'gold',
  tags: ['Sturm', 'Bruch'],
  description: 'Every 7s a boomerang flies to the nearest enemy and back (4–18 +22% AD physical each way).',
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.wurfholzNext ?? 0) > ctx.combat.now) return;
    const t = ctx.combat.nearestEnemy(ctx.player, 700);
    if (!t) return;
    ctx.run.memory.wurfholzNext = ctx.combat.now + 7000;
    const dmg = (ppDmg(ctx, 30, 135) + 0.22 * ctx.player.stats.get('damage')) * ctx.power(wurfholz);
    ctx.combat.spawnProjectile({
      x: ctx.player.x,
      y: ctx.player.y,
      dirX: t.x - ctx.player.x,
      dirY: t.y - ctx.player.y,
      speed: 850,
      radius: 9,
      color: 0xddbb77,
      team: 'player',
      maxDist: 620,
      maxHits: 10,
      spin: true,
      boomerangTo: ctx.player,
      onHit: (hit) => ctx.combat.dealDamage(ctx.player, hit, dmg, 'ability', 'physisch'),
    });
  },
};

// Banditenstolz (Konzept: Dashes panzern, stapelnd bis Rundenende)
const banditenstolz: AugmentDef = {
  id: 'banditenstolz',
  name: "Outlaw's Pride",
  tier: 'gold',
  tags: ['Sturm', 'Ward'],
  description: 'Each dash: +10 armor & MR until end of round (up to 5 stacks).',
  onCombatInit: (ctx) => {
    ctx.run.memory.banditStacks = 0;
  },
  hooks: {
    dashEnd: (_p, ctx) => {
      ctx.run.memory.banditStacks = Math.min(5, (ctx.run.memory.banditStacks ?? 0) + 1);
      const v = 10 * (ctx.run.memory.banditStacks ?? 0) * ctx.power(banditenstolz);
      ctx.player.stats.set({ id: 'dyn:bandit-r', stat: 'armor', flat: v });
      ctx.player.stats.set({ id: 'dyn:bandit-m', stat: 'magicResist', flat: v });
    },
  },
};

// Zäher Wille (Konzept: starke Dauerregeneration)
const zaeherWille: AugmentDef = {
  id: 'zaeherwille',
  name: 'Tenacious Will',
  tier: 'gold',
  tags: ['Ward', 'Blut'],
  description: 'Regenerate 2 HP/s, doubled below 50% max HP.',
  onUpdate: (dt, ctx) => {
    if (!ctx.player.alive) return;
    const rate = ctx.player.hpPct < 0.5 ? 4 : 2;
    ctx.player.heal(rate * dt * ctx.power(zaeherWille));
  },
};

// Böser Funke (Konzept: Fähigkeitstreffer stapeln permanente AP)
const boeserFunke: AugmentDef = {
  id: 'boeserfunke',
  name: 'Evil Spark',
  tier: 'gold',
  tags: ['Arkan'],
  needs: ['ap'],
  description: 'Ability damage permanently grants +0.5 AP (1s cooldown). As your 2nd augment: start with 13 AP.',
  onCombatInit: (ctx) => {
    if (ctx.run.memory.funkeInit === undefined) {
      ctx.run.memory.funkeInit = 1;
      if (ctx.run.augments.length >= 2 && ctx.run.augments[1]?.id === 'boeserfunke') {
        ctx.run.memory.funkeStacks = 13 / 0.5;
      }
    }
    applyFunke(ctx);
  },
  hooks: {
    abilityHit: (_p, ctx) => {
      if ((ctx.run.memory.funkeNext ?? 0) > ctx.combat.now) return;
      ctx.run.memory.funkeNext = ctx.combat.now + 1000;
      ctx.run.memory.funkeStacks = (ctx.run.memory.funkeStacks ?? 0) + (ctx.run.memory.stackMult ?? 1);
      applyFunke(ctx);
    },
  },
};
function applyFunke(ctx: AugmentCtx): void {
  ctx.player.stats.set({
    id: 'perm:boeserfunke',
    stat: 'abilityPower',
    flat: (ctx.run.memory.funkeStacks ?? 0) * 0.5,
  });
}

// Kampfgesang (Konzept: Wirken heilt)
const kampfgesang: AugmentDef = {
  id: 'kampfgesang',
  name: 'Battle Song',
  tier: 'gold',
  tags: ['Blut', 'Arkan'],
  description: 'Each ability cast heals you for 1–8 (+1% max HP).',
  hooks: {
    abilityCast: (_p, ctx) => {
      ctx.player.heal((ppDmg(ctx, 5, 60) + ctx.player.maxHP * 0.01) * ctx.power(kampfgesang));
    },
  },
};

// Zeitschleife (Konzept: flaches Fähigkeitentempo)
const zeitschleife: AugmentDef = {
  id: 'zeitschleife',
  name: 'Time Loop',
  tier: 'gold',
  tags: ['Arkan'],
  description: '+40 ability haste.',
  statMods: [{ stat: 'abilityHaste', flat: 40 }],
};

// Neustart (Konzept: periodischer Cooldown-Reset)
const neustart: AugmentDef = {
  id: 'neustart',
  name: 'Restart',
  tier: 'gold',
  tags: ['Arkan', 'Sturm'],
  description: 'Every 12s all your cooldowns are reset.',
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.run.memory.neustartNext = ctx.combat.now + 12000;
    },
  },
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.neustartNext ?? Infinity) > ctx.combat.now) return;
    ctx.run.memory.neustartNext = ctx.combat.now + 12000;
    ctx.player.resetCooldowns();
    ctx.combat.announce('Restart!', '#9fd8ff');
  },
};

// Rastlose Genesung (Konzept: Bewegung heilt)
const rastloseGenesung: AugmentDef = {
  id: 'rastlosegenesung',
  name: 'Restless Recovery',
  tier: 'gold',
  tags: ['Blut', 'Sturm'],
  description: 'Movement heals: 0.2–1.2 HP per 100 units travelled.',
  onCombatInit: (ctx) => {
    ctx.run.memory.genesungX = ctx.player.x;
    ctx.run.memory.genesungY = ctx.player.y;
  },
  onUpdate: (_dt, ctx) => {
    const moved = Math.hypot(
      ctx.player.x - (ctx.run.memory.genesungX ?? ctx.player.x),
      ctx.player.y - (ctx.run.memory.genesungY ?? ctx.player.y),
    );
    ctx.run.memory.genesungX = ctx.player.x;
    ctx.run.memory.genesungY = ctx.player.y;
    if (moved > 0 && moved < 200) {
      ctx.player.heal((moved / 100) * pp(ctx, 0.2, 1.2) * ctx.power(rastloseGenesung));
    }
  },
};

// Hauptgang (Konzept: Q-Schaden rauf, Haste runter)
const hauptgang: AugmentDef = {
  id: 'hauptgang',
  name: 'Main Course',
  tier: 'gold',
  tags: ['Bruch', 'Arkan'],
  description: 'Your Q deals +50% damage, but −50 ability haste.',
  statMods: [{ stat: 'abilityHaste', flat: -50 }],
  hooks: {
    abilityHit: ({ ability, target, dmg }, ctx) => {
      if (ability !== 'Q' || !target.alive) return;
      procDamage(ctx, target, dmg * 0.5 * ctx.power(hauptgang), 'physisch');
    },
  },
};

// Beilage (Konzept: E-Schaden rauf, Haste runter)
const beilage: AugmentDef = {
  id: 'beilage',
  name: 'Side Dish',
  tier: 'gold',
  tags: ['Bruch', 'Arkan'],
  description: 'Your E deals +50% damage, but −50 ability haste.',
  statMods: [{ stat: 'abilityHaste', flat: -50 }],
  hooks: {
    abilityHit: ({ ability, target, dmg }, ctx) => {
      if (ability !== 'E' || !target.alive) return;
      procDamage(ctx, target, dmg * 0.5 * ctx.power(beilage), 'magisch');
    },
  },
};

// Weittracht (Konzept: Reichweite, Stufe 2)
const weittracht: AugmentDef = {
  id: 'weittracht',
  name: 'Farsight',
  tier: 'gold',
  tags: ['Sturm'],
  description: '+100 attack range.',
  statMods: [{ stat: 'attackRange', flat: 100 }],
};

// Schrumpfwerk (Konzept: Tötungen machen dich klein und flink)
const schrumpfwerk: AugmentDef = {
  id: 'schrumpfwerk',
  name: 'Shrink Engine',
  tier: 'gold',
  tags: ['Sturm'],
  description: 'Takedowns: permanently +8 ability haste, +1% move speed, −4% size (max 20 stacks).',
  onCombatInit: (ctx) => applySchrumpf(ctx),
  hooks: {
    killWindow: (_p, ctx) => {
      ctx.run.memory.schrumpfStacks = Math.min(
        20,
        (ctx.run.memory.schrumpfStacks ?? 0) + (ctx.run.memory.stackMult ?? 1),
      );
      applySchrumpf(ctx);
    },
  },
};
function applySchrumpf(ctx: AugmentCtx): void {
  const st = ctx.run.memory.schrumpfStacks ?? 0;
  ctx.player.stats.set({ id: 'perm:schrumpf-h', stat: 'abilityHaste', flat: st * 8 });
  ctx.player.stats.set({ id: 'perm:schrumpf-ms', stat: 'moveSpeed', pct: st * 0.01 });
  ctx.player.radius = Math.max(12, Math.round(26 * (1 - 0.04 * st)));
}

// Schrumpfstrahl (Konzept: Angriffe schwächen den Schaden des Ziels)
const schrumpfstrahl: AugmentDef = {
  id: 'schrumpfstrahl',
  name: 'Shrink Ray',
  tier: 'gold',
  tags: ['Ward'],
  description: 'Attacks: the target deals −15% damage for 3s (refreshing).',
  hooks: {
    autoHit: ({ target }, ctx) => {
      if (!target.alive) return;
      target.stats.set({
        id: 'debuff:schrumpfstrahl',
        stat: 'damage',
        pct: -0.15 * ctx.power(schrumpfstrahl),
        expiresAt: ctx.combat.now + 3000,
      });
    },
  },
};

// Scharfschütze (Konzept: Ferntreffer laden Fähigkeiten neu)
const scharfschuetze: AugmentDef = {
  id: 'scharfschuetze',
  name: 'Sharpshooter',
  tier: 'gold',
  tags: ['Sturm', 'Arkan'],
  description: 'Ability hits from over 560 range: −3s on all cooldowns (1s cooldown).',
  hooks: {
    abilityHit: ({ target }, ctx) => {
      if ((ctx.run.memory.scharfNext ?? 0) > ctx.combat.now) return;
      const d = Math.hypot(target.x - ctx.player.x, target.y - ctx.player.y);
      if (d < 560) return;
      ctx.run.memory.scharfNext = ctx.combat.now + 1000;
      ctx.player.reduceCooldowns(3000 * ctx.power(scharfschuetze));
    },
  },
};

// Ruhige Hand (Konzept: Angriffstempo einfrieren, Überschuss wird AD)
const ruhigeHand: AugmentDef = {
  id: 'ruhigehand',
  name: 'Steady Hand',
  tier: 'gold',
  tags: ['Bruch'],
  description: 'Your attack speed is locked at 0.65. Each 1% bonus attack speed becomes 1 AD.',
  onUpdate: (_dt, ctx) => {
    const s = ctx.player.stats;
    s.remove('dyn:ruhigehand-as');
    s.remove('dyn:ruhigehand-ad');
    const current = s.get('attackSpeed');
    const base = s.getBase('attackSpeed');
    const bonusPct = Math.max(0, (current / Math.max(0.05, base) - 1) * 100);
    s.set({ id: 'dyn:ruhigehand-as', stat: 'attackSpeed', flat: 0.65 - current });
    s.set({ id: 'dyn:ruhigehand-ad', stat: 'damage', flat: bonusPct * (1 / 3) * ctx.power(ruhigeHand) });
  },
};

// Seelensauger (Konzept: Krits heilen)
const seelensauger: AugmentDef = {
  id: 'seelensauger',
  name: 'Soul Siphon',
  tier: 'gold',
  tags: ['Blut'],
  description: '+25% crit chance. Attacks heal you for 10% damage × crit chance.',
  statMods: [{ stat: 'critChance', flat: 0.25 }],
  hooks: {
    autoHit: ({ dmg }, ctx) => {
      const c = Math.min(1, ctx.player.stats.get('critChance'));
      ctx.player.heal(dmg * 0.1 * c * ctx.power(seelensauger));
    },
  },
};

// Statistik hoch zwei (Konzept: 3 zufällige Werteboni)
const statistik2: AugmentDef = {
  id: 'statistik2',
  name: 'Stats Squared',
  tier: 'gold',
  tags: [],
  description: 'Instantly gain 3 random permanent stat bonuses.',
  onCombatInit: (ctx) => statRolls(ctx, 'stat2', 3),
};

// Panzerlok (Konzept: Tötungen machen dauerhaft massiger)
const panzerlok: AugmentDef = {
  id: 'panzerlok',
  name: 'Tank Engine',
  tier: 'gold',
  tags: ['Ward', 'Blut'],
  description: 'Takedowns: permanently +2% max HP.',
  onCombatInit: (ctx) => applyPanzerlok(ctx),
  hooks: {
    killWindow: (_p, ctx) => {
      ctx.run.memory.panzerlokStacks =
        (ctx.run.memory.panzerlokStacks ?? 0) + (ctx.run.memory.stackMult ?? 1);
      applyPanzerlok(ctx);
    },
  },
};
function applyPanzerlok(ctx: AugmentCtx): void {
  ctx.player.stats.set({
    id: 'perm:panzerlok',
    stat: 'maxHP',
    pct: (ctx.run.memory.panzerlokStacks ?? 0) * 0.02,
  });
}

// Nadelstich (Konzept: Durchdringung)
const nadelstich: AugmentDef = {
  id: 'nadelstich',
  name: 'Needlepoint',
  tier: 'gold',
  tags: ['Bruch'],
  description: 'Your hits pierce: +15% of the damage as extra true damage.',
  hooks: {
    damageDealt: ({ target, dmg, type }, ctx) => {
      if (procActive() || type === 'other' || !target.alive) return;
      procDamage(ctx, target, dmg * 0.15 * ctx.power(nadelstich), 'wahr');
    },
  },
};

// Transmutation: Prisma (Konzept: zufälliges Prisma-Augment)
const transmutPrisma: AugmentDef = {
  id: 'transmutprisma',
  name: 'Transmute: Prisma',
  tier: 'gold',
  tags: [],
  description: 'Instantly gain a random Prisma augment.',
  onCombatInit: (ctx) => {
    if (ctx.run.memory.transmutPrismaDone) return;
    ctx.run.memory.transmutPrismaDone = 1;
    grantRandomAugment(ctx, 'prisma');
  },
};

// Taktschlag (Konzept: jeder 2. Angriff trägt Treffer-Effekte doppelt)
let taktschlagLock = false;
const taktschlag: AugmentDef = {
  id: 'taktschlag',
  name: 'Off-Beat',
  tier: 'gold',
  tags: ['Sturm'],
  description: 'Every 2nd attack triggers your on-hit effects one more time.',
  onCombatInit: (ctx) => {
    ctx.run.memory.taktCount = 0;
  },
  hooks: {
    autoHit: ({ target, dmg }, ctx) => {
      if (taktschlagLock) return;
      ctx.run.memory.taktCount = (ctx.run.memory.taktCount ?? 0) + 1;
      if (ctx.run.memory.taktCount < 2 || !target.alive) return;
      ctx.run.memory.taktCount = 0;
      taktschlagLock = true;
      ctx.combat.bus.emit('autoHit', { target, dmg: dmg * ctx.power(taktschlag) });
      taktschlagLock = false;
    },
  },
};

// Wechselbalg (Konzept: verwandelt sich jede Runde)
const wechselbalg: AugmentDef = {
  id: 'wechselbalg',
  name: 'Changeling',
  tier: 'gold',
  tags: [],
  description: 'At each round start this slot turns into a random other augment (for that round only).',
  onCombatInit: (ctx) => {
    const pool = poolRef.all.filter(
      (a) =>
        a.id !== 'wechselbalg' &&
        !ctx.run.augments.some((o) => o.id === a.id) &&
        augmentFitsChampion(a, ctx.run.champion),
    );
    if (pool.length === 0) return;
    const rolled = pool[Math.floor(Math.random() * pool.length)];
    ctx.grantTemp(rolled);
    ctx.combat.announce(`Changeling: ${rolled.name}`, '#ddaaff');
  },
};

// Wundbrand (Konzept: Brände können kritisch ausschlagen)
const wundbrand: AugmentDef = {
  id: 'wundbrand',
  name: 'Gangrene',
  tier: 'gold',
  tags: ['Bruch'],
  description: '+25% crit chance. Burn damage burns for an extra 40% × crit chance.',
  statMods: [{ stat: 'critChance', flat: 0.25 }],
  hooks: {
    damageDealt: ({ target, dmg, type }, ctx) => {
      if (procActive() || type !== 'burn' || !target.alive) return;
      const c = Math.min(1, ctx.player.stats.get('critChance'));
      procDamage(ctx, target, dmg * 0.4 * c * ctx.power(wundbrand), 'wahr');
    },
  },
};

// Hastwerk (Konzept: Haste macht auch schnell)
const hastwerk: AugmentDef = {
  id: 'hastwerk',
  name: 'Hastework',
  tier: 'gold',
  tags: ['Sturm', 'Arkan'],
  description: '120% of your ability haste becomes move speed.',
  onUpdate: (_dt, ctx) => {
    const haste = Math.max(0, ctx.player.stats.get('abilityHaste'));
    ctx.player.stats.set({
      id: 'dyn:hastwerk',
      stat: 'moveSpeed',
      pct: msPct(haste * 1.2) * ctx.power(hastwerk),
    });
  },
};

// Endform-Vorstufe: Käfigglocke ist Prisma; hier Gold-Abrechnung
// Abrechnung (Konzept: E markiert alle, gesammelter Schaden detoniert)
const abrechnung: AugmentDef = {
  id: 'abrechnung',
  name: 'Reckoning',
  tier: 'gold',
  tags: ['Arkan', 'Bruch'],
  description: 'E marks all enemies (8s cooldown): 35% of the damage dealt over the next 5s then detonates as true damage.',
  onCombatInit: (ctx) => {
    ctx.run.memory.abrechnungUntil = 0;
  },
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'E') return;
      if ((ctx.run.memory.abrechnungNext ?? 0) > ctx.combat.now) return;
      ctx.run.memory.abrechnungNext = ctx.combat.now + 8000;
      ctx.run.memory.abrechnungUntil = ctx.combat.now + 5000;
      const stored = new Map<Unit, number>();
      abrechnungStore = stored;
      ctx.combat.announce('Reckoning primed…', '#ff9f7a');
      ctx.combat.delay(5000, () => {
        for (const [u, amt] of stored) {
          if (!u.alive || amt <= 0) continue;
          ctx.combat.ring(u.x, u.y, 0xff7755, 90);
          procDamage(ctx, u, amt * 0.35 * ctx.power(abrechnung), 'wahr');
        }
        abrechnungStore = null;
      });
    },
    damageDealt: ({ target, dmg, type }, ctx) => {
      if (type === 'other' || !abrechnungStore) return;
      if ((ctx.run.memory.abrechnungUntil ?? 0) < ctx.combat.now) return;
      abrechnungStore.set(target, (abrechnungStore.get(target) ?? 0) + dmg);
    },
  },
};
let abrechnungStore: Map<Unit, number> | null = null;

export const GOLD: AugmentDef[] = [
  beilwurf,
  verstaerkerkern,
  grosshirn,
  ersterStreich,
  letzterSchliff,
  himmelsleib,
  trommelfeuer,
  morgenroete,
  fluchklinge,
  goldsegen,
  zweitschlag,
  geisterklinge,
  fanghaken,
  brandhieb,
  blitzschritt,
  jagdfieber,
  wechselspiel,
  volltreffer,
  gewitterhieb,
  arkanpfeile,
  zauberschuetze,
  wurfholz,
  banditenstolz,
  zaeherWille,
  boeserFunke,
  kampfgesang,
  zeitschleife,
  neustart,
  rastloseGenesung,
  hauptgang,
  beilage,
  weittracht,
  schrumpfwerk,
  schrumpfstrahl,
  scharfschuetze,
  ruhigeHand,
  seelensauger,
  statistik2,
  panzerlok,
  nadelstich,
  transmutPrisma,
  taktschlag,
  wechselbalg,
  wundbrand,
  hastwerk,
  abrechnung,
];
