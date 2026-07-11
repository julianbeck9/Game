import { EnemyConfig } from '../entities/Enemy';
import {
  DifficultyScale,
  makeHaescher,
  makeHexer,
  makeSchuetze,
  makeUsurpator,
  makeWaechter,
} from '../entities/enemies';

export const MAX_ROUND = 12;

export type ModifierId = 'feuerring' | 'heilblumen' | 'bruchzone' | 'blitzsturm';

export const MODIFIER_NAMES: Record<ModifierId, string> = {
  feuerring: 'Feuerring',
  heilblumen: 'Heilblumen',
  bruchzone: 'Bruchzone',
  blitzsturm: 'Blitzsturm',
};

/** Per-round difficulty: stats up, reaction time down, dodges up — steeper now that losses advance too. */
export function roundScale(round: number): DifficultyScale {
  return {
    hp: 1 + 0.17 * (round - 1),
    dmg: 1 + 0.12 * (round - 1),
    reactionMs: Math.max(120, 400 - 25 * (round - 1)),
    dodgeChance: Math.min(0.9, 0.4 + 0.045 * round),
    armor: 4 + 2.2 * (round - 1),
    mr: 4 + 2.2 * (round - 1),
  };
}

export interface RoundSpec {
  enemies: EnemyConfig[];
  boss: boolean;
  title: string;
  /** Usurpator's visible augments, shown at round start. */
  bossAugments?: string[];
  /** Arena modifier, one per round from R5 on. */
  modifier?: ModifierId;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 12-round gauntlet. Losses cost a heart but the run advances — only the
 * final throne room (R12) must actually be won.
 *
 * R1–4 solo archetypes · R5 first duo · R6 Usurpator (mini) · R7–9 duos ·
 * R10–11 trios · R12 Usurpator (final). Duos/trios + Diener summons keep
 * the on-kill augment economy fueled.
 */
export function roundSpec(round: number): RoundSpec {
  const s = roundScale(round);
  const modifier =
    round >= 5
      ? pick<ModifierId>(['feuerring', 'heilblumen', 'bruchzone', 'blitzsturm'])
      : undefined;

  if (round === 6 || round === MAX_ROUND) {
    const final = round === MAX_ROUND;
    const boss = makeUsurpator(s, final);
    return {
      enemies: [boss],
      boss: true,
      title: `Runde ${round} — Der Usurpator`,
      bossAugments: boss.visibleAugments,
      modifier,
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
      enemies = [makeHexer(s)];
      break;
    case 4:
      enemies = [makeWaechter(s)];
      break;
    case 5:
      enemies = pick([
        [makeHaescher(s), makeSchuetze(s)],
        [makeHaescher(s), makeHexer(s)],
      ]);
      break;
    case 7:
      enemies = pick([
        [makeHaescher(s), makeSchuetze(s)],
        [makeHexer(s), makeSchuetze(s)],
        [makeHexer(s), makeHaescher(s)],
      ]);
      break;
    case 8:
      enemies = pick([
        [makeSchuetze(s), makeWaechter(s)],
        [makeHaescher(s), makeWaechter(s)],
        [makeHexer(s), makeWaechter(s)],
      ]);
      break;
    case 9:
      enemies = pick([
        [makeWaechter(s), makeHexer(s)],
        [makeSchuetze(s), makeSchuetze(s)],
        [makeWaechter(s), makeHaescher(s)],
      ]);
      break;
    case 10:
      enemies = [makeHaescher(s), makeSchuetze(s), makeHexer(s)];
      break;
    default: // 11
      enemies = pick([
        [makeWaechter(s), makeHaescher(s), makeSchuetze(s)],
        [makeWaechter(s), makeHexer(s), makeSchuetze(s)],
      ]);
      break;
  }
  return { enemies, boss: false, title: `Runde ${round}`, modifier };
}
