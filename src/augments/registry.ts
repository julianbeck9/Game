import { AugmentDef } from './types';
import { poolRef } from './helpers';
import { SILBER } from './silber';
import { GOLD } from './gold';
import { PRISMA } from './prisma';
import { SIVIR_AUGMENTS } from './champions/sivir';
import { KARTHUS_AUGMENTS } from './champions/karthus';
import { BLITZCRANK_AUGMENTS } from './champions/blitzcrank';
import { FIZZ_AUGMENTS } from './champions/fizz';
import { ZAC_AUGMENTS } from './champions/zac';
import { LUX_AUGMENTS } from './champions/lux';
import { MASTERYI_AUGMENTS } from './champions/masteryi';
import { WARWICK_AUGMENTS } from './champions/warwick';
import { RETIRED_AUGMENT_IDS } from './retired';
import { CORE_AUGMENTS } from './core';

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
export const CHAMPION_AUGMENTS: AugmentDef[] = [...SIVIR_AUGMENTS, ...KARTHUS_AUGMENTS, ...BLITZCRANK_AUGMENTS, ...FIZZ_AUGMENTS,
  ...ZAC_AUGMENTS,
  ...LUX_AUGMENTS,
  ...MASTERYI_AUGMENTS,
  ...WARWICK_AUGMENTS,
];

/**
 * The live pool is now core.ts alone — twenty-one augments, rebuilt from
 * scratch. See the header there for why the old ~180 were dropped wholesale
 * rather than pruned.
 *
 * SILBER, GOLD, PRISMA and the per-champion files are still imported and still
 * compile, but no longer reach a run. They are kept rather than deleted for
 * two reasons: the tier files hold working implementations of mechanics worth
 * mining when the pool grows again, and the champion files are bound to the
 * League-derived roster that the new champion pack replaces — deleting them
 * before that swap lands would throw away the only reference for what those
 * champions did. `retired.ts` stays wired for the same reason.
 */
export const LEGACY_AUGMENTS: AugmentDef[] = [...SILBER, ...GOLD, ...PRISMA, ...CHAMPION_AUGMENTS].filter(
  (a) => !RETIRED_AUGMENT_IDS.has(a.id),
);

export const AUGMENTS: AugmentDef[] = CORE_AUGMENTS;

// Late-bind the full pool for Transmutations-style augments (avoids cycles).
poolRef.all = AUGMENTS;

export function augmentById(id: string): AugmentDef | undefined {
  // Falls back to the legacy pool so old ids still RESOLVE (debug grants, saved
  // references, tests) without being OFFERED — only AUGMENTS feeds the roll.
  return AUGMENTS.find((a) => a.id === id) ?? LEGACY_AUGMENTS.find((a) => a.id === id);
}
