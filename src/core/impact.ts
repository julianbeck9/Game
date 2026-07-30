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

/**
 * Draw the burst at the point of contact. Rings sized by severity, so a heavy
 * hit visibly displaces more of the screen than a light one.
 */
export function drawBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  sev: number,
  color: number,
  depth = 139,
): void {
  const g = scene.add.graphics().setDepth(depth);
  const r0 = 16 + sev * 34;
  g.lineStyle(Math.max(2, 2 + sev * 4), color, 0.95);
  g.strokeCircle(x, y, r0);
  // Spokes read as direction-less force and cost nothing; only heavy hits get
  // them, which keeps light hits from turning the screen into confetti.
  if (sev >= 0.3) {
    const spokes = 4 + Math.round(sev * 4);
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + Math.random() * 0.3;
      const inner = r0 * 0.7;
      const outer = r0 * (1.35 + sev * 0.5);
      g.lineBetween(x + Math.cos(a) * inner, y + Math.sin(a) * inner, x + Math.cos(a) * outer, y + Math.sin(a) * outer);
    }
  }
  scene.tweens.add({
    targets: g,
    alpha: 0,
    scaleX: 1.5 + sev,
    scaleY: 1.5 + sev,
    duration: 180 + sev * 160,
    ease: 'Cubic.easeOut',
    onComplete: () => g.destroy(),
  });
  // Tween scale around the burst's own centre rather than the world origin.
  g.setPosition(0, 0);
}

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
