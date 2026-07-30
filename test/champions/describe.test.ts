// Plain `node` environment: this file no longer needs jsdom, because
// champions/registry.ts imports Phaser type-only and so nothing in this chain
// touches `window` any more. See the import-hygiene test in kits.test.ts.
import { describe, expect, it } from 'vitest';
import { CHAMPIONS, championById } from '../../src/champions/registry';
import { Q_SCALE } from '../../src/champions/kits';
import { describeQ } from '../../src/champions/describe';

describe('kit description generator (B6)', () => {
  it('every champion has a non-empty generated Q description', () => {
    for (const c of CHAMPIONS) {
      expect(describeQ(c).length).toBeGreaterThan(0);
    }
  });

  it('a line-shaped Q reports range and width from spec.q', () => {
    const lux = championById('lux');
    expect(describeQ(lux)).toBe('Line, 700 range, 24 wide — 60/90/120/150 damage by round.');
  });

  it('a self-centered circle Q reports its radius, no range', () => {
    const zac = championById('zac');
    expect(describeQ(zac)).toBe('Self AoE, 200 radius — 60/90/120/150 damage by round.');
  });

  it('a cone Q reports range and angle', () => {
    const ashe = championById('ashe');
    expect(describeQ(ashe)).toBe('Cone, 620 range, 32° wide — 50/75/100/125 damage per bolt by round.');
  });

  it('a pure self-buff Q (kind: self) still reports its round-scaled number', () => {
    const warwick = championById('warwick');
    expect(describeQ(warwick)).toBe('Self-cast — 20/30/40/50% bonus move speed by round.');
  });

  it('a targeted-AoE circle Q reports range and radius (not self-centered)', () => {
    const ziggs = championById('ziggs');
    expect(describeQ(ziggs)).toBe('Circle, 800 range, 130 radius — 60/90/120/150 damage by round.');
  });

  it('a zero-radius targeted circle Q (point-target snipe) omits the radius', () => {
    const fiddlesticks = championById('fiddlesticks');
    expect(describeQ(fiddlesticks)).toBe('Targeted, 520 range — 50/75/100/125 damage by round.');
  });

  // The core B6 guarantee: the generator reads Q_SCALE live, so a number
  // changed at the single source (the same tuple `fireQ`'s rs(...) spreads)
  // immediately shows up in the generated text — no separate copy to forget.
  it('changing Q_SCALE updates the generated text without touching describe.ts', () => {
    const before = describeQ(championById('zac'));
    const original = [...Q_SCALE.zac] as [number, number, number, number];
    Q_SCALE.zac[0] = 999;
    const after = describeQ(championById('zac'));
    Q_SCALE.zac.splice(0, 4, ...original); // restore for other tests

    expect(before).not.toBe(after);
    expect(after).toContain('999');
  });
});
