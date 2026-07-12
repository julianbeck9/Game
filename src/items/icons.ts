import Phaser from 'phaser';
import { shade } from '../core/draw';

/**
 * Chunky 16-bit item icons drawn from tiny pixel maps. Each item picks an
 * `iconKind`; the item's own color tints the main body so pieces of the same
 * type still read as distinct. Palette chars:
 *   . transparent · X dark outline · C item color · L light color
 *   D dark item color · plus a few fixed accents (S steel, W wood, R red,
 *   B blue, Y yellow, G glass, w white).
 */
export type ItemIconKind =
  | 'boots' | 'sword' | 'dagger' | 'bow' | 'hammer' | 'axe' | 'spear'
  | 'plate' | 'cloak' | 'shield' | 'thorns' | 'staff' | 'orb' | 'wand'
  | 'tome' | 'heart' | 'hourglass' | 'flame' | 'frost' | 'cross'
  | 'fang' | 'moon' | 'star' | 'gauntlet' | 'coin';

const ACC: Record<string, number> = {
  S: 0xc8d0dc, s: 0x8a94a4, // steel
  W: 0x8a5a30, w: 0xf0f4ff, // wood / white
  R: 0xe03c3c, B: 0x5a8ad0, Y: 0xffd24a, G: 0xaee6ff,
  X: 0x14141c,
};

const ICONS: Record<ItemIconKind, string[]> = {
  boots: [
    '........',
    '..CC....',
    '..CC....',
    '..CC....',
    '..CCC...',
    '..CCCCC.',
    '..CCCCCC',
    '..DDDDDD',
  ],
  sword: [
    '......Sw',
    '.....SS.',
    '....SS..',
    '...SS...',
    '..SS....',
    '.YSY....',
    'W.Y.....',
    '........',
  ],
  dagger: [
    '.....S..',
    '....SS..',
    '...SS...',
    '..SS....',
    '.YYY....',
    '..W.....',
    '........',
    '........',
  ],
  bow: [
    '..CC....',
    '.C..C...',
    'C....C..',
    'C..S.C..',
    'C..S.C..',
    'C....C..',
    '.C..C...',
    '..CC....',
  ],
  hammer: [
    '.CCCC...',
    '.CCCC...',
    '.CDDC...',
    '..WW....',
    '..WW....',
    '..WW....',
    '..WW....',
    '........',
  ],
  axe: [
    '..CCCW..',
    '.CCCCCW.',
    '.CCCC.W.',
    '..DD..W.',
    '......W.',
    '......W.',
    '......W.',
    '........',
  ],
  spear: [
    '.......Y',
    '......C.',
    '.....C..',
    '....C...',
    '...C....',
    '..C.....',
    '.W......',
    'W.......',
  ],
  plate: [
    '.CCCCCC.',
    'CCCCCCCC',
    'CCDDDDCC',
    'CCCCCCCC',
    'CCCCCCCC',
    '.CCCCCC.',
    '..CCCC..',
    '...CC...',
  ],
  cloak: [
    '..CCCC..',
    '.CCCCCC.',
    'CCCCCCCC',
    'CCCCCCCC',
    'CCCCCCCC',
    'DCCCCCCD',
    '.DCCCCD.',
    '..D..D..',
  ],
  shield: [
    '.CCCCCC.',
    'CCCCCCCC',
    'CCCLLCCC',
    'CCLLLLCC',
    'CCCLLCCC',
    '.CCCCCC.',
    '..CCCC..',
    '...CC...',
  ],
  thorns: [
    'X.X.X.X.',
    '.CCCCCC.',
    'XCCCCCCX',
    '.CCLLCC.',
    'XCCCCCCX',
    '.CCCCCC.',
    'X.X.X.X.',
    '........',
  ],
  staff: [
    '.....GG.',
    '....GLLG',
    '....GLLG',
    '.....GG.',
    '....C...',
    '...C....',
    '..C.....',
    '.C......',
  ],
  orb: [
    '..GGGG..',
    '.GLLLLG.',
    'GLLwwLLG',
    'GLwwwwLG',
    'GLLwwLLG',
    'GLLLLLLG',
    '.GLLLLG.',
    '..GGGG..',
  ],
  wand: [
    '......Y.',
    '.....YCY',
    '......Y.',
    '....C...',
    '...C....',
    '..C.....',
    '.W......',
    'W.......',
  ],
  tome: [
    '.CCCCCC.',
    'CCwwwwCC',
    'CwCCCCwC',
    'CwCCCCwC',
    'CwCCCCwC',
    'CwwwwwwC',
    'CCCCCCCC',
    '.DDDDDD.',
  ],
  heart: [
    '.CC..CC.',
    'CCCCCCCC',
    'CCCCCCCC',
    'CCCLLCCC',
    '.CCCCCC.',
    '..CCCC..',
    '...CC...',
    '........',
  ],
  hourglass: [
    'YYYYYYYY',
    '.CCCCCC.',
    '..CCCC..',
    '...CC...',
    '...CC...',
    '..CCCC..',
    '.CCCCCC.',
    'YYYYYYYY',
  ],
  flame: [
    '...C....',
    '..CC....',
    '.CCLC...',
    'CCLLYC..',
    'CLYYLC..',
    'CLYYLCC.',
    '.CCLLC..',
    '..CCC...',
  ],
  frost: [
    '...C....',
    '.C.C.C..',
    '..CCC...',
    'CCCLCCC.',
    '..CCC...',
    '.C.C.C..',
    '...C....',
    '........',
  ],
  cross: [
    '...CC...',
    '...CC...',
    '.CCCCCC.',
    '.CCCCCC.',
    '...CC...',
    '...CC...',
    '...CC...',
    '...CC...',
  ],
  fang: [
    '.CCCCCC.',
    'CCCCCCCC',
    'CCCCCCCC',
    'DCCCCCCD',
    '.DCCCCD.',
    '..w..w..',
    '..w..w..',
    '........',
  ],
  moon: [
    '..CCCC..',
    '.CCC....',
    'CCC.....',
    'CCC.....',
    'CCC.....',
    '.CCC....',
    '..CCCC..',
    '........',
  ],
  star: [
    '...C....',
    '...C....',
    'C.CCC.C.',
    '.CCCCC..',
    '..CCC...',
    '.CC.CC..',
    'C.....C.',
    '........',
  ],
  gauntlet: [
    '.CC.CC..',
    'CCCCCCC.',
    'CCCCCCC.',
    'CCCCCCC.',
    '.CCCCCC.',
    '..CCCC..',
    '..CCCC..',
    '........',
  ],
  coin: [
    '..YYYY..',
    '.YYYYYY.',
    'YYDDYYY.',
    'YYDYDYY.',
    'YYDYDYY.',
    'YYYDDYY.',
    '.YYYYYY.',
    '..YYYY..',
  ],
};

/** Draw a chunky item icon centered at (cx, cy), fitting a box of size `s`. */
export function drawItemIcon(
  g: Phaser.GameObjects.Graphics,
  kind: ItemIconKind,
  cx: number,
  cy: number,
  s: number,
  color: number,
): void {
  const map = ICONS[kind] ?? ICONS.orb;
  const cols = map[0].length;
  const rows = map.length;
  const px = s / Math.max(cols, rows);
  const ox = cx - (cols * px) / 2;
  const oy = cy - (rows * px) / 2;
  const pal: Record<string, number> = {
    C: color,
    D: shade(color, -0.4),
    L: shade(color, 0.4),
    ...ACC,
  };
  map.forEach((row, ry) => {
    [...row].forEach((ch, rx) => {
      const col = pal[ch];
      if (col === undefined) return;
      g.fillStyle(col, 1);
      g.fillRect(ox + rx * px, oy + ry * px, px + 0.5, px + 0.5);
    });
  });
}
