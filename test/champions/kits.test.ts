// Plain `node` environment (no jsdom) — see the import-hygiene test at the
// bottom of this file for why champions/registry.ts must not value-import Phaser.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACTIVE_CHAMPIONS, CHAMPIONS, isActiveChampion } from '../../src/champions/registry';

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

/**
 * Import hygiene. champions/registry.ts is the entry point every champion unit
 * test pulls in, and it needs Phaser only for one `Phaser.Scene` parameter type.
 *
 * Written as a source-level assertion on purpose: a runtime check does NOT catch
 * this. Under the `node` environment a value import of Phaser loads fine, so the
 * suite stays green — the damage only shows up under jsdom, where importing the
 * engine costs more than the 60s worker-start budget that vitest hard-codes
 * (START_TIMEOUT in vitest/dist/chunks/cli-api.*.js, not configurable). The
 * symptom is 4 test files dying with "Timeout waiting for worker to respond",
 * which reads like a flaky machine rather than an import mistake.
 */
/**
 * M3: the roster shown on the select screen is cut to eight, and the other 18
 * are **benched, not deleted**. The owner wants that art and those kits kept, so
 * this pins down that benching stayed a filter on what is offered and never
 * became a deletion — re-activating one must remain a single id in ACTIVE_IDS.
 */
describe('active roster (M3)', () => {
  const ACTIVE = ['sivir', 'lux', 'fizz', 'zac', 'blitzcrank', 'karthus', 'warwick', 'masteryi'];

  it('offers exactly the eight planned champions', () => {
    expect(ACTIVE_CHAMPIONS.map((c) => c.id).sort()).toEqual([...ACTIVE].sort());
    for (const id of ACTIVE) expect(isActiveChampion(id)).toBe(true);
    expect(isActiveChampion('teemo')).toBe(false);
  });

  it('keeps all 26 champions in the code, fully intact', () => {
    expect(CHAMPIONS.length).toBe(26);
    const benched = CHAMPIONS.filter((c) => !isActiveChampion(c.id));
    expect(benched.length).toBe(18);
    for (const c of benched) {
      // Everything a champion needs to be playable again, still present.
      expect(typeof c.fireQ, c.id).toBe('function');
      expect(typeof c.castE, c.id).toBe('function');
      expect(c.spec?.q, c.id).toBeTruthy();
      expect(c.sprite.length, c.id).toBeGreaterThan(0);
      expect(Object.keys(c.base).length, c.id).toBeGreaterThan(0);
      expect(c.info.q.name.length, c.id).toBeGreaterThan(0);
    }
  });
});

/**
 * B10: internal VFX direction notes were reaching the player. Every ability
 * description is authored with a bracketed note for the effect work
 * ("[blue shield outline]"), and all 97 of them were rendered verbatim in the
 * menu's kit viewer. `AI()` in kits.ts strips them; this pins that down for the
 * whole roster, including champions added later.
 */
describe('player-facing ability text (B10)', () => {
  const slots = ['passive', 'q', 'e', 'dash'] as const;

  it('never leaks a bracketed VFX note', () => {
    const leaks: string[] = [];
    for (const c of CHAMPIONS) {
      for (const slot of slots) {
        const { name, desc } = c.info[slot];
        if (/[[\]]/.test(desc)) leaks.push(`${c.id}.${slot}: ${desc}`);
        if (/[[\]]/.test(name)) leaks.push(`${c.id}.${slot} (name): ${name}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it('leaves a real sentence behind after stripping', () => {
    for (const c of CHAMPIONS) {
      for (const slot of slots) {
        const d = c.info[slot].desc;
        expect(d.length, `${c.id}.${slot}`).toBeGreaterThan(10);
        expect(d, `${c.id}.${slot}`).toBe(d.trim());
        expect(d, `${c.id}.${slot}`).not.toMatch(/\s{2,}/);
      }
    }
  });
});

describe('import hygiene', () => {
  it('champions/registry.ts imports Phaser type-only', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../src/champions/registry.ts', import.meta.url)),
      'utf8',
    );
    expect(src).toMatch(/^import type Phaser from 'phaser';$/m);
    expect(src).not.toMatch(/^import Phaser from 'phaser';$/m);
  });
});
