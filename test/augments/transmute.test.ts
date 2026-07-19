// @vitest-environment jsdom
//
// jsdom, not node: augmentById/grantRandomAugment pull in champions/registry.ts,
// which imports Phaser, and Phaser dereferences `window` at import time.
import { describe, expect, it, beforeEach } from 'vitest';
import { augmentById } from '../../src/augments/registry';
import { newRun, run, addAugment, MAX_AUGMENTS } from '../../src/core/run';
import type { AugmentCtx, AugmentDef } from '../../src/augments/types';

function fakeAugment(id: string): AugmentDef {
  return { id, name: id, tier: 'gold', tags: [], description: '' };
}

function fakeCtx(): AugmentCtx {
  return {
    combat: { announce: () => {} } as unknown as AugmentCtx['combat'],
    player: {} as unknown as AugmentCtx['player'],
    run,
    power: () => 1,
    grantTemp: () => {},
  };
}

describe('transmute augments consume themselves (B2)', () => {
  beforeEach(() => {
    newRun();
  });

  it('Transmute: Prisma grants a prisma augment and removes itself', () => {
    const transmut = augmentById('transmutprisma')!;
    expect(transmut).toBeDefined();
    addAugment(transmut);
    transmut.onCombatInit?.(fakeCtx());
    expect(run.augments.some((a) => a.id === 'transmutprisma')).toBe(false);
    expect(run.augments.some((a) => a.tier === 'prisma')).toBe(true);
  });

  it('Transmute: Chaos grants two augments and removes itself', () => {
    const transmut = augmentById('transmutchaos')!;
    expect(transmut).toBeDefined();
    addAugment(transmut);
    transmut.onCombatInit?.(fakeCtx());
    expect(run.augments.some((a) => a.id === 'transmutchaos')).toBe(false);
    expect(run.augments.length).toBe(2);
  });

  it('Transmute: Silver grants up to three silver augments and removes itself', () => {
    const transmut = augmentById('transmutsilber')!;
    expect(transmut).toBeDefined();
    addAugment(transmut);
    transmut.onCombatInit?.(fakeCtx());
    expect(run.augments.some((a) => a.id === 'transmutsilber')).toBe(false);
    expect(run.augments.length).toBe(3);
    expect(run.augments.every((a) => a.tier === 'silber')).toBe(true);
  });

  it('never exceeds MAX_AUGMENTS, even mid transmute chain', () => {
    // Fill to one slot below cap, then let the transmute occupy the last slot:
    // run.augments is at MAX_AUGMENTS *before* onCombatInit runs.
    for (let i = 0; i < MAX_AUGMENTS - 1; i++) addAugment(fakeAugment(`filler${i}`));
    const transmut = augmentById('transmutsilber')!;
    expect(addAugment(transmut)).toBe(true);
    expect(run.augments.length).toBe(MAX_AUGMENTS);

    transmut.onCombatInit?.(fakeCtx());

    // The cap was already full when the grant loop ran (the transmute itself
    // still occupied its slot at that point), so nothing new fit — the loop
    // refuses silently rather than exceeding MAX_AUGMENTS. Self-removal still
    // frees the transmute's own slot afterwards.
    expect(run.augments.length).toBeLessThanOrEqual(MAX_AUGMENTS);
    expect(run.augments.some((a) => a.id === 'transmutsilber')).toBe(false);
    expect(run.augments.some((a) => a.tier === 'silber')).toBe(false);
    expect(run.augments.length).toBe(MAX_AUGMENTS - 1);
  });

  it('grants what fits when one slot is free, still never exceeding the cap', () => {
    // One slot free below the transmute itself: exactly one silver grant fits
    // before the cap blocks the rest; self-removal frees a second slot after.
    for (let i = 0; i < MAX_AUGMENTS - 2; i++) addAugment(fakeAugment(`filler${i}`));
    const transmut = augmentById('transmutsilber')!;
    expect(addAugment(transmut)).toBe(true);
    expect(run.augments.length).toBe(MAX_AUGMENTS - 1);

    transmut.onCombatInit?.(fakeCtx());

    expect(run.augments.length).toBeLessThanOrEqual(MAX_AUGMENTS);
    expect(run.augments.some((a) => a.id === 'transmutsilber')).toBe(false);
    expect(run.augments.filter((a) => a.tier === 'silber').length).toBe(1);
    expect(run.augments.length).toBe(MAX_AUGMENTS - 1); // fillers + exactly 1 granted silver
  });
});
