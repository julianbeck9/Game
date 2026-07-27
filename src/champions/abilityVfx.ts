import type { VfxSpec } from './championConfig';
import type { AbilityShape } from './types';

/**
 * Geometry overrides for a cast VFX, derived from the ability's declared shape.
 *
 * championConfig owns the *artistic* choice (which effect, which colour); the
 * AbilitySpec owns the *truth* (how far it reaches, how wide it is). Before
 * this, both were hand-tuned separately and drifted: a champion whose Q flies
 * 700px drew a 260px default projectile, so the effect stopped in mid-air well
 * short of where the ability actually hit.
 *
 * Same single-source-of-truth rule the aim preview already follows — the
 * numbers live in exactly one place and everything else reads them.
 */
export function vfxGeometry(shape: AbilityShape | undefined): Partial<VfxSpec> | undefined {
  if (!shape) return undefined;
  switch (shape.kind) {
    case 'line':
      // Reach is the real range; thickness follows the hitbox width.
      return { dist: shape.range, size: Math.max(3, shape.width / 2) };
    case 'circle':
      // Self-centred blasts draw at their true radius; cursor-placed ones are
      // thrown out to their cast range.
      return shape.at === 'self'
        ? { kind: 'aoe', dist: shape.radius }
        : { dist: shape.range ?? shape.radius, size: Math.max(4, shape.radius / 8) };
    case 'cone':
      return { kind: 'cone', dist: shape.range, spread: shape.angle };
    case 'dash':
      return { dist: shape.range };
    case 'self':
      return undefined; // no reach to honour — keep the configured flourish
  }
}

/**
 * Cast effect for one ability.
 *
 * With a configured `base`, the champion's authored effect is kept and only
 * resized to the real reach. Without one, the effect is synthesised from the
 * shape: half the roster (13 of 26) has no `castVfx` in championConfig at all,
 * so casting was visually silent for them. Now that every champion declares an
 * AbilitySpec, the shape itself is enough to draw something honest.
 *
 * `fallbackColor` should be the champion's attack colour, so a synthesised cast
 * stays in the same palette as the rest of its kit.
 */
export function specForShape(
  base: VfxSpec | undefined,
  shape: AbilityShape | undefined,
  fallbackColor = 0xffffff,
): VfxSpec | undefined {
  const geo = vfxGeometry(shape);
  if (base) return geo ? { ...base, ...geo } : base;
  if (!shape) return undefined;
  return synthesize(shape, fallbackColor);
}

function synthesize(shape: AbilityShape, color: number): VfxSpec {
  switch (shape.kind) {
    case 'line':
      return { kind: 'projectile', color, speed: 900, dist: shape.range, size: Math.max(3, shape.width / 2) };
    case 'circle':
      return shape.at === 'self'
        ? { kind: 'aoe', color, dist: shape.radius }
        : { kind: 'lob', color, dist: shape.range ?? shape.radius, size: Math.max(4, shape.radius / 8) };
    case 'cone':
      return { kind: 'cone', color, dist: shape.range, spread: shape.angle };
    case 'dash':
      return { kind: 'flash', color };
    case 'self':
      return { kind: 'flash', color };
  }
}

/**
 * Attack effect for one auto-attack.
 *
 * A ranged champion's auto already spawns a real, damaging projectile — the
 * configured cosmetic `projectile`/`lob` effect then flew alongside it as a
 * second, slower, harmless copy. So for those, the travel visual is the real
 * projectile and all the sprite contributes is a muzzle flash.
 */
export function attackVfxFor(base: VfxSpec | undefined, ranged: boolean): VfxSpec | undefined {
  if (!ranged || !base) return base;
  if (base.kind !== 'projectile' && base.kind !== 'lob') return base;
  return { kind: 'muzzle', color: base.color, size: Math.max(8, (base.size ?? 5) * 1.6), shake: base.shake };
}
