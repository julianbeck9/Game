import { describe, expect, it, beforeEach } from 'vitest';
import { ITEMS, rollShop } from '../../src/items/registry';
import { newRun, run } from '../../src/core/run';
import { championUsesAP } from '../../src/champions/registry';

/**
 * B11: the shop rolled the entire item pool without asking which champion was
 * playing, so a pure-AD champion was offered AP-only gear — Sivir's very first
 * shop offered Soulstealer at exactly her 350 starting gold. Augment offers had
 * been gated by `augmentFitsChampion` all along; the shop simply never was.
 */
const AP_ONLY = ITEMS.filter((i) => i.needs?.includes('ap'));

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

  it('keeps every genuine starter choice for an AD champion', () => {
    run.champion = 'sivir';
    // The starter shop is capped at gear costing <= 400, and that pool holds
    // exactly five items: the four boots plus Soulstealer. Gating drops it to
    // four offers, and the whole boots decision (speed / armor / MR / attack
    // speed) survives — only the dead pick is gone. See B12 for how thin this
    // pool is in the first place; that is a content gap, not a gating bug.
    const offers = rollShop(1);
    const names = offers.map((o) => o.name).sort();
    expect(names).toEqual(['Mercury Boots', 'Plated Boots', 'Spur Boots', 'Wind Boots']);
  });

  it('leaves the AP champion one more starter option than the AD champion', () => {
    run.champion = 'lux';
    const ap = rollShop(1).length;
    newRun();
    run.champion = 'sivir';
    expect(ap).toBe(rollShop(1).length + 1);
  });
});
