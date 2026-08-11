import type Phaser from 'phaser';
import { EnemyConfig, Enemy, EnemyAbilitySpec } from './Enemy';
import { COLORS } from '../config';
import { AUGMENTS } from '../augments/registry';
import { ACTIVE_CHAMPIONS } from '../champions/registry';
import { rivalAbilitiesFor } from '../champions/rivalKits';
import { run } from '../core/run';
import { clampToArena, resolvePillars } from '../core/geometry';

/** Valid blink destination: inside the arena, outside any pillar. */
function clampBlink(x: number, y: number, r: number): { x: number; y: number } {
  const p = resolvePillars(x, y, r);
  return clampToArena(p.x, p.y, r);
}

/** Per-round difficulty knobs applied to archetype templates. */
export interface DifficultyScale {
  hp: number; // multiplier
  dmg: number; // multiplier
  reactionMs: number; // dodge reaction delay (lower = harder)
  dodgeChance: number;
  /** LoL-like defenses, rising per round. */
  armor: number;
  mr: number;
}

// ---- Shared ability builders ----

function lungeAbility(dmg: number, opts?: Partial<EnemyAbilitySpec>): EnemyAbilitySpec {
  return {
    id: 'lunge',
    cd: 5200,
    condition: (_e, d) => d >= 140 && d <= 470,
    telegraphMs: 520,
    drawTelegraph: (e, g, prog) => {
      const L = 430;
      const a = e.telegraphAim;
      g.fillStyle(COLORS.telegraph, 0.16 + prog * 0.22);
      const w = 34;
      g.fillTriangle(
        e.x - a.y * w, e.y + a.x * w,
        e.x + a.y * w, e.y - a.x * w,
        e.x + a.x * L * prog, e.y + a.y * L * prog,
      );
      g.lineStyle(3, COLORS.telegraph, 0.8);
      g.strokeCircle(e.x, e.y, e.radius + 6);
    },
    execute: (e) => {
      e.startLunge({
        dir: { ...e.telegraphAim },
        speed: 1150,
        remaining: 440,
        hit: false,
        onImpact: (en, t) => en.combat.dealDamage(en, t, dmg * en.dmgScale(), 'auto'),
      });
    },
    ...opts,
  };
}

function skillshotAbility(dmg: number, opts?: Partial<EnemyAbilitySpec>): EnemyAbilitySpec {
  return {
    id: 'skillshot',
    cd: 4200,
    condition: (_e, d) => d >= 180 && d <= 700,
    telegraphMs: 600,
    drawTelegraph: (e, g, prog) => {
      const a = e.telegraphAim;
      const L = 760;
      g.lineStyle(6 + prog * 8, COLORS.telegraph, 0.25 + prog * 0.3);
      g.beginPath();
      g.moveTo(e.x, e.y);
      g.lineTo(e.x + a.x * L, e.y + a.y * L);
      g.strokePath();
    },
    execute: (e) => {
      e.combat.spawnProjectile({
        x: e.x + e.telegraphAim.x * (e.radius + 8),
        y: e.y + e.telegraphAim.y * (e.radius + 8),
        dirX: e.telegraphAim.x,
        dirY: e.telegraphAim.y,
        speed: 1000,
        radius: 13,
        color: COLORS.enemyProj,
        team: 'enemy',
        maxDist: 800,
        onHit: (t) => e.combat.dealDamage(e, t, dmg * e.dmgScale(), 'ability'),
      });
    },
    ...opts,
  };
}

function slamAbility(dmg: number, radius: number, opts?: Partial<EnemyAbilitySpec>): EnemyAbilitySpec {
  return {
    id: 'slam',
    cd: 6500,
    condition: (_e, d) => d <= radius + 60,
    telegraphMs: 850,
    drawTelegraph: (e, g, prog) => {
      g.lineStyle(4, COLORS.telegraph, 0.9);
      g.strokeCircle(e.x, e.y, radius);
      g.fillStyle(COLORS.telegraph, 0.10 + prog * 0.25);
      g.fillCircle(e.x, e.y, radius * prog);
    },
    execute: (e) => {
      const t = e.target;
      const dx = t.x - e.x;
      const dy = t.y - e.y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius + t.radius) {
        e.combat.dealDamage(e, t, dmg * e.dmgScale(), 'ability');
      }
      e.memory.slamFlash = e.combat.now;
    },
    ...opts,
  };
}

/** Summon 2 Diener when dropping below hpPct (once per fight). */
function summonAbility(hpPct: number, s: DifficultyScale): EnemyAbilitySpec {
  return {
    id: 'summon',
    cd: 1000,
    condition: (e) => e.hpPct <= hpPct && !e.memory.summoned,
    telegraphMs: 700,
    drawTelegraph: (e, g, prog) => {
      g.lineStyle(4, 0xffaa55, 0.5 + prog * 0.5);
      g.strokeCircle(e.x, e.y, e.radius + 14 + prog * 24);
    },
    execute: (e) => {
      e.memory.summoned = 1;
      for (const off of [-70, 70]) {
        e.combat.spawnEnemyUnit(makeDiener(s), e.x + off, e.y);
      }
    },
  };
}

// ---- Archetypes ----

export function makeHaescher(s: DifficultyScale): EnemyConfig {
  return {
    name: 'Stalker',
    kind: 'haescher',
    radius: 26,
    color: COLORS.enemy,
    darkColor: COLORS.enemyDark,
    stats: { maxHP: 240 * s.hp, moveSpeed: 270, damage: s.dmg, armor: s.armor + 4, magicResist: s.mr },
    preferredRange: 40,
    rangeBand: 30,
    reactionMs: s.reactionMs,
    dodgeChance: s.dodgeChance,
    aggression: 0.8,
    melee: { range: 55, dmg: 15, intervalMs: 900 },
    abilities: [lungeAbility(26)],
  };
}

export function makeSchuetze(s: DifficultyScale): EnemyConfig {
  return {
    name: 'Marksman',
    kind: 'schuetze',
    radius: 24,
    color: 0xe0663c,
    darkColor: 0x8b3a1a,
    stats: { maxHP: 190 * s.hp, moveSpeed: 285, damage: s.dmg, armor: s.armor, magicResist: s.mr },
    preferredRange: 380,
    rangeBand: 70,
    reactionMs: s.reactionMs,
    dodgeChance: Math.min(0.9, s.dodgeChance + 0.15),
    aggression: 0.55,
    rangedAuto: { range: 520, dmg: 9, intervalMs: 1050, projSpeed: 780 },
    abilities: [
      skillshotAbility(24),
      {
        // Fächersalve: five arrows in a fan — punishes standing in front
        id: 'salve',
        cd: 8000,
        condition: (_e, d) => d >= 220 && d <= 620,
        telegraphMs: 700,
        drawTelegraph: (e, g, prog) => {
          const a = e.telegraphAim;
          const base = Math.atan2(a.y, a.x);
          g.lineStyle(3, COLORS.telegraph, 0.2 + prog * 0.5);
          for (const off of [-0.5, -0.25, 0, 0.25, 0.5]) {
            g.beginPath();
            g.moveTo(e.x, e.y);
            g.lineTo(e.x + Math.cos(base + off) * 600, e.y + Math.sin(base + off) * 600);
            g.strokePath();
          }
        },
        execute: (e) => {
          const base = Math.atan2(e.telegraphAim.y, e.telegraphAim.x);
          for (const off of [-0.5, -0.25, 0, 0.25, 0.5]) {
            e.combat.spawnProjectile({
              x: e.x,
              y: e.y,
              dirX: Math.cos(base + off),
              dirY: Math.sin(base + off),
              speed: 880,
              radius: 10,
              color: COLORS.enemyProj,
              team: 'enemy',
              maxDist: 660,
              onHit: (t) => e.combat.dealDamage(e, t, 12 * e.dmgScale(), 'ability'),
            });
          }
        },
      },
    ],
  };
}

export function makeBerserker(s: DifficultyScale): EnemyConfig {
  return {
    name: 'Berserker',
    kind: 'berserker',
    radius: 28,
    color: 0xcc4422,
    darkColor: 0x661a0a,
    stats: { maxHP: 300 * s.hp, moveSpeed: 265, damage: s.dmg * 1.1, armor: s.armor + 2, magicResist: s.mr },
    preferredRange: 45,
    rangeBand: 30,
    reactionMs: s.reactionMs + 60,
    dodgeChance: Math.max(0.1, s.dodgeChance - 0.15),
    aggression: 0.95,
    melee: { range: 60, dmg: 17, intervalMs: 950 },
    abilities: [
      lungeAbility(24, { cd: 6000 }),
      {
        // Blutwut: below 50% HP he snaps — faster, harder, angrier (once)
        id: 'blutwut',
        cd: 500,
        condition: (e) => e.hpPct <= 0.5 && !e.memory.wut,
        telegraphMs: 500,
        drawTelegraph: (e, g, prog) => {
          g.lineStyle(4, 0xff2200, 0.4 + prog * 0.6);
          g.strokeCircle(e.x, e.y, e.radius + 8 + prog * 16);
        },
        execute: (e) => {
          e.memory.wut = 1;
          e.stats.set({ id: 'buff:wut-ms', stat: 'moveSpeed', pct: 0.35 });
          e.stats.set({ id: 'buff:wut-dmg', stat: 'damage', pct: 0.3 });
          e.combat.announce('Der Berserker rast!', '#ff5533');
        },
      },
    ],
  };
}

export function makeSpeermaid(s: DifficultyScale): EnemyConfig {
  return {
    name: 'Spearmaiden',
    kind: 'speermaid',
    radius: 24,
    color: 0x44aa88,
    darkColor: 0x1a5540,
    stats: { maxHP: 210 * s.hp, moveSpeed: 300, damage: s.dmg, armor: s.armor + 2, magicResist: s.mr + 4 },
    preferredRange: 320,
    rangeBand: 60,
    reactionMs: s.reactionMs,
    dodgeChance: Math.min(0.9, s.dodgeChance + 0.1),
    aggression: 0.7,
    rangedAuto: { range: 420, dmg: 8, intervalMs: 1100, projSpeed: 820 },
    abilities: [
      {
        // Durchbohrender Speer: pierces everything on its line
        id: 'speer',
        cd: 5500,
        condition: (_e, d) => d >= 160 && d <= 700,
        telegraphMs: 650,
        drawTelegraph: (e, g, prog) => {
          const a = e.telegraphAim;
          g.lineStyle(10 + prog * 6, 0x66ddb8, 0.2 + prog * 0.35);
          g.beginPath();
          g.moveTo(e.x, e.y);
          g.lineTo(e.x + a.x * 820, e.y + a.y * 820);
          g.strokePath();
        },
        execute: (e) => {
          e.combat.spawnProjectile({
            x: e.x,
            y: e.y,
            dirX: e.telegraphAim.x,
            dirY: e.telegraphAim.y,
            speed: 1150,
            radius: 12,
            color: 0x66ddb8,
            team: 'enemy',
            maxDist: 860,
            maxHits: 5,
            blockedByPillars: false,
            onHit: (t) => e.combat.dealDamage(e, t, 20 * e.dmgScale(), 'ability'),
          });
        },
      },
      {
        // Rückzugssprung: leaps away when cornered
        id: 'sprung',
        cd: 7000,
        condition: (_e, d) => d < 160,
        telegraphMs: 250,
        drawTelegraph: (e, g, prog) => {
          g.lineStyle(3, 0x66ddb8, 0.4 + prog * 0.6);
          g.strokeCircle(e.x, e.y, e.radius + 4 + prog * 8);
        },
        execute: (e) => {
          const t = e.target;
          const away = Math.atan2(e.y - t.y, e.x - t.x) + (Math.random() - 0.5) * 0.8;
          const p = clampBlink(e.x + Math.cos(away) * 380, e.y + Math.sin(away) * 380, e.radius);
          e.combat.flashLine(e.x, e.y, p.x, p.y, 0x66ddb8);
          e.x = p.x;
          e.y = p.y;
        },
      },
    ],
  };
}

export function makeWaechter(s: DifficultyScale): EnemyConfig {
  return {
    name: 'Warden',
    kind: 'waechter',
    radius: 38,
    color: 0xb03060,
    darkColor: 0x5c1030,
    stats: { maxHP: 520 * s.hp, moveSpeed: 205, damage: s.dmg, armor: s.armor + 12, magicResist: s.mr + 6 },
    preferredRange: 50,
    rangeBand: 35,
    reactionMs: s.reactionMs + 120, // tanks are slow to react
    dodgeChance: Math.max(0.15, s.dodgeChance - 0.2),
    aggression: 0.65,
    melee: { range: 70, dmg: 14, intervalMs: 1200 },
    abilities: [
      slamAbility(34, 165),
      summonAbility(0.6, s),
      {
        // Schockwelle: slams the ground, shoving everyone away — breaks kiting
        id: 'schockwelle',
        cd: 9000,
        condition: (_e, d) => d <= 240,
        telegraphMs: 650,
        drawTelegraph: (e, g, prog) => {
          g.lineStyle(5, 0xffaa55, 0.3 + prog * 0.5);
          g.strokeCircle(e.x, e.y, 240 * prog);
        },
        execute: (e) => {
          e.combat.ring(e.x, e.y, 0xffaa55, 260);
          const t = e.target;
          if (Math.hypot(t.x - e.x, t.y - e.y) <= 260 + t.radius) {
            e.combat.dealDamage(e, t, 14 * e.dmgScale(), 'ability');
            const d = Math.max(20, Math.hypot(t.x - e.x, t.y - e.y));
            t.moveBy(((t.x - e.x) / d) * 220, ((t.y - e.y) / d) * 220);
          }
        },
      },
    ],
  };
}

export function makeHexer(s: DifficultyScale): EnemyConfig {
  return {
    name: 'Warlock',
    kind: 'hexer',
    radius: 24,
    color: 0xb04ad0,
    darkColor: 0x5c2070,
    stats: { maxHP: 200 * s.hp, moveSpeed: 255, damage: s.dmg, armor: s.armor, magicResist: s.mr + 12 },
    preferredRange: 330,
    rangeBand: 60,
    reactionMs: s.reactionMs,
    dodgeChance: s.dodgeChance,
    aggression: 0.5,
    rangedAuto: { range: 470, dmg: 8, intervalMs: 1250, projSpeed: 720 },
    abilities: [
      {
        // Fluchzone: curses the ground under the player — punishes standing still
        id: 'fluch',
        cd: 7000,
        condition: (_e, d) => d <= 560,
        telegraphMs: 850,
        drawTelegraph: (e, g, prog) => {
          if (!e.memory.fluchSet) {
            e.memory.fluchSet = 1;
            e.memory.fluchX = e.target.x;
            e.memory.fluchY = e.target.y;
          }
          g.lineStyle(3, 0xb04ad0, 0.9);
          g.strokeCircle(e.memory.fluchX, e.memory.fluchY, 130);
          g.fillStyle(0xb04ad0, 0.08 + prog * 0.2);
          g.fillCircle(e.memory.fluchX, e.memory.fluchY, 130 * prog);
        },
        execute: (e) => {
          e.memory.fluchSet = 0;
          e.combat.addHazard({
            x: e.memory.fluchX,
            y: e.memory.fluchY,
            r: 125,
            until: e.combat.now + 2600,
            dps: 14 * e.dmgScale(),
            team: 'enemy',
            color: 0xb04ad0,
          });
        },
      },
      {
        // Blinzeln: teleports away when dived — punishes greedy chases
        id: 'blink',
        cd: 6500,
        condition: (_e, d) => d < 190,
        telegraphMs: 260,
        drawTelegraph: (e, g, prog) => {
          g.lineStyle(3, 0xd88aff, 0.5 + prog * 0.5);
          g.strokeCircle(e.x, e.y, e.radius + 6 + prog * 10);
        },
        execute: (e) => {
          const t = e.target;
          const ox = e.x;
          const oy = e.y;
          // Try a handful of far-away spots, keep the first valid one
          for (let i = 0; i < 8; i++) {
            const a = Math.atan2(e.y - t.y, e.x - t.x) + (Math.random() - 0.5) * 2.2;
            const nx = t.x + Math.cos(a) * 430;
            const ny = t.y + Math.sin(a) * 430;
            const p = clampBlink(nx, ny, e.radius);
            if (Math.hypot(p.x - t.x, p.y - t.y) > 300) {
              e.x = p.x;
              e.y = p.y;
              break;
            }
          }
          e.combat.flashLine(ox, oy, e.x, e.y, 0xd88aff);
        },
      },
    ],
  };
}

export function makeDiener(s: DifficultyScale): EnemyConfig {
  return {
    name: 'Thrall',
    kind: 'diener',
    radius: 14,
    color: 0xd06a6a,
    darkColor: 0x7a2a2a,
    stats: { maxHP: 45 * s.hp, moveSpeed: 310, damage: s.dmg, armor: 0, magicResist: 0 },
    preferredRange: 25,
    rangeBand: 20,
    reactionMs: s.reactionMs + 200,
    dodgeChance: 0.1,
    aggression: 1,
    melee: { range: 38, dmg: 6, intervalMs: 800 },
    abilities: [],
  };
}

/**
 * The Usurpator "picks" visible augments from the real pool; their tags are
 * folded into his stats so knowing them at round start actually matters.
 */
export function makeUsurpator(s: DifficultyScale, final: boolean): EnemyConfig {
  const pool = AUGMENTS.filter((a) => a.tier !== 'prisma');
  const count = final ? 4 : 2;
  const picked: typeof pool = [];
  while (picked.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }

  const cfg: EnemyConfig = {
    name: 'The Usurper',
    kind: 'usurpator',
    radius: 32,
    color: 0xcc2244,
    darkColor: 0x661022,
    stats: { maxHP: (final ? 950 : 620) * s.hp, moveSpeed: 280, damage: s.dmg * (final ? 1.15 : 1), armor: s.armor + 8, magicResist: s.mr + 8 },
    preferredRange: 220,
    rangeBand: 80,
    reactionMs: Math.max(120, s.reactionMs - 60),
    dodgeChance: Math.min(0.9, s.dodgeChance + 0.1),
    aggression: 0.9,
    rangedAuto: { range: 480, dmg: 8, intervalMs: 1200, projSpeed: 820 },
    abilities: [
      lungeAbility(30, { cd: 6000 }),
      skillshotAbility(26, { cd: 5000 }),
      slamAbility(38, 175, { cd: 8000 }),
      ...(final ? [summonAbility(0.5, s)] : []),
    ],
    visibleAugments: picked.map((a) => a.name),
  };

  // Fold augment tags into boss power — "know your enemy" has teeth
  for (const a of picked) {
    for (const tag of a.tags) {
      switch (tag) {
        case 'Blut':
          cfg.regenPctPerSec = (cfg.regenPctPerSec ?? 0) + 0.012;
          break;
        case 'Sturm':
          cfg.stats.moveSpeed = (cfg.stats.moveSpeed ?? 280) * 1.12;
          cfg.reactionMs = Math.max(100, cfg.reactionMs - 50);
          break;
        case 'Arkan':
          for (const ab of cfg.abilities) ab.cd *= 0.8;
          break;
        case 'Ward':
          cfg.stats.maxHP = (cfg.stats.maxHP ?? 600) * 1.2;
          break;
        case 'Bruch':
          cfg.stats.damage = (cfg.stats.damage ?? 1) * 1.15;
          break;
      }
    }
  }
  return cfg;
}

/**
 * Fighter-type enemies appear as random rival champions from the roster:
 * melee kinds draw a melee champion, ranged kinds a ranged one, and the
 * player's own pick is excluded. Wardens, thralls and the boss keep their
 * monster identity. Behaviour/stats stay the archetype's — this is a skin.
 */
const RIVAL_KINDS: Record<string, 'melee' | 'ranged'> = {
  haescher: 'melee',
  berserker: 'melee',
  speermaid: 'melee',
  schuetze: 'ranged',
  hexer: 'ranged',
};

/**
 * Dress ONE marked enemy as a rival champion, and make it a real threat.
 *
 * This used to dress every fighter-type enemy, which meant a wave was five
 * champions borrowing five signature kits and no plain enemies at all — so
 * there was nothing with a simple readable attack to learn against, and a
 * champion carried no weight because every enemy was one. Now the roster shows
 * up as an occasional mini-boss: rarer, and worth being afraid of.
 */
function dressAsRival(cfg: EnemyConfig): EnemyConfig {
  const style = RIVAL_KINDS[cfg.kind];
  if (!cfg.elite || !style || cfg.championSprite) return cfg;
  // ACTIVE_CHAMPIONS, not CHAMPIONS: the 26 retired League-derived entries are
  // still in the registry for reference, and an elite must never be one of them.
  const pool = ACTIVE_CHAMPIONS.filter(
    (c) => c.id !== run.champion && (style === 'melee' ? !c.ranged : c.ranged),
  );
  if (pool.length === 0) return cfg;
  const champ = pool[Math.floor(Math.random() * pool.length)];
  // Borrow the champion's signature ability so the rival actually fights like
  // them; fall back to the archetype's kit if none is defined.
  const abilities = rivalAbilitiesFor(champ.id) ?? cfg.abilities;
  // A mini-boss has to read as one: bigger, tougher, hits harder, presses more.
  const stats = { ...cfg.stats };
  stats.maxHP = (stats.maxHP ?? 100) * 3.2;
  stats.damage = (stats.damage ?? 10) * 1.5;
  return {
    ...cfg,
    championSprite: champ.id,
    name: champ.name,
    abilities,
    stats,
    radius: Math.round(cfg.radius * 1.25),
    aggression: Math.min(1, cfg.aggression + 0.2),
  };
}

export function spawnEnemy(
  scene: Phaser.Scene,
  combat: Enemy['combat'],
  x: number,
  y: number,
  cfg: EnemyConfig,
): Enemy {
  return new Enemy(scene, combat, x, y, dressAsRival(cfg));
}
