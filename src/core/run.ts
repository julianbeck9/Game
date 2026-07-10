import { AugmentDef, Tag, RuleFlags, DEFAULT_FLAGS } from '../augments/types';

/**
 * State of one run (no persistence — a page reload is a fresh run).
 * Lives outside any scene so it survives scene switches.
 */
export interface RunState {
  round: number;
  /** Run-HP pool (100). Round losses subtract from it. */
  runHP: number;
  augments: AugmentDef[];
  tagCounts: Record<Tag, number>;
  flags: RuleFlags;
  /** Run-permanent counters owned by augments (e.g. Blutrausch stacks). */
  memory: Record<string, number>;
  /** Run summary bookkeeping */
  totalDamageDealt: number;
  kills: number;
}

export let run: RunState = newRunState();

export function newRun(): RunState {
  run = newRunState();
  return run;
}

function newRunState(): RunState {
  return {
    round: 1,
    runHP: 100,
    augments: [],
    tagCounts: { Blut: 0, Sturm: 0, Arkan: 0, Ward: 0, Bruch: 0 },
    flags: { ...DEFAULT_FLAGS },
    memory: {},
    totalDamageDealt: 0,
    kills: 0,
  };
}

/** Add a picked augment: registry entry + tag counts + rule flags. */
export function addAugment(def: AugmentDef): void {
  run.augments.push(def);
  for (const t of def.tags) run.tagCounts[t]++;
  if (def.ruleFlags) Object.assign(run.flags, def.ruleFlags);
}

export function hasAugment(id: string): boolean {
  return run.augments.some((a) => a.id === id);
}
