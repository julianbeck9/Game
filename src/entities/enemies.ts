import type Phaser from 'phaser';
import { EnemyConfig, Enemy, EnemyAbilitySpec } from './Enemy';
import { COLORS } from '../config';
import { AUGMENTS } from '../augments/registry';
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
    name: 'Häscher',
    kind: 'haescher',
    radius: 26,
    color: COLORS.enemy,
    darkColor: COLORS.enemyDark,
    stats: { maxHP: 240 * s.hp, moveSpeed: 270, damage: s.dmg },
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
    name: 'Schütze',
    kind: 'schuetze',
    radius: 24,
    color: 0xe0663c,
    darkColor: 0x8b3a1a,
    stats: { maxHP: 190 * s.hp, moveSpeed: 285, damage: s.dmg },
    preferredRange: 380,
    rangeBand: 70,
    reactionMs: s.reactionMs,
    dodgeChance: Math.min(0.9, s.dodgeChance + 0.15),
    aggression: 0.55,
    rangedAuto: { range: 520, dmg: 9, intervalMs: 1050, projSpeed: 780 },
    abilities: [skillshotAbility(24)],
  };
}

export function makeWaechter(s: DifficultyScale): EnemyConfig {
  return {
    name: 'Wächter',
    kind: 'waechter',
    radius: 38,
    color: 0xb03060,
    darkColor: 0x5c1030,
    stats: { maxHP: 520 * s.hp, moveSpeed: 205, damage: s.dmg },
    preferredRange: 50,
    rangeBand: 35,
    reactionMs: s.reactionMs + 120, // tanks are slow to react
    dodgeChance: Math.max(0.15, s.dodgeChance - 0.2),
    aggression: 0.65,
    melee: { range: 70, dmg: 14, intervalMs: 1200 },
    abilities: [slamAbility(34, 165), summonAbility(0.6, s)],
  };
}

export function makeHexer(s: DifficultyScale): EnemyConfig {
  return {
    name: 'Hexer',
    kind: 'hexer',
    radius: 24,
    color: 0xb04ad0,
    darkColor: 0x5c2070,
    stats: { maxHP: 200 * s.hp, moveSpeed: 255, damage: s.dmg },
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
    name: 'Diener',
    kind: 'diener',
    radius: 14,
    color: 0xd06a6a,
    darkColor: 0x7a2a2a,
    stats: { maxHP: 45 * s.hp, moveSpeed: 310, damage: s.dmg },
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
    name: 'Usurpator',
    kind: 'usurpator',
    radius: 32,
    color: 0xcc2244,
    darkColor: 0x661022,
    stats: { maxHP: (final ? 950 : 620) * s.hp, moveSpeed: 280, damage: s.dmg * (final ? 1.15 : 1) },
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

export function spawnEnemy(
  scene: Phaser.Scene,
  combat: Enemy['combat'],
  x: number,
  y: number,
  cfg: EnemyConfig,
): Enemy {
  return new Enemy(scene, combat, x, y, cfg);
}
