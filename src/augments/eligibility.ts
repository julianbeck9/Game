import type { AugmentDef } from './types';
import { championUsesAP } from '../champions/registry';

/**
 * Whether an augment is worth offering to (or granting) a given champion.
 * LoL-like gating: stat-specific augments only appear for champions that can
 * actually use that stat — an AP-only augment never shows up for an AD
 * champion, so you never waste a pick on a dead stat.
 */
export function augmentFitsChampion(def: AugmentDef, championId: string): boolean {
  if (def.needs?.includes('ap') && !championUsesAP(championId)) return false;
  return true;
}
