import { dist, norm, type Vec } from './geometry';
import type { Player } from '../entities/Player';
import type { Unit } from '../entities/Unit';
import type { Enemy } from '../entities/Enemy';
import type { Hazard } from './combat';

/**
 * Scripted player, for measurement — not a game feature.
 *
 * The sim harness needs someone to hold the controls for hundreds of runs, and
 * the numbers are only worth anything if that someone plays through the *same*
 * surfaces a human does: a movement vector, `castQ`/`castE` with an aim
 * direction, and `dash`. Nothing here reaches past those, so nothing here can
 * make the game look better than it plays.
 *
 * It is deliberately a competent-but-plain player, not an optimum: hold attack
 * range, stand still so autos actually fire (champions only attack with planted
 * feet), spend Q on cooldown, keep E for a windup that is genuinely close, back
 * off when hurt, and never stand in a hazard. It reads only what is on screen —
 * a telegraph counts once it is being drawn, never before.
 *
 * Every threshold here is a lever on how good "the player" is, and therefore on
 * every KPI the sim reports. Change them deliberately, and re-measure.
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

/** Close enough that a windup is worth breaking position for. */
const THREAT_RANGE = 300;
/** Below this share of max HP, hold a wider berth. */
const HURT_PCT = 0.4;

function visibleThreat(p: Player, foes: Unit[]): Unit | null {
  let best: Unit | null = null;
  let bestD = THREAT_RANGE;
  for (const f of foes) {
    const e = f as Enemy;
    if (typeof e.isCasting !== 'function' || !e.isCasting()) continue;
    const d = dist(p.x, p.y, f.x, f.y);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

/** Enemy ground effect the player is currently standing in, if any. */
function standingInHazard(p: Player, hazards: readonly Hazard[]): Hazard | null {
  for (const h of hazards) {
    if (h.team === 'player') continue;
    if (dist(p.x, p.y, h.x, h.y) < h.r + p.radius) return h;
  }
  return null;
}

export function autopilotIntent(p: Player, units: Unit[], hazards: readonly Hazard[] = []): AutopilotIntent {
  if (!p.alive) return IDLE;
  const foes = units.filter((u) => u !== p && u.alive && u.team !== p.team);
  if (foes.length === 0) return IDLE;

  const range = p.stats.get('attackRange');

  // Focus the weakest thing already in range, else close on the nearest. Killing
  // something removes its damage from the fight, which stacking chip damage
  // across three healthy enemies does not.
  let target = foes[0];
  let bestScore = Infinity;
  for (const f of foes) {
    const d = dist(p.x, p.y, f.x, f.y);
    const score = d <= range ? f.hp : 1e6 + d;
    if (score < bestScore) {
      bestScore = score;
      target = f;
    }
  }
  const aim = norm(target.x - p.x, target.y - p.y);
  const targetD = dist(p.x, p.y, target.x, target.y);

  const hurt = p.maxHP > 0 && p.hp / p.maxHP < HURT_PCT;
  const near = range * (hurt ? 0.75 : 0.6);
  const far = range * 0.92;

  let move: Vec = { x: 0, y: 0 };
  if (targetD > far) move = aim;
  else if (targetD < near) move = { x: -aim.x, y: -aim.y };

  // Standing in a damage zone beats any positioning plan.
  const hazard = standingInHazard(p, hazards);
  if (hazard) {
    move = norm(p.x - hazard.x, p.y - hazard.y);
  }

  const threat = visibleThreat(p, foes);
  if (threat && !hazard) {
    // Sidestep a windup rather than walking down its middle. Perpendicular to
    // the caster keeps distance roughly constant while leaving the line.
    const away = norm(p.x - threat.x, p.y - threat.y);
    move = norm(-away.y, away.x);
  }

  const threatD = threat ? dist(p.x, p.y, threat.x, threat.y) : Infinity;
  return {
    move,
    aim,
    q: p.isReady('Q'),
    // E stays defensive: spending it on cooldown would flatter every augment
    // that happens to trigger off a cast.
    e: !!threat && threatD < 240 && p.isReady('E'),
    // Dash to break a close windup, or to escape a hazard that is chasing.
    dash: p.isReady('Dash') && ((!!threat && threatD < 200) || (!!hazard && hurt)),
  };
}
