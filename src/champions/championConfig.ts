/**
 * championConfig.ts — Einzige Quelle der Wahrheit für Champion-Tuning + VFX.
 *
 * Jede Signature aus deiner Liste ist hier auf Animations-/VFX-Parameter gemappt.
 * Zum Feintunen NUR hier anfassen — AnimatedChampion und ChampionVfx lesen daraus.
 * Fehlt eine ID, greift DEFAULT_CFG (Melee-Lunge, generischer Slash).
 */

export type Archetype = 'melee' | 'ranged' | 'caster';
export type AttackStyle = 'lunge' | 'recoil';
export type VfxKind =
  | 'meleeArc'   // Nahkampf-Slash vor der Figur
  | 'projectile' // gerades Geschoss nach vorn
  | 'lob'        // Bogen-Wurf, landet vor der Figur
  | 'puff'       // expandierende Wolke (Blasrohr etc.)
  | 'beam'       // kurzer Strahl nach vorn
  | 'grab'       // ausfahrender Arm/Haken, zieht zurück
  | 'aoe'        // Ring am Boden (Stampf/Explosion)
  | 'cone'       // Kegel/Sektor in Zielrichtung (Fächer, Atem)
  | 'muzzle'     // kurzes Mündungsfeuer an der Waffe (echtes Geschoss fliegt separat)
  | 'flash';     // kurzer Leucht-Blitz an der Figur

export interface VfxSpec {
  kind: VfxKind;
  color: number;
  speed?: number;   // px/s (projectile/lob)
  dist?: number;    // Reichweite px
  size?: number;    // Radius/Dicke px
  /** Öffnungswinkel in Grad (nur 'cone'). */
  spread?: number;
  shake?: number;   // Kamera-Shake-Intensität (0 = keiner)
}

export interface ChampCfg {
  archetype: Archetype;
  attackStyle: AttackStyle;
  walkBob?: number;   // 0 = kein Laufzyklus → Gleiten
  idleAmp?: number;   // Atem-Amplitude
  lunge?: number;     // Vorstoß-Reichweite (Melee)
  float?: boolean;    // dauerhaftes Schweben (Idle)
  jitter?: boolean;   // ruckartiges Zucken (fiddlesticks)
  attackDur?: number; // ms, überschreibt Default 300
  castDur?: number;   // ms, überschreibt Default 520
  attackVfx?: VfxSpec;
  castVfx?: VfxSpec;
}

const arc  = (color: number, extra: Partial<VfxSpec> = {}): VfxSpec => ({ kind: 'meleeArc', color, size: 16, ...extra });
const proj = (color: number, extra: Partial<VfxSpec> = {}): VfxSpec => ({ kind: 'projectile', color, speed: 520, dist: 260, size: 4, ...extra });
const lob  = (color: number, extra: Partial<VfxSpec> = {}): VfxSpec => ({ kind: 'lob', color, speed: 320, dist: 140, size: 5, ...extra });
const aoe  = (color: number, extra: Partial<VfxSpec> = {}): VfxSpec => ({ kind: 'aoe', color, dist: 46, ...extra });

export const DEFAULT_CFG: ChampCfg = {
  archetype: 'melee', attackStyle: 'lunge', lunge: 10,
  attackVfx: arc(0xffffff),
};

export const CHAMPS: Record<string, ChampCfg> = {
  // --- Melee-Nahkampf ---
  zac:        { archetype: 'melee',  attackStyle: 'lunge', idleAmp: 0.06, lunge: 14, attackVfx: arc(0x7cc144, { size: 20, shake: 3 }) },
  fizz:       { archetype: 'melee',  attackStyle: 'lunge', lunge: 12, idleAmp: 0.045, attackDur: 240, attackVfx: arc(0x4fd0c0) },
  jarvan:     { archetype: 'melee',  attackStyle: 'lunge', lunge: 16, attackVfx: arc(0xf0c020, { size: 20 }), castVfx: aoe(0xf0c020, { dist: 40 }) },
  taric:      { archetype: 'melee',  attackStyle: 'lunge', lunge: 12, attackDur: 360, attackVfx: arc(0xff77cc, { size: 22, shake: 3 }), castVfx: { kind: 'flash', color: 0xff99dd } },
  alistar:    { archetype: 'melee',  attackStyle: 'lunge', lunge: 12, idleAmp: 0.03, attackVfx: arc(0xd8cbb0, { size: 20, shake: 4 }), castVfx: aoe(0xd8cbb0, { shake: 5 }) },
  leesin:     { archetype: 'melee',  attackStyle: 'lunge', lunge: 14, attackDur: 220, attackVfx: arc(0xd08040) },
  nocturne:   { archetype: 'melee',  attackStyle: 'lunge', lunge: 13, attackVfx: arc(0x6a5aa0), castVfx: { kind: 'flash', color: 0x2a2340 } },
  warwick:    { archetype: 'melee',  attackStyle: 'lunge', lunge: 13, idleAmp: 0.02, attackVfx: arc(0x8fb0d0, { size: 18 }) },
  masteryi:   { archetype: 'melee',  attackStyle: 'lunge', lunge: 12, attackDur: 180, attackVfx: arc(0xe0d040, { size: 14 }) },
  chogath:    { archetype: 'melee',  attackStyle: 'lunge', lunge: 12, idleAmp: 0.03, attackVfx: arc(0x9060a0, { size: 22, shake: 4 }), castVfx: aoe(0x9060a0, { dist: 52, shake: 5 }) },
  gragas:     { archetype: 'melee',  attackStyle: 'lunge', lunge: 12, idleAmp: 0.04, attackVfx: arc(0xc06040, { size: 20, shake: 3 }), castVfx: lob(0x9a5a2a, { size: 7 }) },
  shen:       { archetype: 'melee',  attackStyle: 'lunge', lunge: 12, idleAmp: 0.028, attackVfx: arc(0x40a0c0) },
  amumu:      { archetype: 'melee',  attackStyle: 'lunge', lunge: 9,  attackVfx: arc(0xddccaa), castVfx: proj(0xe8dcc0, { speed: 360, size: 3 }) },
  fiddlesticks:{ archetype: 'melee', attackStyle: 'lunge', lunge: 12, jitter: true, attackVfx: arc(0x8b9b5b, { size: 20 }) },
  blitzcrank: { archetype: 'melee',  attackStyle: 'lunge', lunge: 14, idleAmp: 0.03, attackVfx: arc(0xf0a020, { size: 20, shake: 3 }), castVfx: { kind: 'grab', color: 0xf0d060, dist: 220, size: 6 } },

  // --- Ranged / Recoil ---
  teemo:      { archetype: 'ranged', attackStyle: 'recoil', walkBob: 2, attackVfx: { kind: 'puff', color: 0x8fd14f, dist: 120, size: 6 } },
  kogmaw:     { archetype: 'ranged', attackStyle: 'recoil', attackVfx: proj(0xb060d0, { speed: 380, size: 5 }) },
  varus:      { archetype: 'ranged', attackStyle: 'recoil', attackDur: 460, attackVfx: proj(0x9b6fd0, { speed: 640, size: 3, dist: 320 }) },
  ashe:       { archetype: 'ranged', attackStyle: 'recoil', attackDur: 460, attackVfx: proj(0x9fd0e0, { speed: 560, size: 3, dist: 320 }) },
  sivir:      { archetype: 'ranged', attackStyle: 'recoil', attackVfx: proj(0xd0a040, { speed: 420, size: 6, dist: 200 }) },
  lucian:     { archetype: 'ranged', attackStyle: 'recoil', attackDur: 220, attackVfx: proj(0xe0c060, { speed: 700, size: 3 }) },

  // --- Caster ---
  ziggs:      { archetype: 'caster', attackStyle: 'recoil', attackVfx: lob(0xff8030, { size: 6, shake: 3 }), castVfx: aoe(0xff8030, { dist: 50, shake: 4 }) },
  brand:      { archetype: 'caster', attackStyle: 'recoil', attackVfx: proj(0xff5522, { speed: 460, size: 5 }), castVfx: aoe(0xff5522, { dist: 48, shake: 3 }) },
  lux:        { archetype: 'caster', attackStyle: 'recoil', castDur: 560, attackVfx: proj(0xffe070, { speed: 520, size: 3 }), castVfx: { kind: 'beam', color: 0xffe070, dist: 200, size: 10 } },
  cassiopeia: { archetype: 'caster', attackStyle: 'lunge', walkBob: 0, lunge: 8, attackVfx: arc(0x60c080), castVfx: aoe(0x60c080, { dist: 44 }) },
  karthus:    { archetype: 'caster', attackStyle: 'recoil', walkBob: 0, float: true, attackVfx: proj(0x50c0a0, { speed: 400, size: 4 }), castVfx: aoe(0x50c0a0, { dist: 56 }) },
};

/** Alle 26 IDs, abgeleitet aus CHAMPS (für Loader/Demo als Manifest nutzbar). */
export const CHAMP_IDS: string[] = Object.keys(CHAMPS);

export function cfgFor(id: string): ChampCfg {
  const c = CHAMPS[id];
  if (!c) console.warn(`[championConfig] keine Config für "${id}" — DEFAULT_CFG genutzt`);
  return c ?? DEFAULT_CFG;
}
