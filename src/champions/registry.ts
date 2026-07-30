// Type-only: the sole use of Phaser here is the `Phaser.Scene` parameter of
// ensureChampionTextures. A value import would drag the whole engine (and its
// window dereference at import time) into every consumer — including the unit
// tests, where it costs more than vitest's hard-coded 60s worker start budget.
import type Phaser from 'phaser';
import { ChampionDef } from './types';
import { shade } from '../core/draw';
import { KITS } from './kits';

/**
 * The champion roster. Each champion is a data row (name / tagline / region)
 * bound to its bespoke kit (see kits.ts, keyed by id) and a PNG sprite
 * (public/champs/<id>.png). Original text throughout — a private fan homage.
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
}

/** id order matches the sprite sheet the art came from (see public/champs). */
const ROSTER: Row[] = [
  { id: 'zac', name: 'Zac', tagline: 'The Secret Weapon', region: 'Zaun' },
  { id: 'fizz', name: 'Fizz', tagline: 'The Tidal Trickster', region: 'Bilgewater' },
  { id: 'jarvan', name: 'Jarvan', tagline: 'The Exemplar', region: 'Demacia' },
  { id: 'taric', name: 'Taric', tagline: 'The Gem Knight', region: 'Demacia' },
  { id: 'teemo', name: 'Teemo', tagline: 'The Swift Scout', region: 'Bandle' },
  { id: 'kogmaw', name: "Kog'Maw", tagline: 'The Mouth of the Abyss', region: 'The Void' },
  { id: 'alistar', name: 'Alistar', tagline: 'The Minotaur', region: 'Runeterra' },
  { id: 'cassiopeia', name: 'Cassiopeia', tagline: 'The Serpent', region: 'Noxus' },
  { id: 'leesin', name: 'Lee Sin', tagline: 'The Blind Monk', region: 'Ionia' },
  { id: 'ziggs', name: 'Ziggs', tagline: 'The Hexplosives Expert', region: 'Zaun' },
  { id: 'nocturne', name: 'Nocturne', tagline: 'The Eternal Nightmare', region: 'The Dark' },
  { id: 'warwick', name: 'Warwick', tagline: 'The Uncaged Wrath', region: 'Zaun' },
  { id: 'blitzcrank', name: 'Blitzcrank', tagline: 'The Great Steam Golem', region: 'Zaun' },
  { id: 'amumu', name: 'Amumu', tagline: 'The Sad Mummy', region: 'Shurima' },
  { id: 'brand', name: 'Brand', tagline: 'The Burning Vengeance', region: 'Runeterra' },
  { id: 'varus', name: 'Varus', tagline: 'The Arrow of Retribution', region: 'Ionia' },
  { id: 'masteryi', name: 'Master Yi', tagline: 'The Wuju Bladesman', region: 'Ionia' },
  { id: 'fiddlesticks', name: 'Fiddlesticks', tagline: 'The Ancient Fear', region: 'The Dark' },
  { id: 'lux', name: 'Lux', tagline: 'The Lady of Luminosity', region: 'Demacia' },
  { id: 'sivir', name: 'Sivir', tagline: 'The Battle Mistress', region: 'Shurima' },
  { id: 'chogath', name: "Cho'Gath", tagline: 'The Terror of the Void', region: 'The Void' },
  { id: 'ashe', name: 'Ashe', tagline: 'The Frost Archer', region: 'Freljord' },
  { id: 'gragas', name: 'Gragas', tagline: 'The Rabble Rouser', region: 'Freljord' },
  { id: 'karthus', name: 'Karthus', tagline: 'The Deathsinger', region: 'The Dark' },
  { id: 'lucian', name: 'Lucian', tagline: 'The Purifier', region: 'Demacia' },
  { id: 'shen', name: 'Shen', tagline: 'The Eye of Twilight', region: 'Ionia' },
];

function build(row: Row): ChampionDef {
  const k = KITS[row.id];
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    region: row.region,
    kitLine: k.kitLine,
    info: k.info,
    base: { ...k.base },
    spec: k.spec,
    ranged: k.ranged,
    qRange: k.qRange,
    cds: k.cds,
    qCdFromAS: k.qCdFromAS,
    critMult: k.critMult,
    scales: k.scales,
    fireQ: k.fireQ,
    castE: k.castE,
    onDash: k.onDash,
    onAutoHit: k.onAutoHit,
    onCombatInit: k.onCombatInit,
    passiveTick: k.passiveTick,
    image: true,
    sprite: FALLBACK,
    palette: PAL,
  };
}

export const CHAMPIONS: ChampionDef[] = ROSTER.map(build);

/**
 * The champions actually offered on the select screen.
 *
 * The other 18 are **benched, not deleted** — kits, stats, specs and sprites all
 * stay exactly as they are, they are simply not offered. They still appear as
 * rival skins in the arena (entities/enemies.ts `dressAsRival`), so none of that
 * art goes to waste. Bringing one back is one id in this list.
 *
 * Why cut at all: eight champions with deep, kit-changing augments beat 26 that
 * all resolve to "aim Q, then auto-attack". This is the roster M4 builds
 * champion augments for, one archetype each — marksman, burst mage, assassin,
 * engage tank, utility hook, zone caster, sustain bruiser, on-hit DPS.
 */
const ACTIVE_IDS = ['sivir', 'lux', 'fizz', 'zac', 'blitzcrank', 'karthus', 'warwick', 'masteryi'];

export const ACTIVE_CHAMPIONS: ChampionDef[] = ACTIVE_IDS.map((id) => {
  const c = CHAMPIONS.find((x) => x.id === id);
  if (!c) throw new Error(`ACTIVE_IDS names a champion that does not exist: ${id}`);
  return c;
});

export function isActiveChampion(id: string): boolean {
  return ACTIVE_IDS.includes(id);
}

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
