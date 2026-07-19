// @vitest-environment jsdom
//
// jsdom, not node: champions/registry.ts imports Phaser, which dereferences
// `window` at import time.
import { describe, expect, it } from 'vitest';
import { CHAMPIONS } from '../../src/champions/registry';

const VALID_KINDS = new Set(['line', 'circle', 'cone', 'dash', 'self']);

describe('AbilitySpec coverage (B3, S2-3)', () => {
  it('has exactly 26 champions in the roster', () => {
    expect(CHAMPIONS.length).toBe(26);
  });

  it('every champion has a spec.q with a recognized shape kind', () => {
    const missing = CHAMPIONS.filter((c) => !c.spec?.q).map((c) => c.id);
    expect(missing).toEqual([]);
    for (const c of CHAMPIONS) {
      expect(VALID_KINDS.has(c.spec!.q!.kind)).toBe(true);
    }
  });
});
