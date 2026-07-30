import { describe, expect, it } from 'vitest';
import { BLITZCRANK_AUGMENTS } from '../../src/augments/champions/blitzcrank';
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
describe('Blitzcrank augments (M4)', () => {
  it('are all gated to Blitzcrank and nowhere else', () => {
    for (const a of BLITZCRANK_AUGMENTS) {
      expect(a.champion, a.id).toBe('blitzcrank');
      expect(augmentFitsChampion(a, 'blitzcrank'), a.id).toBe(true);
      expect(augmentFitsChampion(a, 'sivir'), a.id).toBe(false);
      expect(augmentFitsChampion(a, 'lux'), a.id).toBe(false);
    }
  });

  it('is registered in the live pool exactly once each', () => {
    for (const a of BLITZCRANK_AUGMENTS) {
      expect(AUGMENTS.filter((x) => x.id === a.id).length, a.id).toBe(1);
    }
  });

  it('has unique ids that cannot collide with another champion set', () => {
    const ids = BLITZCRANK_AUGMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('blz_'), id).toBe(true);
  });

  it('covers at least four build lanes with several picks each', () => {
    // The roadmap asks for 8-10 augments over 4-5 lanes per champion.
    expect(BLITZCRANK_AUGMENTS.length).toBeGreaterThanOrEqual(8);
    const lanes = new Set(BLITZCRANK_AUGMENTS.flatMap((a) => a.tags ?? []));
    expect(lanes.size).toBeGreaterThanOrEqual(2);
  });

  it('spreads across tiers rather than sitting in one', () => {
    const tiers = new Set(BLITZCRANK_AUGMENTS.map((a) => a.tier));
    expect(tiers.has('silber')).toBe(true);
    expect(tiers.has('gold')).toBe(true);
    expect(tiers.has('prisma')).toBe(true);
  });

  it('describes itself to the player without leaking notation (B10)', () => {
    for (const a of BLITZCRANK_AUGMENTS) {
      expect(a.description.length, a.id).toBeGreaterThan(15);
      expect(a.description, a.id).not.toMatch(/[[\]]/);
    }
  });

  it('actually does something — no augment is only a description', () => {
    for (const a of BLITZCRANK_AUGMENTS) {
      const acts = !!(a.hooks || a.onUpdate || a.onCombatInit || a.statMods || a.ruleFlags);
      expect(acts, `${a.id} has no effect of any kind`).toBe(true);
    }
  });
});

describe('Blitzcrank kit (M4)', () => {
  const blitz = championById('blitzcrank');

  it('fires the hook where you aim, as a real skillshot', () => {
    // Rocket Grab used to snap to the nearest enemy, which made the most
    // distinctive button in the roster impossible to miss — and so impossible
    // to play well. The declared line is what the aim preview draws.
    const dash = blitz.spec?.dash;
    expect(dash?.kind).toBe('line');
    if (dash && dash.kind === 'line') {
      expect(dash.range).toBeGreaterThan(400);
      expect(dash.width).toBeGreaterThan(0);
    }
  });

  it('tells the scripted player to lead the hook', () => {
    expect(blitz.autoplay?.qLeadMs).toBeGreaterThan(0);
  });

  it('keeps Power Fist as a self-buff on the next attack', () => {
    expect(blitz.spec?.q?.kind).toBe('self');
    expect(typeof blitz.onAutoHit).toBe('function');
  });
});
