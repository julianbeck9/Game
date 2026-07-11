import { AugmentDef } from './types';
import type { Unit } from '../entities/Unit';
import { COLORS } from '../config';
import { pp, ppDmg, msPct, procDamage, procActive, slowUnit, enemiesWithin, unitLockReady, statRolls, grantRandomAugment } from './helpers';
import { SILBER } from './silber';

/**
 * PRISMA — Regelbrecher und Fantasie-Erfüller. Konzepte aus dem bekannten
 * Arena-Repertoire, eigene Namen/Texte, Referenzzahlen skaliert.
 */

// Tempospirale (Konzept: Wirken stapelt Haste endlos)
const tempospirale: AugmentDef = {
  id: 'tempospirale',
  name: 'Tempospirale',
  tier: 'prisma',
  tags: ['Arkan'],
  description: 'Jede gewirkte Fähigkeit: +8 Fähigkeitentempo bis Rundenende (stapelt endlos).',
  onCombatInit: (ctx) => {
    ctx.run.memory.spiraleStacks = 0;
  },
  hooks: {
    abilityCast: (_p, ctx) => {
      ctx.run.memory.spiraleStacks = (ctx.run.memory.spiraleStacks ?? 0) + 1;
      ctx.player.stats.set({
        id: 'dyn:tempospirale',
        stat: 'abilityHaste',
        flat: 8 * (ctx.run.memory.spiraleStacks ?? 0) * ctx.power(tempospirale),
      });
    },
  },
};

// Bodenständig (Konzept: verzichte auf den Dash, gewinne rohe Magie)
const bodenstaendig: AugmentDef = {
  id: 'bodenstaendig',
  name: 'Bodenständig',
  tier: 'prisma',
  tags: ['Arkan'],
  description: 'Dein Dash ist gesperrt. Dafür: +25% Fähigkeitsschaden und +45 Fähigkeitentempo.',
  ruleFlags: { dashCharges: 0 },
  statMods: [
    { stat: 'abilityDamage', pct: 0.25 },
    { stat: 'abilityHaste', flat: 45 },
  ],
};

// Klingenwalzer (Konzept: Dash endet in einem Hiebgewitter)
const klingenwalzer: AugmentDef = {
  id: 'klingenwalzer',
  name: 'Klingenwalzer',
  tier: 'prisma',
  tags: ['Sturm', 'Bruch'],
  description: 'Nach deinem Dash: 6 blitzschnelle Hiebe auf den nächsten Gegner (je 40% AD).',
  hooks: {
    dashEnd: (_p, ctx) => {
      for (let i = 0; i < 6; i++) {
        ctx.combat.delay(i * 100, () => {
          const t = ctx.combat.nearestEnemy(ctx.player, 260);
          if (!t) return;
          ctx.combat.flashLine(ctx.player.x, ctx.player.y, t.x, t.y, 0xffffff);
          ctx.combat.dealDamage(
            ctx.player,
            t,
            ctx.player.stats.get('damage') * 0.4 * ctx.power(klingenwalzer),
            'ability',
            'physisch',
          );
        });
      }
    },
  },
};

// Zuckerschock (Konzept: absurde Wirk-Geschwindigkeit)
const zuckerschock: AugmentDef = {
  id: 'zuckerschock',
  name: 'Zuckerschock',
  tier: 'prisma',
  tags: ['Arkan', 'Sturm'],
  description: '+200 Fähigkeitentempo. Wirken gewährt +40% Tempo für 2s.',
  statMods: [{ stat: 'abilityHaste', flat: 200 }],
  hooks: {
    abilityCast: (_p, ctx) => {
      ctx.player.stats.set({
        id: 'buff:zuckerschock',
        stat: 'moveSpeed',
        pct: 0.4 * ctx.power(zuckerschock),
        expiresAt: ctx.combat.now + 2000,
      });
    },
  },
};

// Unantastbar (Konzept: E gewährt Unverwundbarkeit)
const unantastbar: AugmentDef = {
  id: 'unantastbar',
  name: 'Unantastbar',
  tier: 'prisma',
  tags: ['Ward'],
  description: 'Deine E hüllt dich 2s in einen undurchdringlichen Schild (8s Sperrzeit).',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'E') return;
      if ((ctx.run.memory.unantastbarNext ?? 0) > ctx.combat.now) return;
      ctx.run.memory.unantastbarNext = ctx.combat.now + 8000;
      const granted = ctx.player.maxHP * 3 * ctx.power(unantastbar);
      ctx.player.addShield(granted);
      ctx.combat.announce('Unantastbar!', '#cfe8ff');
      ctx.combat.delay(2000, () => {
        ctx.player.shield = Math.max(0, ctx.player.shield - granted);
      });
    },
  },
};

// Sternenhof (Konzept: kreisende Sterne verletzen bei Berührung)
const sternenhof: AugmentDef = {
  id: 'sternenhof',
  name: 'Sternenhof',
  tier: 'prisma',
  tags: ['Arkan'],
  description: '6 Sterne kreisen um dich: Berührung kostet 1–20 magischen Schaden (0,5s Sperrzeit/Ziel).',
  onUpdate: (_dt, ctx) => {
    const stars = 6;
    const orbitR = 150;
    const baseA = ctx.combat.now / 700;
    const dmg = ppDmg(ctx, 5, 160) * ctx.power(sternenhof);
    for (let i = 0; i < stars; i++) {
      const a = baseA + (Math.PI * 2 * i) / stars;
      const sx = ctx.player.x + Math.cos(a) * orbitR;
      const sy = ctx.player.y + Math.sin(a) * orbitR;
      for (const u of enemiesWithin(ctx, sx, sy, 46)) {
        if (!unitLockReady(u, 'sternenhof', ctx.combat.now, 500)) continue;
        ctx.combat.ring(sx, sy, 0xaad4ff, 40);
        procDamage(ctx, u, dmg, 'magisch');
      }
    }
  },
};

// Funkenschlag (Konzept: Schaden springt als wahrer Funke weiter)
const funkenschlag: AugmentDef = {
  id: 'funkenschlag',
  name: 'Funkenschlag',
  tier: 'prisma',
  tags: ['Arkan', 'Bruch'],
  description: 'Dein Schaden springt zu 25% als wahrer Schaden auf den nächsten weiteren Gegner über.',
  hooks: {
    damageDealt: ({ target, dmg, type }, ctx) => {
      if (procActive() || type === 'other' || !target.alive) return;
      let other: Unit | null = null;
      let best = 800;
      for (const u of ctx.combat.units) {
        if (!u.alive || u.team !== 'enemy' || u === target) continue;
        const d = Math.hypot(u.x - target.x, u.y - target.y);
        if (d < best) {
          best = d;
          other = u;
        }
      }
      if (!other) return;
      ctx.combat.flashLine(target.x, target.y, other.x, other.y, 0xffee88);
      procDamage(ctx, other, dmg * 0.25 * ctx.power(funkenschlag), 'wahr');
    },
  },
};

// Todeszirkel (Konzept: Heilung tut dem Feind weh)
const todeszirkel: AugmentDef = {
  id: 'todeszirkel',
  name: 'Todeszirkel',
  tier: 'prisma',
  tags: ['Blut', 'Arkan'],
  description: 'Erhaltene Heilung fügt dem nächsten Gegner (1000) 50% davon als magischen Schaden zu.',
  onCombatInit: (ctx) => {
    ctx.run.memory.zirkelPrevHp = ctx.player.hp;
  },
  onUpdate: (_dt, ctx) => {
    const prev = ctx.run.memory.zirkelPrevHp ?? ctx.player.hp;
    const delta = ctx.player.hp - prev;
    ctx.run.memory.zirkelPrevHp = ctx.player.hp;
    if (delta < 0.5) return;
    const t = ctx.combat.nearestEnemy(ctx.player, 1000);
    if (!t) return;
    ctx.combat.flashLine(ctx.player.x, ctx.player.y, t.x, t.y, 0x88ffcc);
    procDamage(ctx, t, delta * 0.5 * ctx.power(todeszirkel), 'magisch');
  },
};

// Brachialmagie (Konzept: langsamere, brutalere Zauber)
const brachialmagie: AugmentDef = {
  id: 'brachialmagie',
  name: 'Brachialmagie',
  tier: 'prisma',
  tags: ['Arkan', 'Bruch'],
  description: '+100% Fähigkeitsschaden, aber −50 Fähigkeitentempo. Wirken: +40% Tempo für 2s.',
  statMods: [
    { stat: 'abilityDamage', pct: 1.0 },
    { stat: 'abilityHaste', flat: -50 },
  ],
  hooks: {
    abilityCast: (_p, ctx) => {
      ctx.player.stats.set({
        id: 'buff:brachialmagie',
        stat: 'moveSpeed',
        pct: 0.4 * ctx.power(brachialmagie),
        expiresAt: ctx.combat.now + 2000,
      });
    },
  },
};

// Wallbrecher (Konzept: Kontrolle schenkt Schilde)
const wallbrecher: AugmentDef = {
  id: 'wallbrecher',
  name: 'Wallbrecher',
  tier: 'prisma',
  tags: ['Ward'],
  description: 'Verlangsamst du einen Gegner: Schild über 12–37 (+3% max. LP) für 3s (5s Sperrzeit/Ziel).',
  onUpdate: (_dt, ctx) => {
    for (const u of ctx.combat.units) {
      if (!u.alive || u.team !== 'enemy' || !u.stats.hasPrefix('slow:')) continue;
      if (!unitLockReady(u, 'wallbrecher', ctx.combat.now, 5000)) continue;
      const amount = (pp(ctx, 100, 300) / 8 + ctx.player.maxHP * 0.03) * ctx.power(wallbrecher);
      ctx.player.addShield(amount);
      ctx.combat.delay(3000, () => {
        ctx.player.shield = Math.max(0, ctx.player.shield - amount);
      });
    }
  },
};

// Windläufer (Konzept: der Dash lädt rasend schnell)
const windlaeufer: AugmentDef = {
  id: 'windlaeufer',
  name: 'Windläufer',
  tier: 'prisma',
  tags: ['Sturm'],
  description: 'Dein Dash lädt 3× so schnell.',
  ruleFlags: { dashCdMult: 1 / 3 },
};

// Teufelspakt (Konzept: LP-Tribut für wahre Macht)
const teufelspakt: AugmentDef = {
  id: 'teufelspakt',
  name: 'Teufelspakt',
  tier: 'prisma',
  tags: ['Blut', 'Bruch'],
  description: 'Verliere 2% aktueller LP pro Sekunde (nie tödlich). Dafür: +10% wahrer Zusatzschaden, Tötungen heilen 12–31 LP.',
  onUpdate: (dt, ctx) => {
    if (!ctx.player.alive) return;
    const drain = Math.min(Math.max(0, ctx.player.hp - 1), ctx.player.hp * 0.02 * dt);
    ctx.player.applyDamage(drain);
  },
  hooks: {
    damageDealt: ({ target, dmg, type }, ctx) => {
      if (procActive() || type === 'other' || !target.alive) return;
      procDamage(ctx, target, dmg * 0.1 * ctx.power(teufelspakt), 'wahr');
    },
    killWindow: (_p, ctx) => ctx.player.heal(ppDmg(ctx, 100, 250) * ctx.power(teufelspakt)),
  },
};

// Klingenschwur (Konzept: Fernkämpfer wird Klingentänzer)
const klingenschwur: AugmentDef = {
  id: 'klingenschwur',
  name: 'Klingenschwur',
  tier: 'prisma',
  tags: ['Blut', 'Sturm'],
  description: 'Deine Reichweite sinkt auf Nahkampf. Dafür: +25% AD, +20% Angriffstempo, +25% LP, +15% Tempo, +25% Lebensraub.',
  statMods: [
    { stat: 'damage', pct: 0.25 },
    { stat: 'attackSpeed', pct: 0.2 },
    { stat: 'maxHP', pct: 0.25 },
    { stat: 'moveSpeed', pct: 0.15 },
    { stat: 'lifesteal', flat: 0.25 },
  ],
  onCombatInit: (ctx) => {
    const base = ctx.player.stats.getBase('attackRange');
    if (base > 120) {
      ctx.player.stats.set({ id: 'aug:klingenschwur:range', stat: 'attackRange', flat: 95 - base });
    }
  },
};

// Grauensbringer (Konzept: Nähe zum Feind macht zäh)
const grauensbringer: AugmentDef = {
  id: 'grauensbringer',
  name: 'Grauensbringer',
  tier: 'prisma',
  tags: ['Ward', 'Blut'],
  description: 'Nähe zu Gegnern (500) sammelt Grauen (max. 40/Runde): dauerhaft +0,5 max. LP je Punkt.',
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.run.memory.grauenRound = 0;
    },
  },
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.grauenNext ?? 0) <= ctx.combat.now) {
      ctx.run.memory.grauenNext = ctx.combat.now + 500;
      const near = enemiesWithin(ctx, ctx.player.x, ctx.player.y, 500).length;
      if (near > 0 && (ctx.run.memory.grauenRound ?? 0) < 40) {
        const gain = Math.min(near, 40 - (ctx.run.memory.grauenRound ?? 0));
        ctx.run.memory.grauenRound = (ctx.run.memory.grauenRound ?? 0) + gain;
        ctx.run.memory.grauenTotal =
          (ctx.run.memory.grauenTotal ?? 0) + gain * (ctx.run.memory.stackMult ?? 1);
      }
    }
    ctx.player.stats.set({
      id: 'perm:grauen',
      stat: 'maxHP',
      flat: (ctx.run.memory.grauenTotal ?? 0) * 0.5 * ctx.power(grauensbringer),
    });
  },
};

// Beidhändig (Konzept: zweite Klinge schlägt nach)
const beidhaendig: AugmentDef = {
  id: 'beidhaendig',
  name: 'Beidhändig',
  tier: 'prisma',
  tags: ['Sturm', 'Bruch'],
  description: '+20% Angriffstempo. Jeder Angriff schlägt ein zweites Mal mit 40% Schaden zu.',
  statMods: [{ stat: 'attackSpeed', pct: 0.2 }],
  hooks: {
    autoHit: ({ target, dmg }, ctx) => {
      if (!target.alive) return;
      ctx.combat.delay(120, () => {
        if (target.alive) procDamage(ctx, target, dmg * 0.4 * ctx.power(beidhaendig), 'physisch');
      });
    },
  },
};

// Bebenspur (Konzept: der Dash reißt den Boden auf)
const bebenspur: AugmentDef = {
  id: 'bebenspur',
  name: 'Bebenspur',
  tier: 'prisma',
  tags: ['Sturm', 'Bruch'],
  description: 'Dein Dash hinterlässt eine Spur, die nach 0,75s birst: 18–38 (+50% AD) physischer Schaden.',
  hooks: {
    dashStart: (_p, ctx) => {
      ctx.run.memory.bebenX = ctx.player.x;
      ctx.run.memory.bebenY = ctx.player.y;
    },
    dashEnd: (_p, ctx) => {
      const x1 = ctx.run.memory.bebenX ?? ctx.player.x;
      const y1 = ctx.run.memory.bebenY ?? ctx.player.y;
      const x2 = ctx.player.x;
      const y2 = ctx.player.y;
      const dmg = (ppDmg(ctx, 140, 300) + 0.5 * ctx.player.stats.get('damage')) * ctx.power(bebenspur);
      ctx.combat.delay(750, () => {
        for (const f of [0, 0.5, 1]) {
          const px = x1 + (x2 - x1) * f;
          const py = y1 + (y2 - y1) * f;
          ctx.combat.ring(px, py, 0xcc9955, 150);
          for (const u of enemiesWithin(ctx, px, py, 150)) {
            if (!unitLockReady(u, 'bebenspur', ctx.combat.now, 500)) continue;
            ctx.combat.dealDamage(ctx.player, u, dmg, 'ability', 'physisch');
          }
        }
      });
    },
  },
};

// Heureka (Konzept: AP wird auch zu Haste)
const heureka: AugmentDef = {
  id: 'heureka',
  name: 'Heureka',
  tier: 'prisma',
  tags: ['Arkan'],
  description: '20% deiner Fähigkeitsstärke wirken zusätzlich als Fähigkeitentempo.',
  onUpdate: (_dt, ctx) => {
    ctx.player.stats.set({
      id: 'dyn:heureka',
      stat: 'abilityHaste',
      flat: ctx.player.stats.get('abilityPower') * 0.2 * ctx.power(heureka),
    });
  },
};

// Endform (Konzept: E entfesselt die finale Gestalt)
const endform: AugmentDef = {
  id: 'endform',
  name: 'Endform',
  tier: 'prisma',
  tags: ['Blut', 'Ward'],
  description: 'E entfesselt dich 7,5s: Schild (30% max. LP), +15% Lebensraub, +30% Tempo (20s Sperrzeit).',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'E') return;
      if ((ctx.run.memory.endformNext ?? 0) > ctx.combat.now) return;
      ctx.run.memory.endformNext = ctx.combat.now + 20000;
      const p = ctx.power(endform);
      ctx.player.addShield(ctx.player.maxHP * 0.3 * p);
      ctx.player.stats.set({
        id: 'buff:endform-ls',
        stat: 'lifesteal',
        flat: 0.15 * p,
        expiresAt: ctx.combat.now + 7500,
      });
      ctx.player.stats.set({
        id: 'buff:endform-ms',
        stat: 'moveSpeed',
        pct: 0.3 * p,
        expiresAt: ctx.combat.now + 7500,
      });
      ctx.combat.announce('Endform!', '#ffb3f0');
    },
  },
};

// Wichtelwut (Konzept: klein, flink, giftig gegen Große)
const wichtelwut: AugmentDef = {
  id: 'wichtelwut',
  name: 'Wichtelwut',
  tier: 'prisma',
  tags: ['Sturm', 'Bruch'],
  description: 'Du bist winzig: +25% Tempo, und +20% Schaden gegen größere Gegner.',
  statMods: [{ stat: 'moveSpeed', pct: 0.25 }],
  onCombatInit: (ctx) => {
    ctx.player.radius = 18;
  },
  hooks: {
    damageDealt: ({ target, dmg, type }, ctx) => {
      if (procActive() || type === 'other' || !target.alive) return;
      if (target.radius <= ctx.player.radius) return;
      procDamage(ctx, target, dmg * 0.2 * ctx.power(wichtelwut), 'wahr');
    },
  },
};

// Porzellankanone (Konzept: zerbrechlich, aber unaufhaltsam)
const porzellankanone: AugmentDef = {
  id: 'porzellankanone',
  name: 'Porzellankanone',
  tier: 'prisma',
  tags: ['Bruch'],
  description: '−70% max. LP. Dafür trägt all dein Schaden +15% wahren Zusatzschaden.',
  statMods: [{ stat: 'maxHP', pct: -0.7 }],
  hooks: {
    damageDealt: ({ target, dmg, type }, ctx) => {
      if (procActive() || type === 'other' || !target.alive) return;
      procDamage(ctx, target, dmg * 0.15 * ctx.power(porzellankanone), 'wahr');
    },
  },
};

// Gigantwuchs (Konzept: schierer Wuchs)
const gigantwuchs: AugmentDef = {
  id: 'gigantwuchs',
  name: 'Gigantwuchs',
  tier: 'prisma',
  tags: ['Ward'],
  description: '+15% max. LP, +10% AD und AP, +30% Größe.',
  statMods: [
    { stat: 'maxHP', pct: 0.15 },
    { stat: 'damage', pct: 0.1 },
    { stat: 'abilityPower', pct: 0.1 },
  ],
  onCombatInit: (ctx) => {
    ctx.player.radius = Math.round(26 * 1.3);
  },
};

// Bienenstock (Konzept: ein wachsender Schwarm sticht für dich)
const bienenstock: AugmentDef = {
  id: 'bienenstock',
  name: 'Bienenstock',
  tier: 'prisma',
  tags: ['Sturm'],
  description: 'Start mit 1 Biene, +1 je Angriffstreffer (max. 8). Alle 1,5s sticht der Schwarm: 7–15 magisch pro Biene.',
  onCombatInit: (ctx) => {
    ctx.run.memory.bienen = 1;
  },
  hooks: {
    autoHit: (_p, ctx) => {
      ctx.run.memory.bienen = Math.min(8, (ctx.run.memory.bienen ?? 1) + 1);
    },
  },
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.bienenNext ?? 0) > ctx.combat.now) return;
    const t = ctx.combat.nearestEnemy(ctx.player, 600);
    if (!t) return;
    ctx.run.memory.bienenNext = ctx.combat.now + 1500;
    const n = ctx.run.memory.bienen ?? 1;
    ctx.combat.flashLine(ctx.player.x, ctx.player.y, t.x, t.y, 0xffcc33);
    procDamage(ctx, t, ppDmg(ctx, 60, 120) * n * ctx.power(bienenstock), 'magisch');
  },
};

// Höllenkanal (Konzept: Brände kühlen deine Fähigkeiten)
const hoellenkanal: AugmentDef = {
  id: 'hoellenkanal',
  name: 'Höllenkanal',
  tier: 'prisma',
  tags: ['Bruch', 'Arkan'],
  description: 'Fähigkeitstreffer entzünden (1–7/s für 5s, stapelnd). Solange etwas brennt, laden Fähigkeiten 0,3s/s schneller.',
  hooks: {
    abilityHit: ({ target }, ctx) => {
      if (!target.alive) return;
      if (!unitLockReady(target, 'hoellenkanal', ctx.combat.now, 1000)) return;
      ctx.combat.addBurn(target, ppDmg(ctx, 6, 60) * ctx.power(hoellenkanal), 5000);
    },
  },
  onUpdate: (dt, ctx) => {
    const burning = ctx.combat.units.some((u) => u.alive && u.team === 'enemy' && u.burns.length > 0);
    if (burning) ctx.player.reduceCooldowns(300 * dt * ctx.power(hoellenkanal));
  },
};

// Prunkfaust (Konzept: Fähigkeiten können kritisch treffen)
const prunkfaust: AugmentDef = {
  id: 'prunkfaust',
  name: 'Prunkfaust',
  tier: 'prisma',
  tags: ['Arkan', 'Bruch'],
  description: '+25% Kritchance (+4% je 33 AP). Fähigkeiten können kritisch treffen (+40% Schaden).',
  statMods: [{ stat: 'critChance', flat: 0.25 }],
  onUpdate: (_dt, ctx) => {
    ctx.player.stats.set({
      id: 'dyn:prunkfaust',
      stat: 'critChance',
      flat: (ctx.player.stats.get('abilityPower') / 33) * 0.04,
    });
  },
  hooks: {
    abilityHit: ({ target, dmg }, ctx) => {
      if (!target.alive) return;
      if (Math.random() >= Math.min(1, ctx.player.stats.get('critChance'))) return;
      ctx.combat.ring(target.x, target.y, 0xffffff, 46);
      procDamage(ctx, target, dmg * 0.4 * ctx.power(prunkfaust), 'magisch');
    },
  },
};

// Laserblick (Konzept: dauerhafter Blickstrahl)
const laserblick: AugmentDef = {
  id: 'laserblick',
  name: 'Laserblick',
  tier: 'prisma',
  tags: ['Arkan'],
  description: 'Dein Blick brennt: Gegner in Blickrichtung (700 lang, 80 breit) erleiden 2–30 magisch/s.',
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.laserNext ?? 0) > ctx.combat.now) return;
    ctx.run.memory.laserNext = ctx.combat.now + 250;
    const p = ctx.player;
    const fx = p.facing.x;
    const fy = p.facing.y;
    const dmg = ppDmg(ctx, 5, 60) * ctx.power(laserblick); // pro Viertelsekunde
    let hitAny = false;
    for (const u of ctx.combat.units) {
      if (!u.alive || u.team !== 'enemy') continue;
      const relX = u.x - p.x;
      const relY = u.y - p.y;
      const along = relX * fx + relY * fy;
      if (along < 0 || along > 700) continue;
      const perp = Math.abs(relX * fy - relY * fx);
      if (perp > 40 + u.radius) continue;
      hitAny = true;
      procDamage(ctx, u, dmg, 'magisch');
    }
    if (hitAny) {
      ctx.combat.flashLine(p.x, p.y, p.x + fx * 700, p.y + fy * 700, 0xff5566);
    }
  },
};

// Irrer Alchemist (Konzept: jede Runde ein anderes Elixier)
const irrerAlchemist: AugmentDef = {
  id: 'irreralchemist',
  name: 'Irrer Alchemist',
  tier: 'prisma',
  tags: [],
  description: 'Zu Rundenbeginn zufällig: +20% LP & +30% AD/AP & Größe — oder +70 Haste, +40% Tempo & Schrumpfung.',
  hooks: {
    roundStart: (_p, ctx) => {
      const p = ctx.power(irrerAlchemist);
      if (Math.random() < 0.5) {
        ctx.player.stats.set({ id: 'dyn:alch-hp', stat: 'maxHP', pct: 0.2 * p });
        ctx.player.stats.set({ id: 'dyn:alch-ad', stat: 'damage', pct: 0.3 * p });
        ctx.player.stats.set({ id: 'dyn:alch-ap', stat: 'abilityPower', pct: 0.3 * p });
        ctx.player.radius = Math.round(26 * 1.4);
        ctx.player.heal(ctx.player.maxHP); // die neue Masse ist sofort gefüllt
        ctx.combat.announce('Elixier des Kolosses!', '#a0ffb0');
      } else {
        ctx.player.stats.set({ id: 'dyn:alch-haste', stat: 'abilityHaste', flat: 70 * p });
        ctx.player.stats.set({ id: 'dyn:alch-ms', stat: 'moveSpeed', pct: 0.4 * p });
        ctx.player.radius = Math.round(26 * 0.6);
        ctx.combat.announce('Elixier des Windes!', '#a0d8ff');
      }
    },
  },
};

// Dualist (Konzept: beides füttern)
const dualist: AugmentDef = {
  id: 'dualist',
  name: 'Dualist',
  tier: 'prisma',
  tags: ['Sturm', 'Arkan'],
  description: 'Angriffe: +1 AD bis Rundenende. Gewirkte Fähigkeiten: +2 AP bis Rundenende (stapelt endlos).',
  onCombatInit: (ctx) => {
    ctx.run.memory.dualAd = 0;
    ctx.run.memory.dualAp = 0;
  },
  hooks: {
    autoHit: (_p, ctx) => {
      ctx.run.memory.dualAd = (ctx.run.memory.dualAd ?? 0) + 1;
      ctx.player.stats.set({
        id: 'dyn:dualist-ad',
        stat: 'damage',
        flat: (ctx.run.memory.dualAd ?? 0) * ctx.power(dualist),
      });
    },
    abilityCast: (_p, ctx) => {
      ctx.run.memory.dualAp = (ctx.run.memory.dualAp ?? 0) + 2;
      ctx.player.stats.set({
        id: 'dyn:dualist-ap',
        stat: 'abilityPower',
        flat: (ctx.run.memory.dualAp ?? 0) * ctx.power(dualist),
      });
    },
  },
};

// Zauberfaust (Konzept: Schläge kühlen ab)
const zauberfaust: AugmentDef = {
  id: 'zauberfaust',
  name: 'Zauberfaust',
  tier: 'prisma',
  tags: ['Arkan', 'Sturm'],
  description: 'Jeder Angriffstreffer verkürzt deine Abklingzeiten um 1,25s.',
  hooks: {
    autoHit: (_p, ctx) => ctx.player.reduceCooldowns(1250 * ctx.power(zauberfaust)),
  },
};

// Matroschka (Konzept: mehrschichtiges Weiterleben)
const matroschka: AugmentDef = {
  id: 'matroschka',
  name: 'Matroschka',
  tier: 'prisma',
  tags: ['Ward'],
  description: 'Zweimal pro Run: Stirbst du, schälst du dich neu und kämpfst weiter.',
  ruleFlags: { revives: 2 },
};

// Allkern (Konzept: zwei zufällige Elementarkerne pro Kampf)
const ALLKERN_IDS = ['hextechkern', 'glutkern', 'bergkern', 'ozeankern'];
const allkern: AugmentDef = {
  id: 'allkern',
  name: 'Allkern',
  tier: 'prisma',
  tags: [],
  description: 'Jeder Kampf: 2 zufällige Elementarkerne (Hextech, Glut, Berg, Ozean) wirken für dich.',
  onCombatInit: (ctx) => {
    const pool = SILBER.filter(
      (a) => ALLKERN_IDS.includes(a.id) && !ctx.run.augments.some((o) => o.id === a.id),
    );
    for (let i = 0; i < 2 && pool.length > 0; i++) {
      const rolled = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      ctx.grantTemp(rolled);
      ctx.combat.announce(`Allkern: ${rolled.name}`, '#c9f0ff');
    }
  },
};

// Orbitalschlag (Konzept: Strahl aus dem Himmel)
const orbitalschlag: AugmentDef = {
  id: 'orbitalschlag',
  name: 'Orbitalschlag',
  tier: 'prisma',
  tags: ['Arkan', 'Bruch'],
  description: 'Alle 10s zielt ein Strahl auf den nächsten Gegner: nach 0,8s trifft er für 40 + AP (magisch, Umkreis 130).',
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.orbitalNext ?? 0) > ctx.combat.now) return;
    const t = ctx.combat.nearestEnemy(ctx.player, 900);
    if (!t) return;
    ctx.run.memory.orbitalNext = ctx.combat.now + 10000;
    const tx = t.x;
    const ty = t.y;
    ctx.combat.ring(tx, ty, 0xff8899, 130);
    ctx.combat.delay(800, () => {
      ctx.combat.flashLine(tx, ty - 560, tx, ty, 0xff8899);
      ctx.combat.ring(tx, ty, 0xff8899, 150);
      const dmg = (40 + ctx.player.stats.get('abilityPower')) * ctx.power(orbitalschlag);
      for (const u of enemiesWithin(ctx, tx, ty, 130)) {
        ctx.combat.dealDamage(ctx.player, u, dmg, 'ability', 'magisch');
      }
    });
  },
};

// Schicksalsschatulle (Konzept: alles wird prismatisch)
const schicksalsschatulle: AugmentDef = {
  id: 'schicksalsschatulle',
  name: 'Schicksalsschatulle',
  tier: 'prisma',
  tags: [],
  description: 'Deine anderen Augmente verwandeln sich in zufällige Prisma-Augmente (ab der nächsten Runde).',
  onCombatInit: (ctx) => {
    if (ctx.run.memory.schatulleDone) return;
    ctx.run.memory.schatulleDone = 1;
    const owned = new Set(ctx.run.augments.map((a) => a.id));
    for (let i = 0; i < ctx.run.augments.length; i++) {
      const a = ctx.run.augments[i];
      if (a.id === 'schicksalsschatulle') continue;
      const pool = PRISMA.filter((p) => !owned.has(p.id));
      if (pool.length === 0) break;
      const rolled = pool[Math.floor(Math.random() * pool.length)];
      owned.delete(a.id);
      owned.add(rolled.id);
      for (const t of a.tags) ctx.run.tagCounts[t]--;
      for (const t of rolled.tags) ctx.run.tagCounts[t]++;
      if (rolled.ruleFlags) Object.assign(ctx.run.flags, rolled.ruleFlags);
      ctx.run.augments[i] = rolled;
    }
    ctx.combat.announce('Die Schatulle öffnet sich …', '#ffb3f0');
  },
};

// Prismaei (Konzept: Tötungen brüten etwas Prismatisches aus)
const prismaei: AugmentDef = {
  id: 'prismaei',
  name: 'Prismaei',
  tier: 'prisma',
  tags: [],
  description: 'Nach 5 Tötungen schlüpft ein zufälliges zusätzliches Prisma-Augment.',
  hooks: {
    killWindow: (_p, ctx) => {
      if (ctx.run.memory.eiHatched) return;
      ctx.run.memory.eiStacks = (ctx.run.memory.eiStacks ?? 0) + 1;
      if ((ctx.run.memory.eiStacks ?? 0) < 5) return;
      const pool = PRISMA.filter((p) => !ctx.run.augments.some((o) => o.id === p.id));
      if (pool.length === 0) return;
      ctx.run.memory.eiHatched = 1;
      const rolled = pool[Math.floor(Math.random() * pool.length)];
      ctx.run.augments.push(rolled);
      for (const t of rolled.tags) ctx.run.tagCounts[t]++;
      if (rolled.ruleFlags) Object.assign(ctx.run.flags, rolled.ruleFlags);
      ctx.grantTemp(rolled);
      ctx.combat.announce(`Das Ei schlüpft: ${rolled.name}!`, '#ffe9a0');
    },
  },
};

// Endgegner (Konzept: erst Statue, dann Monster)
const endgegner: AugmentDef = {
  id: 'endgegner',
  name: 'Endgegner',
  tier: 'prisma',
  tags: ['Ward', 'Bruch'],
  description: 'Die ersten 5s jeder Runde bist du verwurzelt und gehärtet. Danach: +30% AD/AP/LP, Schild (25% max. LP).',
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.run.memory.endgegnerT = ctx.combat.now + 5000;
      ctx.run.memory.endgegnerDone = 0;
    },
  },
  onUpdate: (_dt, ctx) => {
    const until = ctx.run.memory.endgegnerT ?? 0;
    const p = ctx.power(endgegner);
    if (ctx.combat.now < until) {
      ctx.player.stats.set({ id: 'dyn:endgegner-root', stat: 'moveSpeed', pct: -1 });
      ctx.player.stats.set({ id: 'dyn:endgegner-r', stat: 'armor', flat: 200 });
      ctx.player.stats.set({ id: 'dyn:endgegner-m', stat: 'magicResist', flat: 200 });
    } else if (!ctx.run.memory.endgegnerDone) {
      ctx.run.memory.endgegnerDone = 1;
      ctx.player.stats.remove('dyn:endgegner-root');
      ctx.player.stats.remove('dyn:endgegner-r');
      ctx.player.stats.remove('dyn:endgegner-m');
      ctx.player.stats.set({ id: 'dyn:endgegner-ad', stat: 'damage', pct: 0.3 * p });
      ctx.player.stats.set({ id: 'dyn:endgegner-ap', stat: 'abilityPower', pct: 0.3 * p });
      ctx.player.stats.set({ id: 'dyn:endgegner-hp', stat: 'maxHP', pct: 0.3 * p });
      ctx.player.radius = Math.round(26 * 1.35);
      ctx.player.addShield(ctx.player.maxHP * 0.25 * p);
      ctx.combat.ring(ctx.player.x, ctx.player.y, 0xff4455, 400);
      for (const u of enemiesWithin(ctx, ctx.player.x, ctx.player.y, 400)) {
        const d = Math.max(30, Math.hypot(u.x - ctx.player.x, u.y - ctx.player.y));
        u.moveBy(((u.x - ctx.player.x) / d) * 220, ((u.y - ctx.player.y) / d) * 220);
      }
      ctx.combat.announce('DER ENDGEGNER ERWACHT', '#ff4455');
    }
  },
};

// Gerechter Zorn (Konzept: Heilung facht Zauberkraft an)
const gerechterZorn: AugmentDef = {
  id: 'gerechterzorn',
  name: 'Gerechter Zorn',
  tier: 'prisma',
  tags: ['Blut', 'Arkan'],
  description: 'Jede erhaltene Heilung (3s Sperrzeit): +2% Fähigkeitsschaden bis Rundenende (stapelt endlos).',
  onCombatInit: (ctx) => {
    ctx.run.memory.zornStacks = 0;
    ctx.run.memory.zornPrevHp = ctx.player.hp;
  },
  onUpdate: (_dt, ctx) => {
    const prev = ctx.run.memory.zornPrevHp ?? ctx.player.hp;
    const delta = ctx.player.hp - prev;
    ctx.run.memory.zornPrevHp = ctx.player.hp;
    if (delta < 0.5 || (ctx.run.memory.zornNext ?? 0) > ctx.combat.now) return;
    ctx.run.memory.zornNext = ctx.combat.now + 3000;
    ctx.run.memory.zornStacks = (ctx.run.memory.zornStacks ?? 0) + 1;
    ctx.player.stats.set({
      id: 'dyn:zorn',
      stat: 'abilityDamage',
      pct: 0.02 * (ctx.run.memory.zornStacks ?? 0) * ctx.power(gerechterZorn),
    });
  },
};

// Adlerauge (Konzept: Reichweite, Endstufe)
const adlerauge: AugmentDef = {
  id: 'adlerauge',
  name: 'Adlerauge',
  tier: 'prisma',
  tags: ['Sturm'],
  description: '+150 Angriffsreichweite.',
  statMods: [{ stat: 'attackRange', flat: 150 }],
};

// Schmortopf (Konzept: brennende Aura)
const schmortopf: AugmentDef = {
  id: 'schmortopf',
  name: 'Schmortopf',
  tier: 'prisma',
  tags: ['Bruch'],
  description: 'Flammenaura (500): Gegner darin brennen für 1% ihrer max. LP pro Sekunde (stapelnd).',
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.schmorNext ?? 0) > ctx.combat.now) return;
    ctx.run.memory.schmorNext = ctx.combat.now + 1000;
    for (const u of enemiesWithin(ctx, ctx.player.x, ctx.player.y, 500)) {
      ctx.combat.addBurn(u, u.maxHP * 0.01 * ctx.power(schmortopf), 5000);
    }
  },
};

// Nachhall (Konzept: Fähigkeitstreffer detonieren nach)
const nachhall: AugmentDef = {
  id: 'nachhall',
  name: 'Nachhall',
  tier: 'prisma',
  tags: ['Arkan'],
  description: 'Fähigkeitstreffer hallen nach: nach 0,75s Detonation am Ziel (13–40 +50% AP magisch, 6s Sperrzeit).',
  hooks: {
    abilityHit: ({ target }, ctx) => {
      if ((ctx.run.memory.nachhallNext ?? 0) > ctx.combat.now || !target.alive) return;
      ctx.run.memory.nachhallNext = ctx.combat.now + 6000;
      const tx = target.x;
      const ty = target.y;
      const dmg = (ppDmg(ctx, 100, 325) + 0.5 * ctx.player.stats.get('abilityPower')) * ctx.power(nachhall);
      ctx.combat.ring(tx, ty, 0x9f88ff, 150);
      ctx.combat.delay(750, () => {
        ctx.combat.ring(tx, ty, 0x9f88ff, 160);
        for (const u of enemiesWithin(ctx, tx, ty, 150)) {
          ctx.combat.dealDamage(ctx.player, u, dmg, 'ability', 'magisch');
        }
      });
    },
  },
};

// Statistik hoch drei (Konzept: 4 zufällige Werteboni)
const statistik3: AugmentDef = {
  id: 'statistik3',
  name: 'Statistik hoch drei',
  tier: 'prisma',
  tags: [],
  description: 'Sofort 4 zufällige permanente Werteboni.',
  onCombatInit: (ctx) => statRolls(ctx, 'stat3', 4),
};

// Käfigkampf (Konzept: E zwingt zum Nahkampf mit dir)
const kaefigkampf: AugmentDef = {
  id: 'kaefigkampf',
  name: 'Käfigkampf',
  tier: 'prisma',
  tags: ['Ward', 'Bruch'],
  description: 'Deine E: Gegner im Umkreis (500) werden 2s stark verlangsamt, du erhältst +100 Rüstung & MR (30s Sperrzeit).',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'E') return;
      if ((ctx.run.memory.kaefigNext ?? 0) > ctx.combat.now) return;
      ctx.run.memory.kaefigNext = ctx.combat.now + 30000;
      const p = ctx.power(kaefigkampf);
      ctx.combat.ring(ctx.player.x, ctx.player.y, 0xffaa44, 500);
      for (const u of enemiesWithin(ctx, ctx.player.x, ctx.player.y, 500)) {
        slowUnit(ctx, u, 'kaefigkampf', 0.5, 2000);
      }
      ctx.player.stats.set({ id: 'buff:kaefig-r', stat: 'armor', flat: 100 * p, expiresAt: ctx.combat.now + 2000 });
      ctx.player.stats.set({ id: 'buff:kaefig-m', stat: 'magicResist', flat: 100 * p, expiresAt: ctx.combat.now + 2000 });
    },
  },
};

// Stepptänzer (Konzept: Treffer machen schnell, Tempo macht schnell)
const stepptaenzer: AugmentDef = {
  id: 'stepptaenzer',
  name: 'Stepptänzer',
  tier: 'prisma',
  tags: ['Sturm'],
  description: 'Angriffstreffer: +8 Tempo bis Rundenende (stapelt endlos). Angriffstempo: +10% × Tempo-Verhältnis.',
  onCombatInit: (ctx) => {
    ctx.run.memory.steppStacks = 0;
  },
  hooks: {
    autoHit: (_p, ctx) => {
      ctx.run.memory.steppStacks = (ctx.run.memory.steppStacks ?? 0) + 1;
      ctx.player.stats.set({
        id: 'dyn:stepp-ms',
        stat: 'moveSpeed',
        pct: msPct(8) * (ctx.run.memory.steppStacks ?? 0) * ctx.power(stepptaenzer),
      });
    },
  },
  onUpdate: (_dt, ctx) => {
    const ratio = ctx.player.stats.get('moveSpeed') / Math.max(1, ctx.player.stats.getBase('moveSpeed'));
    ctx.player.stats.set({
      id: 'dyn:stepp-as',
      stat: 'attackSpeed',
      pct: Math.max(0, (ratio - 1) * 0.5 + 0.1) * ctx.power(stepptaenzer) * 0.35,
    });
  },
};

// Transmutation: Chaos (Konzept: zwei zufällige Augmente)
const transmutChaos: AugmentDef = {
  id: 'transmutchaos',
  name: 'Transmutation: Chaos',
  tier: 'prisma',
  tags: [],
  description: 'Du erhältst sofort zwei komplett zufällige Augmente.',
  onCombatInit: (ctx) => {
    if (ctx.run.memory.chaosDone) return;
    ctx.run.memory.chaosDone = 1;
    grantRandomAugment(ctx, null);
    grantRandomAugment(ctx, null);
  },
};

// Transmutation: Silber (Konzept: Masse statt Klasse)
const transmutSilber: AugmentDef = {
  id: 'transmutsilber',
  name: 'Transmutation: Silber',
  tier: 'prisma',
  tags: [],
  description: 'Du erhältst sofort drei zufällige Silber-Augmente.',
  onCombatInit: (ctx) => {
    if (ctx.run.memory.tsilberDone) return;
    ctx.run.memory.tsilberDone = 1;
    const pool = SILBER.filter((a) => !ctx.run.augments.some((o) => o.id === a.id));
    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const rolled = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      ctx.run.augments.push(rolled);
      for (const t of rolled.tags) ctx.run.tagCounts[t]++;
      if (rolled.ruleFlags) Object.assign(ctx.run.flags, rolled.ruleFlags);
      ctx.combat.announce(`Silber: ${rolled.name}`, '#cccccc');
    }
  },
};

// Fernbomber (Konzept: Distanz-Treffer rufen ein Sperrfeuer)
const fernbomber: AugmentDef = {
  id: 'fernbomber',
  name: 'Fernbomber',
  tier: 'prisma',
  tags: ['Sturm', 'Arkan'],
  description: 'Triffst du aus über 560 Entfernung: Sperrfeuer auf das Ziel (22–66 +70% AP magisch, 8s Sperrzeit).',
  hooks: {
    damageDealt: ({ target, type }, ctx) => {
      if (procActive() || type === 'other' || !target.alive) return;
      if ((ctx.run.memory.bomberNext ?? 0) > ctx.combat.now) return;
      const d = Math.hypot(target.x - ctx.player.x, target.y - ctx.player.y);
      if (d < 560) return;
      ctx.run.memory.bomberNext = ctx.combat.now + 8000;
      const dmg = (ppDmg(ctx, 175, 525) + 0.7 * ctx.player.stats.get('abilityPower')) * ctx.power(fernbomber);
      for (let i = 0; i < 2; i++) {
        ctx.combat.delay(i * 200, () => {
          if (!target.alive) return;
          ctx.combat.spawnProjectile({
            x: ctx.player.x,
            y: ctx.player.y,
            dirX: target.x - ctx.player.x,
            dirY: target.y - ctx.player.y,
            speed: 1200,
            radius: 10,
            color: 0x88bbff,
            team: 'player',
            homing: target,
            maxDist: 1400,
            onHit: (hit) => procDamage(ctx, hit, dmg / 2, 'magisch'),
          });
        });
      }
    },
  },
};

// Zugabe (Konzept: die erste E jeder Runde ist gratis)
const zugabe: AugmentDef = {
  id: 'zugabe',
  name: 'Zugabe',
  tier: 'prisma',
  tags: ['Arkan'],
  description: 'Die erste E jeder Runde setzt sofort alle Abklingzeiten zurück.',
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.run.memory.zugabeReady = 1;
    },
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'E' || !ctx.run.memory.zugabeReady) return;
      ctx.run.memory.zugabeReady = 0;
      ctx.combat.delay(50, () => ctx.player.resetCooldowns());
      ctx.combat.announce('Zugabe!', '#ffe9a0');
    },
  },
};

// Lauffeuer (Konzept: springender Feuerball)
const lauffeuer: AugmentDef = {
  id: 'lauffeuer',
  name: 'Lauffeuer',
  tier: 'prisma',
  tags: ['Bruch', 'Arkan'],
  description: 'Alle 12s: Ein Feuerball springt zwischen bis zu 4 Gegnern (44 +30% AD +40% AP magisch je Sprung).',
  onUpdate: (_dt, ctx) => {
    if ((ctx.run.memory.lauffeuerNext ?? 0) > ctx.combat.now) return;
    const first = ctx.combat.nearestEnemy(ctx.player, 800);
    if (!first) return;
    ctx.run.memory.lauffeuerNext = ctx.combat.now + 12000;
    const dmg =
      (350 / 8 + 0.3 * ctx.player.stats.get('damage') + 0.4 * ctx.player.stats.get('abilityPower')) *
      ctx.power(lauffeuer);
    const hit = new Set<Unit>();
    const bounce = (from: { x: number; y: number }, target: Unit, n: number) => {
      if (!target.alive || n > 4) return;
      hit.add(target);
      ctx.combat.flashLine(from.x, from.y, target.x, target.y, COLORS.burn);
      ctx.combat.ring(target.x, target.y, COLORS.burn, 60);
      procDamage(ctx, target, dmg, 'magisch');
      let next: Unit | null = null;
      let best = 500;
      for (const u of ctx.combat.units) {
        if (!u.alive || u.team !== 'enemy' || hit.has(u)) continue;
        const d = Math.hypot(u.x - target.x, u.y - target.y);
        if (d < best) {
          best = d;
          next = u;
        }
      }
      if (next) {
        const nx = next;
        ctx.combat.delay(250, () => bounce({ x: target.x, y: target.y }, nx, n + 1));
      }
    };
    bounce({ x: ctx.player.x, y: ctx.player.y }, first, 1);
  },
};

export const PRISMA: AugmentDef[] = [
  tempospirale,
  bodenstaendig,
  klingenwalzer,
  zuckerschock,
  unantastbar,
  sternenhof,
  funkenschlag,
  todeszirkel,
  brachialmagie,
  wallbrecher,
  windlaeufer,
  teufelspakt,
  klingenschwur,
  grauensbringer,
  beidhaendig,
  bebenspur,
  heureka,
  endform,
  wichtelwut,
  porzellankanone,
  gigantwuchs,
  bienenstock,
  hoellenkanal,
  prunkfaust,
  laserblick,
  irrerAlchemist,
  dualist,
  zauberfaust,
  matroschka,
  allkern,
  orbitalschlag,
  schicksalsschatulle,
  prismaei,
  endgegner,
  gerechterZorn,
  adlerauge,
  schmortopf,
  nachhall,
  statistik3,
  kaefigkampf,
  stepptaenzer,
  transmutChaos,
  transmutSilber,
  fernbomber,
  zugabe,
  lauffeuer,
];
