import { AugmentDef, Tier } from './types';
import { AUGMENTS } from './registry';
import { isDeleted } from '../core/balance';
import { run } from '../core/run';
import { augmentFitsChampion } from './eligibility';

/**
 * Tier gating per pick (after round N): early Silber · midgame Silber/Gold ·
 * lategame Gold/Prisma. Exported so callers (PickScene) and tests can check a
 * roll's tier against the same band the roll itself used — an offer rolled
 * for round N and a reroll of it must use identical tiers, or the reroll can
 * dead-end without ever being a bug in `rollOneOffer` itself (B4).
 */
export function allowedTiers(round: number): Tier[] {
  // Wagemut: alle künftigen Angebote eine Stufe höher
  const boost = run.memory.tierBoost ?? 0;
  const shift = (t: Tier): Tier =>
    boost <= 0 ? t : t === 'silber' ? 'gold' : 'prisma';
  let tiers: Tier[];
  if (round <= 3) tiers = ['silber'];
  else if (round <= 7) tiers = ['silber', 'gold'];
  else if (round <= 11) tiers = ['gold', 'prisma'];
  else tiers = ['gold', 'prisma'];
  return [...new Set(tiers.map(shift))];
}

export interface RollOpts {
  /** Force a specific tier set (e.g. the Silber→Gold trade forces ['gold']). */
  tiers?: Tier[];
  /** Allow a prisma pick (rollOffers turns this off after one prisma is shown). */
  allowPrisma?: boolean;
  /** This is a forced trade: strictly honor `tiers`, never fall back to another tier. */
  forced?: boolean;
}

/**
 * Roll a single augment offer: not owned, not excluded, tier-gated, prisma
 * capped by flags.prismaSlots, with a 40% bias toward owned tags. Returns
 * null when the tier-gated pool is exhausted — never silently substitutes a
 * different tier for `opts.tiers`.
 */
export function rollOneOffer(round: number, exclude: Set<string>, opts: RollOpts = {}): AugmentDef | null {
  const tiers = opts.tiers ?? allowedTiers(round);
  const ownedPrisma = run.augments.filter((a) => a.tier === 'prisma').length;
  // A forced trade (e.g. Gold→Prisma) must honor the requested tier even if
  // the prismaSlots cap is full — the cap only throttles free/random offers.
  const prismaAllowed = opts.forced
    ? (opts.tiers?.includes('prisma') ?? false)
    : (opts.allowPrisma ?? true) && ownedPrisma < run.flags.prismaSlots;

  const owns = (id: string) => run.augments.some((o) => o.id === id);
  const fits = (a: AugmentDef) => augmentFitsChampion(a, run.champion);
  let pool = AUGMENTS.filter(
    (a) =>
      !owns(a.id) &&
      !exclude.has(a.id) &&
      !isDeleted(a.id) &&
      fits(a) &&
      tiers.includes(a.tier) &&
      (a.tier !== 'prisma' || prismaAllowed),
  );
  if (pool.length === 0) return null;

  // Prisma bias: when prisma is on the table, give it a real chance to show up
  // (the gold pool is large, so uniform rolls under-represent prisma).
  if (prismaAllowed && tiers.includes('prisma') && Math.random() < 0.4) {
    const prismas = pool.filter((a) => a.tier === 'prisma');
    if (prismas.length > 0) return prismas[Math.floor(Math.random() * prismas.length)];
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

/** One offered augment card, as shown by PickScene. Kept here (not in
 * PickScene.ts, which imports Phaser) so its pure reroll logic below is
 * importable from tests without pulling in Phaser's device feature
 * detection, which throws under jsdom's canvas shim. */
export interface Offer {
  def: AugmentDef;
  rerolled: boolean;
  /** Reroll was attempted but the tier-gated pool was exhausted (rollOneOffer
   * returned null) — the card keeps its previous def; reroll is disabled. */
  exhausted?: boolean;
}

/**
 * Pure reroll-decision step: a fresh card on success, or the same card
 * marked `exhausted` on a null roll. Never returns `cur` unchanged-and-still
 * -rerollable — a null roll must always become visibly disabled, not a
 * silent no-op (B4: "wenn du Augments ausgewählt hast und rerollst kommen
 * die nicht mehr").
 */
export function nextOfferAfterReroll(cur: Offer, def: AugmentDef | null): Offer {
  return def ? { def, rerolled: true } : { ...cur, exhausted: true };
}
