import { EnemyConfig } from '../entities/Enemy';
import { DifficultyScale, makeHaescher } from '../entities/enemies';

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
}

/**
 * Composition per round.
 * M5 note: only the Häscher archetype exists yet, so every round fields
 * Häscher variants (duos from R5). M6 swaps in Schütze/Wächter/Usurpator.
 */
export function roundSpec(round: number): RoundSpec {
  const s = roundScale(round);
  const duo = round >= 5 && round <= 7;
  return {
    enemies: duo ? [makeHaescher(s), makeHaescher(s)] : [makeHaescher(s)],
    boss: round === 4 || round === 8,
    title: `Runde ${round}`,
  };
}
