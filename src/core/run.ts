import { AugmentDef, Tag, RuleFlags, DEFAULT_FLAGS } from '../augments/types';
import type { ItemDef } from '../items/registry';

/**
 * State of one run (no persistence — a page reload is a fresh run).
 * Lives outside any scene so it survives scene switches.
 */
export interface RunState {
  round: number;
  /** Selected playable champion id. */
  champion: string;
  /** Lives (hearts): a lost round costs one, but the run marches on. 0 = over. */
  lives: number;
  augments: AugmentDef[];
  /** Purchased items (activated each combat like augments; no tag counts). */
  items: ItemDef[];
  gold: number;
  goldEarned: number;
  tagCounts: Record<Tag, number>;
  flags: RuleFlags;
  /** Run-permanent counters owned by augments (e.g. Blutrausch stacks). */
  memory: Record<string, number>;
  /** Run summary bookkeeping */
  totalDamageDealt: number;
  kills: number;
  maxHit: number;
}

export let run: RunState = newRunState();

export function newRun(): RunState {
  run = newRunState();
  return run;
}

function newRunState(): RunState {
  return {
    round: 1,
    champion: 'koenig',
    lives: 3,
    augments: [],
    items: [],
    gold: 0,
    goldEarned: 0,
    tagCounts: { Blut: 0, Sturm: 0, Arkan: 0, Ward: 0, Bruch: 0 },
    flags: { ...DEFAULT_FLAGS },
    memory: {},
    totalDamageDealt: 0,
    kills: 0,
    maxHit: 0,
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

/** Gold income (kills, round rewards). */
export function earnGold(amount: number): void {
  run.gold += amount;
  run.goldEarned += amount;
}

/** Buy an item: pay and stash it. Caller checks affordability/slots. */
export function addItem(item: ItemDef): void {
  run.gold -= item.cost;
  run.items.push(item);
}
