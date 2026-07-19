import { describe, expect, it } from 'vitest';
import { newRun, addItem, sellItem, earnGold } from '../../src/core/run';
import type { ItemDef } from '../../src/items/registry';
import type { RuleFlags } from '../../src/augments/types';

function fakeItem(id: string, cost: number, ruleFlags?: Partial<RuleFlags>): ItemDef {
  return { id, name: id, tier: 'gold', tags: [], description: '', cost, glyph: '?', color: 0xffffff, ruleFlags };
}

// Gold/item invariants for buy (addItem) / sell (sellItem) / refund (earnGold),
// run against the real core/run.ts logic (no mocking) — S3-3.
describe('core/run economy invariants (S3-3)', () => {
  it('addItem() debits exactly the cost', () => {
    const run = newRun();
    const before = run.gold;
    expect(addItem(fakeItem('it_test', 120))).toBe(true);
    expect(run.gold).toBe(before - 120);
    expect(run.items.map((i) => i.id)).toContain('it_test');
  });

  it('addItem() refuses a purchase the run cannot afford, leaving gold and items untouched', () => {
    const run = newRun();
    run.gold = 50;
    expect(addItem(fakeItem('it_expensive', 999))).toBe(false);
    expect(run.gold).toBe(50);
    expect(run.items.length).toBe(0);
  });

  it('gold never goes negative across a long run of purchases', () => {
    const run = newRun();
    for (let i = 0; i < 50; i++) {
      addItem(fakeItem(`it_${i}`, 37));
      expect(run.gold).toBeGreaterThanOrEqual(0);
    }
  });

  it('sellItem() refunds 70% (rounded) and gold increases by exactly the refund', () => {
    const run = newRun();
    addItem(fakeItem('it_sellme', 101)); // 101 * 0.7 = 70.7 -> Math.round -> 71
    const before = run.gold;
    const refund = sellItem('it_sellme');
    expect(refund).toBe(71);
    expect(run.gold).toBe(before + refund);
    expect(run.items.length).toBe(0);
  });

  it('sellItem() on an unowned id is a no-op: refund 0, gold and items unchanged', () => {
    const run = newRun();
    const before = run.gold;
    expect(sellItem('nope')).toBe(0);
    expect(run.gold).toBe(before);
    expect(run.items.length).toBe(0);
  });

  it('sellItem() rebuilds ruleFlags from what remains, dropping the sold item\'s flags', () => {
    const run = newRun();
    addItem(fakeItem('it_a', 10, { revives: 1 }));
    addItem(fakeItem('it_b', 10, { dashCharges: 2 }));
    expect(run.flags.revives).toBe(1);
    expect(run.flags.dashCharges).toBe(2);

    sellItem('it_a');

    expect(run.flags.revives).toBe(0); // back to default: a's flag is gone
    expect(run.flags.dashCharges).toBe(2); // b's flag survives the rebuild
  });

  it('earnGold() increases gold and goldEarned by the same amount', () => {
    const run = newRun();
    const beforeGold = run.gold;
    const beforeEarned = run.goldEarned;
    earnGold(75);
    expect(run.gold).toBe(beforeGold + 75);
    expect(run.goldEarned).toBe(beforeEarned + 75);
  });

  it('gold >= 0 holds across a mixed earn/buy/sell/overspend sequence', () => {
    const run = newRun();
    earnGold(200);
    addItem(fakeItem('m1', 300));
    addItem(fakeItem('m2', 100));
    sellItem('m2');
    expect(addItem(fakeItem('m3', 5000))).toBe(false); // refused, not allowed to go negative
    expect(run.gold).toBeGreaterThanOrEqual(0);
  });
});
