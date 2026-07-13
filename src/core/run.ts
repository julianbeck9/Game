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
  /** One life: lose a round, lose the run. */
  lives: number;
  /** Past round 20 the gauntlet becomes the Endlosmodus. */
  endless: boolean;
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

export const MAX_AUGMENTS = 6;

export let run: RunState = newRunState();

export function newRun(): RunState {
  run = newRunState();
  return run;
}

function newRunState(): RunState {
  return {
    round: 1,
    champion: 'sivir',
    lives: 1,
    endless: false,
    augments: [],
    items: [],
    gold: 350, // starter-shop budget: enough for a first pair of boots
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

/** Drop an owned augment and rebuild tag counts + rule flags from what's left. */
export function removeAugment(id: string): void {
  const i = run.augments.findIndex((a) => a.id === id);
  if (i < 0) return;
  run.augments.splice(i, 1);
  recomputeDerived();
}

/** Sell an item: refund 70% and rebuild flags. */
export function sellItem(id: string): number {
  const i = run.items.findIndex((it) => it.id === id);
  if (i < 0) return 0;
  const refund = Math.round(run.items[i].cost * 0.7);
  run.items.splice(i, 1);
  run.gold += refund;
  recomputeDerived();
  return refund;
}

/** Tag counts and rule flags are pure functions of what you own — rebuild. */
function recomputeDerived(): void {
  run.tagCounts = { Blut: 0, Sturm: 0, Arkan: 0, Ward: 0, Bruch: 0 };
  run.flags = { ...DEFAULT_FLAGS };
  for (const a of run.augments) {
    for (const t of a.tags) run.tagCounts[t]++;
    if (a.ruleFlags) Object.assign(run.flags, a.ruleFlags);
  }
  for (const it of run.items) {
    if (it.ruleFlags) Object.assign(run.flags, it.ruleFlags);
  }
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
  // Items may break rules too (Schutzengel: +1 Wiederbelebung)
  if (item.ruleFlags) Object.assign(run.flags, item.ruleFlags);
}
