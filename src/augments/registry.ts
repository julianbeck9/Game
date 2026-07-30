import { AugmentDef } from './types';
import { poolRef } from './helpers';
import { SILBER } from './silber';
import { GOLD } from './gold';
import { PRISMA } from './prisma';
import { SIVIR_AUGMENTS } from './champions/sivir';
import { KARTHUS_AUGMENTS } from './champions/karthus';
import { RETIRED_AUGMENT_IDS } from './retired';

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
// Champion augments live alongside the generic pool; eligibility.ts keeps them
// out of every other champion's offers.
export const CHAMPION_AUGMENTS: AugmentDef[] = [...SIVIR_AUGMENTS, ...KARTHUS_AUGMENTS];

// Pure stat sticks are retired from the pool (see retired.ts): raw numbers are
// the item shop's job, augments are supposed to change how a run plays.
export const AUGMENTS: AugmentDef[] = [...SILBER, ...GOLD, ...PRISMA, ...CHAMPION_AUGMENTS].filter(
  (a) => !RETIRED_AUGMENT_IDS.has(a.id),
);

// Late-bind the full pool for Transmutations-style augments (avoids cycles).
poolRef.all = AUGMENTS;

export function augmentById(id: string): AugmentDef | undefined {
  return AUGMENTS.find((a) => a.id === id);
}
