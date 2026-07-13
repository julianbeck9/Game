import { AugmentDef } from './types';
import type { Unit } from '../entities/Unit';
import { COLORS } from '../config';
import { pp, ppDmg, msPct, procDamage, procActive, slowUnit, enemiesWithin, unitLockReady, unitCounterAdd, statRolls, grantRandomAugment } from './helpers';

/**
 * SILBER — solide Grundbausteine. Effekte sind an das bekannte
 * Arena-Repertoire angelehnt (Zahlen als Balancing-Referenz übernommen,
 * auf unsere Wertebereiche skaliert), Namen und Texte sind eigene.
 */

// Umpolung (Konzept: Bonus-AD → AP wandeln)
const umpolung: AugmentDef = {
  id: 'umpolung',
  name: 'Reversal',
  tier: 'silber',
  tags: ['Arkan'],
  needs: ['ap'],
  description: 'Your bonus attack damage becomes ability power (×1.67). +10% ability power.',
  onUpdate: (_dt, ctx) => {
    const s = ctx.player.stats;
    s.remove('dyn:umpolung-ad');
    s.remove('dyn:umpolung-ap');
    const bonusAD = Math.max(0, s.get('damage') - s.getBase('damage'));
    const p = ctx.power(umpolung);
    s.set({ id: 'dyn:umpolung-ad', stat: 'damage', flat: -bonusAD * p });
    s.set({ id: 'dyn:umpolung-ap', stat: 'abilityPower', flat: bonusAD * 1.67 * p });
    s.set({ id: 'dyn:umpolung-pct', stat: 'abilityPower', pct: 0.1 * p });
  },
};

// Eisenhaut (Konzept: Kontrolle gewährt Widerstände, stapelbar)
const eisenhaut: AugmentDef = {
  id: 'eisenhaut',
  name: 'Ironhide',
  tier: 'silber',
  tags: ['Ward'],
  description: 'Slowing an enemy grants +2–10 armor & MR for 10s (up to 10 stacks).',
  onCombatInit: (ctx) => {
    ctx.run.memory.eisenhautStacks = 0;
  },
  onUpdate: (_dt, ctx) => {
    for (const u of ctx.combat.units) {
      if (!u.alive || u.team !== 'enemy' || !u.stats.hasPrefix('slow:')) continue;
      if (!unitLockReady(u, 'eisenhaut', ctx.combat.now, 5000)) continue;
      ctx.run.memory.eisenhautStacks = Math.min(10, (ctx.run.memory.eisenhautStacks ?? 0) + 1);
    }
    const v = (ctx.run.memory.eisenhautStacks ?? 0) * pp(ctx, 2, 10) * ctx.power(eisenhaut);
    ctx.player.stats.set({ id: 'dyn:eisenhaut-r', stat: 'armor', flat: v });
    ctx.player.stats.set({ id: 'dyn:eisenhaut-m', stat: 'magicResist', flat: v });
  },
};

// Wucht (Konzept: % Gesamt-AD)
const wucht: AugmentDef = {
  id: 'wucht',
  name: 'Brute Force',
  tier: 'silber',
  tags: ['Bruch'],
  description: '+10% total attack damage.',
  statMods: [{ stat: 'damage', pct: 0.1 }],
};

// Wagemut (Konzept: künftige Angebote eine Stufe höher)
const wagemut: AugmentDef = {
  id: 'wagemut',
  name: 'Daring',
  tier: 'silber',
  tags: [],
  description: 'All future augment offers are one tier higher.',
  onCombatInit: (ctx) => {
    ctx.run.memory.tierBoost = 1;
  },
};

// Kopfgeld (Konzept: markiertes Ziel nimmt mehr Schaden, Extra-Belohnung)
let kopfgeldMark: Unit | null = null;
const kopfgeld: AugmentDef = {
  id: 'kopfgeld',
  name: 'Bounty',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'At round start an enemy is marked: +15% damage to them, +40 gold on takedown.',
  onCombatInit: () => {
    kopfgeldMark = null;
  },
  hooks: {
    roundStart: (_p, ctx) => {
      const enemies = ctx.combat.units.filter((u) => u.alive && u.team === 'enemy');
      if (enemies.length === 0) return;
      kopfgeldMark = enemies[Math.floor(Math.random() * enemies.length)];
      ctx.combat.ring(kopfgeldMark.x, kopfgeldMark.y, 0xffd24a, 90);
    },
    damageDealt: ({ target, dmg, type }, ctx) => {
      if (procActive() || type === 'other' || !target.alive) return;
      if (target !== kopfgeldMark) return;
      procDamage(ctx, target, dmg * 0.15 * ctx.power(kopfgeld), 'wahr');
    },
    killWindow: ({ victim }, ctx) => {
      if (victim !== kopfgeldMark) return;
      kopfgeldMark = null;
      ctx.run.gold += 40;
      ctx.run.goldEarned += 40;
      ctx.combat.announce('Bounty claimed! +40', '#ffd24a');
    },
  },
};

// Berstschild (Konzept: brechende Schilde explodieren)
const berstschild: AugmentDef = {
  id: 'berstschild',
  name: 'Burst Shield',
  tier: 'silber',
  tags: ['Ward', 'Bruch'],
  description: 'When your shield breaks it explodes for 100% of the amount absorbed as magic damage.',
  onCombatInit: (ctx) => {
    ctx.run.memory.berstAbsorbed = 0;
    ctx.run.memory.berstPrev = ctx.player.shield;
  },
  onUpdate: (_dt, ctx) => {
    const prev = ctx.run.memory.berstPrev ?? 0;
    const cur = ctx.player.shield;
    if (cur < prev) ctx.run.memory.berstAbsorbed = (ctx.run.memory.berstAbsorbed ?? 0) + (prev - cur);
    if (prev > 0 && cur <= 0) {
      const dmg = (ctx.run.memory.berstAbsorbed ?? 0) * 1.0 * ctx.power(berstschild);
      ctx.run.memory.berstAbsorbed = 0;
      if (dmg > 1) {
        ctx.combat.ring(ctx.player.x, ctx.player.y, COLORS.shield, 240);
        for (const u of enemiesWithin(ctx, ctx.player.x, ctx.player.y, 240)) {
          ctx.combat.dealDamage(ctx.player, u, dmg, 'ability', 'magisch');
        }
      }
    }
    if (cur > prev) ctx.run.memory.berstAbsorbed = 0; // neuer Schild, frisch zählen
    ctx.run.memory.berstPrev = cur;
  },
};

// Zerlegung (Konzept: Tötungen geben dauerhaft adaptive Kraft)
const zerlegung: AugmentDef = {
  id: 'zerlegung',
  name: 'Dismantle',
  tier: 'silber',
  tags: ['Blut'],
  description: 'Takedowns permanently grant +1.5 AD and +2.5 AP (whole run).',
  onCombatInit: (ctx) => applyZerlegung(ctx),
  hooks: {
    killWindow: (_p, ctx) => {
      ctx.run.memory.zerlegungStacks =
        (ctx.run.memory.zerlegungStacks ?? 0) + (ctx.run.memory.stackMult ?? 1);
      applyZerlegung(ctx);
    },
  },
};
function applyZerlegung(ctx: Parameters<NonNullable<AugmentDef['onCombatInit']>>[0]): void {
  const stacks = ctx.run.memory.zerlegungStacks ?? 0;
  const dampen = ctx.run.flags.silverHalved ? 0.5 : 1;
  ctx.player.stats.set({ id: 'perm:zerlegung-ad', stat: 'damage', flat: stacks * 1.5 * dampen });
  ctx.player.stats.set({ id: 'perm:zerlegung-ap', stat: 'abilityPower', flat: stacks * 2.5 * dampen });
}

// Flinkhand (Konzept: flaches Angriffstempo)
const flinkhand: AugmentDef = {
  id: 'flinkhand',
  name: 'Nimble Hands',
  tier: 'silber',
  tags: ['Sturm'],
  description: '+40% attack speed.',
  statMods: [{ stat: 'attackSpeed', pct: 0.4 }],
};

// Windvorteil (Konzept: Tempo-Differenz = Schaden)
const windvorteil: AugmentDef = {
  id: 'windvorteil',
  name: 'Tailwind',
  tier: 'silber',
  tags: ['Sturm'],
  description: '+1% damage per 10 move speed you have over your target.',
  hooks: {
    damageDealt: ({ target, dmg, type }, ctx) => {
      if (procActive() || type === 'other' || !target.alive) return;
      const diff = ctx.player.stats.get('moveSpeed') - target.stats.get('moveSpeed');
      if (diff <= 0) return;
      const bonus = Math.min(0.5, (diff / 10) * 0.01) * ctx.power(windvorteil);
      procDamage(ctx, target, dmg * bonus, 'wahr');
    },
  },
};

// Giftspur (Konzept: giftige Wolke hinter dir)
const giftspur: AugmentDef = {
  id: 'giftspur',
  name: 'Poison Trail',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'You trail a poison cloud behind you (2–16 damage/s, lasts 3s).',
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.giftspurNext ?? 0) > ctx.combat.now) return;
    ctx.run.memory.giftspurNext = ctx.combat.now + 300;
    ctx.combat.addHazard({
      x: ctx.player.x,
      y: ctx.player.y,
      r: 48,
      until: ctx.combat.now + 3250,
      dps: ppDmg(ctx, 15, 125) * ctx.power(giftspur),
      team: 'player',
      color: 0x77cc44,
    });
  },
};

// Zermürbung (Konzept: Treffer senken Widerstände, stapelbar)
const zermuerbung: AugmentDef = {
  id: 'zermuerbung',
  name: 'Attrition',
  tier: 'silber',
  tags: ['Bruch'],
  description: "Each hit lowers the target's armor & MR by 1 (4s, up to 20 stacks).",
  hooks: {
    damageDealt: ({ target, type }, ctx) => {
      if (type === 'other' || !target.alive) return;
      if (!unitLockReady(target, 'zermuerbung', ctx.combat.now, 100)) return;
      const stacks = unitCounterAdd(target, 'zermuerbung', 1, 20);
      const v = stacks * 1 * ctx.power(zermuerbung);
      target.stats.set({ id: 'debuff:zermuerbung-r', stat: 'armor', flat: -v, expiresAt: ctx.combat.now + 4000 });
      target.stats.set({ id: 'debuff:zermuerbung-m', stat: 'magicResist', flat: -v, expiresAt: ctx.combat.now + 4000 });
    },
  },
};

// Klingenfokus (Konzept: AP → AD wandeln)
const klingenfokus: AugmentDef = {
  id: 'klingenfokus',
  name: 'Blade Focus',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Your ability power becomes attack damage (×0.6). +10% total AD.',
  onUpdate: (_dt, ctx) => {
    const s = ctx.player.stats;
    s.remove('dyn:klingenfokus-ap');
    s.remove('dyn:klingenfokus-ad');
    const ap = s.get('abilityPower');
    const p = ctx.power(klingenfokus);
    if (ap > 0) {
      s.set({ id: 'dyn:klingenfokus-ap', stat: 'abilityPower', flat: -ap * p });
      s.set({ id: 'dyn:klingenfokus-ad', stat: 'damage', flat: ap * 0.6 * p });
    }
    s.set({ id: 'dyn:klingenfokus-pct', stat: 'damage', pct: 0.1 * p });
  },
};

// Notausgang (Konzept: Tief-LP-Panikknopf)
const notausgang: AugmentDef = {
  id: 'notausgang',
  name: 'Escape Hatch',
  tier: 'silber',
  tags: ['Ward', 'Sturm'],
  description: 'On dropping below 35% HP: shield (65% max HP) and +150% move speed, decaying over 5s. Once per fight.',
  onCombatInit: (ctx) => {
    ctx.run.memory.notausgangUsed = 0;
  },
  onUpdate: (_dt, ctx) => {
    if (ctx.run.memory.notausgangUsed || ctx.player.hpPct >= 0.35 || !ctx.player.alive) return;
    ctx.run.memory.notausgangUsed = 1;
    const p = ctx.power(notausgang);
    ctx.player.addShield(ctx.player.maxHP * 0.65 * p);
    ctx.player.stats.set({
      id: 'buff:notausgang',
      stat: 'moveSpeed',
      pct: 1.5 * p,
      expiresAt: ctx.combat.now + 5000,
    });
    ctx.combat.announce('Escape Hatch!', '#7ee08a');
  },
};

// Bannschild (Konzept: Rundenstart-Schild)
const bannschild: AugmentDef = {
  id: 'bannschild',
  name: 'Ward Shield',
  tier: 'silber',
  tags: ['Ward'],
  description: 'Start each fight with a shield (15–30 strength, grows with the rounds).',
  hooks: {
    roundStart: (_p, ctx) => ctx.player.addShield(pp(ctx, 15, 30) * ctx.power(bannschild)),
  },
};

// Fuchsfeuer (Konzept: automatische Heimsuch-Flammen)
const fuchsfeuer: AugmentDef = {
  id: 'fuchsfeuer',
  name: 'Foxfire',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Every 7s: 3 flames chase the nearest enemy (4–20 magic damage, 30% on follow-up hits).',
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.fuchsfeuerNext ?? 0) > ctx.combat.now) return;
    const t = ctx.combat.nearestEnemy(ctx.player, 550);
    if (!t) return;
    ctx.run.memory.fuchsfeuerNext = ctx.combat.now + 7000;
    const base = ppDmg(ctx, 35, 160) * ctx.power(fuchsfeuer);
    for (let i = 0; i < 3; i++) {
      ctx.combat.delay(i * 160, () => {
        const target = ctx.combat.nearestEnemy(ctx.player, 650) ?? t;
        if (!target.alive) return;
        ctx.combat.spawnProjectile({
          x: ctx.player.x,
          y: ctx.player.y,
          dirX: target.x - ctx.player.x,
          dirY: target.y - ctx.player.y,
          speed: 700,
          radius: 8,
          color: 0x66aaff,
          team: 'player',
          homing: target,
          maxDist: 900,
          onHit: (hit) =>
            ctx.combat.dealDamage(ctx.player, hit, i === 0 ? base : base * 0.3, 'ability', 'magisch'),
        });
      });
    }
  },
};

// Frostgeist (Konzept: periodischer Wurzel-Impuls)
const frostgeist: AugmentDef = {
  id: 'frostgeist',
  name: 'Frost Spirit',
  tier: 'silber',
  tags: ['Arkan', 'Ward'],
  description: 'Every 6.5s: a cold pulse roots enemies within 450 for 1.25s.',
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.frostgeistNext ?? 0) > ctx.combat.now) return;
    const targets = enemiesWithin(ctx, ctx.player.x, ctx.player.y, 450);
    if (targets.length === 0) return;
    ctx.run.memory.frostgeistNext = ctx.combat.now + 6500;
    ctx.combat.ring(ctx.player.x, ctx.player.y, 0x99ddff, 450);
    for (const u of targets) slowUnit(ctx, u, 'frostgeist', 1.0, 1250 * ctx.power(frostgeist));
  },
};

// Blutkelch (Konzept: Allesraub)
const blutkelch: AugmentDef = {
  id: 'blutkelch',
  name: 'Blood Chalice',
  tier: 'silber',
  tags: ['Blut'],
  description: '+15% life steal on all your damage.',
  statMods: [{ stat: 'lifesteal', flat: 0.15 }],
};

// Kaltblut (Konzept: Kontrolle heilt)
const kaltblut: AugmentDef = {
  id: 'kaltblut',
  name: 'Cold Blood',
  tier: 'silber',
  tags: ['Blut', 'Arkan'],
  description: 'Slowing an enemy heals you for 1–19 HP (+1% max HP). 5s cooldown per target.',
  onUpdate: (_dt, ctx) => {
    for (const u of ctx.combat.units) {
      if (!u.alive || u.team !== 'enemy' || !u.stats.hasPrefix('slow:')) continue;
      if (!unitLockReady(u, 'kaltblut', ctx.combat.now, 5000)) continue;
      ctx.player.heal((ppDmg(ctx, 10, 150) + ctx.player.maxHP * 0.01) * ctx.power(kaltblut));
    }
  },
};

// Schwergewicht (Konzept: max. LP als Zusatzschaden)
const schwergewicht: AugmentDef = {
  id: 'schwergewicht',
  name: 'Heavyweight',
  tier: 'silber',
  tags: ['Ward', 'Bruch'],
  description: 'Attacks deal an extra 5% of your max HP as physical damage.',
  hooks: {
    autoHit: ({ target }, ctx) => {
      if (!target.alive) return;
      procDamage(ctx, target, ctx.player.maxHP * 0.05 * ctx.power(schwergewicht), 'physisch');
    },
  },
};

// Hextech-Kern (Konzept: periodischer Kettenschlag)
const hextechKern: AugmentDef = {
  id: 'hextechkern',
  name: 'Hextech Core',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Every 5s your next attack charges up: +8–24 magic damage and a 40% slow (1s).',
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.hexReady ?? 1) === 0 && (ctx.run.memory.hexNext ?? 0) <= ctx.combat.now) {
      ctx.run.memory.hexReady = 1;
    }
  },
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.run.memory.hexReady = 1;
    },
    autoHit: ({ target }, ctx) => {
      if (!ctx.run.memory.hexReady || !target.alive) return;
      ctx.run.memory.hexReady = 0;
      ctx.run.memory.hexNext = ctx.combat.now + 5000;
      ctx.combat.flashLine(ctx.player.x, ctx.player.y, target.x, target.y, 0x66ccff);
      procDamage(ctx, target, pp(ctx, 8, 24) * ctx.power(hextechKern), 'magisch');
      slowUnit(ctx, target, 'hextech', 0.4, 1000);
    },
  },
};

// Glutkern (Konzept: periodische Feuer-Explosion am Ziel)
const glutkern: AugmentDef = {
  id: 'glutkern',
  name: 'Ember Core',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Every 8s your next hit explodes for 10–28 magic damage within 200.',
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.run.memory.glutNext = 0;
    },
    damageDealt: ({ target, type }, ctx) => {
      if (type === 'other' || !target.alive) return;
      if ((ctx.run.memory.glutNext ?? 0) > ctx.combat.now) return;
      ctx.run.memory.glutNext = ctx.combat.now + 8000;
      const dmg = pp(ctx, 10, 28) * ctx.power(glutkern);
      ctx.combat.ring(target.x, target.y, COLORS.burn, 200);
      for (const u of enemiesWithin(ctx, target.x, target.y, 200)) {
        procDamage(ctx, u, dmg, 'magisch');
      }
    },
  },
};

// Freilauf (Konzept: Tempo außerhalb des Kampfes)
const freilauf: AugmentDef = {
  id: 'freilauf',
  name: 'Free Run',
  tier: 'silber',
  tags: ['Sturm'],
  description: "+70% move speed while you've neither dealt nor taken damage for 3s.",
  hooks: {
    damageDealt: (_p, ctx) => {
      ctx.run.memory.freilaufLast = ctx.combat.now;
    },
    damageTaken: (_p, ctx) => {
      ctx.run.memory.freilaufLast = ctx.combat.now;
    },
  },
  onUpdate: (_dt, ctx) => {
    const calm = ctx.combat.now - (ctx.run.memory.freilaufLast ?? 0) > 3000;
    if (calm) {
      ctx.player.stats.set({ id: 'dyn:freilauf', stat: 'moveSpeed', pct: 0.7 * ctx.power(freilauf) });
    } else {
      ctx.player.stats.remove('dyn:freilauf');
    }
  },
};

// Eiseskälte (Konzept: deine Verlangsamungen wirken stärker)
const eiseskaelte: AugmentDef = {
  id: 'eiseskaelte',
  name: 'Bitter Cold',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Slowed enemies are slowed by a further 21%.',
  onUpdate: (_dt, ctx) => {
    for (const u of ctx.combat.units) {
      if (!u.alive || u.team !== 'enemy') continue;
      // die eigene Verstärkung darf sich nicht selbst als "Slow" zählen
      const hasForeign = u.stats.hasPrefix('slow:') && !u.stats.has('slow:eiseskaelte-x');
      if (hasForeign) {
        u.stats.set({
          id: 'slow:eiseskaelte-x',
          stat: 'moveSpeed',
          pct: -msPct(75) * ctx.power(eiseskaelte),
          expiresAt: ctx.combat.now + 250,
        });
      }
    }
  },
};

// Beutewitterung (Konzept: Tempo auf angeschlagene Ziele)
const beutewitterung: AugmentDef = {
  id: 'beutewitterung',
  name: 'Bloodscent',
  tier: 'silber',
  tags: ['Blut', 'Sturm'],
  description: '+100% move speed while the nearest enemy is below 40% HP.',
  onUpdate: (_dt, ctx) => {
    const t = ctx.combat.nearestEnemy(ctx.player);
    if (t && t.hpPct < 0.4) {
      ctx.player.stats.set({ id: 'dyn:beute', stat: 'moveSpeed', pct: 1.0 * ctx.power(beutewitterung) });
    } else {
      ctx.player.stats.remove('dyn:beute');
    }
  },
};

// Beintag (Konzept: Tempo + Verlangsamungs-Widerstand)
const beintag: AugmentDef = {
  id: 'beintag',
  name: 'Leg Day',
  tier: 'silber',
  tags: ['Sturm'],
  description: '+11% move speed. While you are slowed: +35% move speed on top.',
  statMods: [{ stat: 'moveSpeed', pct: msPct(40) }],
  onUpdate: (_dt, ctx) => {
    if (ctx.player.stats.hasPrefix('slow:')) {
      ctx.player.stats.set({ id: 'dyn:beintag', stat: 'moveSpeed', pct: 0.35 * ctx.power(beintag) });
    } else {
      ctx.player.stats.remove('dyn:beintag');
    }
  },
};

// Feuerwerk (Konzept: jeder 4. Angriff feuert Raketen)
const feuerwerk: AugmentDef = {
  id: 'feuerwerk',
  name: 'Fireworks',
  tier: 'silber',
  tags: ['Bruch', 'Sturm'],
  description: 'Every 4th attack fires 4 rockets (1–9 magic damage each, 90% effectiveness).',
  onCombatInit: (ctx) => {
    ctx.run.memory.feuerwerkCount = 0;
  },
  hooks: {
    autoHit: ({ target }, ctx) => {
      ctx.run.memory.feuerwerkCount = (ctx.run.memory.feuerwerkCount ?? 0) + 1;
      if (ctx.run.memory.feuerwerkCount < 4 || !target.alive) return;
      ctx.run.memory.feuerwerkCount = 0;
      const dmg = ppDmg(ctx, 11, 80) * 0.9 * ctx.power(feuerwerk);
      for (let i = 0; i < 4; i++) {
        ctx.combat.delay(i * 90, () => {
          if (!target.alive) return;
          ctx.combat.spawnProjectile({
            x: ctx.player.x,
            y: ctx.player.y,
            dirX: target.x - ctx.player.x,
            dirY: target.y - ctx.player.y + (Math.random() - 0.5) * 60,
            speed: 950,
            radius: 6,
            color: 0xff8855,
            team: 'player',
            homing: target,
            maxDist: 800,
            onHit: (hit) => procDamage(ctx, hit, dmg, 'magisch'),
          });
        });
      }
    },
  },
};

// Trugbild (Konzept: Klone bei niedrigen LP)
const trugbild: AugmentDef = {
  id: 'trugbild',
  name: 'Mirage',
  tier: 'silber',
  tags: ['Arkan', 'Ward'],
  description: 'On dropping below 30% HP: 4 mirages confuse enemies (8s). Once per fight.',
  onCombatInit: (ctx) => {
    ctx.run.memory.trugbildUsed = 0;
  },
  onUpdate: (_dt, ctx) => {
    if (ctx.run.memory.trugbildUsed || ctx.player.hpPct >= 0.3 || !ctx.player.alive) return;
    ctx.run.memory.trugbildUsed = 1;
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI * 2 * i) / 4 + Math.random();
      ctx.combat.spawnDecoy(
        ctx.player.x + Math.cos(a) * 90,
        ctx.player.y + Math.sin(a) * 90,
        8000 * ctx.power(trugbild),
      );
    }
    ctx.combat.announce('Mirage!', '#ddaaff');
  },
};

// Bergkern (Konzept: Schild nach Ruhephase)
const bergkern: AugmentDef = {
  id: 'bergkern',
  name: 'Mountain Core',
  tier: 'silber',
  tags: ['Ward'],
  description: 'After 5s without taking damage: a shield for 15% max HP (every 20s).',
  hooks: {
    damageTaken: (_p, ctx) => {
      ctx.run.memory.bergkernCalm = ctx.combat.now;
    },
  },
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.bergkernNext ?? 0) > ctx.combat.now) return;
    if (ctx.combat.now - (ctx.run.memory.bergkernCalm ?? 0) < 5000) return;
    ctx.run.memory.bergkernNext = ctx.combat.now + 20000;
    ctx.player.addShield(ctx.player.maxHP * 0.15 * ctx.power(bergkern));
  },
};

// Taubheit (Konzept: Schaden wird gestundet)
let taubheitTicking = false;
const taubheit: AugmentDef = {
  id: 'taubheit',
  name: 'Numbness',
  tier: 'silber',
  tags: ['Ward'],
  description: '35% of damage taken is deferred and repaid as true damage over 6s.',
  onCombatInit: (ctx) => {
    ctx.run.memory.taubheitPool = 0;
    ctx.run.memory.taubheitAcc = 0;
  },
  hooks: {
    damageTaken: ({ dmg }, ctx) => {
      if (taubheitTicking) return; // eigene Rückzahlung nicht erneut stunden
      const store = dmg * 0.35 * ctx.power(taubheit);
      ctx.run.memory.taubheitPool = (ctx.run.memory.taubheitPool ?? 0) + store;
      ctx.player.heal(store); // gestundeter Anteil kommt sofort zurück …
    },
  },
  onUpdate: (dt, ctx) => {
    const pool = ctx.run.memory.taubheitPool ?? 0;
    if (pool <= 0 || !ctx.player.alive) return;
    const tick = Math.min(pool, (pool / 6) * dt + 0.2 * dt); // … und tröpfelt über ~6s wieder ab
    ctx.run.memory.taubheitPool = pool - tick;
    // in Halbsekunden-Häppchen zurückzahlen, damit keine Zahlenflut entsteht
    ctx.run.memory.taubheitAcc = (ctx.run.memory.taubheitAcc ?? 0) + tick;
    if ((ctx.run.memory.taubheitNext ?? 0) <= ctx.combat.now && (ctx.run.memory.taubheitAcc ?? 0) > 0.5) {
      ctx.run.memory.taubheitNext = ctx.combat.now + 500;
      const amount = ctx.run.memory.taubheitAcc ?? 0;
      ctx.run.memory.taubheitAcc = 0;
      taubheitTicking = true;
      ctx.combat.dealDamage(null, ctx.player, amount, 'other', 'wahr');
      taubheitTicking = false;
    }
  },
};

// Ozeankern (Konzept: Schaden austeilen heilt beständig)
const ozeankern: AugmentDef = {
  id: 'ozeankern',
  name: 'Ocean Core',
  tier: 'silber',
  tags: ['Blut'],
  description: 'Dealing damage heals you 3 HP/s for 3s (refreshing).',
  hooks: {
    damageDealt: (_p, ctx) => {
      ctx.run.memory.ozeanUntil = ctx.combat.now + 3000;
    },
  },
  onUpdate: (dt, ctx) => {
    if ((ctx.run.memory.ozeanUntil ?? 0) > ctx.combat.now) {
      ctx.player.heal(3 * dt * ctx.power(ozeankern));
    }
  },
};

// Fluchtkammer (Konzept: einmal dem Tod entkommen)
const fluchtkammer: AugmentDef = {
  id: 'fluchtkammer',
  name: 'Escape Pod',
  tier: 'silber',
  tags: ['Ward'],
  description: 'Once per run: lethal damage instead lets you escape with 35% HP.',
  ruleFlags: { revives: 1 },
};

// Purist (Konzept: Angriffstempo → Fähigkeitentempo)
const purist: AugmentDef = {
  id: 'purist',
  name: 'Purist',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Your bonus attack speed becomes ability haste (0.3 per 1%). Cooldowns −10%.',
  statMods: [{ stat: 'cooldown', pct: -0.1 }],
  onUpdate: (_dt, ctx) => {
    const s = ctx.player.stats;
    s.remove('dyn:purist-as');
    s.remove('dyn:purist-haste');
    const bonusPct = Math.max(0, s.get('attackSpeed') / Math.max(0.01, s.getBase('attackSpeed')) - 1);
    const p = ctx.power(purist);
    if (bonusPct > 0) {
      s.set({ id: 'dyn:purist-as', stat: 'attackSpeed', pct: -bonusPct * p });
      s.set({ id: 'dyn:purist-haste', stat: 'abilityHaste', flat: bonusPct * 100 * 0.3 * p });
    }
  },
};

// Abstoßfeld (Konzept: Notfall-Rückstoß)
const abstossfeld: AugmentDef = {
  id: 'abstossfeld',
  name: 'Repulsor Field',
  tier: 'silber',
  tags: ['Ward', 'Sturm'],
  description: 'The first time you drop below 60% and 30% HP, all enemies within 500 are knocked back.',
  onCombatInit: (ctx) => {
    ctx.run.memory.abstoss60 = 0;
    ctx.run.memory.abstoss30 = 0;
  },
  onUpdate: (_dt, ctx) => {
    const p = ctx.player;
    if (!p.alive) return;
    const fire = (key: 'abstoss60' | 'abstoss30') => {
      ctx.run.memory[key] = 1;
      ctx.combat.ring(p.x, p.y, 0xffffff, 500);
      for (const u of enemiesWithin(ctx, p.x, p.y, 500)) {
        const d = Math.max(30, Math.hypot(u.x - p.x, u.y - p.y));
        u.moveBy(((u.x - p.x) / d) * 260, ((u.y - p.y) / d) * 260);
      }
    };
    if (!ctx.run.memory.abstoss60 && p.hpPct < 0.6) fire('abstoss60');
    if (!ctx.run.memory.abstoss30 && p.hpPct < 0.3) fire('abstoss30');
  },
};

// Fernrohr (Konzept: Reichweite, Stufe 1)
const fernrohr: AugmentDef = {
  id: 'fernrohr',
  name: 'Spyglass',
  tier: 'silber',
  tags: ['Sturm'],
  description: '+60 attack range.',
  statMods: [{ stat: 'attackRange', flat: 60 }],
};

// Zeitzünder (Konzept: periodische Selbst-Explosion)
const zeitzuender: AugmentDef = {
  id: 'zeitzuender',
  name: 'Time Bomb',
  tier: 'silber',
  tags: ['Bruch'],
  description: "Every 13s a bomb explodes on you: 15% of struck enemies' max HP as true damage.",
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.run.memory.bombeNext = ctx.combat.now + 13000;
    },
  },
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.bombeNext ?? Infinity) > ctx.combat.now) return;
    ctx.run.memory.bombeNext = ctx.combat.now + 13000;
    ctx.combat.ring(ctx.player.x, ctx.player.y, 0xff6a3a, 350);
    for (const u of enemiesWithin(ctx, ctx.player.x, ctx.player.y, 350)) {
      procDamage(ctx, u, u.maxHP * 0.15 * ctx.power(zeitzuender), 'wahr');
      const d = Math.max(30, Math.hypot(u.x - ctx.player.x, u.y - ctx.player.y));
      u.moveBy(((u.x - ctx.player.x) / d) * 120, ((u.y - ctx.player.y) / d) * 120);
    }
  },
};

// Schattenläufer (Konzept: Tempo nach dem Dash)
const schattenlaeufer: AugmentDef = {
  id: 'schattenlaeufer',
  name: 'Shadow Runner',
  tier: 'silber',
  tags: ['Sturm'],
  description: 'After each dash: +57% move speed for 2s.',
  hooks: {
    dashEnd: (_p, ctx) => {
      ctx.player.stats.set({
        id: 'buff:schattenlaeufer',
        stat: 'moveSpeed',
        pct: msPct(200) * ctx.power(schattenlaeufer),
        expiresAt: ctx.combat.now + 2000,
      });
    },
  },
};

// Silberlöffel (Konzept: Silber-Synergie)
const silberloeffel: AugmentDef = {
  id: 'silberloeffel',
  name: 'Silver Spoon',
  tier: 'silber',
  tags: [],
  description: '+7.5% damage per Silver augment you own.',
  onUpdate: (_dt, ctx) => {
    const n = ctx.run.augments.filter((a) => a.tier === 'silber').length;
    const v = 0.075 * n * ctx.power(silberloeffel);
    ctx.player.stats.set({ id: 'dyn:silberloeffel-d', stat: 'damage', pct: v });
    ctx.player.stats.set({ id: 'dyn:silberloeffel-a', stat: 'abilityDamage', pct: v });
  },
};

// Nachdruck (Konzept: Kontrolle stapelt adaptive Kraft bis Rundenende)
const nachdruck: AugmentDef = {
  id: 'nachdruck',
  name: 'Emphasis',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Slowing an enemy grants +1.5 AD and +2.5 AP until end of round (stacks).',
  onCombatInit: (ctx) => {
    ctx.run.memory.nachdruckStacks = 0;
  },
  onUpdate: (_dt, ctx) => {
    for (const u of ctx.combat.units) {
      if (!u.alive || u.team !== 'enemy' || !u.stats.hasPrefix('slow:')) continue;
      if (!unitLockReady(u, 'nachdruck', ctx.combat.now, 5000)) continue;
      ctx.run.memory.nachdruckStacks = (ctx.run.memory.nachdruckStacks ?? 0) + 1;
    }
    const st = ctx.run.memory.nachdruckStacks ?? 0;
    const p = ctx.power(nachdruck);
    ctx.player.stats.set({ id: 'dyn:nachdruck-ad', stat: 'damage', flat: st * 1.5 * p });
    ctx.player.stats.set({ id: 'dyn:nachdruck-ap', stat: 'abilityPower', flat: st * 2.5 * p });
  },
};

// Schleimzeit (Konzept: periodischer Nahbereichs-Rülpser)
const schleimzeit: AugmentDef = {
  id: 'schleimzeit',
  name: 'Slime Time',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Every 7s: a slime burst within 450 — 5–10 (+3–7% max HP) magic damage, healing you 5 per hit.',
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.schleimNext ?? 0) > ctx.combat.now) return;
    const targets = enemiesWithin(ctx, ctx.player.x, ctx.player.y, 450);
    if (targets.length === 0) return;
    ctx.run.memory.schleimNext = ctx.combat.now + 7000;
    ctx.combat.ring(ctx.player.x, ctx.player.y, 0x88dd66, 450);
    const p = ctx.power(schleimzeit);
    for (const u of targets) {
      procDamage(ctx, u, (ppDmg(ctx, 40, 80) + u.maxHP * (pp(ctx, 3, 7) / 100)) * p, 'magisch');
      ctx.player.heal(5 * p);
    }
  },
};

// Tempoteufel (Konzept: Fähigkeitstreffer geben Tempo-Schub)
const tempoteufel: AugmentDef = {
  id: 'tempoteufel',
  name: 'Speed Demon',
  tier: 'silber',
  tags: ['Sturm', 'Arkan'],
  description: 'Ability hits: +43% move speed, decaying over 0.75s.',
  hooks: {
    abilityHit: (_p, ctx) => {
      ctx.player.stats.set({
        id: 'buff:tempoteufel',
        stat: 'moveSpeed',
        pct: msPct(150) * ctx.power(tempoteufel),
        expiresAt: ctx.combat.now + 750,
      });
    },
  },
};

// Stapelsaurus (Konzept: permanente Stapel wachsen schneller)
const stapelsaurus: AugmentDef = {
  id: 'stapelsaurus',
  name: 'Stackosaurus',
  tier: 'silber',
  tags: [],
  description: 'Permanent stack effects grow 75% faster.',
  onCombatInit: (ctx) => {
    ctx.run.memory.stackMult = 1.75;
  },
};

// Statistik! (Konzept: sofortige zufällige Werteboni)
const statistik: AugmentDef = {
  id: 'statistik1',
  name: 'Stats!',
  tier: 'silber',
  tags: [],
  description: 'Instantly gain 2 random permanent stat bonuses.',
  onCombatInit: (ctx) => statRolls(ctx, 'stat1', 2),
};

// Panzerglück (Konzept: Kritchance verteidigt auch)
const panzerglueck: AugmentDef = {
  id: 'panzerglueck',
  name: 'Lucky Plating',
  tier: 'silber',
  tags: ['Ward'],
  description: '+25% crit chance. Damage taken is reduced on average by 20% × crit chance.',
  statMods: [{ stat: 'critChance', flat: 0.25 }],
  hooks: {
    damageTaken: ({ dmg }, ctx) => {
      const c = Math.min(1, ctx.player.stats.get('critChance'));
      ctx.player.heal(dmg * 0.2 * c * ctx.power(panzerglueck));
    },
  },
};

// Knochenbrecher (Konzept: AD + Haste + Durchschlag)
const knochenbrecher: AugmentDef = {
  id: 'knochenbrecher',
  name: 'Bonebreaker',
  tier: 'silber',
  tags: ['Bruch'],
  description: '+7 AD, +15 ability haste. Attacks: +4 true damage.',
  statMods: [
    { stat: 'damage', flat: 7 },
    { stat: 'abilityHaste', flat: 15 },
  ],
  hooks: {
    autoHit: ({ target }, ctx) => {
      if (target.alive) procDamage(ctx, target, 4 * ctx.power(knochenbrecher), 'wahr');
    },
  },
};

// Quälgeist (Konzept: Kontrolle brennt)
const quaelgeist: AugmentDef = {
  id: 'quaelgeist',
  name: 'Tormentor',
  tier: 'silber',
  tags: ['Bruch', 'Arkan'],
  description: 'Slowing an enemy ignites them: 3% of their max HP over 5s (5s cooldown/target).',
  onUpdate: (_dt, ctx) => {
    for (const u of ctx.combat.units) {
      if (!u.alive || u.team !== 'enemy' || !u.stats.hasPrefix('slow:')) continue;
      if (!unitLockReady(u, 'quaelgeist', ctx.combat.now, 5000)) continue;
      ctx.combat.addBurn(u, (u.maxHP * 0.03 * ctx.power(quaelgeist)) / 5, 5000);
    }
  },
};

// Brandstifter (Konzept: Dash entzündet)
const brandstifter: AugmentDef = {
  id: 'brandstifter',
  name: 'Arsonist',
  tier: 'silber',
  tags: ['Sturm', 'Bruch'],
  description: 'Your dash ignites the nearest enemy (650): 3.5% of their max HP over 5s.',
  hooks: {
    dashStart: (_p, ctx) => {
      const t = ctx.combat.nearestEnemy(ctx.player, 650);
      if (!t) return;
      ctx.combat.addBurn(t, (t.maxHP * 0.035 * ctx.power(brandstifter)) / 5, 5000);
    },
  },
};

// Transmutation: Gold (Konzept: zufälliges Gold-Augment)
const transmutGold: AugmentDef = {
  id: 'transmutgold',
  name: 'Transmute: Gold',
  tier: 'silber',
  tags: [],
  description: 'Instantly gain a random Gold augment.',
  onCombatInit: (ctx) => {
    if (ctx.run.memory.transmutGoldDone) return;
    ctx.run.memory.transmutGoldDone = 1;
    grantRandomAugment(ctx, 'gold');
  },
};

// Doppelzünder (Konzept: Fähigkeitstreffer feuern Knallkörper, krit-skaliert)
const doppelzuender: AugmentDef = {
  id: 'doppelzuender',
  name: 'Double Detonator',
  tier: 'silber',
  tags: ['Arkan', 'Bruch'],
  description: '+25% crit chance. Ability hits fire firecrackers (1–4 damage each, +1 per 50% crit chance). 5s cooldown.',
  statMods: [{ stat: 'critChance', flat: 0.25 }],
  hooks: {
    abilityHit: ({ target }, ctx) => {
      if ((ctx.run.memory.doppelzuenderNext ?? 0) > ctx.combat.now || !target.alive) return;
      ctx.run.memory.doppelzuenderNext = ctx.combat.now + 5000;
      const count = 1 + Math.floor(ctx.player.stats.get('critChance') / 0.5);
      const dmg = ppDmg(ctx, 10, 30) * ctx.power(doppelzuender);
      for (let i = 0; i < count; i++) {
        ctx.combat.delay(i * 100, () => {
          if (target.alive) procDamage(ctx, target, dmg, 'magisch');
        });
      }
    },
  },
};

// Taifun (Konzept: Angriffe treffen ein zweites Ziel)
const taifun: AugmentDef = {
  id: 'taifun',
  name: 'Typhoon',
  tier: 'silber',
  tags: ['Sturm'],
  description: 'Attacks fire a bolt at a second target (20% AD, triggers on-hit effects).',
  hooks: {
    autoHit: ({ target }, ctx) => {
      if (ctx.run.memory.taifunLock) return;
      let second: Unit | null = null;
      let best = 500;
      for (const u of ctx.combat.units) {
        if (!u.alive || u.team !== 'enemy' || u === target) continue;
        const d = Math.hypot(u.x - target.x, u.y - target.y);
        if (d < best) {
          best = d;
          second = u;
        }
      }
      if (!second) return;
      const s = second;
      ctx.combat.spawnProjectile({
        x: ctx.player.x,
        y: ctx.player.y,
        dirX: s.x - ctx.player.x,
        dirY: s.y - ctx.player.y,
        speed: 1000,
        radius: 7,
        color: 0xbbeeff,
        team: 'player',
        homing: s,
        maxDist: 800,
        onHit: (hit) => {
          const dealt = ctx.combat.dealDamage(
            ctx.player,
            hit,
            ctx.player.stats.get('damage') * 0.2 * ctx.power(taifun),
            'auto',
            'physisch',
          );
          // Treffer-Effekte einmal weiterreichen, ohne Endlosschleife
          ctx.run.memory.taifunLock = 1;
          ctx.combat.bus.emit('autoHit', { target: hit, dmg: dealt });
          ctx.run.memory.taifunLock = 0;
        },
      });
    },
  },
};

// Bannschleier (Konzept: periodischer Schadensblock)
const bannschleier: AugmentDef = {
  id: 'bannschleier',
  name: 'Warding Veil',
  tier: 'silber',
  tags: ['Ward', 'Arkan'],
  description: 'Every 20s a veil fully negates the next hit you take.',
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.run.memory.schleierReady = 1;
    },
    damageTaken: ({ dmg }, ctx) => {
      if (!ctx.run.memory.schleierReady) return;
      ctx.run.memory.schleierReady = 0;
      ctx.player.heal(dmg);
      ctx.combat.announce('Blocked!', '#aaccff');
      ctx.combat.delay(20000, () => {
        ctx.run.memory.schleierReady = 1;
      });
    },
  },
};

// Schwungrad (Konzept: Fähigkeitstreffer beschleunigen Abklingzeiten)
const schwungrad: AugmentDef = {
  id: 'schwungrad',
  name: 'Flywheel',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Ability hits grant stacks for 6s (max 6): cooldowns tick 2.5%/stack faster.',
  hooks: {
    abilityHit: (_p, ctx) => {
      ctx.run.memory.schwungradStacks = Math.min(6, (ctx.run.memory.schwungradStacks ?? 0) + 1);
      ctx.run.memory.schwungradUntil = ctx.combat.now + 6000;
    },
  },
  onUpdate: (dt, ctx) => {
    if ((ctx.run.memory.schwungradUntil ?? 0) < ctx.combat.now) {
      ctx.run.memory.schwungradStacks = 0;
      return;
    }
    const st = ctx.run.memory.schwungradStacks ?? 0;
    const mult = st >= 6 ? 2 : 1;
    ctx.player.reduceCooldowns(dt * 1000 * st * 0.025 * mult * ctx.power(schwungrad));
  },
};

// Hexensinn (Konzept: flache AP)
const hexensinn: AugmentDef = {
  id: 'hexensinn',
  name: 'Witchcraft',
  tier: 'silber',
  tags: ['Arkan'],
  needs: ['ap'],
  description: '+20 ability power.',
  statMods: [{ stat: 'abilityPower', flat: 20 }],
};

// Eiferer (Konzept: AP füttert Angriffe)
const eiferer: AugmentDef = {
  id: 'eiferer',
  name: 'Zealot',
  tier: 'silber',
  tags: ['Sturm', 'Arkan'],
  description: '+25% attack speed and +12.5% crit chance, each +5% per 33 AP.',
  statMods: [
    { stat: 'attackSpeed', pct: 0.25 },
    { stat: 'critChance', flat: 0.125 },
  ],
  onUpdate: (_dt, ctx) => {
    const bonus = (ctx.player.stats.get('abilityPower') / 33) * 0.05 * ctx.power(eiferer);
    ctx.player.stats.set({ id: 'dyn:eiferer-as', stat: 'attackSpeed', pct: bonus });
    ctx.player.stats.set({ id: 'dyn:eiferer-cc', stat: 'critChance', flat: bonus });
  },
};

export const SILBER: AugmentDef[] = [
  umpolung,
  eisenhaut,
  wucht,
  wagemut,
  kopfgeld,
  berstschild,
  zerlegung,
  flinkhand,
  windvorteil,
  giftspur,
  zermuerbung,
  klingenfokus,
  notausgang,
  bannschild,
  fuchsfeuer,
  frostgeist,
  blutkelch,
  kaltblut,
  schwergewicht,
  hextechKern,
  glutkern,
  freilauf,
  eiseskaelte,
  beutewitterung,
  beintag,
  feuerwerk,
  trugbild,
  bergkern,
  taubheit,
  ozeankern,
  fluchtkammer,
  purist,
  abstossfeld,
  fernrohr,
  zeitzuender,
  schattenlaeufer,
  silberloeffel,
  nachdruck,
  schleimzeit,
  tempoteufel,
  stapelsaurus,
  statistik,
  panzerglueck,
  knochenbrecher,
  quaelgeist,
  brandstifter,
  transmutGold,
  doppelzuender,
  taifun,
  bannschleier,
  schwungrad,
  hexensinn,
  eiferer,
];
