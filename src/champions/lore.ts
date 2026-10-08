import pack from './newRoster.json';

/**
 * Character text from the champion pack (blurb, tip, difficulty).
 *
 * The pack ships a short description and a play tip per champion, written by
 * the owner; until now none of it reached the screen, so the select overlay
 * showed only mechanics. Read straight from the pack file so an edit there
 * lands in the game without a second copy to keep in sync.
 */
export interface Lore {
  blurb: string;
  tip: string;
  /** 1 = easy … 3 = hard, as the pack rates it. */
  difficulty: number;
}

const BY_ID = new Map<string, Lore>(
  (pack.champions as { id: string; blurb?: string; tip?: string; difficulty?: number }[]).map((c) => [
    c.id,
    { blurb: c.blurb ?? '', tip: c.tip ?? '', difficulty: c.difficulty ?? 1 },
  ]),
);

/** Pack text for a champion, or null for champions outside the pack. */
export function loreFor(id: string): Lore | null {
  return BY_ID.get(id) ?? null;
}
