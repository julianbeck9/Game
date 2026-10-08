import type Phaser from 'phaser';
import { shade } from '../core/draw';

/**
 * Per-archetype enemy silhouettes.
 *
 * Every enemy used to be the same `shadedDisc` — one radius, one circle, a
 * different tint and a 20px insignia in the middle. Six archetypes that fight
 * completely differently all read as "orange circle / purple circle", and at
 * the 1.6x camera zoom with nine of them on screen the insignia is far too
 * small to sort them by. That is the whole of "die Gegner sehen scheisse aus":
 * not the rendering quality, the lack of any silhouette to recognise.
 *
 * A silhouette is the cheapest readability there is — it survives being small,
 * being overlapped, being in front of a bright hazard, and being colour-blind.
 * So each archetype gets a distinct outline, and the outline says how it
 * fights: pointed = it comes at you, wide = it blocks, hovering = it casts.
 *
 * The COLLISION radius is untouched. Only the drawing changes here — the flow
 * field and `cellStandable` are radius-sensitive (B9), and a body that is drawn
 * bigger than it collides is a lie the player pays for, so shapes are inscribed
 * in the same radius they always had.
 */

/** Local-space point, facing = +x, scaled by radius. */
type P = [number, number];

/** Keyline colour — near-black, never pure black, so it reads as ink not a hole. */
const KEYLINE = 0x0d0b14;

/** Fill a polygon given in facing-local units, rotated onto `ang`. */
function poly(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, r: number, ang: number,
  pts: P[], color: number, alpha = 1,
): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  g.fillStyle(color, alpha);
  g.beginPath();
  pts.forEach(([px, py], i) => {
    const wx = x + (px * c - py * s) * r;
    const wy = y + (px * s + py * c) * r;
    if (i === 0) g.moveTo(wx, wy); else g.lineTo(wx, wy);
  });
  g.closePath();
  g.fillPath();
}

/** Same polygon as an outline — used for the dark rim that makes shapes pop. */
function outline(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, r: number, ang: number,
  pts: P[], color: number, w = 3, alpha = 1,
): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  g.lineStyle(w, color, alpha);
  g.beginPath();
  pts.forEach(([px, py], i) => {
    const wx = x + (px * c - py * s) * r;
    const wy = y + (px * s + py * c) * r;
    if (i === 0) g.moveTo(wx, wy); else g.lineTo(wx, wy);
  });
  g.closePath();
  g.strokePath();
}

// --- Shapes, all inscribed in radius 1 ---------------------------------------

// Hunter: a dart. Narrow and pointed forward — it closes distance, and the
// shape should make you expect that before it moves.
const HAESCHER: P[] = [[1.25, 0], [-0.45, 0.7], [-0.2, 0], [-0.45, -0.7]];

// Berserker: broad and top-heavy, with shoulders. Reads as weight.
const BERSERKER: P[] = [
  [0.9, 0.3], [0.55, 0.8], [-0.5, 1.0], [-0.95, 0.4],
  [-0.95, -0.4], [-0.5, -1.0], [0.55, -0.8], [0.9, -0.3],
];

// Guardian: a flat-fronted slab. The front edge is the shield, and it is the
// widest thing in the roster because blocking is what it does.
const WAECHTER: P[] = [
  [0.75, 1.0], [-0.6, 0.95], [-0.95, 0.45],
  [-0.95, -0.45], [-0.6, -0.95], [0.75, -1.0], [0.95, 0],
];

// Marksman: a long thin diamond, axis along its aim. Slim = squishy.
const SCHUETZE: P[] = [[1.2, 0], [0, 0.62], [-0.95, 0], [0, -0.62]];

// Spearmaiden: slim body; the reach is drawn separately as the shaft.
const SPEERMAID: P[] = [[0.75, 0], [0.1, 0.55], [-0.85, 0.3], [-0.85, -0.3], [0.1, -0.55]];

// Usurper: a jagged eight-point star. Nothing else in the arena has spikes.
const USURPATOR: P[] = (() => {
  const pts: P[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 === 0 ? 1.0 : 0.62;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
})();

/**
 * Draw one enemy body. `swinging` flashes it white on the melee swing frame,
 * which is the existing hit feedback and stays exactly as it was.
 */
export function drawArchetype(
  g: Phaser.GameObjects.Graphics,
  kind: string,
  x: number, y: number, r: number,
  facing: { x: number; y: number },
  color: number, darkColor: number,
  swinging: boolean,
  now: number,
): void {
  const ang = Math.atan2(facing.y, facing.x);
  const body = swinging ? 0xffffff : color;
  const rim = shade(color, -0.5);
  const lit = shade(body, 0.42);

  // Ground shadow. The caster hovers, so its shadow sits lower and smaller —
  // that gap under the body is what sells "floating" from a top-down view.
  const hover = kind === 'hexer';
  g.fillStyle(0x000000, hover ? 0.22 : 0.3);
  g.fillEllipse(x, y + r * (hover ? 1.25 : 0.88), r * (hover ? 1.5 : 2.05), r * 0.62);

  switch (kind) {
    case 'haescher':
      poly(g, x, y, r, ang, HAESCHER, rim);
      poly(g, x, y, r * 0.86, ang, HAESCHER, body);
      poly(g, x, y, r * 0.5, ang, HAESCHER, lit, 0.5);
      break;

    case 'berserker':
      poly(g, x, y, r, ang, BERSERKER, rim);
      poly(g, x, y, r * 0.87, ang, BERSERKER, body);
      poly(g, x, y, r * 0.45, ang, BERSERKER, lit, 0.45);
      // Shoulder spikes, drawn past the hull so the outline stays jagged.
      poly(g, x, y, r, ang, [[0.2, 0.95], [0.75, 1.5], [-0.15, 1.05]], rim);
      poly(g, x, y, r, ang, [[0.2, -0.95], [0.75, -1.5], [-0.15, -1.05]], rim);
      break;

    case 'waechter': {
      poly(g, x, y, r, ang, WAECHTER, rim);
      poly(g, x, y, r * 0.88, ang, WAECHTER, body);
      // Shield band across the front face — the part that matters.
      poly(g, x, y, r, ang, [[0.72, 0.95], [0.95, 0], [0.72, -0.95], [0.5, -0.9], [0.68, 0], [0.5, 0.9]], shade(color, 0.35));
      break;
    }

    case 'schuetze': {
      poly(g, x, y, r, ang, SCHUETZE, rim);
      poly(g, x, y, r * 0.85, ang, SCHUETZE, body);
      // Bow arc out front: a drawn bow, so its aim is visible without a shot.
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      g.lineStyle(3, shade(color, 0.4), 0.95);
      g.beginPath();
      g.arc(x + c * r * 0.95, y + s * r * 0.95, r * 0.72, ang - 1.05, ang + 1.05);
      g.strokePath();
      break;
    }

    case 'speermaid': {
      // Shaft first so the body sits on top of it.
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      g.lineStyle(4, shade(color, -0.15), 1);
      g.beginPath();
      g.moveTo(x - c * r * 0.7, y - s * r * 0.7);
      g.lineTo(x + c * r * 2.0, y + s * r * 2.0);
      g.strokePath();
      poly(g, x, y, r, ang, [[2.35, 0], [1.85, 0.26], [1.85, -0.26]], shade(color, 0.45)); // spear head
      poly(g, x, y, r, ang, SPEERMAID, rim);
      poly(g, x, y, r * 0.85, ang, SPEERMAID, body);
      break;
    }

    case 'hexer': {
      // Floating orb: no ground contact, plus a halo that turns on its own so
      // the caster is the one thing on screen that is never still.
      const bob = Math.sin(now / 420) * r * 0.12;
      const yy = y - r * 0.35 + bob;
      g.fillStyle(rim, 1);
      g.fillCircle(x, yy, r * 0.86);
      g.fillStyle(body, 1);
      g.fillCircle(x, yy, r * 0.72);
      g.fillStyle(lit, 0.5);
      g.fillCircle(x - r * 0.22, yy - r * 0.26, r * 0.36);
      const ha = now / 700;
      g.lineStyle(3, shade(color, 0.5), 0.85);
      g.beginPath();
      g.arc(x, yy, r * 1.05, ha, ha + 2.2);
      g.strokePath();
      g.beginPath();
      g.arc(x, yy, r * 1.05, ha + Math.PI, ha + Math.PI + 2.2);
      g.strokePath();
      break;
    }

    case 'usurpator':
      poly(g, x, y, r * 1.02, ang, USURPATOR, rim);
      poly(g, x, y, r * 0.88, ang, USURPATOR, body);
      g.fillStyle(shade(body, -0.25), 1);
      g.fillCircle(x, y, r * 0.42);
      break;

    default: {
      // Minions and anything unlisted: the old disc, deliberately plain so the
      // named archetypes stay the ones that draw the eye.
      g.fillStyle(rim, 1);
      g.fillCircle(x, y, r + 3);
      g.fillStyle(body, 1);
      g.fillCircle(x, y, r);
      g.fillStyle(lit, 0.45);
      g.fillCircle(x - r * 0.28, y - r * 0.32, r * 0.55);
      break;
    }
  }

  // Hard near-black keyline last, over everything.
  //
  // The arena maps are detailed painted isometric art; flat vector bodies laid
  // on top of them read as stickers and, worse, vanish wherever the map happens
  // to be the same value as the unit. A heavy dark outline is what every
  // readable action roguelike does about exactly this (Hades, Dead Cells) — it
  // separates the unit from ANY background instead of from one specific one,
  // and it keeps nine overlapping bodies individually countable.
  const shape =
    kind === 'haescher' ? HAESCHER :
    kind === 'berserker' ? BERSERKER :
    kind === 'waechter' ? WAECHTER :
    kind === 'schuetze' ? SCHUETZE :
    kind === 'speermaid' ? SPEERMAID :
    kind === 'usurpator' ? USURPATOR : null;

  if (shape) {
    outline(g, x, y, r * 1.02, ang, shape, KEYLINE, 5, 0.85);
    outline(g, x, y, r, ang, shape, darkColor, 2, 0.9);
  } else if (kind === 'hexer') {
    const yy = y - r * 0.35 + Math.sin(now / 420) * r * 0.12;
    g.lineStyle(5, KEYLINE, 0.85);
    g.strokeCircle(x, yy, r * 0.86);
    g.lineStyle(2, darkColor, 0.9);
    g.strokeCircle(x, yy, r * 0.84);
  } else {
    g.lineStyle(5, KEYLINE, 0.85);
    g.strokeCircle(x, y, r + 2);
  }
}
