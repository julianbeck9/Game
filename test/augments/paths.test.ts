import { beforeEach, describe, expect, it } from 'vitest';
import { newRun, run, addAugment, addItem } from '../../src/core/run';
import { activePathSteps, nextPathStep, pathGainLabel } from '../../src/augments/paths';
import { ITEMS } from '../../src/items/registry';
import type { AugmentDef, Tag } from '../../src/augments/types';

/**
 * Paths (SCHLACHTPLAN 3.2): tags owned across augments AND items light steps
 * at 2/4/6. These pin the bookkeeping; scripts/pathcheck.mjs measures what
 * each step does in the running game.
 */
const pick = (tag: Tag, i: number): AugmentDef => ({ id: `t${tag}${i}`, name: 'x', tier: 'silber', tags: [tag], description: '' });

describe('paths', () => {
  beforeEach(() => newRun());

  it('a step lights exactly at its threshold', () => {
    addAugment(pick('Sturm', 1));
    expect(run.flags.dashCharges).toBe(1);
    for (let i = 2; i <= 4; i++) addAugment(pick('Sturm', i));
    expect(run.tagCounts.Sturm).toBe(4);
    expect(run.flags.dashCharges).toBe(2); // Sturm 4: Second Wind
    expect(run.flags.attackWhileMoving).toBe(false); // Sturm 6 not yet
  });

  it('items count toward paths', () => {
    const ward = ITEMS.filter((it) => it.tags.includes('Ward')).slice(0, 2);
    run.gold = 1e6;
    for (const it of ward) addItem(it);
    expect(run.tagCounts.Ward).toBe(2);
    expect(activePathSteps(run.tagCounts).map((s) => s.def.id)).toContain('path:Ward:2');
  });

  it('every item feeds one or two paths', () => {
    for (const it of ITEMS) {
      expect(it.tags.length, it.id).toBeGreaterThan(0);
      expect(it.tags.length, it.id).toBeLessThanOrEqual(2);
    }
  });

  it('a path never lowers what an item already gave', () => {
    run.gold = 1e6;
    const exec = ITEMS.find((it) => (it.ruleFlags?.executeBelow ?? 0) > 0.1)!;
    addItem(exec);
    for (let i = 0; i < 4; i++) addAugment(pick('Bruch', i));
    expect(run.flags.executeBelow).toBe(exec.ruleFlags!.executeBelow);
  });

  it('card labels count toward the next step', () => {
    expect(nextPathStep(0)).toBe(2);
    expect(nextPathStep(5)).toBe(6);
    expect(nextPathStep(6)).toBeNull();
    expect(pathGainLabel('Sturm', 2)).toBe('+1 Sturm (3/4)');
    expect(pathGainLabel('Sturm', 3)).toBe('+1 Sturm (4/4)!');
  });
});
