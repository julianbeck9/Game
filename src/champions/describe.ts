import type { AbilityShape, ChampionDef } from './types';
import { Q_SCALE, Q_SCALE_LABEL } from './kits';

/** Geometry half of the generated text: what `spec.q` says the shape/range/radius/angle are. */
function describeShape(shape: AbilityShape): string {
  switch (shape.kind) {
    case 'line':
      return `Line, ${shape.range} range, ${shape.width} wide`;
    case 'circle':
      if (shape.at === 'self') return `Self AoE, ${shape.radius} radius`;
      return shape.radius > 0
        ? `Circle, ${shape.range ?? '?'} range, ${shape.radius} radius`
        : `Targeted, ${shape.range ?? '?'} range`;
    case 'cone':
      return `Cone, ${shape.range} range, ${shape.angle}° wide`;
    case 'dash':
      return `Dash, ${shape.range} range`;
    case 'self':
      return 'Self-cast';
  }
}

/** Number half: the round-scaled Q_SCALE tuple, formatted per its Q_SCALE_LABEL entry. */
function describeScale(id: string): string | null {
  const values = Q_SCALE[id];
  const meta = Q_SCALE_LABEL[id];
  if (!values || !meta) return null;
  const shown = values.map((v) => (meta.toPercent ? Math.round(v * 100) : v));
  return `${shown.join('/')}${meta.unit ?? ''} ${meta.label} by round`;
}

/**
 * Generated ground-truth text for a champion's Q: shape from `spec.q`,
 * numbers from `Q_SCALE`/`Q_SCALE_LABEL` — both single sources also read by
 * the aim-preview renderer and the effect code itself, so this text can
 * never drift from what Q actually does (fixes B6).
 */
export function describeQ(champ: ChampionDef): string {
  const shape = champ.spec?.q;
  const shapeText = shape ? describeShape(shape) : null;
  const scaleText = describeScale(champ.id);
  if (shapeText && scaleText) return `${shapeText} — ${scaleText}.`;
  if (shapeText) return `${shapeText}.`;
  if (scaleText) return `${scaleText}.`;
  return '';
}
