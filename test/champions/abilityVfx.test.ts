import { describe, expect, it } from 'vitest';
import { specForShape, vfxGeometry } from '../../src/champions/abilityVfx';
import type { VfxSpec } from '../../src/champions/championConfig';

const base: VfxSpec = { kind: 'projectile', color: 0x88ccff, speed: 520, dist: 260, size: 4 };

describe('vfxGeometry', () => {
  it('takes reach and thickness from a line ability', () => {
    expect(vfxGeometry({ kind: 'line', range: 700, width: 24 })).toEqual({ dist: 700, size: 12 });
  });

  it('draws a self-centred circle as a ring at its true radius', () => {
    expect(vfxGeometry({ kind: 'circle', radius: 200, at: 'self' })).toEqual({ kind: 'aoe', dist: 200 });
  });

  it('throws a cursor-placed circle out to its cast range', () => {
    const geo = vfxGeometry({ kind: 'circle', radius: 120, at: 'cursor', range: 600 });
    expect(geo?.dist).toBe(600);
  });

  it('follows the cone and dash reach', () => {
    expect(vfxGeometry({ kind: 'cone', range: 620, angle: 32 })?.dist).toBe(620);
    expect(vfxGeometry({ kind: 'dash', range: 340 })?.dist).toBe(340);
  });

  it('leaves pure self-buffs to their configured flourish', () => {
    expect(vfxGeometry({ kind: 'self' })).toBeUndefined();
    expect(vfxGeometry(undefined)).toBeUndefined();
  });
});

describe('specForShape', () => {
  it('keeps the artistic choice and only replaces the geometry', () => {
    const out = specForShape(base, { kind: 'line', range: 700, width: 24 });
    expect(out?.kind).toBe('projectile'); // effect type stays a config decision
    expect(out?.color).toBe(0x88ccff);
    expect(out?.speed).toBe(520);
    expect(out?.dist).toBe(700); // …but it now reaches as far as the ability
  });

  it('passes the base through untouched when there is no shape to honour', () => {
    expect(specForShape(base, undefined)).toBe(base);
  });

  /**
   * 13 of 26 champions have no castVfx in championConfig, and DEFAULT_CFG has
   * none either — casting drew nothing at all for them. The declared shape is
   * enough to synthesise an honest effect in the champion's own colour.
   */
  it('synthesises a cast effect when the champion has none configured', () => {
    const line = specForShape(undefined, { kind: 'line', range: 700, width: 24 }, 0x7cc144);
    expect(line).toMatchObject({ kind: 'projectile', dist: 700, color: 0x7cc144 });

    const selfBlast = specForShape(undefined, { kind: 'circle', radius: 200, at: 'self' }, 0x7cc144);
    expect(selfBlast).toMatchObject({ kind: 'aoe', dist: 200 });

    const cone = specForShape(undefined, { kind: 'cone', range: 620, angle: 32 }, 0x7cc144);
    expect(cone).toMatchObject({ kind: 'puff', dist: 620 });

    expect(specForShape(undefined, { kind: 'self' }, 0x7cc144)).toMatchObject({ kind: 'flash' });
  });

  it('still draws nothing when there is neither a config nor a shape', () => {
    expect(specForShape(undefined, undefined)).toBeUndefined();
  });
});
