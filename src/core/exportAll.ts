import { exportEdits } from './mapEdits';
import { exportBalance } from './balance';

/** Everything the admin has changed (map collision + balance), one blob to paste. */
export function exportAll(): string {
  return `=== MAP COLLISION ===\n${exportEdits()}\n\n=== BALANCE ===\n${exportBalance()}`;
}
