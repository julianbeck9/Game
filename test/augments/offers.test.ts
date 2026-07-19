// @vitest-environment jsdom
//
// jsdom, not node: rollOneOffer pulls in augmentFitsChampion -> champions/registry.ts,
// which imports Phaser, and Phaser dereferences `window` at import time. Needs `jsdom`
// as a devDependency once it's wired into package.json.
import { describe, expect, it, beforeEach } from 'vitest';
import { rollOneOffer, allowedTiers, nextOfferAfterReroll, Offer } from '../../src/augments/offers';
import { AUGMENTS } from '../../src/augments/registry';
import { newRun, run } from '../../src/core/run';

describe('rollOneOffer forced trades (B1)', () => {
  beforeEach(() => {
    newRun();
  });

  it('forced prisma trade never returns silber/gold, even with a full prismaSlots cap', () => {
    run.flags.prismaSlots = 0; // cap full: nothing left "owned" but no room for more
    for (let i = 0; i < 200; i++) {
      const def = rollOneOffer(12, new Set(), { tiers: ['prisma'], allowPrisma: true, forced: true });
      expect(def === null || def.tier === 'prisma').toBe(true);
    }
  });

  it('forced prisma trade with room in the cap still never returns silber/gold', () => {
    run.flags.prismaSlots = 4;
    for (let i = 0; i < 200; i++) {
      const def = rollOneOffer(12, new Set(), { tiers: ['prisma'], allowPrisma: true, forced: true });
      expect(def === null || def.tier === 'prisma').toBe(true);
    }
  });

  it('forced gold trade never returns silber/prisma', () => {
    for (let i = 0; i < 200; i++) {
      const def = rollOneOffer(12, new Set(), { tiers: ['gold'], allowPrisma: false, forced: true });
      expect(def === null || def.tier === 'gold').toBe(true);
    }
  });

  it('non-forced rolls keep prior behavior: prismaSlots cap still throttles prisma', () => {
    run.flags.prismaSlots = 0;
    let sawPrisma = false;
    for (let i = 0; i < 200; i++) {
      const def = rollOneOffer(12, new Set());
      if (def?.tier === 'prisma') sawPrisma = true;
    }
    expect(sawPrisma).toBe(false);
  });
});

describe('reroll dead-end repro + invariants (B4)', () => {
  beforeEach(() => {
    newRun();
  });

  // Repro of the reported complaint: "wenn du Augments ausgewählt hast und
  // rerollst kommen die nicht mehr" — exclude the entire tier-gated pool (as
  // if every eligible augment were already shown/owned) and reroll. Before
  // the fix, PickScene.rerollSlot's `if (!def) return;` left the card and its
  // reroll button completely unchanged, so the player saw nothing happen and
  // could click again and again for the same silent no-op.
  it('rollOneOffer returns null once the whole round-1 (silber-only) pool is excluded', () => {
    const round = 1; // allowedTiers(1) === ['silber']
    const silberIds = AUGMENTS.filter((a) => a.tier === 'silber').map((a) => a.id);
    const exclude = new Set(silberIds);
    const def = rollOneOffer(round, exclude);
    expect(def).toBeNull();
  });

  it('nextOfferAfterReroll never leaves a rerollable card unchanged on a null roll', () => {
    const cur: Offer = { def: AUGMENTS[0], rerolled: false };
    const next = nextOfferAfterReroll(cur, null);
    // Same def kept (card doesn't visibly vanish/change), but now marked
    // exhausted so the calling scene disables the reroll button (never a
    // silent, still-clickable no-op).
    expect(next.def).toBe(cur.def);
    expect(next.exhausted).toBe(true);
    expect(next.rerolled).toBe(false);
  });

  it('nextOfferAfterReroll swaps in the new def and marks rerolled on success', () => {
    const cur: Offer = { def: AUGMENTS[0], rerolled: false };
    const fresh = AUGMENTS[1];
    const next = nextOfferAfterReroll(cur, fresh);
    expect(next.def).toBe(fresh);
    expect(next.rerolled).toBe(true);
    expect(next.exhausted).toBeUndefined();
  });

  it('reroll result tier is always inside the round\'s allowed tiers', () => {
    for (const round of [1, 5, 9, 13]) {
      const tiers = allowedTiers(round);
      for (let i = 0; i < 100; i++) {
        const def = rollOneOffer(round, new Set());
        if (def) expect(tiers).toContain(def.tier);
      }
    }
  });

  it('reroll never returns an already-owned augment', () => {
    run.augments = AUGMENTS.filter((a) => a.tier === 'gold').slice(0, 4);
    const owned = new Set(run.augments.map((a) => a.id));
    for (let i = 0; i < 200; i++) {
      const def = rollOneOffer(9, new Set());
      if (def) expect(owned.has(def.id)).toBe(false);
    }
  });

  it('reroll never returns an id already shown on the other cards (exclude set)', () => {
    const shown = AUGMENTS.filter((a) => a.tier === 'gold').slice(0, 2).map((a) => a.id);
    const exclude = new Set(shown);
    for (let i = 0; i < 200; i++) {
      const def = rollOneOffer(9, exclude);
      if (def) expect(exclude.has(def.id)).toBe(false);
    }
  });
});
