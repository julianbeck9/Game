import { EnemyConfig } from '../entities/Enemy';
import {
  DifficultyScale,
  makeHaescher,
  makeSchuetze,
  makeUsurpator,
  makeWaechter,
} from '../entities/enemies';

export const MAX_ROUND = 8;

/** Run-HP cost of losing a round: R1–3 −15 · R4–6 −25 · R7–8 −40. */
export function lossCost(round: number): number {
  if (round <= 3) return 15;
  if (round <= 6) return 25;
  return 40;
}

/** Per-round difficulty: stats up, reaction time down, dodges up. */
export function roundScale(round: number): DifficultyScale {
  return {
    hp: 1 + 0.16 * (round - 1),
    dmg: 1 + 0.11 * (round - 1),
    reactionMs: Math.max(140, 400 - 30 * (round - 1)),
    dodgeChance: Math.min(0.85, 0.42 + 0.05 * round),
  };
}

export interface RoundSpec {
  enemies: EnemyConfig[];
  boss: boolean;
  title: string;
  /** Usurpator's visible augments, shown at round start. */
  bossAugments?: string[];
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Run structure: R1 Häscher · R2 Schütze · R3 Wächter · R4 Usurpator (mini)
 * · R5–7 escalating duos · R8 Usurpator (final).
 * Duos + Diener summons keep the on-kill augment economy fueled.
 */
export function roundSpec(round: number): RoundSpec {
  const s = roundScale(round);

  if (round === 4 || round === 8) {
    const boss = makeUsurpator(s, round === 8);
    return {
      enemies: [boss],
      boss: true,
      title: `Runde ${round} — Der Usurpator`,
      bossAugments: boss.visibleAugments,
    };
  }

  let enemies: EnemyConfig[];
  switch (round) {
    case 1:
      enemies = [makeHaescher(s)];
      break;
    case 2:
      enemies = [makeSchuetze(s)];
      break;
    case 3:
      enemies = [makeWaechter(s)];
      break;
    case 5:
      enemies = [makeHaescher(s), makeSchuetze(s)];
      break;
    case 6:
      enemies = pick([
        [makeSchuetze(s), makeWaechter(s)],
        [makeHaescher(s), makeWaechter(s)],
        [makeHaescher(s), makeSchuetze(s)],
      ]);
      break;
    default: // 7
      enemies = pick([
        [makeWaechter(s), makeSchuetze(s)],
        [makeWaechter(s), makeHaescher(s)],
        [makeSchuetze(s), makeSchuetze(s)],
      ]);
      break;
  }
  return { enemies, boss: false, title: `Runde ${round}` };
}
