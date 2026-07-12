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

/**
 * Roll 3 offers: no owned duplicates, tier gating, at most one prisma slot,
 * prisma capped by flags.prismaSlots, and a 40% bias toward owned tags.
 */
export function rollOffers(round: number, count = 3): AugmentDef[] {
  const tiers = allowedTiers(round);
  const ownedPrisma = run.augments.filter((a) => a.tier === 'prisma').length;
  const prismaAllowed = ownedPrisma < run.flags.prismaSlots;

  let basePool = AUGMENTS.filter(
    (a) => !run.augments.some((o) => o.id === a.id) && tiers.includes(a.tier),
  );
  // Fallback (z.B. Wagemut drückt alles auf Prisma, aber der Prisma-Slot ist belegt):
  // dann bleibt der Pool nutzbar, statt leere Angebote zu zeigen.
  if (basePool.filter((a) => a.tier !== 'prisma' || prismaAllowed).length < count) {
    basePool = AUGMENTS.filter((a) => !run.augments.some((o) => o.id === a.id));
  }

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
