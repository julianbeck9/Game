import { AugmentDef, AugmentCtx } from './types';
import type { AbilityId } from '../core/events';
import type { Unit } from '../entities/Unit';
import { ABILITIES, COLORS } from '../config';

/**
 * THE augment registry — all 30. Augments are data + hooks only: they
 * subscribe to combat events and push modifiers through the stat pipeline
 * or call the Combat API. Adding augment #31 means adding one entry here —
 * never touching combat core code.
 */

// ---------------------------------------------------------------------------
// SILBER (12)
// ---------------------------------------------------------------------------

// #1
const blutzoll: AugmentDef = {
  id: 'blutzoll',
  name: 'Blutzoll',
  tier: 'silber',
  tags: ['Blut'],
  description: 'Deine Angriffe heilen dich um 4% des Schadens.',
  hooks: {
    autoHit: ({ dmg }, ctx) => ctx.player.heal(dmg * 0.04 * ctx.power(blutzoll)),
  },
};

// #2
const brandmal: AugmentDef = {
  id: 'brandmal',
  name: 'Brandmal',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Treffer entzünden: 3 Schaden/s für 3s, stapelbar.',
  hooks: {
    autoHit: ({ target }, ctx) => ctx.combat.addBurn(target, 3 * ctx.power(brandmal), 3000),
    abilityHit: ({ target }, ctx) => ctx.combat.addBurn(target, 3 * ctx.power(brandmal), 3000),
  },
};

// #3
let koenigsbannArmed = false;
let koenigsbannAbility: AbilityId | null = null;
let koenigsbannUntil = 0;
const koenigsbann: AugmentDef = {
  id: 'koenigsbann',
  name: 'Königsbann',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Die erste Fähigkeit jedes Kampfes trifft doppelt.',
  onCombatInit: () => {
    koenigsbannArmed = true;
    koenigsbannAbility = null;
  },
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (!koenigsbannArmed) return;
      koenigsbannArmed = false;
      koenigsbannAbility = ability;
      koenigsbannUntil = ctx.combat.now + 2500;
    },
    abilityHit: ({ ability, target, dmg }, ctx) => {
      if (ability !== koenigsbannAbility || ctx.combat.now >= koenigsbannUntil) return;
      ctx.combat.dealDamage(ctx.player, target, dmg * ctx.power(koenigsbann), 'ability');
    },
  },
};

// #4
const kuehlung: AugmentDef = {
  id: 'kuehlung',
  name: 'Kühlung',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Jeder Angriffstreffer verkürzt deine Abklingzeiten um 0,3s.',
  hooks: {
    autoHit: (_p, ctx) => ctx.player.reduceCooldowns(300 * ctx.power(kuehlung)),
  },
};

// #5
const sturmschritt: AugmentDef = {
  id: 'sturmschritt',
  name: 'Sturmschritt',
  tier: 'silber',
  tags: ['Sturm'],
  description: 'Nach jedem Dash: +50% Angriffstempo für 1,5s.',
  hooks: {
    dashEnd: (_p, ctx) => {
      ctx.player.stats.set({
        id: 'buff:sturmschritt',
        stat: 'attackSpeed',
        pct: 0.5 * ctx.power(sturmschritt),
        expiresAt: ctx.combat.now + 1500,
      });
    },
  },
};

// #6
const bollwerk: AugmentDef = {
  id: 'bollwerk',
  name: 'Bollwerk',
  tier: 'silber',
  tags: ['Ward'],
  description: 'Beginne jeden Kampf mit einem Schild (15% max. LP).',
  hooks: {
    roundStart: (_p, ctx) => {
      ctx.player.addShield(ctx.player.maxHP * 0.15 * ctx.power(bollwerk));
    },
  },
};

// #7
const blutrausch: AugmentDef = {
  id: 'blutrausch',
  name: 'Blutrausch',
  tier: 'silber',
  tags: ['Blut'],
  description: '+3 Angriffsschaden pro Tötung — hält den ganzen Run.',
  onCombatInit: (ctx) => applyBlutrausch(ctx),
  hooks: {
    killWindow: (_p, ctx) => {
      ctx.run.memory.blutrauschStacks = (ctx.run.memory.blutrauschStacks ?? 0) + 1;
      applyBlutrausch(ctx);
    },
  },
};

function applyBlutrausch(ctx: AugmentCtx): void {
  const stacks = ctx.run.memory.blutrauschStacks ?? 0;
  // Permanent run stacks: silver dampener applies, Blutmond's HP condition doesn't
  const dampen = ctx.run.flags.silverHalved ? 0.5 : 1;
  ctx.player.stats.set({ id: 'perm:blutrausch', stat: 'damage', flat: stacks * 3 * dampen });
}

// #8
let splitterGuardUntil = 0;
const splitterwurf: AugmentDef = {
  id: 'splitterwurf',
  name: 'Splitterwurf',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Klingenwurf zersplittert am Ende in 3 Splitter (je 40% Schaden).',
  onCombatInit: () => (splitterGuardUntil = 0),
  hooks: {
    abilityHit: ({ ability, target }, ctx) => {
      if (ability !== 'Q' || ctx.combat.now < splitterGuardUntil) return;
      splitterGuardUntil = ctx.combat.now + 300; // one burst per cast, not per pierce
      const dmg = ABILITIES.Q.dmg * ctx.player.stats.get('abilityDamage') * 0.4 * ctx.power(splitterwurf);
      const base = Math.atan2(target.y - ctx.player.y, target.x - ctx.player.x);
      for (const off of [-0.45, 0, 0.45]) {
        ctx.combat.spawnProjectile({
          x: target.x,
          y: target.y,
          dirX: Math.cos(base + off),
          dirY: Math.sin(base + off),
          speed: 850,
          radius: 7,
          color: COLORS.burn,
          team: 'player',
          maxDist: 320,
          ignore: target,
          // Splinters are augment damage — no abilityHit re-emit, no chain reactions
          onHit: (t) => ctx.combat.dealDamage(ctx.player, t, dmg, 'ability'),
        });
      }
    },
  },
};

// #9
let schwungCharge = 0;
let schwungLastX = 0;
let schwungLastY = 0;
const schwungmasse: AugmentDef = {
  id: 'schwungmasse',
  name: 'Schwungmasse',
  tier: 'silber',
  tags: ['Sturm'],
  description: 'Bewegung lädt bis zu +20% Schaden auf; Stillstand entlädt.',
  onCombatInit: (ctx) => {
    schwungCharge = 0;
    schwungLastX = ctx.player.x;
    schwungLastY = ctx.player.y;
  },
  onUpdate: (dt, ctx) => {
    const moved = Math.hypot(ctx.player.x - schwungLastX, ctx.player.y - schwungLastY);
    schwungLastX = ctx.player.x;
    schwungLastY = ctx.player.y;
    const max = 0.2 * ctx.power(schwungmasse);
    if (moved > 40 * dt) {
      schwungCharge = Math.min(max, schwungCharge + max * dt / 2); // full in ~2s of motion
    } else {
      schwungCharge = Math.max(0, schwungCharge - max * dt); // drains in ~1s
    }
    ctx.player.stats.set({ id: 'dyn:schwungmasse', stat: 'damage', pct: schwungCharge });
  },
};

// #10
const dornenkrone: AugmentDef = {
  id: 'dornenkrone',
  name: 'Dornenkrone',
  tier: 'silber',
  tags: ['Ward'],
  description: 'Nahkampf-Angreifer erleiden 25% des Schadens zurück.',
  hooks: {
    damageTaken: ({ source, dmg, melee }, ctx) => {
      if (!melee || !source || !source.alive) return;
      ctx.combat.dealDamage(ctx.player, source, dmg * 0.25 * ctx.power(dornenkrone), 'reflect');
    },
  },
};

// #11
const weitschuss: AugmentDef = {
  id: 'weitschuss',
  name: 'Weitschuss',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Angriffe auf Ziele weiter als 300px: +30% Schaden.',
  hooks: {
    autoHit: ({ target, dmg }, ctx) => {
      const d = Math.hypot(target.x - ctx.player.x, target.y - ctx.player.y);
      if (d > 300) {
        ctx.combat.dealDamage(ctx.player, target, dmg * 0.3 * ctx.power(weitschuss), 'auto');
      }
    },
  },
};

// #12
const nachbrenner: AugmentDef = {
  id: 'nachbrenner',
  name: 'Nachbrenner',
  tier: 'silber',
  tags: ['Sturm', 'Bruch'],
  description: 'Dein Dash hinterlässt eine brennende Spur (3s).',
  hooks: {
    dashStart: (_p, ctx) => {
      // Drop flame patches along the dash path while it lasts
      for (let i = 0; i <= 4; i++) {
        ctx.combat.delay(i * 45, () => {
          ctx.combat.addHazard({
            x: ctx.player.x,
            y: ctx.player.y,
            r: 42,
            until: ctx.combat.now + 3000,
            dps: 8 * ctx.power(nachbrenner),
            team: 'player',
            color: COLORS.burn,
          });
        });
      }
    },
  },
};

// ---------------------------------------------------------------------------
// GOLD (12)
// ---------------------------------------------------------------------------

// #13
const kettenblitz: AugmentDef = {
  id: 'kettenblitz',
  name: 'Kettenblitz',
  tier: 'gold',
  tags: ['Arkan'],
  description:
    'Angriffe springen auf ein zweites Ziel (70% Schaden). Ohne zweites Ziel: trifft dasselbe erneut mit 35%.',
  hooks: {
    autoHit: ({ target, dmg }, ctx) => {
      let second: Unit | null = null;
      let bestD = 380;
      for (const u of ctx.combat.units) {
        if (!u.alive || u.team !== 'enemy' || u === target) continue;
        const d = Math.hypot(u.x - target.x, u.y - target.y);
        if (d < bestD) {
          bestD = d;
          second = u;
        }
      }
      if (second) {
        ctx.combat.flashLine(target.x, target.y, second.x, second.y, 0x88ddff);
        ctx.combat.dealDamage(ctx.player, second, dmg * 0.7 * ctx.power(kettenblitz), 'auto');
      } else {
        // Fallback covers pure 1v1 rounds
        ctx.combat.flashLine(target.x, target.y - 40, target.x, target.y, 0x88ddff);
        ctx.combat.dealDamage(ctx.player, target, dmg * 0.35 * ctx.power(kettenblitz), 'auto');
      }
    },
  },
};

// #14
const echo: AugmentDef = {
  id: 'echo',
  name: 'Echo',
  tier: 'gold',
  tags: ['Arkan'],
  description: 'Klingenwurf wiederholt sich nach 0,4s automatisch.',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'Q') return;
      const dir = { ...ctx.player.lastQDir };
      ctx.combat.delay(400, () => ctx.player.fireQ(dir, ctx.power(echo)));
    },
  },
};

// #15
const doppeltritt: AugmentDef = {
  id: 'doppeltritt',
  name: 'Doppeltritt',
  tier: 'gold',
  tags: ['Sturm'],
  description: '+1 Dash-Ladung.',
  ruleFlags: { dashCharges: 2 },
};

// #16
const phasensprung: AugmentDef = {
  id: 'phasensprung',
  name: 'Phasensprung',
  tier: 'gold',
  tags: ['Sturm'],
  description: 'Während des Dashs bist du unverwundbar.',
  ruleFlags: { dashIFrames: true },
};

// #17 — Resonanz: reads the tag map live
const blutpakt: AugmentDef = {
  id: 'blutpakt',
  name: 'Blutpakt',
  tier: 'gold',
  tags: ['Blut'],
  description: '+4% Lebensraub pro Blut-Augment, das du trägst.',
  onUpdate: (_dt, ctx) => {
    ctx.player.stats.set({
      id: 'dyn:blutpakt',
      stat: 'lifesteal',
      flat: 0.04 * ctx.run.tagCounts.Blut * ctx.power(blutpakt),
    });
  },
};

// #18 — Resonanz
const ueberladung: AugmentDef = {
  id: 'ueberladung',
  name: 'Überladung',
  tier: 'gold',
  tags: ['Arkan'],
  description: '+8% Fähigkeitsschaden pro Arkan-Augment.',
  onUpdate: (_dt, ctx) => {
    ctx.player.stats.set({
      id: 'dyn:ueberladung',
      stat: 'abilityDamage',
      pct: 0.08 * ctx.run.tagCounts.Arkan * ctx.power(ueberladung),
    });
  },
};

// #19
let zweiterWindUsed = false;
const zweiterWind: AugmentDef = {
  id: 'zweiterwind',
  name: 'Zweiter Wind',
  tier: 'gold',
  tags: ['Ward'],
  description: 'Einmal pro Kampf: Fällst du unter 15% LP, heile sofort 30%.',
  onCombatInit: () => (zweiterWindUsed = false),
  hooks: {
    playerHpThreshold: ({ pct }, ctx) => {
      if (pct !== 0.15 || zweiterWindUsed) return;
      zweiterWindUsed = true;
      ctx.player.heal(ctx.player.maxHP * 0.3 * ctx.power(zweiterWind));
      ctx.combat.announce('Zweiter Wind!', '#7ee08a');
    },
  },
};

// #20
const henkersblick: AugmentDef = {
  id: 'henkersblick',
  name: 'Henkersblick',
  tier: 'gold',
  tags: ['Bruch'],
  description: 'Gegner unter 12% LP werden sofort hingerichtet.',
  hooks: {
    damageDealt: ({ target }, ctx) => {
      if (!target.alive || target.team !== 'enemy') return;
      const threshold = target.isBoss ? 0.08 : 0.12;
      if (target.hpPct <= threshold) {
        ctx.combat.dealDamage(ctx.player, target, target.hp + target.shield, 'other');
        ctx.combat.announce('Hingerichtet!', '#ff6a5e');
      }
    },
  },
};

// #21 — its doubling lives in ctx.power(), the combat-wide Blut scaler
const blutmond: AugmentDef = {
  id: 'blutmond',
  name: 'Blutmond',
  tier: 'gold',
  tags: ['Blut'],
  description: 'Unter 50% LP wirken alle deine Blut-Effekte doppelt.',
};

// #22
const schattenzwilling: AugmentDef = {
  id: 'schattenzwilling',
  name: 'Schattenzwilling',
  tier: 'gold',
  tags: ['Sturm'],
  description: 'Dein Dash lässt einen Köder zurück, der Gegner 1,5s lang verspottet.',
  hooks: {
    dashStart: (_p, ctx) => {
      ctx.combat.spawnDecoy(ctx.player.x, ctx.player.y, 1500 * ctx.power(schattenzwilling));
    },
  },
};

// #23
const bannkreis: AugmentDef = {
  id: 'bannkreis',
  name: 'Bannkreis',
  tier: 'gold',
  tags: ['Ward', 'Arkan'],
  description: 'Königsruf verlangsamt zusätzlich alle Gegner im Umkreis um 35% (2s).',
  hooks: {
    abilityCast: ({ ability }, ctx) => {
      if (ability !== 'E') return;
      for (const u of ctx.combat.units) {
        if (!u.alive || u.team !== 'enemy') continue;
        if (Math.hypot(u.x - ctx.player.x, u.y - ctx.player.y) > 340) continue;
        u.stats.set({
          id: 'slow:bannkreis',
          stat: 'moveSpeed',
          pct: -0.35 * ctx.power(bannkreis),
          expiresAt: ctx.combat.now + 2000,
        });
      }
    },
  },
};

// #24 — wild, no tag
const narrenwuerfel: AugmentDef = {
  id: 'narrenwuerfel',
  name: 'Narrenwürfel',
  tier: 'gold',
  tags: [],
  description: 'Dieser Slot würfelt sich zu Rundenbeginn in ein zufälliges Silber-Augment neu.',
  onCombatInit: (ctx) => {
    const pool = AUGMENTS.filter(
      (a) =>
        a.tier === 'silber' &&
        a.id !== 'blutrausch' && // run-permanent stacks don't fit a per-round loan
        !ctx.run.augments.some((o) => o.id === a.id),
    );
    if (pool.length === 0) return;
    const rolled = pool[Math.floor(Math.random() * pool.length)];
    ctx.grantTemp(rolled);
    ctx.combat.announce(`Narrenwürfel: ${rolled.name}`, '#ddaaff');
  },
};

// ---------------------------------------------------------------------------
// PRISMA (6) — Regelbrecher, max. 1 pro Run (außer Doppelkrone)
// ---------------------------------------------------------------------------

// #25
const kronlos: AugmentDef = {
  id: 'kronlos',
  name: 'Kronlos',
  tier: 'prisma',
  tags: ['Arkan'],
  description: 'Keine Auto-Angriffe mehr. Dafür: −70% Abklingzeiten.',
  ruleFlags: { noAutoAttacks: true },
  statMods: [{ stat: 'cooldown', pct: -0.7 }],
};

// #26
const zeitdieb: AugmentDef = {
  id: 'zeitdieb',
  name: 'Zeitdieb',
  tier: 'prisma',
  tags: ['Arkan', 'Bruch'],
  description: 'Jede Tötung setzt alle Abklingzeiten zurück.',
  hooks: {
    killWindow: (_p, ctx) => ctx.player.resetCooldowns(),
  },
};

// #27
const glaskanone: AugmentDef = {
  id: 'glaskanone',
  name: 'Glaskanone',
  tier: 'prisma',
  tags: ['Bruch'],
  description: '+100% Schaden. Deine maximalen LP werden halbiert.',
  statMods: [
    { stat: 'damage', pct: 1.0 },
    { stat: 'abilityDamage', pct: 1.0 },
    { stat: 'maxHP', pct: -0.5 },
  ],
};

// #28
const spiegelkoenig: AugmentDef = {
  id: 'spiegelkoenig',
  name: 'Spiegelkönig',
  tier: 'prisma',
  tags: ['Arkan', 'Ward'],
  description: 'Ein Spiegelbild mit deinen Augments (25% Wirkung) kämpft an deiner Seite.',
  onCombatInit: (ctx) => ctx.combat.spawnMirror(0.25),
};

// #29
const ewigeFlamme: AugmentDef = {
  id: 'ewigeflamme',
  name: 'Ewige Flamme',
  tier: 'prisma',
  tags: ['Bruch'],
  description: 'Brand läuft nie ab und stapelt unbegrenzt.',
  ruleFlags: { burnForever: true },
};

// #30
const doppelkrone: AugmentDef = {
  id: 'doppelkrone',
  name: 'Doppelkrone',
  tier: 'prisma',
  tags: [],
  description: 'Du kannst 2 Prisma tragen. Alle Silber-Augmente wirken nur noch halb.',
  ruleFlags: { prismaSlots: 2, silverHalved: true },
};

// ---------------------------------------------------------------------------
// ARENA-EXPANSION — an die bekannten Arena-Augmente angelehnt, frei adaptiert
// ---------------------------------------------------------------------------

// #31
const goliath: AugmentDef = {
  id: 'goliath',
  name: 'Goliath',
  tier: 'silber',
  tags: ['Ward'],
  description: 'Du bist größer: +35% max. LP, aber −8% Tempo.',
  statMods: [
    { stat: 'maxHP', pct: 0.35 },
    { stat: 'moveSpeed', pct: -0.08 },
  ],
  onCombatInit: (ctx) => {
    ctx.player.radius = 32;
  },
};

// #32
const eiskalt: AugmentDef = {
  id: 'eiskalt',
  name: 'Eiskalt',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Deine Angriffe verlangsamen Getroffene um 15% (1s).',
  hooks: {
    autoHit: ({ target }, ctx) => {
      target.stats.set({
        id: 'slow:eiskalt',
        stat: 'moveSpeed',
        pct: -0.15 * ctx.power(eiskalt),
        expiresAt: ctx.combat.now + 1000,
      });
    },
  },
};

// #33
const feuerband: AugmentDef = {
  id: 'feuerband',
  name: 'Feuerband',
  tier: 'silber',
  tags: ['Bruch'],
  description: 'Brennende Gegner sind um 20% verlangsamt.',
  onUpdate: (_dt, ctx) => {
    for (const u of ctx.combat.units) {
      if (!u.alive || u.team !== 'enemy') continue;
      if (u.burns.length > 0) {
        u.stats.set({
          id: 'slow:feuerband',
          stat: 'moveSpeed',
          pct: -0.2 * ctx.power(feuerband),
          expiresAt: ctx.combat.now + 300,
        });
      }
    }
  },
};

// #34
const adrenalin: AugmentDef = {
  id: 'adrenalin',
  name: 'Adrenalin',
  tier: 'silber',
  tags: ['Sturm'],
  description: 'Erlittener Schaden gewährt +18% Tempo für 1,5s.',
  hooks: {
    damageTaken: (_p, ctx) => {
      ctx.player.stats.set({
        id: 'buff:adrenalin',
        stat: 'moveSpeed',
        pct: 0.18 * ctx.power(adrenalin),
        expiresAt: ctx.combat.now + 1500,
      });
    },
  },
};

// #35
const mystischerHieb: AugmentDef = {
  id: 'mystischerhieb',
  name: 'Mystischer Hieb',
  tier: 'silber',
  tags: ['Arkan'],
  description: 'Fähigkeitstreffer verkürzen deine Abklingzeiten um 0,5s.',
  hooks: {
    abilityHit: (_p, ctx) => ctx.player.reduceCooldowns(500 * ctx.power(mystischerHieb)),
  },
};

// #36
const seelenraub: AugmentDef = {
  id: 'seelenraub',
  name: 'Seelenraub',
  tier: 'silber',
  tags: ['Blut'],
  description: '+6 max. LP pro Tötung — hält den ganzen Run.',
  onCombatInit: (ctx) => applySeelenraub(ctx),
  hooks: {
    killWindow: (_p, ctx) => {
      ctx.run.memory.seelenraubStacks = (ctx.run.memory.seelenraubStacks ?? 0) + 1;
      applySeelenraub(ctx);
      ctx.player.heal(6);
    },
  },
};

function applySeelenraub(ctx: AugmentCtx): void {
  const stacks = ctx.run.memory.seelenraubStacks ?? 0;
  const dampen = ctx.run.flags.silverHalved ? 0.5 : 1;
  ctx.player.stats.set({ id: 'perm:seelenraub', stat: 'maxHP', flat: stacks * 6 * dampen });
}

// #37
const blutdurst: AugmentDef = {
  id: 'blutdurst',
  name: 'Blutdurst',
  tier: 'silber',
  tags: ['Blut'],
  description: 'Tötungen heilen dich sofort um 20% deiner max. LP.',
  hooks: {
    killWindow: (_p, ctx) => ctx.player.heal(ctx.player.maxHP * 0.2 * ctx.power(blutdurst)),
  },
};

// #38
const panzerung: AugmentDef = {
  id: 'panzerung',
  name: 'Panzerung',
  tier: 'silber',
  tags: ['Ward'],
  description: '+14 Rüstung und +14 Magieresistenz.',
  statMods: [
    { stat: 'armor', flat: 14 },
    { stat: 'magicResist', flat: 14 },
  ],
};

// #39
const riesentoeter: AugmentDef = {
  id: 'riesentoeter',
  name: 'Riesentöter',
  tier: 'gold',
  tags: ['Bruch'],
  description: 'Gegen Gegner mit mehr als 400 max. LP: +18% Schaden.',
  hooks: {
    damageDealt: ({ target, dmg, type }, ctx) => {
      if (type === 'other' || !target.alive || target.maxHP <= 400) return;
      if ((ctx.run.memory.riesentoeterLock ?? 0) > ctx.combat.now) return;
      ctx.run.memory.riesentoeterLock = ctx.combat.now + 30; // one echo per hit
      ctx.combat.dealDamage(ctx.player, target, dmg * 0.18 * ctx.power(riesentoeter), 'other');
    },
  },
};

// #40
const frostgeboren: AugmentDef = {
  id: 'frostgeboren',
  name: 'Frostgeboren',
  tier: 'gold',
  tags: ['Arkan'],
  description: 'Verlangsamte Gegner erleiden 15% mehr Schaden von dir.',
  hooks: {
    damageDealt: ({ target, dmg, type }, ctx) => {
      if (type === 'other' || !target.alive) return;
      if (!target.stats.hasPrefix('slow:')) return;
      if ((ctx.run.memory.frostgebLock ?? 0) > ctx.combat.now) return;
      ctx.run.memory.frostgebLock = ctx.combat.now + 30;
      ctx.combat.dealDamage(ctx.player, target, dmg * 0.15 * ctx.power(frostgeboren), 'other');
    },
  },
};

// #41
const kampfrausch: AugmentDef = {
  id: 'kampfrausch',
  name: 'Kampfrausch',
  tier: 'gold',
  tags: ['Blut'],
  description: 'Bis zu +60% Angriffstempo — je weniger LP, desto mehr.',
  onUpdate: (_dt, ctx) => {
    const missing = 1 - ctx.player.hpPct;
    ctx.player.stats.set({
      id: 'dyn:kampfrausch',
      stat: 'attackSpeed',
      pct: 0.6 * missing * ctx.power(kampfrausch),
    });
  },
};

// #42
const standhaft: AugmentDef = {
  id: 'standhaft',
  name: 'Standhaft',
  tier: 'gold',
  tags: ['Ward'],
  description: 'Solange du stillstehst: +25 Rüstung und Magieresistenz.',
  onUpdate: (_dt, ctx) => {
    if (ctx.player.isStationary) {
      const v = 25 * ctx.power(standhaft);
      ctx.player.stats.set({ id: 'dyn:standhaft-r', stat: 'armor', flat: v });
      ctx.player.stats.set({ id: 'dyn:standhaft-m', stat: 'magicResist', flat: v });
    } else {
      ctx.player.stats.remove('dyn:standhaft-r');
      ctx.player.stats.remove('dyn:standhaft-m');
    }
  },
};

// #43
const ueberheilung: AugmentDef = {
  id: 'ueberheilung',
  name: 'Überheilung',
  tier: 'gold',
  tags: ['Blut', 'Ward'],
  description: 'Bei vollen LP wandelt sich Heilkraft in einen Schild (bis 25% max. LP).',
  onUpdate: (dt, ctx) => {
    const p = ctx.player;
    if (p.hpPct >= 0.995 && p.shield < p.maxHP * 0.25) {
      p.shield = Math.min(p.maxHP * 0.25, p.shield + p.maxHP * 0.03 * dt * ctx.power(ueberheilung));
    }
  },
};

// #44
const zeitgewinn: AugmentDef = {
  id: 'zeitgewinn',
  name: 'Zeitgewinn',
  tier: 'gold',
  tags: ['Arkan'],
  description: '+35 Fähigkeitentempo.',
  statMods: [{ stat: 'abilityHaste', flat: 35 }],
};

// #45
const blitzschlaege: AugmentDef = {
  id: 'blitzschlaege',
  name: 'Blitzschläge',
  tier: 'gold',
  tags: ['Bruch', 'Arkan'],
  description: 'Alle 5s trifft ein Blitz den nächsten Gegner (26 Schaden, magisch).',
  onCombatInit: (ctx) => {
    ctx.run.memory.blitzNextAt = ctx.combat.now + 3000;
  },
  onUpdate: (_dt, ctx) => {
    if (ctx.combat.now < (ctx.run.memory.blitzNextAt ?? 0)) return;
    const t = ctx.combat.nearestEnemy(ctx.player, 750);
    if (!t) return;
    ctx.run.memory.blitzNextAt = ctx.combat.now + 5000;
    ctx.combat.flashLine(t.x, t.y - 500, t.x, t.y, 0xaaddff);
    ctx.combat.ring(t.x, t.y, 0xaaddff, 80);
    ctx.combat.dealDamage(ctx.player, t, 26 * ctx.power(blitzschlaege), 'ability', 'magisch');
  },
};

// #46
const juwelenhandschuh: AugmentDef = {
  id: 'juwelenhandschuh',
  name: 'Juwelenhandschuh',
  tier: 'gold',
  tags: ['Arkan'],
  description: 'Deine Fähigkeiten können kritisch treffen (+75% Schaden). +10% Kritchance.',
  statMods: [{ stat: 'critChance', flat: 0.1 }],
  hooks: {
    abilityHit: ({ target, dmg }, ctx) => {
      if (!target.alive) return;
      if (Math.random() < ctx.player.stats.get('critChance')) {
        ctx.combat.dealDamage(ctx.player, target, dmg * 0.75 * ctx.power(juwelenhandschuh), 'other');
        ctx.combat.ring(target.x, target.y, 0xffffff, 46);
      }
    },
  },
};

// #47
const erdstoss: AugmentDef = {
  id: 'erdstoss',
  name: 'Erdstoß',
  tier: 'gold',
  tags: ['Sturm', 'Bruch'],
  description: 'Am Ende deines Dashs bricht der Boden: 22 Schaden im Umkreis.',
  hooks: {
    dashEnd: (_p, ctx) => {
      const dmg = (22 + 0.3 * ctx.player.stats.get('damage')) * ctx.power(erdstoss);
      ctx.combat.ring(ctx.player.x, ctx.player.y, 0xcc9955, 210);
      for (const u of [...ctx.combat.units]) {
        if (!u.alive || u.team !== 'enemy') continue;
        if (Math.hypot(u.x - ctx.player.x, u.y - ctx.player.y) > 210) continue;
        ctx.combat.dealDamage(ctx.player, u, dmg, 'ability', 'physisch');
      }
    },
  },
};

// #48
const doppelherz: AugmentDef = {
  id: 'doppelherz',
  name: 'Doppelherz',
  tier: 'gold',
  tags: ['Blut', 'Ward'],
  description: '+40 max. LP. Unter 30% LP regenerierst du 6 LP/s.',
  statMods: [{ stat: 'maxHP', flat: 40 }],
  onUpdate: (dt, ctx) => {
    if (ctx.player.hpPct < 0.3) ctx.player.heal(6 * dt * ctx.power(doppelherz));
  },
};

// #49
const phoenixherz: AugmentDef = {
  id: 'phoenixherz',
  name: 'Phönixherz',
  tier: 'prisma',
  tags: ['Blut', 'Ward'],
  description: 'Einmal pro Run: Stirbst du, erhebst du dich mit 50% LP erneut.',
  ruleFlags: { revives: 1 },
};

// #50
const gigant: AugmentDef = {
  id: 'gigant',
  name: 'Gigant',
  tier: 'prisma',
  tags: ['Ward', 'Bruch'],
  description: '+120% max. LP und +30% Schaden. Dafür −15% Tempo und ein riesiges Ziel.',
  statMods: [
    { stat: 'maxHP', pct: 1.2 },
    { stat: 'damage', pct: 0.3 },
    { stat: 'abilityDamage', pct: 0.3 },
    { stat: 'moveSpeed', pct: -0.15 },
  ],
  onCombatInit: (ctx) => {
    ctx.player.radius = 38;
  },
};

// #51
const zeitraffer: AugmentDef = {
  id: 'zeitraffer',
  name: 'Zeitraffer',
  tier: 'prisma',
  tags: ['Arkan'],
  description: '+90 Fähigkeitentempo — Fähigkeiten sind fast immer bereit.',
  statMods: [{ stat: 'abilityHaste', flat: 90 }],
};

// #52
const kometenruf: AugmentDef = {
  id: 'kometenruf',
  name: 'Kometenruf',
  tier: 'prisma',
  tags: ['Arkan', 'Bruch'],
  description: 'Jede Fähigkeit ruft einen Kometen auf den nächsten Gegner (32 + AP, magisch).',
  hooks: {
    abilityCast: (_p, ctx) => {
      const t = ctx.combat.nearestEnemy(ctx.player, 800);
      if (!t) return;
      const tx = t.x;
      const ty = t.y;
      ctx.combat.ring(tx, ty, 0x9fb8ff, 110);
      ctx.combat.delay(600, () => {
        ctx.combat.flashLine(tx, ty - 560, tx, ty, 0x9fb8ff);
        ctx.combat.ring(tx, ty, 0x9fb8ff, 130);
        const dmg = (32 + ctx.player.stats.get('abilityPower')) * ctx.power(kometenruf);
        for (const u of [...ctx.combat.units]) {
          if (!u.alive || u.team !== 'enemy') continue;
          if (Math.hypot(u.x - tx, u.y - ty) > 130) continue;
          ctx.combat.dealDamage(ctx.player, u, dmg, 'ability', 'magisch');
        }
      });
    },
  },
};

// #53
const vampirfuerst: AugmentDef = {
  id: 'vampirfuerst',
  name: 'Vampirfürst',
  tier: 'prisma',
  tags: ['Blut'],
  description: '+22% Lebensraub auf allen Schaden.',
  statMods: [{ stat: 'lifesteal', flat: 0.22 }],
};

export const AUGMENTS: AugmentDef[] = [
  // Silber
  blutzoll,
  brandmal,
  koenigsbann,
  kuehlung,
  sturmschritt,
  bollwerk,
  blutrausch,
  splitterwurf,
  schwungmasse,
  dornenkrone,
  weitschuss,
  nachbrenner,
  // Gold
  kettenblitz,
  echo,
  doppeltritt,
  phasensprung,
  blutpakt,
  ueberladung,
  zweiterWind,
  henkersblick,
  blutmond,
  schattenzwilling,
  bannkreis,
  narrenwuerfel,
  // Prisma
  kronlos,
  zeitdieb,
  glaskanone,
  spiegelkoenig,
  ewigeFlamme,
  doppelkrone,
  // Arena-Expansion
  goliath,
  eiskalt,
  feuerband,
  adrenalin,
  mystischerHieb,
  seelenraub,
  blutdurst,
  panzerung,
  riesentoeter,
  frostgeboren,
  kampfrausch,
  standhaft,
  ueberheilung,
  zeitgewinn,
  blitzschlaege,
  juwelenhandschuh,
  erdstoss,
  doppelherz,
  phoenixherz,
  gigant,
  zeitraffer,
  kometenruf,
  vampirfuerst,
];

export function augmentById(id: string): AugmentDef | undefined {
  return AUGMENTS.find((a) => a.id === id);
}
