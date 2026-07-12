import { StatBlock, StatName } from './stats';
import { championById } from '../champions/registry';
import { run } from './run';
import type { AugmentDef } from '../augments/types';

const DEFAULTS: Partial<Record<StatName, number>> = {
  abilityPower: 0, armor: 0, magicResist: 0, critChance: 0, abilityHaste: 0,
  abilityDamage: 1.0, cooldown: 1.0, lifesteal: 0, projSpeed: 900,
};

/**
 * A static stat preview from the current champion + owned augments/items —
 * used by the build screen when no live combat player exists (e.g. the shop).
 * Only static statMods are folded in; dynamic (onUpdate) effects aren't shown.
 */
export function previewStats(): StatBlock {
  const champ = championById(run.champion);
  const sb = new StatBlock({ ...DEFAULTS, ...champ.base });
  const apply = (defs: AugmentDef[]) => {
    for (const d of defs) {
      if (!d.statMods) continue;
      d.statMods.forEach((m, i) =>
        sb.set({ id: `prev:${d.id}:${i}`, stat: m.stat, flat: m.flat, pct: m.pct }),
      );
    }
  };
  apply(run.augments);
  apply(run.items);
  return sb;
}
