import { AugmentDef, Tier } from './types';
import { AUGMENTS } from './registry';
import { run } from '../core/run';

/** Tier gating per pick (after round N): early Silber · midgame Silber/Gold · lategame Gold/Prisma. */
function allowedTiers(round: number): Tier[] {
  // Wagemut: alle künftigen Angebote eine Stufe höher
  const boost = run.memory.tierBoost ?? 0;
  const shift = (t: Tier): Tier =>
    boost <= 0 ? t : t === 'silber' ? 'gold' : 'prisma';
  let tiers: Tier[];
  if (round <= 4) tiers = ['silber'];
  else if (round <= 13) tiers = ['silber', 'gold'];
  else tiers = ['gold', 'prisma'];
  return [...new Set(tiers.map(shift))];
}

export interface RollOpts {
  /** Force a specific tier set (e.g. the Silber→Gold trade forces ['gold']). */
  tiers?: Tier[];
  /** Allow a prisma pick (rollOffers turns this off after one prisma is shown). */
  allowPrisma?: boolean;
}

/**
 * Roll a single augment offer: not owned, not excluded, tier-gated, prisma
 * capped by flags.prismaSlots, with a 40% bias toward owned tags. Returns
 * null only when the entire pool is exhausted.
 */
export function rollOneOffer(round: number, exclude: Set<string>, opts: RollOpts = {}): AugmentDef | null {
  const tiers = opts.tiers ?? allowedTiers(round);
  const ownedPrisma = run.augments.filter((a) => a.tier === 'prisma').length;
  const prismaAllowed = (opts.allowPrisma ?? true) && ownedPrisma < run.flags.prismaSlots;

  const owns = (id: string) => run.augments.some((o) => o.id === id);
  let pool = AUGMENTS.filter(
    (a) =>
      !owns(a.id) &&
      !exclude.has(a.id) &&
      tiers.includes(a.tier) &&
      (a.tier !== 'prisma' || prismaAllowed),
  );
  // Fallback: if the gated pool is empty, open up to anything not owned/excluded
  if (pool.length === 0) {
    pool = AUGMENTS.filter((a) => !owns(a.id) && !exclude.has(a.id) && (a.tier !== 'prisma' || prismaAllowed));
    if (pool.length === 0) return null;
  }

  const ownedTags = new Set(
    (Object.keys(run.tagCounts) as (keyof typeof run.tagCounts)[]).filter((t) => run.tagCounts[t] > 0),
  );
  if (ownedTags.size > 0 && Math.random() < 0.4) {
    const tagged = pool.filter((a) => a.tags.some((t) => ownedTags.has(t)));
    if (tagged.length > 0) pool = tagged;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Roll `count` distinct offers: no owned duplicates, tier gating, at most one
 * prisma per selection (capped by flags.prismaSlots), 40% owned-tag bias.
 */
export function rollOffers(round: number, count = 3): AugmentDef[] {
  const offers: AugmentDef[] = [];
  const exclude = new Set<string>();
  let prismaOffered = false;
  while (offers.length < count) {
    const def = rollOneOffer(round, exclude, { allowPrisma: !prismaOffered });
    if (!def) break;
    if (def.tier === 'prisma') prismaOffered = true;
    offers.push(def);
    exclude.add(def.id);
  }
  return offers;
}
