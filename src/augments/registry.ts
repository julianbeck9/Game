import { AugmentDef } from './types';
import { poolRef } from './helpers';
import { SILBER } from './silber';
import { GOLD } from './gold';
import { PRISMA } from './prisma';

/**
 * THE augment registry. Augments are data + hooks only: they subscribe to
 * combat events and push modifiers through the stat pipeline or call the
 * Combat API. Adding an augment means adding one entry to its tier file —
 * never touching combat core code.
 *
 * The pool is a from-scratch adaptation of the well-known arena augment
 * roster: same tier split and balancing relationships (flat values rescaled
 * to our stat ranges), but every name, text and implementation is original.
 */
export const AUGMENTS: AugmentDef[] = [...SILBER, ...GOLD, ...PRISMA];

// Late-bind the full pool for Transmutations-style augments (avoids cycles).
poolRef.all = AUGMENTS;

export function augmentById(id: string): AugmentDef | undefined {
  return AUGMENTS.find((a) => a.id === id);
}
