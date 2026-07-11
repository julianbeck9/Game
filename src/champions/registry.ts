import Phaser from 'phaser';
import { ChampionDef } from './types';
import { COLORS } from '../config';
import { norm } from '../core/geometry';
import type { Unit } from '../entities/Unit';

/**
 * The champion roster. König is this game's own hero; Yasuo and Ashe are
 * private fan-homage adaptations of familiar kits, rebuilt for the
 * 3-slot control scheme with original pixel art and original text.
 */

const PAL = {
  K: 0x22222e, // dark
  S: 0xf0c8a0, // skin
  W: 0xf0f4ff, // white cloth
  B: 0x3a6ad0, // blue
  C: 0x7fd8f0, // ice
  Y: 0xffc832, // gold
  D: 0x8a6a2a, // dark gold
  R: 0xe03c3c, // red
  G: 0xb8c0d0, // steel
  T: 0x2aa198, // teal
};

// ---------------------------------------------------------------------------
// König — the game's own exiled king (boomerang blade / royal nova)
// ---------------------------------------------------------------------------

const koenig: ChampionDef = {
  id: 'koenig',
  name: 'Der König',
  tagline: 'Verbannter Herrscher',
  kitLine: 'Q Bumerangklinge · E Nova + verstärkte Hiebe · Dash schneidet',
  ranged: true,
  qRange: 640,
  cds: { Q: 4200, E: 8000, Dash: 5000 },
  base: {
    maxHP: 220,
    moveSpeed: 300,
    damage: 20,
    attackSpeed: 1.0,
    attackRange: 450,
    armor: 12,
    magicResist: 12,
    projSpeed: 900,
  },
  fireQ: (p, d, scale) => {
    const dmg = (25 + 1.1 * p.stats.get('damage')) * p.stats.get('abilityDamage') * scale;
    p.combat.spawnProjectile({
      x: p.x + d.x * (p.radius + 6),
      y: p.y + d.y * (p.radius + 6),
      dirX: d.x,
      dirY: d.y,
      speed: 1050,
      radius: 13,
      color: COLORS.playerProj,
      team: 'player',
      maxHits: 2,
      maxDist: 640,
      boomerangTo: p,
      spin: true,
      onHit: (t) => {
        const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch');
        p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
      },
    });
  },
  castE: (p) => {
    p.empoweredAutos = 3;
    const dmg = (8 + 0.4 * p.stats.get('damage')) * p.stats.get('abilityDamage');
    p.combat.ring(p.x, p.y, COLORS.buff, 270);
    for (const u of [...p.combat.units]) {
      if (!u.alive || u.team !== 'enemy') continue;
      if (Math.hypot(u.x - p.x, u.y - p.y) > 270) continue;
      const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'physisch');
      p.combat.bus.emit('abilityHit', { ability: 'E', target: u, dmg: dealt });
      const away = norm(u.x - p.x, u.y - p.y);
      u.moveBy(away.x * 95, away.y * 95);
    }
  },
  sprite: [
    '..Y.Y.Y..',
    '..YYYYY..',
    '..SSSSS..',
    '..SKSKS..',
    '..SSSSS..',
    '.DYYYYYD.',
    'DYYYYYYYD',
    'D.YYYYY.D',
    '..YYYYY..',
    '..D...D..',
  ],
  palette: PAL,
};

// ---------------------------------------------------------------------------
// Yasuo — wandernder Schwertkämpfer (fan homage)
// Q: Stahlsturm-Stich, jeder 3. entfesselt einen Wirbelsturm · E: Windwand
// ---------------------------------------------------------------------------

const yasuo: ChampionDef = {
  id: 'yasuo',
  name: 'Yasuo',
  tagline: 'Der Wanderer des Windes',
  kitLine: 'Q Stich, jeder 3. ein Wirbelsturm · E Windwand blockt Geschosse',
  ranged: false,
  qRange: 280,
  cds: { Q: 2600, E: 11000, Dash: 4200 },
  base: {
    maxHP: 215,
    moveSpeed: 335,
    damage: 22,
    attackSpeed: 1.3,
    attackRange: 150,
    armor: 14,
    magicResist: 10,
    critChance: 0.2,
    projSpeed: 900,
  },
  fireQ: (p, d, scale) => {
    p.memory.qStacks = (p.memory.qStacks ?? 0) + 1;
    const dmg = (12 + 0.85 * p.stats.get('damage')) * p.stats.get('abilityDamage') * scale;

    if (p.memory.qStacks >= 3) {
      // Third thrust: unleash the whirlwind
      p.memory.qStacks = 0;
      p.combat.spawnProjectile({
        x: p.x + d.x * (p.radius + 6),
        y: p.y + d.y * (p.radius + 6),
        dirX: d.x,
        dirY: d.y,
        speed: 820,
        radius: 20,
        color: 0xbfeef8,
        team: 'player',
        maxHits: 4,
        maxDist: 620,
        spin: true,
        onHit: (t) => {
          const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch');
          p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
          // Staggered by the storm
          t.stats.set({ id: 'slow:wirbel', stat: 'moveSpeed', pct: -0.6, expiresAt: p.combat.now + 800 });
        },
      });
      return;
    }

    // Narrow instant thrust
    const L = 270;
    const W = 46;
    p.combat.flashLine(p.x, p.y, p.x + d.x * L, p.y + d.y * L, 0xd8f4ff);
    for (const u of [...p.combat.units]) {
      if (!u.alive || u.team !== 'enemy') continue;
      const rx = u.x - p.x;
      const ry = u.y - p.y;
      const along = rx * d.x + ry * d.y;
      if (along < 0 || along > L + u.radius) continue;
      const off = Math.abs(rx * -d.y + ry * d.x);
      if (off > W + u.radius) continue;
      const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'physisch');
      p.combat.bus.emit('abilityHit', { ability: 'Q', target: u, dmg: dealt });
    }
  },
  castE: (p) => {
    // Windwand: a wall of wind in facing direction that devours enemy projectiles
    const d = p.facing;
    const cx = p.x + d.x * 110;
    const cy = p.y + d.y * 110;
    const half = 130;
    p.combat.addWall(cx - d.y * half, cy + d.x * half, cx + d.y * half, cy - d.x * half, p.combat.now + 2600);
  },
  sprite: [
    '.KKKKK...',
    'KKKKKKK..',
    '.SSSS.K..',
    '.SKSK.K..',
    '.SSSS.K.G',
    'WWWWW.K.G',
    'WBBBW...G',
    'W.WWW.W.G',
    '.W.W....G',
    '.K.K.....',
  ],
  palette: PAL,
};

// ---------------------------------------------------------------------------
// Ashe — Frostbogenschützin (fan homage)
// Autos verlangsamen · Q: Pfeilfächer · E: Fokusfeuer (Angriffstempo-Schub)
// ---------------------------------------------------------------------------

const ashe: ChampionDef = {
  id: 'ashe',
  name: 'Ashe',
  tagline: 'Die Frostbogenschützin',
  kitLine: 'Autos verlangsamen · Q Pfeilfächer · E Fokusfeuer (Tempo-Schub)',
  ranged: true,
  qRange: 560,
  cds: { Q: 5000, E: 9000, Dash: 5200 },
  base: {
    maxHP: 185,
    moveSpeed: 290,
    damage: 19,
    attackSpeed: 0.95,
    attackRange: 500,
    armor: 8,
    magicResist: 10,
    critChance: 0.1,
    projSpeed: 950,
  },
  fireQ: (p, d, scale) => {
    // Volley: a fan of frost arrows
    const dmg = (4 + 0.7 * p.stats.get('damage')) * p.stats.get('abilityDamage') * scale;
    const base = Math.atan2(d.y, d.x);
    for (const off of [-0.42, -0.21, 0, 0.21, 0.42]) {
      p.combat.spawnProjectile({
        x: p.x + Math.cos(base + off) * (p.radius + 6),
        y: p.y + Math.sin(base + off) * (p.radius + 6),
        dirX: Math.cos(base + off),
        dirY: Math.sin(base + off),
        speed: 980,
        radius: 9,
        color: 0x9fe8ff,
        team: 'player',
        maxDist: 560,
        onHit: (t) => {
          const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch');
          p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
          applyFrost(p, t, 0.35, 1600);
        },
      });
    }
  },
  castE: (p) => {
    // Fokusfeuer: surge of attack speed; frost bites harder while it lasts
    p.stats.set({ id: 'buff:fokusfeuer', stat: 'attackSpeed', pct: 0.8, expiresAt: p.combat.now + 3000 });
    p.memory.fokusUntil = p.combat.now + 3000;
    p.combat.ring(p.x, p.y, 0x9fe8ff, 120);
  },
  onAutoHit: (p, t) => {
    const strong = (p.memory.fokusUntil ?? 0) > p.combat.now;
    applyFrost(p, t, strong ? 0.35 : 0.15, strong ? 1500 : 1000);
  },
  sprite: [
    '...CCC...',
    '..CWWWC..',
    '.CWSSSWC.',
    '.CWSKSWC.',
    '..CWWWC..',
    '.CCWWWCC.',
    'CCWWWWWCC',
    'C.WWWWW.C',
    '..WWWWW..',
    '...C.C...',
  ],
  palette: PAL,
};

function applyFrost(p: { combat: { now: number } }, t: Unit, pct: number, ms: number): void {
  t.stats.set({ id: 'slow:frost', stat: 'moveSpeed', pct: -pct, expiresAt: p.combat.now + ms });
}

export const CHAMPIONS: ChampionDef[] = [koenig, yasuo, ashe];

export function championById(id: string): ChampionDef {
  return CHAMPIONS.find((c) => c.id === id) ?? koenig;
}

/** Bake each champion's pixel map into a texture once (8-bit look, zero per-frame cost). */
export function ensureChampionTextures(scene: Phaser.Scene, px = 6): void {
  for (const c of CHAMPIONS) {
    const key = `champ:${c.id}`;
    if (scene.textures.exists(key)) continue;
    const g = scene.add.graphics();
    c.sprite.forEach((row, ry) => {
      [...row].forEach((ch, rx) => {
        const color = c.palette[ch];
        if (color === undefined) return;
        g.fillStyle(color, 1);
        g.fillRect(rx * px, ry * px, px, px);
      });
    });
    g.generateTexture(key, c.sprite[0].length * px, c.sprite.length * px);
    g.destroy();
  }
}
