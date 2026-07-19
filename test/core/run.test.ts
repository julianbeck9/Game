import { describe, expect, it } from 'vitest';
import { newRun, addAugment } from '../../src/core/run';
import type { AugmentDef } from '../../src/augments/types';

function fakeAugment(id: string, tags: AugmentDef['tags']): AugmentDef {
  return { id, name: id, tier: 'silber', tags, description: '' };
}

describe('core/run', () => {
  it('newRun() resets to the starting state', () => {
    const run = newRun();
    expect(run.gold).toBe(350);
    expect(run.augments.length).toBe(0);
  });

  it('addAugment() records the augment and bumps its tag counts', () => {
    const run = newRun();
    addAugment(fakeAugment('test-blut', ['Blut']));
    expect(run.augments.length).toBe(1);
    expect(run.tagCounts.Blut).toBe(1);
    expect(run.tagCounts.Sturm).toBe(0);
  });
});
