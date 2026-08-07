import type { MapDef } from '../maps';
import { shade } from '../draw';

/**
 * Per-region colours for everything the environment layer draws.
 *
 * ARTDIRECTION rule 3: the map carries the palette. So the shadow on Shurima is
 * a warm brown, not black — a neutral black shadow over warm sand reads as
 * dirt on the lens, and the same grey lip line drawn on nine different maps is
 * exactly the "one effect pasted over nine paintings" look this pass exists to
 * remove. These are eyeballed against each PNG rather than derived, because a
 * formula over `floor[]` gets the hue right and the value wrong every time.
 */
export interface EnvPalette {
  /** Cast shadows and contact darkening. Dark, tinted toward the map's mood. */
  shadow: number;
  /** The bottom of a chasm / the emptiness outside the arena. */
  voidTone: number;
  /** Lit edge of a ledge or a wall top — the light comes from up-left. */
  lip: number;
  /** Dust kicked up by feet on this ground. */
  dust: number;
  /** Vignette / outer-frame tone. */
  frame: number;
}

const TABLE: Record<string, EnvPalette> = {
  // Ionia: green-blue shade, sky-white cliff light, the void is open sky-fog.
  highland: { shadow: 0x1d2a1e, voidTone: 0x203442, lip: 0xe8f4d8, dust: 0xcfd8b0, frame: 0x101a16 },
  // Demacia: cold marble, blue-grey shade, petrol shadow, gold-white light.
  demacia: { shadow: 0x1a2030, voidTone: 0x141a2a, lip: 0xfff2c8, dust: 0xd8dae8, frame: 0x0d1220 },
  // Freljord dark: deep blue ice shadow, near-black lake beneath.
  freljord_dark: { shadow: 0x16243a, voidTone: 0x0b1120, lip: 0xdff0ff, dust: 0xcfe6f5, frame: 0x0a1020 },
  // Freljord snow: brighter, snow bounces a lot of light back into shade.
  freljord_snow: { shadow: 0x24374e, voidTone: 0x101c2c, lip: 0xffffff, dust: 0xeaf6ff, frame: 0x101c2c },
  // Noxus: dried-blood brown shade, the pits go black-red.
  noxus: { shadow: 0x24120f, voidTone: 0x120606, lip: 0xf0c8a0, dust: 0xa8846c, frame: 0x1a0a0a },
  // Shurima: warm brown shade (never grey on sand), bleached sun lip.
  shurima: { shadow: 0x3a2510, voidTone: 0x24160a, lip: 0xfff0c0, dust: 0xe8cf94, frame: 0x241608 },
  // Zaun: sickly green shade, chem-sludge dark.
  zaun: { shadow: 0x14200f, voidTone: 0x0a1408, lip: 0xd8f0a0, dust: 0x9cb078, frame: 0x0c1408 },
  // Shadow Isles: teal mist shadow, the void is genuinely empty.
  shadow: { shadow: 0x0e1e1e, voidTone: 0x050c0c, lip: 0xa8f0e0, dust: 0x86b4ac, frame: 0x061010 },
  // Void: violet-black, the chasm glows faintly rather than going pure black.
  void: { shadow: 0x180f2a, voidTone: 0x0a0616, lip: 0xd8b0ff, dust: 0xa87ce0, frame: 0x0c0818 },
};

/**
 * Palette for a map, falling back to something derived from its own declared
 * floor/rim colours. The fallback exists so a map added later still renders
 * sensibly instead of drawing black-on-black — it is a safety net, not a
 * substitute for tuning the table above.
 */
export function envPalette(map: MapDef): EnvPalette {
  const known = TABLE[map.id];
  if (known) return known;
  return {
    shadow: shade(map.floor[0], -0.35),
    voidTone: shade(map.floor[0], -0.7),
    lip: shade(map.rim, 0.6),
    dust: shade(map.floor[2], 0.35),
    frame: shade(map.floor[0], -0.6),
  };
}
