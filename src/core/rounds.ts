import { EnemyConfig } from '../entities/Enemy';
import {
  DifficultyScale,
  makeBerserker,
  makeHaescher,
  makeHexer,
  makeSchuetze,
  makeSpeermaid,
  makeUsurpator,
  makeWaechter,
} from '../entities/enemies';
import { MapDef, rollMap } from './maps';

export const MAX_ROUND = 20;

export type ModifierId = 'feuerring' | 'heilblumen' | 'bruchzone' | 'blitzsturm';

export const MODIFIER_NAMES: Record<ModifierId, string> = {
  feuerring: 'Feuerring',
  heilblumen: 'Heilblumen',
  bruchzone: 'Bruchzone',
  blitzsturm: 'Blitzsturm',
};

/**
 * Per-round difficulty. Linear ramp through the 20-round gauntlet; past
 * round 20 (Endlosmodus) enemies scale EXPONENTIALLY — the run always
 * ends eventually, the question is how deep you get.
 */
export function roundScale(round: number): DifficultyScale {
  const capped = Math.min(round, MAX_ROUND);
  const base: DifficultyScale = {
    hp: 1 + 0.15 * (capped - 1),
    dmg: 1 + 0.1 * (capped - 1),
    reactionMs: Math.max(110, 400 - 16 * (capped - 1)),
    dodgeChance: Math.min(0.9, 0.4 + 0.028 * capped),
    armor: 4 + 1.8 * (capped - 1),
    mr: 4 + 1.8 * (capped - 1),
  };
  if (round > MAX_ROUND) {
    const over = round - MAX_ROUND;
    base.hp *= Math.pow(1.16, over);
    base.dmg *= Math.pow(1.1, over);
    base.armor += 3 * over;
    base.mr += 3 * over;
    base.reactionMs = Math.max(90, base.reactionMs - 2 * over);
  }
  return base;
}

export interface RoundSpec {
  enemies: EnemyConfig[];
  boss: boolean;
  title: string;
  map: MapDef;
  /** Usurpator's visible augments, shown at round start. */
  bossAugments?: string[];
  /** Arena modifier, one per round from R5 on. */
  modifier?: ModifierId;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const BUILDERS = [makeHaescher, makeSchuetze, makeHexer, makeWaechter, makeBerserker, makeSpeermaid];

/** Random squad of n distinct-ish archetypes. */
function squad(n: number, s: DifficultyScale): EnemyConfig[] {
  const out: EnemyConfig[] = [];
  const bag = [...BUILDERS];
  for (let i = 0; i < n; i++) {
    if (bag.length === 0) bag.push(...BUILDERS);
    const b = bag.splice(Math.floor(Math.random() * bag.length), 1)[0];
    out.push(b(s));
  }
  return out;
}

/**
 * 20-round gauntlet with one life. Bosses at 7 / 14 / 20; squads grow from
 * solos to trios. Past 20 the Endlosmodus rolls ever-larger squads against
 * exponentially scaling stats, with a boss every 5th round.
 */
export function roundSpec(round: number): RoundSpec {
  const s = roundScale(round);
  const map = rollMap();
  const modifier =
    round >= 5
      ? pick<ModifierId>(['feuerring', 'heilblumen', 'bruchzone', 'blitzsturm'])
      : undefined;

  // Endless mode: exponential squads, boss every 5th round
  if (round > MAX_ROUND) {
    if (round % 5 === 0) {
      const boss = makeUsurpator(s, true);
      return {
        enemies: [boss, ...squad(2 + Math.floor((round - MAX_ROUND) / 10), s)],
        boss: true,
        title: `Endless ${round} — The Usurper`,
        map,
        bossAugments: boss.visibleAugments,
        modifier,
      };
    }
    const n = Math.min(7, 3 + Math.floor((round - MAX_ROUND - 1) / 6));
    return { enemies: squad(n, s), boss: false, title: `Endless ${round}`, map, modifier };
  }

  if (round === 7 || round === 14 || round === MAX_ROUND) {
    const final = round === MAX_ROUND;
    const boss = makeUsurpator(s, final);
    return {
      enemies: round === 14 ? [boss, ...squad(2, s)] : [boss, ...(final ? squad(2, s) : [])],
      boss: true,
      title: `Round ${round} — The Usurper`,
      map,
      bossAugments: boss.visibleAugments,
      modifier,
    };
  }

  let enemies: EnemyConfig[];
  if (round <= 2) enemies = [pick([makeHaescher, makeSchuetze, makeHexer])(s)]; // gentle intro
  else if (round === 3) enemies = squad(2, s);
  else if (round === 4) enemies = [makeBerserker(s), makeSpeermaid(s)];
  else if (round <= 6) enemies = squad(3, s);
  else if (round <= 10) enemies = squad(3, s);
  else if (round <= 13) enemies = squad(4, s);
  else if (round <= 17) enemies = squad(4, s);
  else enemies = squad(5, s);

  return { enemies, boss: false, title: `Round ${round}`, map, modifier };
}
