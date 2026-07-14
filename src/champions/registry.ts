import Phaser from 'phaser';
import { ChampionDef } from './types';
import { shade } from '../core/draw';
import { KITS, KitName } from './kits';

/**
 * The champion roster. Each champion is a data row that picks a reusable kit
 * archetype (see kits.ts) and supplies its own name / region / stat tweaks and
 * a PNG sprite (public/champs/<id>.png). Original text throughout — a private
 * fan homage, no third-party data copied.
 */

// Fallback pixel sprite, only drawn if a champion's PNG fails to load.
const PAL: Record<string, number> = { X: 0x14141c, S: 0xf0c8a0, A: 0x6a7a90, a: 0x40485a };
const FALLBACK = [
  '..AAAA..', '.AAAAAA.', '.AXSSXA.', '.ASSSSA.', '.AaSSaA.', 'A.AAAA.A',
  'A.aAAa.A', '..aAAa..', '..AA.AA.', '..XX.XX.',
];

interface Row {
  id: string;
  name: string;
  tagline: string;
  region: string;
  kit: KitName;
  base?: ChampionDef['base'];
}

/** id order matches the sprite sheet the art came from (see public/champs). */
const ROSTER: Row[] = [
  { id: 'zac', name: 'Zac', tagline: 'The Ooze', region: 'Zaun', kit: 'hooktank', base: { maxHP: 340 } },
  { id: 'fizz', name: 'Fizz', tagline: 'The Trickster', region: 'Bilgewater', kit: 'assassin', base: { moveSpeed: 345 } },
  { id: 'jarvan', name: 'Jarvan', tagline: 'The Vanguard', region: 'Demacia', kit: 'cleavetank' },
  { id: 'taric', name: 'Taric', tagline: 'The Gem Knight', region: 'Demacia', kit: 'mage', base: { maxHP: 220 } },
  { id: 'teemo', name: 'Teemo', tagline: 'The Scout', region: 'Bandle', kit: 'casterdot', base: { moveSpeed: 320 } },
  { id: 'kogmaw', name: "Kog'Maw", tagline: 'The Maw', region: 'The Void', kit: 'rockets', base: { attackRange: 560 } },
  { id: 'alistar', name: 'Alistar', tagline: 'The Bull', region: 'Runeterra', kit: 'hooktank' },
  { id: 'cassiopeia', name: 'Cassiopeia', tagline: 'The Serpent', region: 'Noxus', kit: 'casterdot' },
  { id: 'leesin', name: 'Lee Sin', tagline: 'The Monk', region: 'Ionia', kit: 'windblade' },
  { id: 'ziggs', name: 'Ziggs', tagline: 'The Bombardier', region: 'Zaun', kit: 'mage', base: { attackRange: 520 } },
  { id: 'nocturne', name: 'Nocturne', tagline: 'The Nightmare', region: 'The Dark', kit: 'assassin' },
  { id: 'warwick', name: 'Warwick', tagline: 'The Hunter', region: 'Zaun', kit: 'bruiserbleed', base: { lifesteal: 0.12 } },
  { id: 'blitzcrank', name: 'Blitzcrank', tagline: 'The Golem', region: 'Zaun', kit: 'hooktank' },
  { id: 'amumu', name: 'Amumu', tagline: 'The Lonely Mummy', region: 'Shurima', kit: 'hooktank', base: { maxHP: 330 } },
  { id: 'brand', name: 'Brand', tagline: 'The Ember', region: 'Runeterra', kit: 'casterdot', base: { abilityPower: 30 } },
  { id: 'varus', name: 'Varus', tagline: 'The Piercing Arrow', region: 'Ionia', kit: 'frostarrow', base: { attackRange: 540 } },
  { id: 'masteryi', name: 'Master Yi', tagline: 'The Blade', region: 'Ionia', kit: 'windblade', base: { attackSpeed: 1.4 } },
  { id: 'fiddlesticks', name: 'Fiddlesticks', tagline: 'The Dread', region: 'The Dark', kit: 'casterdot' },
  { id: 'lux', name: 'Lux', tagline: 'The Light', region: 'Demacia', kit: 'mage' },
  { id: 'sivir', name: 'Sivir', tagline: 'The Warrior', region: 'Shurima', kit: 'boomerang' },
  { id: 'chogath', name: "Cho'Gath", tagline: 'The Terror', region: 'The Void', kit: 'hooktank', base: { maxHP: 360, damage: 22 } },
  { id: 'ashe', name: 'Ashe', tagline: 'The Frost Archer', region: 'Freljord', kit: 'frostarrow' },
  { id: 'gragas', name: 'Gragas', tagline: 'The Reveler', region: 'Freljord', kit: 'cleavetank', base: { maxHP: 300 } },
  { id: 'karthus', name: 'Karthus', tagline: 'The Deathsinger', region: 'The Dark', kit: 'casterdot', base: { maxHP: 190 } },
  { id: 'lucian', name: 'Lucian', tagline: 'The Purifier', region: 'Demacia', kit: 'rockets' },
  { id: 'shen', name: 'Shen', tagline: 'The Eye', region: 'Ionia', kit: 'cleavetank' },
];

function build(row: Row): ChampionDef {
  const k = KITS[row.kit];
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    region: row.region,
    kitLine: k.kitLine,
    info: k.info,
    base: { ...k.base, ...row.base },
    ranged: k.ranged,
    qRange: k.qRange,
    cds: k.cds,
    qCdFromAS: k.qCdFromAS,
    critMult: k.critMult,
    scales: k.scales,
    fireQ: k.fireQ,
    castE: k.castE,
    onAutoHit: k.onAutoHit,
    onCombatInit: k.onCombatInit,
    passiveTick: k.passiveTick,
    onDamageTaken: k.onDamageTaken,
    image: true,
    sprite: FALLBACK,
    palette: PAL,
  };
}

export const CHAMPIONS: ChampionDef[] = ROSTER.map(build);

/** Every champion's PNG key, for scene preload. */
export const CHAMP_IMAGE_KEYS = CHAMPIONS.map((c) => c.id);

export function championById(id: string): ChampionDef {
  return CHAMPIONS.find((c) => c.id === id) ?? CHAMPIONS[0];
}

/** LoL-like identity check used to gate stat-specific augment offers. */
export function championUsesAP(id: string): boolean {
  return (championById(id).scales ?? ['ad']).includes('ap');
}

/**
 * Ensure a texture exists for each champion. Image champions load their PNG in
 * scene preload under `champ:<id>`; this only bakes a fallback pixel sprite for
 * any champion whose PNG isn't present, so nothing renders blank.
 */
export function ensureChampionTextures(scene: Phaser.Scene, px = 6): void {
  const PAD = 3;
  for (const c of CHAMPIONS) {
    const key = `champ:${c.id}`;
    if (scene.textures.exists(key)) continue; // PNG already loaded, or baked before
    const rows = c.sprite;
    const W = rows[0].length;
    const H = rows.length;
    const filled = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && c.palette[rows[y][x]] !== undefined;
    const g = scene.add.graphics();
    g.fillStyle(0x0a0a12, 1);
    rows.forEach((row, ry) => [...row].forEach((ch, rx) => { if (c.palette[ch] !== undefined) g.fillRect(PAD + rx * px - 2, PAD + ry * px - 2, px + 4, px + 4); }));
    rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
      const color = c.palette[ch]; if (color === undefined) return;
      let col = color; if (!filled(rx, ry - 1)) col = shade(color, 0.4); else if (!filled(rx, ry + 1)) col = shade(color, -0.32);
      g.fillStyle(col, 1); g.fillRect(PAD + rx * px, PAD + ry * px, px, px);
    }));
    g.generateTexture(key, W * px + PAD * 2, H * px + PAD * 2);
    g.destroy();
  }
}
