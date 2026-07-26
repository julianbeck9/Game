import { describe, expect, it, beforeEach } from 'vitest';
import { MAX_STARS, starLabel, starPower, starUpgradeCost, starsOf, withStars } from '../../src/items/stars';
import { addItem, newRun, run, sellItem, upgradeItem } from '../../src/core/run';
import type { ItemDef } from '../../src/items/registry';

function testItem(): ItemDef {
  return {
    id: 'test_blade',
    tier: 'gold',
    tags: [],
    name: 'Test Blade',
    cost: 100,
    glyph: 'T',
    color: 0xffffff,
    description: '+10 AD',
    statMods: [
      { stat: 'damage', flat: 10 },
      { stat: 'attackSpeed', pct: 0.2 },
    ],
  };
}

describe('item star forging', () => {
  beforeEach(() => {
    newRun();
  });

  it('treats an unforged item as ★1 with unscaled stats', () => {
    const it = testItem();
    expect(starsOf(it)).toBe(1);
    expect(starUpgradeCost(it)).toBe(90); // 0.9 × base cost
    expect(withStars(it, 1)).toBe(it);
  });

  it('raises the rank through powerMult only', () => {
    const two = withStars(testItem(), 2);
    expect(two.stars).toBe(2);
    expect(two.powerMult).toBe(starPower(2));
    expect(two.id).toBe('test_blade');
  });

  /**
   * Regression guard: AugmentManager.activate already multiplies statMods by
   * ctx.power(def). Pre-scaling them here too made a ★3 item hit for 4×.
   * The effective value is (statMod × powerMult) — that product is the contract.
   */
  it('leaves statMods unscaled so the pipeline applies the rank exactly once', () => {
    const three = withStars(testItem(), 3);
    expect(three.statMods?.[0].flat).toBe(10);
    expect(three.statMods?.[1].pct).toBe(0.2);
    const effectiveFlat = (three.statMods?.[0].flat ?? 0) * (three.powerMult ?? 1);
    const effectivePct = (three.statMods?.[1].pct ?? 0) * (three.powerMult ?? 1);
    expect(effectiveFlat).toBeCloseTo(20); // 10 × 2, never 10 × 2 × 2
    expect(effectivePct).toBeCloseTo(0.4);
  });

  it('never mutates the source item — run.items holds shared registry objects', () => {
    const base = testItem();
    withStars(base, 3);
    expect(base.stars).toBeUndefined();
    expect(base.powerMult).toBeUndefined();
    expect(base.statMods?.[0].flat).toBe(10);
  });

  it('derives each forge from the ★1 base instead of compounding', () => {
    const base = testItem();
    const viaSteps = withStars(withStars(base, 2), 3);
    const direct = withStars(base, 3);
    expect(viaSteps.powerMult).toBe(direct.powerMult);
    expect(viaSteps.cost).toBe(direct.cost);
  });

  it('caps at ★3 and quotes no further upgrade cost', () => {
    const maxed = withStars(testItem(), MAX_STARS);
    expect(starsOf(maxed)).toBe(MAX_STARS);
    expect(starUpgradeCost(maxed)).toBeNull();
    expect(starLabel(MAX_STARS)).toBe('★★★');
    // Asking beyond the cap clamps rather than inventing a 4th rank.
    expect(starsOf(withStars(maxed, 9))).toBe(MAX_STARS);
  });
});

describe('upgradeItem (run state)', () => {
  beforeEach(() => {
    newRun();
  });

  it('charges exactly the quoted gold and raises the rank', () => {
    run.gold = 1000;
    addItem(testItem()); // costs 100 → 900 left
    const quoted = starUpgradeCost(run.items[0])!;
    const before = run.gold;
    expect(upgradeItem('test_blade')).toBe(true);
    expect(run.gold).toBe(before - quoted);
    expect(starsOf(run.items[0])).toBe(2);
  });

  it('refuses when gold is short and leaves the item untouched', () => {
    run.gold = 100;
    addItem(testItem()); // 0 gold left
    expect(upgradeItem('test_blade')).toBe(false);
    expect(run.gold).toBe(0);
    expect(starsOf(run.items[0])).toBe(1);
  });

  it('refuses once the item is fully forged', () => {
    run.gold = 5000;
    addItem(testItem());
    expect(upgradeItem('test_blade')).toBe(true);
    expect(upgradeItem('test_blade')).toBe(true);
    expect(starsOf(run.items[0])).toBe(MAX_STARS);
    const before = run.gold;
    expect(upgradeItem('test_blade')).toBe(false);
    expect(run.gold).toBe(before);
  });

  it('refunds 70% of everything invested when a forged item is sold', () => {
    run.gold = 5000;
    addItem(testItem());
    upgradeItem('test_blade');
    upgradeItem('test_blade');
    const invested = 100 + 90 + 140; // base + ★2 + ★3
    const refund = sellItem('test_blade');
    expect(refund).toBe(Math.round(invested * 0.7));
    expect(run.items).toHaveLength(0);
    expect(run.gold).toBeGreaterThanOrEqual(0);
  });
});
