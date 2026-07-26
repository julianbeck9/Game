import type { ItemDef } from './registry';

/**
 * Item star ranks. An item bought in the shop is ★1 and can be forged up to
 * ★3 with gold.
 *
 * Why this exists: once all six item slots are full there is nothing left to
 * spend gold on, so lategame income was dead weight. Forging turns surplus
 * gold back into power without widening the item catalog.
 *
 * The power curve reuses the augment tier language (1× / 1.5× / 2×) on
 * purpose, so "one star up" reads as "one tier up" everywhere in the game.
 */
export const MAX_STARS = 3;

const STAR_POWER = [1, 1.5, 2];
/** Gold for the next rank, as a factor of the item's original shop cost. */
const UPGRADE_COST_FACTOR = [0.9, 1.4];

function clampStars(s: number): number {
  return Math.max(1, Math.min(MAX_STARS, Math.round(s)));
}

export function starsOf(it: ItemDef): number {
  return clampStars(it.stars ?? 1);
}

/** The pristine ★1 item. Upgrades always derive from this, never from a scaled copy. */
export function baseOf(it: ItemDef): ItemDef {
  return it.baseItem ?? it;
}

export function starPower(stars: number): number {
  return STAR_POWER[clampStars(stars) - 1];
}

export function starLabel(stars: number): string {
  return '★'.repeat(clampStars(stars));
}

/** Gold to reach the next rank, or null when the item is already ★3. */
export function starUpgradeCost(it: ItemDef): number | null {
  const s = starsOf(it);
  if (s >= MAX_STARS) return null;
  return Math.round(baseOf(it).cost * UPGRADE_COST_FACTOR[s - 1]);
}

/**
 * Build the upgraded copy of an item. Never mutates: `run.items` holds shared
 * registry objects, so a starred item has to be a derived clone — mutating in
 * place would leak the upgrade into every future run.
 *
 * `statMods` are deliberately left at their ★1 values. AugmentManager.activate
 * already multiplies both stat mods and hook effects by `ctx.power(def)`, so
 * `powerMult` is the single lever — pre-scaling the stats here as well would
 * apply the rank twice (a ★3 item hit for 4× instead of 2×).
 */
export function withStars(it: ItemDef, stars: number): ItemDef {
  const base = baseOf(it);
  const rank = clampStars(stars);
  if (rank <= 1) return base;
  const mult = starPower(rank);
  // Sell refunds 70% of `cost`, so carry the total invested — forging is never a gold trap.
  let invested = base.cost;
  for (let s = 1; s < rank; s++) invested += Math.round(base.cost * UPGRADE_COST_FACTOR[s - 1]);
  return {
    ...base,
    baseItem: base,
    stars: rank,
    cost: invested,
    powerMult: mult,
    description: `${base.description} · ${starLabel(rank)} ${mult}× values`,
  };
}
