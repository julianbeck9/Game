import type { Player } from '../entities/Player';
import type { Vec } from '../core/geometry';
import type { StatName } from '../core/stats';
import type { Unit } from '../entities/Unit';

/** Name + description for one ability slot (shown in the menu kit viewer). */
export interface AbilityInfo {
  name: string;
  desc: string;
}

/**
 * Declarative ground-truth for an ability's targeting shape, read by the aim
 * preview, the range/radius indicators, the description generator, and bot
 * AI — kept separate from `AbilityInfo` (which stays flavor text/name only).
 * Numbers must match what the `fireQ`/`castE` effect code actually hits.
 */
export type AbilityShape =
  | { kind: 'line'; range: number; width: number; speed?: number }
  | { kind: 'circle'; radius: number; at: 'self' | 'cursor'; range?: number }
  | { kind: 'cone'; range: number; angle: number } // angle in degrees
  | { kind: 'dash'; range: number }
  | { kind: 'self' }; // pure self-buff, no targetable shape

/**
 * Playable champion: a LoL-like stat sheet plus a 3-slot kit (Q / E / Dash),
 * a passive, and a 16-bit sprite. Fan-homage kits are adapted to this game's
 * controls; all art and text here is original.
 */
export interface ChampionDef {
  id: string;
  name: string;
  tagline: string;
  /** Home region, shown on the select screen. */
  region: string;
  /** One-line kit summary for the select cards. */
  kitLine: string;
  /** Full kit text for the menu detail viewer. */
  info: {
    passive: AbilityInfo;
    q: AbilityInfo;
    e: AbilityInfo;
    dash: AbilityInfo;
  };
  base: Partial<Record<StatName, number>>;
  /**
   * Declarative ability shapes for consumers that need ground truth about
   * targeting geometry (preview renderer, description generator, bot AI).
   * Optional per-slot so non-migrated champions don't break the build.
   */
  spec?: { q?: AbilityShape; e?: AbilityShape; dash?: AbilityShape };
  /**
   * Champion damage identity (LoL-like): which stats this champion's kit
   * actually scales with. Used to gate augment offers — an AP-only augment is
   * never offered to a champion that doesn't use AP. Defaults to attack-damage
   * (ad) when omitted; add 'ap' for mages like Lux.
   */
  scales?: ('ad' | 'ap')[];
  /** Ranged autos fire projectiles; melee autos are instant swings. */
  ranged: boolean;
  /** Aim-preview length and smart-cast acquisition range for Q. */
  qRange: number;
  cds: { Q: number; E: number; Dash: number };
  /** Yasuo: Q cooldown scales with attack speed instead of ability haste. */
  qCdFromAS?: boolean;
  /** Yasuo: crit chance counts double on auto-attacks. */
  critMult?: number;
  /** Q implementation; also used by the Echo augment for re-casts. */
  fireQ(p: Player, dir: Vec, scale: number): void;
  /** dir: aim direction (mouse on desktop, facing/joystick on touch). */
  castE(p: Player, dir?: Vec): void;
  /**
   * Champion-specific Dash effect (leap, hook, blink…). Runs when the player
   * dashes; return true to take over movement (the generic dash slide is
   * suppressed) or false/undefined to keep the plain directional dash.
   */
  onDash?(p: Player, dir: Vec): boolean | void;
  /** Optional on-hit rider for auto-attacks (frost, marks, executes…). */
  onAutoHit?(p: Player, target: Unit): void;
  /** Passive setup at combat start (reset stacks, seed state). */
  onCombatInit?(p: Player): void;
  /** Passive per-frame tick (flow building, regen, thresholds…). */
  passiveTick?(p: Player, dt: number): void;
  /** Passive reaction to taking damage (Yasuo flow shield, etc.). */
  onDamageTaken?(p: Player, dmg: number, source: Unit | null): void;
  /**
   * Last word before dying. Called when a hit would otherwise be lethal; return
   * true to refuse the death for now. The player keeps playing at 1 HP and is
   * immune while it lasts, then dies when `p.undyingUntil` passes — so it buys
   * a window to act, not a heal. Karthus's Death Defied is the reason this
   * exists: casting on after the killing blow is the best moment in his kit.
   */
  onLethal?(p: Player): boolean;
  /**
   * Advice for the scripted player only (core/autopilot), never read in real
   * play. A champion whose kit needs handling a generic bot cannot infer —
   * leading a fused skillshot, holding a toggle — says so here, so that
   * knowledge lives with the champion instead of accumulating as a pile of
   * special cases inside the bot. Leaving it out just means the plain rules
   * apply, which for most kits is correct.
   */
  autoplay?: {
    /** Milliseconds of lead to aim ahead of a moving target with Q. */
    qLeadMs?: number;
    /** E toggles a stance; hold it on while an enemy is within this radius. */
    toggleEWithin?: number;
    /** Key in `player.memory` holding that toggle's current state. */
    toggleEKey?: string;
  };
  /** 16-bit sprite: rows of palette characters ('.' = transparent). */
  sprite: string[];
  palette: Record<string, number>;
  /** If true, render a loaded PNG (public/champs/<id>.png) instead of the pixel sprite. */
  image?: boolean;
}
