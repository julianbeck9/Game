import { dist, norm, type Vec } from './geometry';
import type { Player } from '../entities/Player';
import type { Unit } from '../entities/Unit';
import type { Enemy } from '../entities/Enemy';

/**
 * Scripted player, for measurement — not a game feature.
 *
 * The sim harness needs someone to hold the controls for hundreds of runs, and
 * the numbers are only worth anything if that someone plays through the *same*
 * surfaces a human does: a movement vector, `castQ`/`castE` with an aim
 * direction, and `dash`. Nothing here reaches past those, so nothing here can
 * make the game look better than it plays.
 *
 * It is deliberately a competent-but-plain player: hold attack range, stand
 * still to let autos fire (champions only attack with planted feet), spend Q on
 * cooldown at the nearest target, keep E for when something is actually
 * incoming, and dash out of telegraphs. It does not read enemy internals it
 * could not see on screen — a telegraph is only reacted to once it is being
 * drawn.
 */

export interface AutopilotIntent {
  move: Vec;
  aim: Vec;
  q: boolean;
  e: boolean;
  dash: boolean;
}

let enabled = false;

export function setAutopilot(on: boolean): void {
  enabled = on;
}

export function autopilotEnabled(): boolean {
  return enabled;
}

const IDLE: AutopilotIntent = { move: { x: 0, y: 0 }, aim: { x: 0, y: 1 }, q: false, e: false, dash: false };

/** A telegraph the player can see being drawn right now. */
function incomingThreat(p: Player, foes: Unit[]): Unit | null {
  for (const f of foes) {
    const e = f as Enemy;
    if (typeof e.isCasting !== 'function' || !e.isCasting()) continue;
    if (dist(p.x, p.y, f.x, f.y) < 420) return f;
  }
  return null;
}

export function autopilotIntent(p: Player, units: Unit[]): AutopilotIntent {
  if (!p.alive) return IDLE;
  const foes = units.filter((u) => u !== p && u.alive && u.team !== p.team);
  if (foes.length === 0) return IDLE;

  let target = foes[0];
  let best = Infinity;
  for (const f of foes) {
    const d = dist(p.x, p.y, f.x, f.y);
    if (d < best) {
      best = d;
      target = f;
    }
  }
  const aim = norm(target.x - p.x, target.y - p.y);

  // Hold a band inside auto-attack range. Standing still matters: autos only
  // fire with planted feet, so drifting forever means never dealing damage.
  const range = p.stats.get('attackRange');
  const near = range * 0.6;
  const far = range * 0.92;

  let move: Vec = { x: 0, y: 0 };
  if (best > far) move = aim;
  else if (best < near) move = { x: -aim.x, y: -aim.y };

  const threat = incomingThreat(p, foes);
  if (threat) {
    // Sidestep a windup rather than walking down its middle.
    const away = norm(p.x - threat.x, p.y - threat.y);
    move = norm(-away.y + away.x * 0.3, away.x + away.y * 0.3);
  }

  return {
    move,
    aim,
    q: p.isReady('Q'),
    // E is defensive here; spending it on cooldown would flatter any augment
    // that happens to trigger off it.
    e: !!threat && p.isReady('E'),
    dash: !!threat && best < 220 && p.isReady('Dash'),
  };
}
