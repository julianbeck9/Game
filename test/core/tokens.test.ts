import { describe, expect, it, beforeEach } from 'vitest';
import { tokensFor, tokenBudget } from '../../src/core/tokens';
import { run, newRun } from '../../src/core/run';
import type { Combat } from '../../src/core/combat';
import type { Unit } from '../../src/entities/Unit';

/**
 * Attack tokens (SCHLACHTPLAN Phase 1.2): at most `tokenBudget(round)` enemies
 * attack at once, holders rotate, and a unit mid wind-up keeps its token.
 * The live behaviour is measured headless in scripts/dodgecheck.mjs; these
 * pin the bookkeeping so a refactor cannot quietly break the cap.
 */

const unit = (): Unit => ({ alive: true }) as Unit;
const fight = (): Combat => ({ units: [] }) as unknown as Combat;

describe('attack tokens', () => {
  beforeEach(() => {
    newRun();
    run.round = 6; // budget 3
  });

  it('never hands out more tokens than the round budget', () => {
    const t = tokensFor(fight());
    const us = [unit(), unit(), unit(), unit(), unit()];
    const granted = us.filter((u) => t.request(u, 0));
    expect(granted).toHaveLength(tokenBudget(6));
    expect(t.active).toBe(3);
  });

  it('rotates: an expired holder rests, and a waiting unit takes its place', () => {
    const t = tokensFor(fight());
    const [a, b, c, d] = [unit(), unit(), unit(), unit()];
    for (const u of [a, b, c]) expect(t.request(u, 0)).toBe(true);
    expect(t.request(d, 0)).toBe(false);
    // After the hold time the first three return their tokens…
    expect(t.request(d, 3000)).toBe(true);
    // …and must rest before asking again, even though slots are free…
    expect(t.request(a, 3000)).toBe(false);
    // …after which they are back in the rotation.
    expect(t.request(a, 3950)).toBe(true);
  });

  it('a unit that is busy (mid wind-up) keeps its token past the hold time', () => {
    const t = tokensFor(fight());
    const a = unit();
    expect(t.request(a, 0)).toBe(true);
    // Refreshed every frame while busy, well beyond the 2600ms hold…
    for (let now = 0; now <= 3200; now += 16) t.request(a, now, true);
    expect(t.request(a, 3200, true)).toBe(true);
    // …while an idle holder loses it on schedule (control).
    const b = unit();
    expect(t.request(b, 0)).toBe(true);
    expect(t.request(b, 3200)).toBe(false);
  });

  it('each fight gets its own pool (the arena scene is reused across rounds)', () => {
    const f1 = fight();
    const f2 = fight();
    const u = unit();
    expect(tokensFor(f1).request(u, 0)).toBe(true);
    expect(tokensFor(f2).active).toBe(0);
  });

  it('the budget grows with the run and never passes four', () => {
    expect(tokenBudget(1)).toBe(2);
    expect(tokenBudget(8)).toBe(3);
    expect(tokenBudget(20)).toBe(4);
    expect(tokenBudget(40)).toBe(4);
  });
});
