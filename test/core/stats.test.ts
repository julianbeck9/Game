import { describe, expect, it } from 'vitest';
import { StatBlock } from '../../src/core/stats';

describe('stat pipeline', () => {
  it('derived = (base + flat) * (1 + pct)', () => {
    const s = new StatBlock({ damage: 20 });
    s.add({ id: 'a', stat: 'damage', flat: 5 });
    s.add({ id: 'b', stat: 'damage', pct: 0.4 });
    expect(s.get('damage')).toBeCloseTo(35);
  });

  it('stacked slows stop a unit, they never reverse it', () => {
    const s = new StatBlock({ moveSpeed: 300 });
    s.set({ id: 'slow:a', stat: 'moveSpeed', pct: -0.7 });
    s.set({ id: 'slow:b', stat: 'moveSpeed', pct: -0.6 });
    expect(s.get('moveSpeed')).toBe(0);
  });

  it('other stats may still go below zero (armor shred is read with max(0) at use)', () => {
    const s = new StatBlock({ armor: 10 });
    s.add({ id: 'shred', stat: 'armor', flat: -25 });
    expect(s.get('armor')).toBe(-15);
  });
});
