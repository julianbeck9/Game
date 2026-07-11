import { AugmentDef, Tier } from './types';
import { AUGMENTS } from './registry';
import { run } from '../core/run';

/** Tier gating per pick (after round N): early Silber · midgame Silber/Gold · lategame Gold/Prisma. */
function allowedTiers(round: number): Tier[] {
  if (round <= 3) return ['silber'];
  if (round <= 8) return ['silber', 'gold'];
  return ['gold', 'prisma'];
}

/**
 * Roll 3 offers: no owned duplicates, tier gating, at most one prisma slot,
 * prisma capped by flags.prismaSlots, and a 40% bias toward owned tags.
 */
export function rollOffers(round: number, count = 3): AugmentDef[] {
  const tiers = allowedTiers(round);
  const ownedPrisma = run.augments.filter((a) => a.tier === 'prisma').length;
  const prismaAllowed = ownedPrisma < run.flags.prismaSlots;

  const basePool = AUGMENTS.filter(
    (a) => !run.augments.some((o) => o.id === a.id) && tiers.includes(a.tier),
  );

  const ownedTags = new Set(
    (Object.keys(run.tagCounts) as (keyof typeof run.tagCounts)[]).filter(
      (t) => run.tagCounts[t] > 0,
    ),
  );

  const offers: AugmentDef[] = [];
  let prismaOffered = false;

  while (offers.length < count) {
    let pool = basePool.filter(
      (a) =>
        !offers.includes(a) &&
        (a.tier !== 'prisma' || (prismaAllowed && !prismaOffered)),
    );
    if (pool.length === 0) break;

    // 40% bias toward tags the player already owns, so builds converge
    if (ownedTags.size > 0 && Math.random() < 0.4) {
      const tagged = pool.filter((a) => a.tags.some((t) => ownedTags.has(t)));
      if (tagged.length > 0) pool = tagged;
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick.tier === 'prisma') prismaOffered = true;
    offers.push(pick);
  }

  return offers;
}
