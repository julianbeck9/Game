import { beforeEach, describe, expect, it } from 'vitest';
import { newRun, run, addAugment, MAX_AUGMENTS } from '../../src/core/run';
import { augmentById } from '../../src/augments/registry';

/**
 * Slot augments (SCHLACHTPLAN 3.4): one augment per verb. A second pick in a
 * slot replaces the first — and the run's flags follow what is actually held,
 * not whichever overlapping pick happened to come last.
 */
describe('augment slots', () => {
  beforeEach(() => newRun());
  const def = (id: string) => augmentById(id)!;

  it('a second auto-slot pick replaces the first', () => {
    addAugment(def('kettenschlag'));
    expect(run.flags.autoChain).toBe(3);
    addAugment(def('brecheisen'));
    expect(run.augments.map((a) => a.id)).toEqual(['brecheisen']);
    expect(run.flags.autoChain).toBe(0);
    expect(run.flags.knockbackOnHit).toBeGreaterThan(0);
  });

  it('different slots stack', () => {
    addAugment(def('kettenschlag'));
    addAugment(def('sturmbock'));
    addAugment(def('kronjagd'));
    expect(run.augments).toHaveLength(3);
  });

  it('a slot swap goes through even with every slot taken', () => {
    const fillers = ['aderlass', 'wachhaltung', 'richtstatt', 'trotz', 'nadeloehr'];
    addAugment(def('sturmbock'));
    for (const id of fillers) addAugment(def(id));
    expect(run.augments).toHaveLength(MAX_AUGMENTS);
    expect(addAugment(def('doppeltritt'))).toBe(true);
    expect(run.augments.some((a) => a.id === 'sturmbock')).toBe(false);
    expect(run.augments).toHaveLength(MAX_AUGMENTS);
  });
});
