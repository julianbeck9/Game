import Phaser from 'phaser';

/**
 * Little LoL-style stat glyphs drawn with vector primitives (no assets).
 * Each icon is centered on (cx, cy) and fits roughly within a box of `s`.
 */
export type IconKey =
  | 'maxHP'
  | 'damage'
  | 'abilityPower'
  | 'attackSpeed'
  | 'critChance'
  | 'armor'
  | 'magicResist'
  | 'abilityHaste'
  | 'abilityDamage'
  | 'moveSpeed'
  | 'lifesteal'
  | 'attackRange'
  | 'gold';

export const STAT_COLOR: Record<IconKey, number> = {
  maxHP: 0x5fd06a,
  damage: 0xe8956a,
  abilityPower: 0x6ab8ff,
  attackSpeed: 0xf0d060,
  critChance: 0xff6a6a,
  armor: 0xc9b47a,
  magicResist: 0x8fa8ff,
  abilityHaste: 0x7fe0d0,
  abilityDamage: 0xb98aff,
  moveSpeed: 0x9be0a0,
  lifesteal: 0xe0567a,
  attackRange: 0xa8d8a0,
  gold: 0xffd24a,
};

export function drawStatIcon(g: Phaser.GameObjects.Graphics, key: IconKey, cx: number, cy: number, s: number): void {
  const c = STAT_COLOR[key];
  const r = s / 2;
  g.fillStyle(c, 1);
  g.lineStyle(Math.max(2, s * 0.12), c, 1);

  switch (key) {
    case 'maxHP': {
      // Heart
      g.fillCircle(cx - r * 0.42, cy - r * 0.28, r * 0.46);
      g.fillCircle(cx + r * 0.42, cy - r * 0.28, r * 0.46);
      g.fillTriangle(cx - r * 0.82, cy - r * 0.06, cx + r * 0.82, cy - r * 0.06, cx, cy + r * 0.82);
      break;
    }
    case 'damage': {
      // Sword: blade + crossguard + hilt
      g.lineStyle(Math.max(3, s * 0.16), c, 1);
      g.beginPath();
      g.moveTo(cx - r * 0.6, cy + r * 0.6);
      g.lineTo(cx + r * 0.6, cy - r * 0.6);
      g.strokePath();
      g.lineStyle(Math.max(2, s * 0.1), c, 1);
      g.beginPath();
      g.moveTo(cx - r * 0.55, cy + r * 0.15);
      g.lineTo(cx - r * 0.1, cy + r * 0.6);
      g.strokePath();
      break;
    }
    case 'abilityPower': {
      // Wand + orb
      g.lineStyle(Math.max(3, s * 0.14), c, 1);
      g.beginPath();
      g.moveTo(cx - r * 0.5, cy + r * 0.6);
      g.lineTo(cx + r * 0.28, cy - r * 0.28);
      g.strokePath();
      g.fillCircle(cx + r * 0.42, cy - r * 0.42, r * 0.36);
      break;
    }
    case 'attackSpeed': {
      // Circular arrows (speed loop)
      g.lineStyle(Math.max(2, s * 0.12), c, 1);
      g.beginPath();
      g.arc(cx, cy, r * 0.62, Math.PI * 0.15, Math.PI * 1.5, false);
      g.strokePath();
      const ax = cx + Math.cos(Math.PI * 0.15) * r * 0.62;
      const ay = cy + Math.sin(Math.PI * 0.15) * r * 0.62;
      g.fillTriangle(ax + r * 0.2, ay - r * 0.2, ax + r * 0.2, ay + r * 0.24, ax - r * 0.16, ay + r * 0.02);
      break;
    }
    case 'critChance': {
      // Starburst
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = i % 2 === 0 ? r * 0.9 : r * 0.4;
        const a2 = ((i + 1) / 8) * Math.PI * 2;
        const rr2 = (i + 1) % 2 === 0 ? r * 0.9 : r * 0.4;
        g.fillTriangle(cx, cy, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, cx + Math.cos(a2) * rr2, cy + Math.sin(a2) * rr2);
      }
      break;
    }
    case 'armor': {
      // Shield
      g.fillStyle(c, 1);
      g.beginPath();
      g.moveTo(cx, cy - r * 0.8);
      g.lineTo(cx + r * 0.7, cy - r * 0.5);
      g.lineTo(cx + r * 0.55, cy + r * 0.4);
      g.lineTo(cx, cy + r * 0.85);
      g.lineTo(cx - r * 0.55, cy + r * 0.4);
      g.lineTo(cx - r * 0.7, cy - r * 0.5);
      g.closePath();
      g.fillPath();
      break;
    }
    case 'magicResist': {
      // Shield with a spark
      g.lineStyle(Math.max(2, s * 0.12), c, 1);
      g.beginPath();
      g.moveTo(cx, cy - r * 0.8);
      g.lineTo(cx + r * 0.7, cy - r * 0.5);
      g.lineTo(cx + r * 0.55, cy + r * 0.4);
      g.lineTo(cx, cy + r * 0.85);
      g.lineTo(cx - r * 0.55, cy + r * 0.4);
      g.lineTo(cx - r * 0.7, cy - r * 0.5);
      g.closePath();
      g.strokePath();
      g.fillStyle(c, 1);
      g.fillCircle(cx, cy, r * 0.2);
      break;
    }
    case 'abilityHaste': {
      // Gear-ish hourglass
      g.fillStyle(c, 1);
      g.fillTriangle(cx - r * 0.6, cy - r * 0.7, cx + r * 0.6, cy - r * 0.7, cx, cy);
      g.fillTriangle(cx - r * 0.6, cy + r * 0.7, cx + r * 0.6, cy + r * 0.7, cx, cy);
      break;
    }
    case 'abilityDamage': {
      // Impact star (diamond burst)
      g.fillStyle(c, 1);
      g.fillTriangle(cx, cy - r * 0.9, cx + r * 0.3, cy, cx - r * 0.3, cy);
      g.fillTriangle(cx, cy + r * 0.9, cx + r * 0.3, cy, cx - r * 0.3, cy);
      g.fillTriangle(cx - r * 0.9, cy, cx, cy - r * 0.3, cx, cy + r * 0.3);
      g.fillTriangle(cx + r * 0.9, cy, cx, cy - r * 0.3, cx, cy + r * 0.3);
      break;
    }
    case 'moveSpeed': {
      // Boot
      g.fillStyle(c, 1);
      g.fillRect(cx - r * 0.5, cy - r * 0.7, r * 0.5, r * 1.2);
      g.fillRect(cx - r * 0.5, cy + r * 0.2, r * 1.2, r * 0.4);
      break;
    }
    case 'lifesteal': {
      // Blood drop
      g.fillStyle(c, 1);
      g.fillCircle(cx, cy + r * 0.25, r * 0.55);
      g.fillTriangle(cx - r * 0.5, cy + r * 0.05, cx + r * 0.5, cy + r * 0.05, cx, cy - r * 0.85);
      break;
    }
    case 'attackRange': {
      // Crosshair / target
      g.lineStyle(Math.max(2, s * 0.1), c, 1);
      g.strokeCircle(cx, cy, r * 0.7);
      g.beginPath();
      g.moveTo(cx - r * 0.95, cy);
      g.lineTo(cx - r * 0.35, cy);
      g.moveTo(cx + r * 0.35, cy);
      g.lineTo(cx + r * 0.95, cy);
      g.moveTo(cx, cy - r * 0.95);
      g.lineTo(cx, cy - r * 0.35);
      g.moveTo(cx, cy + r * 0.35);
      g.lineTo(cx, cy + r * 0.95);
      g.strokePath();
      g.fillStyle(c, 1);
      g.fillCircle(cx, cy, r * 0.14);
      break;
    }
    case 'gold': {
      // Coin
      g.fillStyle(c, 1);
      g.fillCircle(cx, cy, r * 0.85);
      g.fillStyle(0xb8860b, 1);
      g.fillCircle(cx, cy, r * 0.55);
      break;
    }
  }
}
