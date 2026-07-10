import type Phaser from 'phaser';
import { EnemyConfig, Enemy } from './Enemy';
import { COLORS } from '../config';

/** Per-round difficulty knobs applied to archetype templates. */
export interface DifficultyScale {
  hp: number; // multiplier
  dmg: number; // multiplier
  reactionMs: number; // dodge reaction delay (lower = harder)
  dodgeChance: number;
}

export const SCALE_R1: DifficultyScale = { hp: 1, dmg: 1, reactionMs: 380, dodgeChance: 0.45 };

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
    abilities: [
      {
        id: 'lunge',
        cd: 5200,
        condition: (_e, d) => d >= 140 && d <= 470,
        telegraphMs: 520,
        drawTelegraph: (e, g, prog) => {
          const L = 430;
          const a = e.telegraphAim;
          g.fillStyle(COLORS.telegraph, 0.16 + prog * 0.22);
          // Widening strip toward the locked aim
          const w = 34;
          const px = -a.y * w;
          const py = a.x * w;
          g.fillTriangle(
            e.x + px, e.y + py,
            e.x - px, e.y - py,
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
            onImpact: (en, t) => en.combat.dealDamage(en, t, 26 * en.dmgScale(), 'auto'),
          });
        },
      },
    ],
  };
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
