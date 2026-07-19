import { AugmentDef } from './types';
import type { Unit } from '../entities/Unit';
import { COLORS } from '../config';
import { pp, ppDmg, msPct, procDamage, procActive, slowUnit, enemiesWithin, unitLockReady, statRolls, grantRandomAugment } from './helpers';
import { SILBER } from './silber';
import { removeAugment } from '../core/run';

/**
 * PRISMA — Regelbrecher und Fantasie-Erfüller. Konzepte aus dem bekannten
 * Arena-Repertoire, eigene Namen/Texte, Referenzzahlen skaliert.
 */

// Tempospirale (Konzept: Wirken stapelt Haste endlos)
const tempospirale: AugmentDef = {
  id: 'tempospirale',
  name: 'Tempo Spiral',
  tier: 'prisma',
  tags: ['Arkan'],
  description: 'Each ability cast: +8 ability haste until end of round (stacks infinitely).',
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
  name: 'Grounded',
  tier: 'prisma',
  tags: ['Arkan'],
  description: 'Your dash is disabled. In return: +25% ability amp and +45 ability haste.',
  ruleFlags: { dashCharges: 0 },
  statMods: [
    { stat: 'abilityDamage', pct: 0.25 },
    { stat: 'abilityHaste', flat: 45 },
  ],
};

// Klingenwalzer (Konzept: Dash endet in einem Hiebgewitter)
const klingenwalzer: AugmentDef = {
  id: 'klingenwalzer',
  name: 'Blade Waltz',
  tier: 'prisma',
  tags: ['Sturm', 'Bruch'],
  description: 'After your dash: 6 lightning-fast strikes on the nearest enemy (40% AD each).',
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
  name: 'Sugar Rush',
  tier: 'prisma',
  tags: ['Arkan', 'Sturm'],
  description: '+200 ability haste. Casting grants +40% move speed for 2s.',
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
  name: 'Untouchable',
  tier: 'prisma',
  tags: ['Ward'],
  description: 'Your E wraps you in an impenetrable shield for 2s (8s cooldown).',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'E') return;
      if ((ctx.run.memory.unantastbarNext ?? 0) > ctx.combat.now) return;
      ctx.run.memory.unantastbarNext = ctx.combat.now + 8000;
      const granted = ctx.player.maxHP * 3 * ctx.power(unantastbar);
      ctx.player.addShield(granted);
      ctx.combat.announce('Untouchable!', '#cfe8ff');
      ctx.combat.delay(2000, () => {
        ctx.player.shield = Math.max(0, ctx.player.shield - granted);
      });
    },
  },
};

// Sternenhof (Konzept: kreisende Sterne verletzen bei Berührung)
const sternenhof: AugmentDef = {
  id: 'sternenhof',
  name: 'Star Halo',
  tier: 'prisma',
  tags: ['Arkan'],
  description: '6 stars orbit you: contact deals 1–20 magic damage (0.5s cooldown/target).',
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
  name: 'Spark Chain',
  tier: 'prisma',
  tags: ['Arkan', 'Bruch'],
  description: '25% of your damage jumps to the next nearby enemy as true damage.',
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
  name: 'Death Circle',
  tier: 'prisma',
  tags: ['Blut', 'Arkan'],
  description: 'Healing you receive deals 50% of it to the nearest enemy (1000) as magic damage.',
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
  name: 'Brute Magic',
  tier: 'prisma',
  tags: ['Arkan', 'Bruch'],
  description: '+100% ability amp, but −50 ability haste. Casting: +40% move speed for 2s.',
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
  name: 'Wallbreaker',
  tier: 'prisma',
  tags: ['Ward'],
  description: 'Slowing an enemy grants a shield of 12–37 (+3% max HP) for 3s (5s cooldown/target).',
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
  name: 'Windrunner',
  tier: 'prisma',
  tags: ['Sturm'],
  description: 'Your dash recharges 3× as fast.',
  ruleFlags: { dashCdMult: 1 / 3 },
};

// Teufelspakt (Konzept: LP-Tribut für wahre Macht)
const teufelspakt: AugmentDef = {
  id: 'teufelspakt',
  name: "Devil's Pact",
  tier: 'prisma',
  tags: ['Blut', 'Bruch'],
  description: 'Lose 2% of current HP per second (never lethal). In return: +10% extra true damage, takedowns heal 12–31 HP.',
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
  name: 'Blade Oath',
  tier: 'prisma',
  tags: ['Blut', 'Sturm'],
  description: 'Your range drops to melee. In return: +25% AD, +20% attack speed, +25% HP, +15% move speed, +25% life steal.',
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
  name: 'Dreadbringer',
  tier: 'prisma',
  tags: ['Ward', 'Blut'],
  description: 'Proximity to enemies (500) gathers Dread (max 40/round): permanently +0.5 max HP per point.',
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
  name: 'Ambidextrous',
  tier: 'prisma',
  tags: ['Sturm', 'Bruch'],
  description: '+20% attack speed. Each attack strikes a second time for 40% damage.',
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
  name: 'Quake Trail',
  tier: 'prisma',
  tags: ['Sturm', 'Bruch'],
  description: 'Your dash leaves a trail that bursts after 0.75s: 18–38 (+50% AD) physical damage.',
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
  name: 'Eureka',
  tier: 'prisma',
  tags: ['Arkan'],
  needs: ['ap'],
  description: '20% of your ability power also counts as ability haste.',
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
  name: 'Final Form',
  tier: 'prisma',
  tags: ['Blut', 'Ward'],
  description: 'E unleashes you for 7.5s: shield (30% max HP), +15% life steal, +30% move speed (20s cooldown).',
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
      ctx.combat.announce('Final Form!', '#ffb3f0');
    },
  },
};

// Wichtelwut (Konzept: klein, flink, giftig gegen Große)
const wichtelwut: AugmentDef = {
  id: 'wichtelwut',
  name: 'Imp Rage',
  tier: 'prisma',
  tags: ['Sturm', 'Bruch'],
  description: 'You are tiny: +25% move speed, and +20% damage to larger enemies.',
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
  name: 'Porcelain Cannon',
  tier: 'prisma',
  tags: ['Bruch'],
  description: '−70% max HP. In return all your damage carries +15% extra true damage.',
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
  name: 'Gigantism',
  tier: 'prisma',
  tags: ['Ward'],
  description: '+15% max HP, +10% AD and AP, +30% size.',
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
  name: 'Beehive',
  tier: 'prisma',
  tags: ['Sturm'],
  description: 'Start with 1 bee, +1 per attack hit (max 8). Every 1.5s the swarm stings: 7–15 magic per bee.',
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
  name: 'Infernal Conduit',
  tier: 'prisma',
  tags: ['Bruch', 'Arkan'],
  description: 'Ability hits ignite (1–7/s for 5s, stacking). While anything burns, abilities recharge 0.3s/s faster.',
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
  name: 'Jeweled Gauntlet',
  tier: 'prisma',
  tags: ['Arkan', 'Bruch'],
  description: '+25% crit chance (+4% per 33 AP). Abilities can crit (+40% damage).',
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
  name: 'Laser Eyes',
  tier: 'prisma',
  tags: ['Arkan'],
  description: 'Your gaze burns: enemies in your facing line (700 long, 80 wide) take 2–30 magic/s.',
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
  name: 'Mad Alchemist',
  tier: 'prisma',
  tags: [],
  description: 'At round start, randomly: +20% HP & +30% AD/AP & size — or +70 haste, +40% move speed & shrink.',
  hooks: {
    roundStart: (_p, ctx) => {
      const p = ctx.power(irrerAlchemist);
      if (Math.random() < 0.5) {
        ctx.player.stats.set({ id: 'dyn:alch-hp', stat: 'maxHP', pct: 0.2 * p });
        ctx.player.stats.set({ id: 'dyn:alch-ad', stat: 'damage', pct: 0.3 * p });
        ctx.player.stats.set({ id: 'dyn:alch-ap', stat: 'abilityPower', pct: 0.3 * p });
        ctx.player.radius = Math.round(26 * 1.4);
        ctx.player.heal(ctx.player.maxHP); // die neue Masse ist sofort gefüllt
        ctx.combat.announce('Colossus Elixir!', '#a0ffb0');
      } else {
        ctx.player.stats.set({ id: 'dyn:alch-haste', stat: 'abilityHaste', flat: 70 * p });
        ctx.player.stats.set({ id: 'dyn:alch-ms', stat: 'moveSpeed', pct: 0.4 * p });
        ctx.player.radius = Math.round(26 * 0.6);
        ctx.combat.announce('Wind Elixir!', '#a0d8ff');
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
  description: 'Attacks: +1 AD until end of round. Ability casts: +2 AP until end of round (stacks infinitely).',
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
  name: 'Spellfist',
  tier: 'prisma',
  tags: ['Arkan', 'Sturm'],
  description: 'Each attack hit reduces your cooldowns by 1.25s.',
  hooks: {
    autoHit: (_p, ctx) => ctx.player.reduceCooldowns(1250 * ctx.power(zauberfaust)),
  },
};

// Allkern (Konzept: zwei zufällige Elementarkerne pro Kampf)
const ALLKERN_IDS = ['hextechkern', 'glutkern', 'bergkern', 'ozeankern'];
const allkern: AugmentDef = {
  id: 'allkern',
  name: 'Omni Core',
  tier: 'prisma',
  tags: [],
  description: 'Each fight: 2 random elemental cores (Hextech, Ember, Mountain, Ocean) work for you.',
  onCombatInit: (ctx) => {
    const pool = SILBER.filter(
      (a) => ALLKERN_IDS.includes(a.id) && !ctx.run.augments.some((o) => o.id === a.id),
    );
    for (let i = 0; i < 2 && pool.length > 0; i++) {
      const rolled = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      ctx.grantTemp(rolled);
      ctx.combat.announce(`Omni Core: ${rolled.name}`, '#c9f0ff');
    }
  },
};

// Orbitalschlag (Konzept: Strahl aus dem Himmel)
const orbitalschlag: AugmentDef = {
  id: 'orbitalschlag',
  name: 'Orbital Strike',
  tier: 'prisma',
  tags: ['Arkan', 'Bruch'],
  description: 'Every 10s a beam targets the nearest enemy: after 0.8s it hits for 40 + AP (magic, radius 130).',
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
  name: "Fate's Casket",
  tier: 'prisma',
  tags: [],
  description: 'Your other augments turn into random Prisma augments (from next round on).',
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
    ctx.combat.announce('The casket opens…', '#ffb3f0');
  },
};

// Prismaei (Konzept: Tötungen brüten etwas Prismatisches aus)
const prismaei: AugmentDef = {
  id: 'prismaei',
  name: 'Prisma Egg',
  tier: 'prisma',
  tags: [],
  description: 'After 5 takedowns a random extra Prisma augment hatches.',
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
      ctx.combat.announce(`The egg hatches: ${rolled.name}!`, '#ffe9a0');
    },
  },
};

// Endgegner (Konzept: erst Statue, dann Monster)
const endgegner: AugmentDef = {
  id: 'endgegner',
  name: 'Final Boss',
  tier: 'prisma',
  tags: ['Ward', 'Bruch'],
  description: 'For the first 5s of each round you are rooted and hardened. Then: +30% AD/AP/HP, shield (25% max HP).',
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
      ctx.combat.announce('THE FINAL BOSS AWAKENS', '#ff4455');
    }
  },
};

// Gerechter Zorn (Konzept: Heilung facht Zauberkraft an)
const gerechterZorn: AugmentDef = {
  id: 'gerechterzorn',
  name: 'Righteous Wrath',
  tier: 'prisma',
  tags: ['Blut', 'Arkan'],
  description: 'Each heal you receive (3s cooldown): +2% ability amp until end of round (stacks infinitely).',
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
  name: 'Eagle Eye',
  tier: 'prisma',
  tags: ['Sturm'],
  description: '+150 attack range.',
  statMods: [{ stat: 'attackRange', flat: 150 }],
};

// Schmortopf (Konzept: brennende Aura)
const schmortopf: AugmentDef = {
  id: 'schmortopf',
  name: 'Slow Cooker',
  tier: 'prisma',
  tags: ['Bruch'],
  description: 'Flame aura (500): enemies inside burn for 1% of their max HP per second (stacking).',
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
  name: 'Reverb',
  tier: 'prisma',
  tags: ['Arkan'],
  description: 'Ability hits reverberate: detonation on the target after 0.75s (13–40 +50% AP magic, 6s cooldown).',
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
  name: 'Stats Cubed',
  tier: 'prisma',
  tags: [],
  description: 'Instantly gain 4 random permanent stat bonuses.',
  onCombatInit: (ctx) => statRolls(ctx, 'stat3', 4),
};

// Käfigkampf (Konzept: E zwingt zum Nahkampf mit dir)
const kaefigkampf: AugmentDef = {
  id: 'kaefigkampf',
  name: 'Cage Match',
  tier: 'prisma',
  tags: ['Ward', 'Bruch'],
  description: 'Your E: enemies within 500 are heavily slowed for 2s, and you gain +100 armor & MR (30s cooldown).',
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
  name: 'Tap Dancer',
  tier: 'prisma',
  tags: ['Sturm'],
  description: 'Attack hits: +8 move speed until end of round (stacks infinitely). Attack speed: +10% × move-speed ratio.',
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
  name: 'Transmute: Chaos',
  tier: 'prisma',
  tags: [],
  description: 'Instantly gain two completely random augments.',
  onCombatInit: (ctx) => {
    if (ctx.run.memory.chaosDone) return;
    ctx.run.memory.chaosDone = 1;
    grantRandomAugment(ctx, null);
    grantRandomAugment(ctx, null);
    removeAugment('transmutchaos'); // one-shot: the slot it occupied is now free
  },
};

// Transmutation: Silber (Konzept: Masse statt Klasse)
const transmutSilber: AugmentDef = {
  id: 'transmutsilber',
  name: 'Transmute: Silver',
  tier: 'prisma',
  tags: [],
  description: 'Instantly gain three random Silver augments.',
  onCombatInit: (ctx) => {
    if (ctx.run.memory.tsilberDone) return;
    ctx.run.memory.tsilberDone = 1;
    // 'silber' tier already scopes the shared pool to SILBER; each call excludes
    // what the previous call just granted, so all three land distinct (or stop
    // early once the pool/slots run out) — same addAugment path as every other grant.
    for (let i = 0; i < 3; i++) {
      const rolled = grantRandomAugment(ctx, 'silber', { announce: false });
      if (!rolled) break;
      ctx.combat.announce(`Silver: ${rolled.name}`, '#cccccc');
    }
    removeAugment('transmutsilber'); // one-shot: the slot it occupied is now free
  },
};

// Fernbomber (Konzept: Distanz-Treffer rufen ein Sperrfeuer)
const fernbomber: AugmentDef = {
  id: 'fernbomber',
  name: 'Long Bomber',
  tier: 'prisma',
  tags: ['Sturm', 'Arkan'],
  description: 'Hitting from over 560 range: a barrage on the target (22–66 +70% AP magic, 8s cooldown).',
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
  name: 'Encore',
  tier: 'prisma',
  tags: ['Arkan'],
  description: 'The first E each round instantly resets all cooldowns.',
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.run.memory.zugabeReady = 1;
    },
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'E' || !ctx.run.memory.zugabeReady) return;
      ctx.run.memory.zugabeReady = 0;
      ctx.combat.delay(50, () => ctx.player.resetCooldowns());
      ctx.combat.announce('Encore!', '#ffe9a0');
    },
  },
};

// Lauffeuer (Konzept: springender Feuerball)
const lauffeuer: AugmentDef = {
  id: 'lauffeuer',
  name: 'Wildfire',
  tier: 'prisma',
  tags: ['Bruch', 'Arkan'],
  description: 'Every 12s: a fireball bounces between up to 4 enemies (44 +30% AD +40% AP magic per bounce).',
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
