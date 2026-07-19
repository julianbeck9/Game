// @vitest-environment jsdom
//
// jsdom, not node: rollOneOffer pulls in augmentFitsChampion -> champions/registry.ts,
// which imports Phaser, and Phaser dereferences `window` at import time. Needs `jsdom`
// as a devDependency once it's wired into package.json.
import { describe, expect, it, beforeEach } from 'vitest';
import { rollOneOffer } from '../../src/augments/offers';
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
