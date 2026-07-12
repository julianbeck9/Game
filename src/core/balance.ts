import { CHAMPIONS } from '../champions/registry';
import { AUGMENTS } from '../augments/registry';
import { ITEMS } from '../items/registry';
import type { AugmentStatMod } from '../augments/types';
import type { StatName } from './stats';

/**
 * Admin balance overrides, saved in the browser. The Balance tuner writes here;
 * applyBalance() folds the values into the live registries at boot (and the
 * tuner also mutates the live defs immediately). Export dumps them so the
 * numbers can be baked into the source permanently.
 */
interface BalanceStore {
  champ: Record<string, Partial<Record<StatName, number>>>;
  cost: Record<string, number>;
  statMods: Record<string, AugmentStatMod[]>;
  deleted: Record<string, true>;
}

const KEY = 'cc_balance_v1';
let store: BalanceStore | null = null;

function load(): BalanceStore {
  if (store) return store;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    store = { champ: {}, cost: {}, statMods: {}, deleted: {}, ...raw };
  } catch {
    store = { champ: {}, cost: {}, statMods: {}, deleted: {} };
  }
  return store!;
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    /* ignore */
  }
}

/** Fold saved overrides into the live registries. Call once at boot. */
export function applyBalance(): void {
  const s = load();
  for (const c of CHAMPIONS) {
    const o = s.champ[c.id];
    if (o) Object.assign(c.base, o);
  }
  for (const it of ITEMS) {
    if (s.cost[it.id] != null) it.cost = s.cost[it.id];
  }
  for (const d of [...AUGMENTS, ...ITEMS]) {
    if (s.statMods[d.id]) d.statMods = s.statMods[d.id].map((m) => ({ ...m }));
  }
}

export function isDeleted(id: string): boolean {
  return !!load().deleted[id];
}

// ---- editors (mutate the live def AND persist) ----

export function setChampBase(id: string, stat: StatName, val: number): void {
  const s = load();
  (s.champ[id] ??= {})[stat] = val;
  const c = CHAMPIONS.find((x) => x.id === id);
  if (c) c.base[stat] = val;
  save();
}

export function setItemCost(id: string, val: number): void {
  const s = load();
  s.cost[id] = val;
  const it = ITEMS.find((x) => x.id === id);
  if (it) it.cost = val;
  save();
}

export function setStatMod(id: string, idx: number, field: 'flat' | 'pct', val: number): void {
  const s = load();
  const def = [...AUGMENTS, ...ITEMS].find((d) => d.id === id);
  if (!def?.statMods) return;
  def.statMods[idx][field] = val;
  s.statMods[id] = def.statMods.map((m) => ({ ...m }));
  save();
}

export function toggleDeleted(id: string): boolean {
  const s = load();
  if (s.deleted[id]) delete s.deleted[id];
  else s.deleted[id] = true;
  save();
  return !!s.deleted[id];
}

/** TS-ready dump for baking overrides into the source permanently. */
export function exportBalance(): string {
  const s = load();
  const lines: string[] = [];
  for (const [id, o] of Object.entries(s.champ)) lines.push(`champ ${id}: ${JSON.stringify(o)}`);
  for (const [id, v] of Object.entries(s.cost)) lines.push(`item ${id} cost: ${v}`);
  for (const [id, m] of Object.entries(s.statMods)) lines.push(`statMods ${id}: ${JSON.stringify(m)}`);
  const del = Object.keys(s.deleted);
  if (del.length) lines.push(`deleted: ${del.join(', ')}`);
  return lines.join('\n') || '(no balance changes)';
}
