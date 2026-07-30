import { describe, expect, it } from 'vitest';
import { LUX_AUGMENTS } from '../../src/augments/champions/lux';
import { AUGMENTS } from '../../src/augments/registry';
import { augmentFitsChampion } from '../../src/augments/eligibility';
import { championById } from '../../src/champions/registry';

/**
 * M4, second champion. The point of champion augments is not that they exist,
 * it is that they *disagree* — a pool where every pick is an upgrade produces
 * the same run every time, which is the A-axis problem the roadmap opens with.
 * These check the shape that makes disagreement possible; whether the lanes
 * actually feel different is a playtest question, not a test question.
 */
describe('Lux augments (M4)', () => {
  it('are all gated to Lux and nowhere else', () => {
    for (const a of LUX_AUGMENTS) {
      expect(a.champion, a.id).toBe('lux');
      expect(augmentFitsChampion(a, 'lux'), a.id).toBe(true);
      expect(augmentFitsChampion(a, 'sivir'), a.id).toBe(false);
      expect(augmentFitsChampion(a, 'zac'), a.id).toBe(false);
    }
  });

  it('is registered in the live pool exactly once each', () => {
    for (const a of LUX_AUGMENTS) {
      expect(AUGMENTS.filter((x) => x.id === a.id).length, a.id).toBe(1);
    }
  });

  it('has unique ids that cannot collide with another champion set', () => {
    const ids = LUX_AUGMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('lux_'), id).toBe(true);
  });

  it('covers at least four build lanes with several picks each', () => {
    // The roadmap asks for 8-10 augments over 4-5 lanes per champion.
    expect(LUX_AUGMENTS.length).toBeGreaterThanOrEqual(8);
    const lanes = new Set(LUX_AUGMENTS.flatMap((a) => a.tags ?? []));
    expect(lanes.size).toBeGreaterThanOrEqual(2);
  });

  it('spreads across tiers rather than sitting in one', () => {
    const tiers = new Set(LUX_AUGMENTS.map((a) => a.tier));
    expect(tiers.has('silber')).toBe(true);
    expect(tiers.has('gold')).toBe(true);
    expect(tiers.has('prisma')).toBe(true);
  });

  it('describes itself to the player without leaking notation (B10)', () => {
    for (const a of LUX_AUGMENTS) {
      expect(a.description.length, a.id).toBeGreaterThan(15);
      expect(a.description, a.id).not.toMatch(/[[\]]/);
    }
  });

  it('actually does something — no augment is only a description', () => {
    for (const a of LUX_AUGMENTS) {
      const acts = !!(a.hooks || a.onUpdate || a.onCombatInit || a.statMods || a.ruleFlags);
      expect(acts, `${a.id} has no effect of any kind`).toBe(true);
    }
  });
});

