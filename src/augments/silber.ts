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
  name: 'Umpolung',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Dein Bonus-Angriffsschaden wird zu Fähigkeitsstärke (×1,67). +10% Fähigkeitsstärke.',
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
  name: 'Eisenhaut',
  tier: 'silber',
  tags: ['Ward'],
  description: 'Verlangsamst du einen Gegner: +2–10 Rüstung & MR für 10s (bis zu 10 Stapel).',
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
  name: 'Wucht',
  tier: 'silber',
  tags: ['Bruch'],
  description: '+10% Gesamt-Angriffsschaden.',
  statMods: [{ stat: 'damage', pct: 0.1 }],
};

// Wagemut (Konzept: künftige Angebote eine Stufe höher)
const wagemut: AugmentDef = {
  id: 'wagemut',
  name: 'Wagemut',
  tier: 'silber',
  tags: [],
  description: 'Alle zukünftigen Augment-Angebote sind eine Stufe höher.',
  onCombatInit: (ctx) => {
    ctx.run.memory.tierBoost = 1;
  },
};

// Kopfgeld (Konzept: markiertes Ziel nimmt mehr Schaden, Extra-Belohnung)
let kopfgeldMark: Unit | null = null;
const kopfgeld: AugmentDef = {
  id: 'kopfgeld',
  name: 'Kopfgeld',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Zu Rundenbeginn wird ein Gegner markiert: +15% Schaden gegen ihn, +40 Gold bei Tötung.',
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
      ctx.combat.announce('Kopfgeld kassiert! +40', '#ffd24a');
    },
  },
};

// Berstschild (Konzept: brechende Schilde explodieren)
const berstschild: AugmentDef = {
  id: 'berstschild',
  name: 'Berstschild',
  tier: 'silber',
  tags: ['Ward', 'Bruch'],
  description: 'Bricht dein Schild, explodiert er: 100% der absorbierten Menge als magischer Schaden.',
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
  name: 'Zerlegung',
  tier: 'silber',
  tags: ['Blut'],
  description: 'Tötungen gewähren dauerhaft +1,5 AD und +2,5 AP (ganzer Run).',
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
  name: 'Flinkhand',
  tier: 'silber',
  tags: ['Sturm'],
  description: '+40% Angriffstempo.',
  statMods: [{ stat: 'attackSpeed', pct: 0.4 }],
};

// Windvorteil (Konzept: Tempo-Differenz = Schaden)
const windvorteil: AugmentDef = {
  id: 'windvorteil',
  name: 'Windvorteil',
  tier: 'silber',
  tags: ['Sturm'],
  description: '+1% Schaden je 10 Tempo, das du schneller bist als dein Ziel.',
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
  name: 'Giftspur',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Du ziehst eine Giftwolke hinter dir her (2–16 Schaden/s, 3s Verweildauer).',
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
  name: 'Zermürbung',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Jeder Treffer senkt Rüstung & MR des Ziels um 1 (4s, bis zu 20 Stapel).',
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
  name: 'Klingenfokus',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Deine Fähigkeitsstärke wird zu Angriffsschaden (×0,6). +10% Gesamt-AD.',
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
  name: 'Notausgang',
  tier: 'silber',
  tags: ['Ward', 'Sturm'],
  description: 'Fällst du unter 35% LP: Schild (65% max. LP) und +150% Tempo, 5s abklingend. 1× pro Kampf.',
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
    ctx.combat.announce('Notausgang!', '#7ee08a');
  },
};

// Bannschild (Konzept: Rundenstart-Schild)
const bannschild: AugmentDef = {
  id: 'bannschild',
  name: 'Bannschild',
  tier: 'silber',
  tags: ['Ward'],
  description: 'Beginne jeden Kampf mit einem Schild (15–30 Stärke, wächst mit den Runden).',
  hooks: {
    roundStart: (_p, ctx) => ctx.player.addShield(pp(ctx, 15, 30) * ctx.power(bannschild)),
  },
};

// Fuchsfeuer (Konzept: automatische Heimsuch-Flammen)
const fuchsfeuer: AugmentDef = {
  id: 'fuchsfeuer',
  name: 'Fuchsfeuer',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Alle 7s: 3 Feuer verfolgen den nächsten Gegner (4–20 magischer Schaden, Folgetreffer 30%).',
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
  name: 'Frostgeist',
  tier: 'silber',
  tags: ['Arkan', 'Ward'],
  description: 'Alle 6,5s: Kältepuls wurzelt Gegner im Umkreis (450) für 1,25s fest.',
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
  name: 'Blutkelch',
  tier: 'silber',
  tags: ['Blut'],
  description: '+15% Lebensraub auf all deinen Schaden.',
  statMods: [{ stat: 'lifesteal', flat: 0.15 }],
};

// Kaltblut (Konzept: Kontrolle heilt)
const kaltblut: AugmentDef = {
  id: 'kaltblut',
  name: 'Kaltblut',
  tier: 'silber',
  tags: ['Blut', 'Arkan'],
  description: 'Verlangsamst du einen Gegner, heilst du 1–19 LP (+1% max. LP). 5s Sperrzeit pro Ziel.',
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
  name: 'Schwergewicht',
  tier: 'silber',
  tags: ['Ward', 'Bruch'],
  description: 'Angriffe verursachen zusätzlich 5% deiner max. LP als physischen Schaden.',
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
  name: 'Hextech-Kern',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Alle 5s lädt sich dein nächster Angriff auf: +8–24 magischer Schaden und 40% Verlangsamung (1s).',
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
  name: 'Glutkern',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Alle 8s explodiert dein nächster Treffer: 10–28 magischer Schaden im Umkreis (200).',
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
  name: 'Freilauf',
  tier: 'silber',
  tags: ['Sturm'],
  description: '+70% Tempo, solange du 3s weder Schaden ausgeteilt noch erlitten hast.',
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
  name: 'Eiseskälte',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Verlangsamte Gegner werden um weitere 21% verlangsamt.',
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
  name: 'Beutewitterung',
  tier: 'silber',
  tags: ['Blut', 'Sturm'],
  description: '+100% Tempo, solange der nächste Gegner unter 40% LP ist.',
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
  name: 'Beintag',
  tier: 'silber',
  tags: ['Sturm'],
  description: '+11% Tempo. Bist du verlangsamt: +35% Tempo zusätzlich.',
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
  name: 'Feuerwerk',
  tier: 'silber',
  tags: ['Bruch', 'Sturm'],
  description: 'Jeder 4. Angriff feuert 4 Raketen (je 1–9 magischer Schaden, 90% Wirkung).',
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
  name: 'Trugbild',
  tier: 'silber',
  tags: ['Arkan', 'Ward'],
  description: 'Fällst du unter 30% LP: 4 Trugbilder verwirren die Gegner (8s). 1× pro Kampf.',
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
    ctx.combat.announce('Trugbild!', '#ddaaff');
  },
};

// Bergkern (Konzept: Schild nach Ruhephase)
const bergkern: AugmentDef = {
  id: 'bergkern',
  name: 'Bergkern',
  tier: 'silber',
  tags: ['Ward'],
  description: 'Nach 5s ohne erlittenen Schaden: Schild über 15% max. LP (alle 20s).',
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
  name: 'Taubheit',
  tier: 'silber',
  tags: ['Ward'],
  description: '35% erlittener Schaden wird gestundet und über 6s als wahrer Schaden nachgereicht.',
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
  name: 'Ozeankern',
  tier: 'silber',
  tags: ['Blut'],
  description: 'Schaden auszuteilen heilt dich um 3 LP/s für 3s (auffrischend).',
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
  name: 'Fluchtkammer',
  tier: 'silber',
  tags: ['Ward'],
  description: 'Einmal pro Run: Tödlicher Schaden lässt dich stattdessen mit 35% LP entkommen.',
  ruleFlags: { revives: 1 },
};

// Purist (Konzept: Angriffstempo → Fähigkeitentempo)
const purist: AugmentDef = {
  id: 'purist',
  name: 'Purist',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Dein Bonus-Angriffstempo wird zu Fähigkeitentempo (0,3 je 1%). Abklingzeiten −10%.',
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
  name: 'Abstoßfeld',
  tier: 'silber',
  tags: ['Ward', 'Sturm'],
  description: 'Fällst du erstmals unter 60% bzw. 30% LP, werden alle Gegner im Umkreis (500) weggestoßen.',
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
  name: 'Fernrohr',
  tier: 'silber',
  tags: ['Sturm'],
  description: '+60 Angriffsreichweite.',
  statMods: [{ stat: 'attackRange', flat: 60 }],
};

// Zeitzünder (Konzept: periodische Selbst-Explosion)
const zeitzuender: AugmentDef = {
  id: 'zeitzuender',
  name: 'Zeitzünder',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Alle 13s explodiert eine Bombe an dir: 15% der max. LP der Getroffenen als wahrer Schaden.',
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
  name: 'Schattenläufer',
  tier: 'silber',
  tags: ['Sturm'],
  description: 'Nach jedem Dash: +57% Tempo für 2s.',
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
  name: 'Silberlöffel',
  tier: 'silber',
  tags: [],
  description: '+7,5% Schaden je Silber-Augment, das du trägst.',
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
  name: 'Nachdruck',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Verlangsamst du einen Gegner: +1,5 AD und +2,5 AP bis Rundenende (stapelt).',
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
  name: 'Schleimzeit',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Alle 7s: Schleimstoß im Umkreis (450) — 5–10 (+3–7% max. LP) magischer Schaden, heilt dich je Treffer um 5.',
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
  name: 'Tempoteufel',
  tier: 'silber',
  tags: ['Sturm', 'Arkan'],
  description: 'Fähigkeitstreffer: +43% Tempo, 0,75s abklingend.',
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
  name: 'Stapelsaurus',
  tier: 'silber',
  tags: [],
  description: 'Permanente Stapel-Effekte wachsen 75% schneller.',
  onCombatInit: (ctx) => {
    ctx.run.memory.stackMult = 1.75;
  },
};

// Statistik! (Konzept: sofortige zufällige Werteboni)
const statistik: AugmentDef = {
  id: 'statistik1',
  name: 'Statistik!',
  tier: 'silber',
  tags: [],
  description: 'Sofort 2 zufällige permanente Werteboni.',
  onCombatInit: (ctx) => statRolls(ctx, 'stat1', 2),
};

// Panzerglück (Konzept: Kritchance verteidigt auch)
const panzerglueck: AugmentDef = {
  id: 'panzerglueck',
  name: 'Panzerglück',
  tier: 'silber',
  tags: ['Ward'],
  description: '+25% Kritchance. Erlittener Schaden wird im Schnitt um 20% × Kritchance gemindert.',
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
  name: 'Knochenbrecher',
  tier: 'silber',
  tags: ['Bruch'],
  description: '+7 AD, +15 Fähigkeitentempo. Angriffe: +4 wahrer Schaden.',
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
  name: 'Quälgeist',
  tier: 'silber',
  tags: ['Bruch', 'Arkan'],
  description: 'Verlangsamst du einen Gegner, brennt er: 3% seiner max. LP über 5s (5s Sperrzeit/Ziel).',
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
  name: 'Brandstifter',
  tier: 'silber',
  tags: ['Sturm', 'Bruch'],
  description: 'Dein Dash entzündet den nächsten Gegner (650): 3,5% seiner max. LP über 5s.',
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
  name: 'Transmutation: Gold',
  tier: 'silber',
  tags: [],
  description: 'Du erhältst sofort ein zufälliges Gold-Augment.',
  onCombatInit: (ctx) => {
    if (ctx.run.memory.transmutGoldDone) return;
    ctx.run.memory.transmutGoldDone = 1;
    grantRandomAugment(ctx, 'gold');
  },
};

// Doppelzünder (Konzept: Fähigkeitstreffer feuern Knallkörper, krit-skaliert)
const doppelzuender: AugmentDef = {
  id: 'doppelzuender',
  name: 'Doppelzünder',
  tier: 'silber',
  tags: ['Arkan', 'Bruch'],
  description: '+25% Kritchance. Fähigkeitstreffer feuern Knallkörper (je 1–4 Schaden, +1 je 50% Kritchance). 5s Sperrzeit.',
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
  name: 'Taifun',
  tier: 'silber',
  tags: ['Sturm'],
  description: 'Angriffe feuern einen Bolzen auf ein zweites Ziel (20% AD, löst Treffer-Effekte aus).',
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
  name: 'Bannschleier',
  tier: 'silber',
  tags: ['Ward', 'Arkan'],
  description: 'Alle 20s negiert ein Schleier den nächsten erlittenen Treffer vollständig.',
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.run.memory.schleierReady = 1;
    },
    damageTaken: ({ dmg }, ctx) => {
      if (!ctx.run.memory.schleierReady) return;
      ctx.run.memory.schleierReady = 0;
      ctx.player.heal(dmg);
      ctx.combat.announce('Geblockt!', '#aaccff');
      ctx.combat.delay(20000, () => {
        ctx.run.memory.schleierReady = 1;
      });
    },
  },
};

// Schwungrad (Konzept: Fähigkeitstreffer beschleunigen Abklingzeiten)
const schwungrad: AugmentDef = {
  id: 'schwungrad',
  name: 'Schwungrad',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Fähigkeitstreffer geben 6s lang Stapel (max. 6): Abklingzeiten laufen 2,5%/Stapel schneller.',
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
  name: 'Hexensinn',
  tier: 'silber',
  tags: ['Arkan'],
  description: '+20 Fähigkeitsstärke.',
  statMods: [{ stat: 'abilityPower', flat: 20 }],
};

// Eiferer (Konzept: AP füttert Angriffe)
const eiferer: AugmentDef = {
  id: 'eiferer',
  name: 'Eiferer',
  tier: 'silber',
  tags: ['Sturm', 'Arkan'],
  description: '+25% Angriffstempo und +12,5% Kritchance, je +5% pro 33 AP.',
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
