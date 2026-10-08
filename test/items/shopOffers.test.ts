import { describe, expect, it, beforeEach } from 'vitest';
import { ITEMS, rollShop, RETIRED_ITEM_IDS } from '../../src/items/registry';
import { newRun, run } from '../../src/core/run';
import { championUsesAP } from '../../src/champions/registry';

/**
 * B11: the shop rolled the entire item pool without asking which champion was
 * playing, so a pure-AD champion was offered AP-only gear — Sivir's very first
 * shop offered Soulstealer at exactly her 350 starting gold. Augment offers had
 * been gated by `augmentFitsChampion` all along; the shop simply never was.
 */
const AP_ONLY = ITEMS.filter((i) => i.needs?.includes('ap') && !RETIRED_ITEM_IDS.has(i.id));

describe('rollShop champion gating (B11)', () => {
  beforeEach(() => {
    newRun();
  });

  it('has AP-only items tagged in the pool at all', () => {
    // Guards the test itself: if nothing is tagged, the assertions below are vacuous.
    expect(AP_ONLY.length).toBeGreaterThan(0);
    expect(championUsesAP('sivir')).toBe(false);
    expect(championUsesAP('lux')).toBe(true);
  });

  it('never offers an AP-only item to a pure-AD champion', () => {
    run.champion = 'sivir';
    const seen = new Set<string>();
    // Rolls are random, so sample enough to make an escape overwhelmingly likely.
    for (let i = 0; i < 400; i++) {
      run.items.length = 0;
      for (const it of rollShop(5)) seen.add(it.id);
    }
    const leaked = AP_ONLY.filter((i) => seen.has(i.id)).map((i) => i.name);
    expect(leaked).toEqual([]);
    expect(seen.size).toBeGreaterThan(5); // the shop still stocks plenty
  });

  it('still offers those items to an AP champion', () => {
    run.champion = 'lux';
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      run.items.length = 0;
      for (const it of rollShop(5)) seen.add(it.id);
    }
    const offered = AP_ONLY.filter((i) => seen.has(i.id));
    expect(offered.length).toBe(AP_ONLY.length);
  });

  it('fills the starter shop with cheap gear, boots and path pieces alike', () => {
    // The starter shop is capped at gear costing <= 400. It used to hold five
    // items (four boots and Soulstealer) — the B12 content gap. The path base
    // pieces (augments/paths.ts) fill it, so an AD champion sees a full row.
    run.champion = 'sivir';
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const offers = rollShop(1);
      expect(offers.length).toBe(6);
      for (const o of offers) {
        expect(o.cost).toBeLessThanOrEqual(400);
        seen.add(o.name);
      }
    }
    for (const n of ['Mercury Boots', 'Plated Boots', 'Spur Boots', 'Wind Boots', 'Whetstone', 'Featherblade']) {
      expect(seen.has(n), n).toBe(true);
    }
  });

  it('never offers a retired on-hit proc (SCHLACHTPLAN 3.5)', () => {
    run.champion = 'lux';
    for (let i = 0; i < 300; i++) {
      run.items.length = 0;
      for (const it of rollShop(9)) expect(RETIRED_ITEM_IDS.has(it.id), it.id).toBe(false);
    }
  });
});
