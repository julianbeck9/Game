import { beforeEach, describe, expect, it } from 'vitest';
import { newRun, run, addItem, sellItem } from '../../src/core/run';
import { ITEMS, itemById, RETIRED_ITEM_IDS } from '../../src/items/registry';

/**
 * SCHLACHTPLAN 3.5: the shop sells numbers (cheap path pieces) and rules
 * (expensive cores) — never "on hit: extra damage". A core is only worth its
 * price if buying it actually flips the rule, and selling it flips it back.
 */
describe('rule-core items', () => {
  beforeEach(() => {
    newRun();
    run.gold = 1e6;
  });

  it.each([
    ['it_spaltbogen', 'autoChain', 2],
    ['it_widderhorn', 'knockbackOnHit', 40],
    ['it_klingenmantel', 'dashDamage', 45],
    ['it_angstglas', 'clutchSlowmo', true],
  ] as const)('%s sets %s while owned', (id, flag, value) => {
    const it = itemById(id)!;
    addItem(it);
    expect(run.flags[flag]).toBe(value);
    sellItem(id);
    expect(run.flags[flag]).not.toBe(value);
  });

  it('every on-hit proc is retired, and the live shop keeps a path piece per path', () => {
    const live = ITEMS.filter((i) => !RETIRED_ITEM_IDS.has(i.id));
    expect(ITEMS.length - live.length).toBe(15);
    for (const tag of ['Blut', 'Sturm', 'Arkan', 'Ward', 'Bruch'] as const) {
      expect(live.some((i) => i.cost <= 260 && i.tags.length === 1 && i.tags[0] === tag), tag).toBe(true);
    }
  });
});
