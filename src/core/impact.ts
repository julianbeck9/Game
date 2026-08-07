import Phaser from 'phaser';
import type { Unit } from '../entities/Unit';

/**
 * How a hit feels.
 *
 * The owner's note on priority 2 is the whole brief: *"man muss checken dass es
 * ein Impact hat außer eine Zahl, das hat man am meisten mit Animationen."* A
 * hit used to be a number floating upward and a 90ms tint; only a **kill** got
 * hit-stop. So every blow in the game landed with the same non-weight,
 * regardless of whether it took 3% or 60% of a health bar — and no amount of
 * build depth is felt through a flat impact.
 *
 * Everything here keys off ONE number: how big the hit was relative to what it
 * hit. That is what a player actually perceives — 200 damage is enormous to a
 * minion and a scratch to a boss — and routing every effect through a single
 * severity keeps shake, freeze, flash and text agreeing with each other instead
 * of each having its own hand-tuned threshold.
 */

/** 0 = a scratch, 1 = this took most of the bar. */
export function severityOf(dealt: number, target: Unit): number {
  const bar = Math.max(1, target.maxHP);
  return Math.max(0, Math.min(1, dealt / (bar * 0.35)));
}

export interface ImpactOpts {
  /** Player taking damage reads louder than the player dealing it. */
  onPlayer: boolean;
  /** Killing blows get the full treatment regardless of size. */
  killing?: boolean;
  /** Ability hits are allowed to be showier than auto-attacks. */
  ability?: boolean;
}

/**
 * Hit-stop, in ms of world-freeze. The oldest trick in the action-game book:
 * a couple of frames where nothing moves reads as *weight*, because the eye
 * gets a moment to register that something connected.
 *
 * Deliberately short and capped — long freezes feel like lag, not force, and
 * they stack badly when several enemies are hit at once.
 */
export function hitStopMs(sev: number, opts: ImpactOpts): number {
  if (opts.killing) return 130;
  if (sev < 0.18) return 0; // chip damage must not stutter the game
  return Math.round(35 + sev * 75);
}

/** Camera shake as [duration ms, intensity]. */
export function shakeFor(sev: number, opts: ImpactOpts): [number, number] {
  if (opts.onPlayer) return [150, Math.min(0.02, 0.005 + sev * 0.02)];
  if (opts.killing) return [140, 0.008];
  if (sev < 0.12) return [0, 0];
  return [Math.round(70 + sev * 90), Math.min(0.014, 0.002 + sev * 0.014)];
}

/** Damage-number size in px, so a big hit is legible as big before it is read. */
export function numberSize(sev: number): number {
  return Math.round(26 + sev * 34);
}

/** How much debris one hit throws. See `sprayFor`. */
export interface Spray {
  sparks: number;
  debris: number;
  smoke: number;
  /** Cone half-width in radians for the main spray. */
  spread: number;
  /** Launch speed in px/s before per-particle jitter. */
  speed: number;
  /** Leave a mark on the floor. */
  decal: boolean;
  /** Peak alpha of the screen wash; 0 = none. */
  flash: number;
}

/**
 * Severity → how much matter a hit throws.
 *
 * This lives next to hit-stop and shake on purpose. Those two already agree
 * with each other because they read the same severity; the particles have to
 * read it from the same place or the game ends up with a hit that freezes hard
 * and sprays nothing, which reads as a bug rather than as a heavy blow.
 *
 * The thresholds below are the *only* place a hit's class is decided:
 *
 * - under 0.28 — sparks only. A scratch should not throw rubble.
 * - 0.28+      — solid debris and smoke appear: something broke.
 * - 0.55+      — the floor keeps a mark, and the screen acknowledges it.
 *
 * Note the spread NARROWS as severity rises. That is counter-intuitive and
 * deliberate: a weak hit glances and scatters, a heavy one drives through and
 * throws its debris along the line of the blow, which is what makes the two
 * read as different events rather than the same event at two sizes.
 */
export function sprayFor(sev: number): Spray {
  const heavy = sev >= 0.55;
  const solid = sev >= 0.28;
  return {
    sparks: Math.round(4 + sev * 14),
    debris: solid ? Math.round(2 + sev * 7) : 0,
    smoke: solid ? Math.round(1 + sev * 3) : 0,
    spread: 1.5 - sev * 0.75,
    speed: 150 + sev * 420,
    decal: heavy,
    flash: heavy ? 0.05 + sev * 0.09 : 0,
  };
}

/*
 * `drawBurst` used to live here: one `add.graphics()` plus one tween per hit,
 * drawing a direction-less circle. It moved to `core/particles.ts` as
 * `Particles.shock()`, which is pooled (no display object per blow, which the
 * leak check in scripts/verify.mjs cares about) and stretches the ring along
 * the damage vector so the burst says which way the hit came from.
 */

/**
 * A short-lived label for something the *build* did — an augment firing, a
 * passive triggering. Without this a champion augment is invisible: the number
 * changes and the player has no way to connect it to the pick they made.
 */
export function procLabel(scene: Phaser.Scene, x: number, y: number, text: string, color = '#ffd24a'): void {
  const t = scene.add
    .text(x, y, text, {
      fontFamily: 'sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color,
      stroke: '#000000',
      strokeThickness: 4,
    })
    .setOrigin(0.5)
    .setDepth(142)
    .setAlpha(0);
  scene.tweens.add({ targets: t, alpha: 1, y: y - 14, duration: 110 });
  scene.tweens.add({
    targets: t,
    alpha: 0,
    y: y - 62,
    delay: 420,
    duration: 420,
    onComplete: () => t.destroy(),
  });
}
