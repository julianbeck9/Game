import { AugmentDef, AugmentCtx } from './types';
import type { Unit } from '../entities/Unit';
import { pp, ppDmg, msPct, procDamage, procActive, slowUnit, unitLockReady, statRolls, grantRandomAugment, poolRef } from './helpers';

/**
 * GOLD — spürbare Machtsprünge. Gleiche Herkunft wie Silber: bekannte
 * Arena-Konzepte, eigene Namen/Texte, Referenzzahlen skaliert übernommen.
 */

// Beilwurf (Konzept: automatische Axt mit Verlangsamung + Panzerbruch)
const beilwurf: AugmentDef = {
  id: 'beilwurf',
  name: 'Beilwurf',
  tier: 'gold',
  tags: ['Bruch'],
  description:
    'Alle 12s fliegt ein Beil zum nächsten Gegner: 8–22 (+40% AD) physisch, 25% langsamer (1,5s), −20% Rüstung & MR (4s).',
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
  name: 'Verstärkerkern',
  tier: 'gold',
  tags: ['Arkan', 'Bruch'],
  description: 'Deine Brand-, Dornen- und Proc-Effekte verursachen +20% Schaden (als wahrer Schaden).',
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
  name: 'Großhirn',
  tier: 'gold',
  tags: ['Ward', 'Arkan'],
  description: 'Beginne jeden Kampf mit einem Schild in Höhe von 300% deiner Fähigkeitsstärke.',
  hooks: {
    roundStart: (_p, ctx) =>
      ctx.player.addShield(Math.max(10, ctx.player.stats.get('abilityPower') * 3) * ctx.power(grosshirn)),
  },
};

// Erster Streich (Konzept: Q-Fokus — Haste)
const ersterStreich: AugmentDef = {
  id: 'ersterstreich',
  name: 'Erster Streich',
  tier: 'gold',
  tags: ['Arkan'],
  description: 'Deine Q-Fähigkeit lädt doppelt so schnell.',
  ruleFlags: { qCdMult: 0.5 },
};

// Letzter Schliff (Konzept: E-Fokus — Haste)
const letzterSchliff: AugmentDef = {
  id: 'letzterschliff',
  name: 'Letzter Schliff',
  tier: 'gold',
  tags: ['Arkan'],
  description: 'Deine E-Fähigkeit lädt doppelt so schnell.',
  ruleFlags: { eCdMult: 0.5 },
};

// Himmelsleib (Konzept: viel LP, etwas weniger Schaden)
const himmelsleib: AugmentDef = {
  id: 'himmelsleib',
  name: 'Himmelsleib',
  tier: 'gold',
  tags: ['Ward'],
  description: '+100 max. LP, aber −10% Schaden.',
  statMods: [
    { stat: 'maxHP', flat: 100 },
    { stat: 'damage', pct: -0.1 },
    { stat: 'abilityDamage', pct: -0.1 },
  ],
};

// Trommelfeuer (Konzept: kritische Treffer beschleunigen)
const trommelfeuer: AugmentDef = {
  id: 'trommelfeuer',
  name: 'Trommelfeuer',
  tier: 'gold',
  tags: ['Sturm'],
  description: '+25% Kritchance. Kritische Treffer: +6% Angriffstempo für 6s (bis zu 10 Stapel).',
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
  name: 'Morgenröte',
  tier: 'gold',
  tags: ['Ward', 'Blut'],
  description: 'Fällst du erstmals unter 60% LP, heilst du 25% max. LP über 3s.',
  onCombatInit: (ctx) => {
    ctx.run.memory.morgenUsed = 0;
    ctx.run.memory.morgenUntil = 0;
  },
  onUpdate: (dt, ctx) => {
    if (!ctx.run.memory.morgenUsed && ctx.player.alive && ctx.player.hpPct < 0.6) {
      ctx.run.memory.morgenUsed = 1;
      ctx.run.memory.morgenUntil = ctx.combat.now + 3000;
      ctx.combat.announce('Morgenröte!', '#ffd9a0');
    }
    if ((ctx.run.memory.morgenUntil ?? 0) > ctx.combat.now) {
      ctx.player.heal(((ctx.player.maxHP * 0.25) / 3) * dt * ctx.power(morgenroete));
    }
  },
};

// Fluchklinge (Konzept: Treffer laden dauerhaften On-Hit-Schaden auf)
const fluchklinge: AugmentDef = {
  id: 'fluchklinge',
  name: 'Fluchklinge',
  tier: 'gold',
  tags: ['Blut', 'Bruch'],
  description: 'Angriffe sammeln Fluchkraft (2/Treffer, max. 40 pro Runde). Dauerhaft: +20% davon als magischer On-Hit-Schaden.',
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
  name: 'Goldsegen',
  tier: 'gold',
  tags: [],
  description: 'Sofort +400 Gold.',
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
  name: 'Zweitschlag',
  tier: 'gold',
  tags: ['Sturm'],
  description: '+25% Kritchance. Kritische Treffer lösen Treffer-Effekte ein zweites Mal aus.',
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
  name: 'Geisterklinge',
  tier: 'gold',
  tags: ['Arkan'],
  description: 'Fähigkeitstreffer lösen deine Treffer-Effekte aus (1s Sperrzeit pro Ziel).',
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
  name: 'Fanghaken',
  tier: 'gold',
  tags: ['Bruch', 'Ward'],
  description: 'Alle 12s zieht ein Haken den nächsten Gegner zu dir und wurzelt ihn 1s fest.',
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
  name: 'Brandhieb',
  tier: 'gold',
  tags: ['Bruch'],
  description: 'Angriffe entzünden: 3% der max. LP des Ziels über 5s, stapelt und frischt auf.',
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
  name: 'Blitzschritt',
  tier: 'gold',
  tags: ['Sturm'],
  description: '+1 Dash-Ladung (2 gesamt).',
  ruleFlags: { dashCharges: 2 },
};

// Jagdfieber (Konzept: Tötungen machen schnell)
const jagdfieber: AugmentDef = {
  id: 'jagdfieber',
  name: 'Jagdfieber',
  tier: 'gold',
  tags: ['Sturm', 'Blut'],
  description: 'Tötungen: +100% Tempo und +30% Angriffstempo für 8s.',
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
  name: 'Wechselspiel',
  tier: 'gold',
  tags: ['Arkan', 'Sturm'],
  description: 'Angriffe: nächste Fähigkeit +20%. Fähigkeiten: nächster Angriff +20%.',
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
  name: 'Volltreffer',
  tier: 'gold',
  tags: ['Sturm', 'Bruch'],
  description: '+50% Kritchance.',
  statMods: [{ stat: 'critChance', flat: 0.5 }],
};

// Gewitterhieb (Konzept: Angriffstempo-Schwelle belohnt)
const gewitterhieb: AugmentDef = {
  id: 'gewitterhieb',
  name: 'Gewitterhieb',
  tier: 'gold',
  tags: ['Sturm'],
  description: '+20% Angriffstempo. Bei 3,0+ Angriffen/s: Angriffe +5 magischer Schaden.',
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
  name: 'Arkanpfeile',
  tier: 'gold',
  tags: ['Arkan'],
  description: 'Fähigkeitstreffer: 3 Geschosse à 0,3–1% der max. LP des Ziels als wahrer Schaden (6s Sperrzeit).',
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
  name: 'Zauberschütze',
  tier: 'gold',
  tags: ['Arkan', 'Sturm'],
  description: 'Angriffe verursachen zusätzlich 75% deiner Fähigkeitsstärke als physischen Schaden.',
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
  name: 'Wurfholz',
  tier: 'gold',
  tags: ['Sturm', 'Bruch'],
  description: 'Alle 7s fliegt ein Bumerang zum nächsten Gegner und zurück (je 4–18 +22% AD physisch).',
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
  name: 'Banditenstolz',
  tier: 'gold',
  tags: ['Sturm', 'Ward'],
  description: 'Jeder Dash: +10 Rüstung & MR bis Rundenende (bis zu 5 Stapel).',
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
  name: 'Zäher Wille',
  tier: 'gold',
  tags: ['Ward', 'Blut'],
  description: 'Regeneriere 2 LP/s, verdoppelt unter 50% max. LP.',
  onUpdate: (dt, ctx) => {
    if (!ctx.player.alive) return;
    const rate = ctx.player.hpPct < 0.5 ? 4 : 2;
    ctx.player.heal(rate * dt * ctx.power(zaeherWille));
  },
};

// Böser Funke (Konzept: Fähigkeitstreffer stapeln permanente AP)
const boeserFunke: AugmentDef = {
  id: 'boeserfunke',
  name: 'Böser Funke',
  tier: 'gold',
  tags: ['Arkan'],
  description: 'Fähigkeitsschaden gewährt dauerhaft +0,5 AP (1s Sperrzeit). Als 2. Augment: Start mit 13 AP.',
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
  name: 'Kampfgesang',
  tier: 'gold',
  tags: ['Blut', 'Arkan'],
  description: 'Jede gewirkte Fähigkeit heilt dich um 1–8 (+1% max. LP).',
  hooks: {
    abilityCast: (_p, ctx) => {
      ctx.player.heal((ppDmg(ctx, 5, 60) + ctx.player.maxHP * 0.01) * ctx.power(kampfgesang));
    },
  },
};

// Zeitschleife (Konzept: flaches Fähigkeitentempo)
const zeitschleife: AugmentDef = {
  id: 'zeitschleife',
  name: 'Zeitschleife',
  tier: 'gold',
  tags: ['Arkan'],
  description: '+40 Fähigkeitentempo.',
  statMods: [{ stat: 'abilityHaste', flat: 40 }],
};

// Neustart (Konzept: periodischer Cooldown-Reset)
const neustart: AugmentDef = {
  id: 'neustart',
  name: 'Neustart',
  tier: 'gold',
  tags: ['Arkan', 'Sturm'],
  description: 'Alle 12s werden alle deine Abklingzeiten zurückgesetzt.',
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.run.memory.neustartNext = ctx.combat.now + 12000;
    },
  },
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.neustartNext ?? Infinity) > ctx.combat.now) return;
    ctx.run.memory.neustartNext = ctx.combat.now + 12000;
    ctx.player.resetCooldowns();
    ctx.combat.announce('Neustart!', '#9fd8ff');
  },
};

// Rastlose Genesung (Konzept: Bewegung heilt)
const rastloseGenesung: AugmentDef = {
  id: 'rastlosegenesung',
  name: 'Rastlose Genesung',
  tier: 'gold',
  tags: ['Blut', 'Sturm'],
  description: 'Bewegung heilt: 0,2–1,2 LP je 100 zurückgelegte Einheiten.',
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
  name: 'Hauptgang',
  tier: 'gold',
  tags: ['Bruch', 'Arkan'],
  description: 'Deine Q verursacht +50% Schaden, aber −50 Fähigkeitentempo.',
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
  name: 'Beilage',
  tier: 'gold',
  tags: ['Bruch', 'Arkan'],
  description: 'Deine E verursacht +50% Schaden, aber −50 Fähigkeitentempo.',
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
  name: 'Weittracht',
  tier: 'gold',
  tags: ['Sturm'],
  description: '+100 Angriffsreichweite.',
  statMods: [{ stat: 'attackRange', flat: 100 }],
};

// Schrumpfwerk (Konzept: Tötungen machen dich klein und flink)
const schrumpfwerk: AugmentDef = {
  id: 'schrumpfwerk',
  name: 'Schrumpfwerk',
  tier: 'gold',
  tags: ['Sturm'],
  description: 'Tötungen: dauerhaft +8 Fähigkeitentempo, +1% Tempo, −4% Größe (max. 20 Stapel).',
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
  name: 'Schrumpfstrahl',
  tier: 'gold',
  tags: ['Ward'],
  description: 'Angriffe: Ziel verursacht −15% Schaden für 3s (auffrischend).',
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
  name: 'Scharfschütze',
  tier: 'gold',
  tags: ['Sturm', 'Arkan'],
  description: 'Fähigkeitstreffer aus über 560 Entfernung: −3s auf alle Abklingzeiten (1s Sperrzeit).',
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
  name: 'Ruhige Hand',
  tier: 'gold',
  tags: ['Bruch'],
  description: 'Dein Angriffstempo ist auf 0,65 festgenagelt. Jedes 1% Bonus-Angriffstempo wird zu 1 AD.',
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
  name: 'Seelensauger',
  tier: 'gold',
  tags: ['Blut'],
  description: '+25% Kritchance. Angriffe heilen dich um 10% Schaden × Kritchance.',
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
  name: 'Statistik hoch zwei',
  tier: 'gold',
  tags: [],
  description: 'Sofort 3 zufällige permanente Werteboni.',
  onCombatInit: (ctx) => statRolls(ctx, 'stat2', 3),
};

// Panzerlok (Konzept: Tötungen machen dauerhaft massiger)
const panzerlok: AugmentDef = {
  id: 'panzerlok',
  name: 'Panzerlok',
  tier: 'gold',
  tags: ['Ward', 'Blut'],
  description: 'Tötungen: dauerhaft +2% max. LP.',
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
  name: 'Nadelstich',
  tier: 'gold',
  tags: ['Bruch'],
  description: 'Deine Treffer durchdringen: +15% des Schadens zusätzlich als wahrer Schaden.',
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
  name: 'Transmutation: Prisma',
  tier: 'gold',
  tags: [],
  description: 'Du erhältst sofort ein zufälliges Prisma-Augment.',
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
  name: 'Taktschlag',
  tier: 'gold',
  tags: ['Sturm'],
  description: 'Jeder 2. Angriff löst deine Treffer-Effekte ein weiteres Mal aus.',
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
  name: 'Wechselbalg',
  tier: 'gold',
  tags: [],
  description: 'Zu jedem Rundenbeginn verwandelt sich dieser Slot in ein zufälliges anderes Augment (nur für diese Runde).',
  onCombatInit: (ctx) => {
    const pool = poolRef.all.filter(
      (a) => a.id !== 'wechselbalg' && !ctx.run.augments.some((o) => o.id === a.id),
    );
    if (pool.length === 0) return;
    const rolled = pool[Math.floor(Math.random() * pool.length)];
    ctx.grantTemp(rolled);
    ctx.combat.announce(`Wechselbalg: ${rolled.name}`, '#ddaaff');
  },
};

// Wundbrand (Konzept: Brände können kritisch ausschlagen)
const wundbrand: AugmentDef = {
  id: 'wundbrand',
  name: 'Wundbrand',
  tier: 'gold',
  tags: ['Bruch'],
  description: '+25% Kritchance. Brandschaden brennt zusätzlich um 40% × Kritchance nach.',
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
  name: 'Hastwerk',
  tier: 'gold',
  tags: ['Sturm', 'Arkan'],
  description: '120% deines Fähigkeitentempos werden zu Lauftempo.',
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
  name: 'Abrechnung',
  tier: 'gold',
  tags: ['Arkan', 'Bruch'],
  description: 'E markiert alle Gegner (8s Sperrzeit): 35% des Schadens der nächsten 5s detoniert danach als wahrer Schaden.',
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
      ctx.combat.announce('Abrechnung läuft …', '#ff9f7a');
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
