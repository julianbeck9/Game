/**
 * Retired augments: pure stat sticks, pulled out of the offer pool.
 *
 * Design rule this enforces: **stats come from items, augments change how you
 * play.** These 31 were the ones the effect matrix classified as `statMod` —
 * augments whose entire content is a number going up, with no hook, no
 * condition and no interaction. Picking one never changed a decision, so three
 * of them on a pick screen was three non-choices in a row, and that is the main
 * reason the augment screen felt flat.
 *
 * They are retired rather than deleted from the source so the numbers stay
 * available: the intent is to fold their budget into the item catalogue (which
 * is *supposed* to be where raw stats live) and to spend the freed pool slots
 * on champion augments that rewrite kits.
 *
 * Re-offering one is a one-line change: drop the id from this list.
 */
export const RETIRED_AUGMENT_IDS: ReadonlySet<string> = new Set([
  // silber
  'wucht',
  'flinkhand',
  'blutkelch',
  'beintag',
  'purist',
  'fernrohr',
  'panzerglueck',
  'knochenbrecher',
  'doppelzuender',
  'hexensinn',
  'eiferer',
  // gold
  'himmelsleib',
  'trommelfeuer',
  'zweitschlag',
  'volltreffer',
  'gewitterhieb',
  'zeitschleife',
  'hauptgang',
  'beilage',
  'weittracht',
  'seelensauger',
  'wundbrand',
  // prisma
  'zuckerschock',
  'brachialmagie',
  'klingenschwur',
  'beidhaendig',
  'wichtelwut',
  'porzellankanone',
  'gigantwuchs',
  'prunkfaust',
  'adlerauge',

  // ---- Second pass: augments that are not stat sticks but still make no
  // decision. Same rule as above — if picking it never changes how you play,
  // it is taking a slot away from something that would.

  // "Instantly gain N random permanent stat bonuses": the stat-stick problem
  // wearing a hat, and random on top, so you cannot even build around it.
  'statistik1',
  'statistik2',
  'statistik3',

  // Permanent stat growth on takedowns. The number goes up on its own; there is
  // no moment where owning it changes a choice.
  'zerlegung',
  'panzerlok',
  'grauensbringer',
  'schrumpfwerk',

  // Four near-identical timer turrets: "every N seconds, hit the nearest enemy".
  // They play themselves and they play the same. The distinct ones are kept
  // instead — laserblick (aims along your facing), schmortopf (an aura you
  // position), lauffeuer (chains) and giftspur (a trail you lay).
  'fuchsfeuer',
  'glutkern',
  'wurfholz',
  'orbitalschlag',
]);
