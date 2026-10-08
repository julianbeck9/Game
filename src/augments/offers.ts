import { AugmentDef, Tag, Tier } from './types';
import { PATH_TAGS } from './paths';
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
  /** Path card: roll only augments wearing one of these tags (when any exist). */
  preferTags?: Tag[];
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
  const unlocked = (a: AugmentDef) => (a.requires ?? []).every(owns);
  const pool = AUGMENTS.filter(
    (a) =>
      !a.champion && // champion lanes roll on their own track: championOffer()
      !owns(a.id) &&
      !exclude.has(a.id) &&
      !isDeleted(a.id) &&
      fits(a) &&
      unlocked(a) &&
      tiers.includes(a.tier) &&
      (a.tier !== 'prisma' || prismaAllowed),
  );
  if (pool.length === 0) return null;

  // The path card: something for a path you are already walking.
  if (opts.preferTags?.length) {
    const onPath = pool.filter((a) => a.tags.some((t) => opts.preferTags!.includes(t)));
    if (onPath.length > 0) return onPath[Math.floor(Math.random() * onPath.length)];
  }

  // Prisma bias: when prisma is on the table, give it a real chance to show up
  // (the gold pool is large, so uniform rolls under-represent prisma).
  if (prismaAllowed && tiers.includes('prisma') && Math.random() < 0.4) {
    const prismas = pool.filter((a) => a.tier === 'prisma');
    if (prismas.length > 0) return prismas[Math.floor(Math.random() * prismas.length)];
  }

  // Rule-breaker bias.
  //
  // A pick screen shows three cards out of a pool of ~170, and only a handful
  // of those change a rule rather than adding a proc. Uniformly rolled, the
  // chance any card in a whole run rewrites how you play is close to nil — so
  // the pool reads as "mostly filler", which is exactly the complaint. Weight
  // them heavily instead of deleting the rest: the procs still make sensible
  // supporting picks, they just stop crowding out the memorable ones.
  if (Math.random() < 0.45) {
    const breakers = pool.filter((a) => a.ruleFlags && Object.keys(a.ruleFlags).length > 0);
    if (breakers.length > 0) return breakers[Math.floor(Math.random() * breakers.length)];
  }

  // No owned-tag bias here any more: that is the path card's job now, made
  // explicit in rollOffers instead of a hidden 40% coin flip on every card.
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * The champion card of a pick screen: one augment from the champion's own
 * lanes, outside the tier bands (a lane must be startable from the first pick).
 *
 * Priority mirrors how a build is felt to come together:
 *  1. a capstone the player has just unlocked — the payoff must show up the
 *     moment it is earned, or the lane reads as a dead end;
 *  2. the next step of a lane already started;
 *  3. any lane opener.
 */
export function championOffer(exclude: Set<string>): AugmentDef | null {
  const owns = (id: string) => run.augments.some((o) => o.id === id);
  const pool = AUGMENTS.filter(
    (a) =>
      a.champion === run.champion &&
      !owns(a.id) &&
      !exclude.has(a.id) &&
      !isDeleted(a.id) &&
      (a.requires ?? []).every(owns),
  );
  if (pool.length === 0) return null;
  const pick = (xs: AugmentDef[]) => xs[Math.floor(Math.random() * xs.length)];
  const capstones = pool.filter((a) => a.requires?.length);
  if (capstones.length) return pick(capstones);
  const started = new Set(run.augments.map((a) => a.lane).filter(Boolean));
  const continuing = pool.filter((a) => a.lane && started.has(a.lane));
  if (continuing.length && Math.random() < 0.75) return pick(continuing);
  return pick(pool);
}

/** Your two biggest started paths, most first (empty before any tag is owned). */
export function topPaths(): Tag[] {
  return PATH_TAGS.filter((t) => run.tagCounts[t] > 0)
    .sort((a, b) => run.tagCounts[b] - run.tagCounts[a])
    .slice(0, 2);
}

/**
 * Roll `count` distinct offers, each card with a job (SCHLACHTPLAN 3.6):
 *   1. the lane card  — your champion's own build (championOffer);
 *   2. the path card  — something for a path you have started;
 *   3. the wildcard   — anything, so a run can still turn.
 * No owned duplicates, tier gating, at most one prisma per selection.
 */
export function rollOffers(round: number, count = 3): AugmentDef[] {
  const offers: AugmentDef[] = [];
  const exclude = new Set<string>();
  let prismaOffered = false;
  const champ = championOffer(exclude);
  if (champ) {
    offers.push(champ);
    exclude.add(champ.id);
    if (champ.tier === 'prisma') prismaOffered = true;
  }
  const paths = topPaths();
  while (offers.length < count) {
    const pathCard = offers.length === 1 && paths.length > 0;
    const def = rollOneOffer(round, exclude, { allowPrisma: !prismaOffered, preferTags: pathCard ? paths : undefined });
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
