import Phaser from 'phaser';
import { ChampionDef } from './types';
import { COLORS } from '../config';
import { norm } from '../core/geometry';
import type { Unit } from '../entities/Unit';

/**
 * The champion roster. König is this game's own hero; the rest are private
 * fan-homage adaptations of familiar kits, rebuilt for the 3-slot control
 * scheme with original 16-bit pixel art and original text.
 */

const PAL: Record<string, number> = {
  X: 0x14141c, // outline / dark
  S: 0xf0c8a0, // skin
  s: 0xc89870, // skin shadow
  W: 0xf0f4ff, // white cloth
  w: 0xb8c0d8, // white shadow
  B: 0x3a6ad0, // blue
  b: 0x24448a, // blue shadow
  C: 0x7fd8f0, // ice
  c: 0x4898b8, // ice shadow
  Y: 0xffc832, // gold
  y: 0xb8860b, // gold shadow
  R: 0xe03c3c, // red
  r: 0x8b1a1a, // red shadow
  G: 0xb8c0d0, // steel
  g: 0x707a90, // steel shadow
  H: 0x6a4a2a, // brown hair
  h: 0x2a2a34, // black hair
  L: 0xf0d878, // blonde
  M: 0xcc66ff, // magic purple
  P: 0xff8ac0, // pink
  N: 0x44aa66, // green
  O: 0xff8c3a, // orange
};

// ---------------------------------------------------------------------------
// König — the game's own exiled king (boomerang blade / royal nova)
// ---------------------------------------------------------------------------

const koenig: ChampionDef = {
  id: 'koenig',
  name: 'Der König',
  tagline: 'Verbannter Herrscher',
  region: 'Die Krone',
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
    '..Y..Y..Y...',
    '..YYYYYYY...',
    '..XSSSSSX...',
    '..XSXSXSX...',
    '..XSSSSSX...',
    '..XsSSSsX...',
    '.RXYYYYYXR..',
    'RRYYYYYYYRR.',
    'RRYyYYYyYRR.',
    '.RYYYYYYYR..',
    '.RyYYYYYyR..',
    '..yYY.YYy...',
    '..XX...XX...',
    '..XX...XX...',
  ],
  palette: PAL,
};

// ---------------------------------------------------------------------------
// Yasuo — wandernder Schwertkämpfer (fan homage)
// Q skaliert mit Angriffstempo · doppelte Kritchance · Windwand in Zielrichtung
// ---------------------------------------------------------------------------

const yasuo: ChampionDef = {
  id: 'yasuo',
  name: 'Yasuo',
  tagline: 'Der Wanderer des Windes',
  region: 'Ionia',
  kitLine: 'Q Stich (lädt mit Angriffstempo), jeder 3. ein Wirbelsturm · E Windwand in Zielrichtung · doppelte Kritchance',
  ranged: false,
  qRange: 280,
  cds: { Q: 3600, E: 11000, Dash: 4200 },
  qCdFromAS: true,
  critMult: 2,
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
  castE: (p, dir) => {
    // Windwand: placed toward the aim (mouse / joystick), not just facing
    const d = dir ?? p.facing;
    const cx = p.x + d.x * 130;
    const cy = p.y + d.y * 130;
    const half = 140;
    p.combat.addWall(cx - d.y * half, cy + d.x * half, cx + d.y * half, cy - d.x * half, p.combat.now + 2600);
  },
  sprite: [
    '....hhhh....',
    '...hhhhhh...',
    '...XSSSSX...',
    '...RRRRRR...',
    '...XSXXSX...',
    '...XsSSsX...',
    'h..XBBBBX..G',
    'hh.BBWWBB..G',
    '.h.BWWWWB..G',
    '...BBWWBB..G',
    '...bBBBBb..G',
    '...bb..bb..y',
    '...XX..XX...',
    '...XX..XX...',
  ],
  palette: PAL,
};

// ---------------------------------------------------------------------------
// Ashe — Frostbogenschützin (fan homage)
// ---------------------------------------------------------------------------

const ashe: ChampionDef = {
  id: 'ashe',
  name: 'Ashe',
  tagline: 'Die Frostbogenschützin',
  region: 'Freljord',
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
    p.stats.set({ id: 'buff:fokusfeuer', stat: 'attackSpeed', pct: 0.8, expiresAt: p.combat.now + 3000 });
    p.memory.fokusUntil = p.combat.now + 3000;
    p.combat.ring(p.x, p.y, 0x9fe8ff, 120);
  },
  onAutoHit: (p, t) => {
    const strong = (p.memory.fokusUntil ?? 0) > p.combat.now;
    applyFrost(p, t, strong ? 0.35 : 0.15, strong ? 1500 : 1000);
  },
  sprite: [
    '....CCCC....',
    '...CCCCCC...',
    '...CWSSWC...',
    '...CSXXSC...',
    '...CSSSSC...',
    '...CsSSsC...',
    'C..WWWWWW..C',
    'C..WCWWCW..C',
    '.C.WWWWWW.C.',
    '.C.wWWWWw.C.',
    '...wWWWWw...',
    '...ww..ww...',
    '...XX..XX...',
    '...XX..XX...',
  ],
  palette: PAL,
};

function applyFrost(p: { combat: { now: number } }, t: Unit, pct: number, ms: number): void {
  t.stats.set({ id: 'slow:frost', stat: 'moveSpeed', pct: -pct, expiresAt: p.combat.now + ms });
}

// ---------------------------------------------------------------------------
// Garen — Bollwerk von Demacia (fan homage)
// ---------------------------------------------------------------------------

const garen: ChampionDef = {
  id: 'garen',
  name: 'Garen',
  tagline: 'Die Macht Demacias',
  region: 'Demacia',
  kitLine: 'Q Tempo + Wuchtschlag · E rotierende Klingen (AoE, mobil)',
  ranged: false,
  qRange: 300,
  cds: { Q: 6000, E: 9000, Dash: 5600 },
  base: {
    maxHP: 265,
    moveSpeed: 305,
    damage: 21,
    attackSpeed: 0.9,
    attackRange: 160,
    armor: 18,
    magicResist: 14,
    projSpeed: 900,
  },
  fireQ: (p, _d, scale) => {
    p.stats.set({ id: 'buff:garenq', stat: 'moveSpeed', pct: 0.3, expiresAt: p.combat.now + 1600 });
    p.memory.qEmpoweredUntil = p.combat.now + 3200;
    p.memory.qEmpowerScale = scale;
    p.combat.ring(p.x, p.y, 0xffe680, 90);
  },
  castE: (p) => {
    const dmg = (9 + 0.45 * p.stats.get('damage')) * p.stats.get('abilityDamage');
    for (let i = 0; i < 6; i++) {
      p.combat.delay(i * 420, () => {
        if (!p.alive) return;
        p.combat.ring(p.x, p.y, 0xd8e8ff, 190);
        for (const u of [...p.combat.units]) {
          if (!u.alive || u.team !== 'enemy') continue;
          if (Math.hypot(u.x - p.x, u.y - p.y) > 190 + u.radius * 0.4) continue;
          const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'physisch');
          p.combat.bus.emit('abilityHit', { ability: 'E', target: u, dmg: dealt });
        }
      });
    }
  },
  onAutoHit: (p, t) => {
    if ((p.memory.qEmpoweredUntil ?? 0) > p.combat.now) {
      p.memory.qEmpoweredUntil = 0;
      const bonus =
        (14 + 0.9 * p.stats.get('damage')) * p.stats.get('abilityDamage') * (p.memory.qEmpowerScale || 1);
      const dealt = p.combat.dealDamage(p, t, bonus, 'ability', 'physisch');
      p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
      p.combat.ring(t.x, t.y, 0xffe680, 60);
    }
  },
  sprite: [
    '...GGGGGG...',
    '...GgGGgG...',
    '...GSSSSG...',
    '...XSXXSX...',
    '...GSSSSG...',
    '...GsSSsG...',
    '.GGGGGGGG..G',
    'GGGBBBBGGG.G',
    'GGGBYYBGGG.G',
    '.GGBBBBGG..G',
    '..GBBBBG...y',
    '..gg..gg....',
    '..XX..XX....',
    '..XX..XX....',
  ],
  palette: PAL,
};

// ---------------------------------------------------------------------------
// Jinx — das Chaos-Geschütz (fan homage)
// ---------------------------------------------------------------------------

const jinx: ChampionDef = {
  id: 'jinx',
  name: 'Jinx',
  tagline: 'Die lose Kanone',
  region: 'Zhaun',
  kitLine: 'Q Rakete (Fläche) · E Schockblitz (starker Slow) · Kills: Tempo!',
  ranged: true,
  qRange: 600,
  cds: { Q: 4800, E: 7000, Dash: 5200 },
  base: {
    maxHP: 175,
    moveSpeed: 285,
    damage: 18,
    attackSpeed: 1.05,
    attackRange: 520,
    armor: 8,
    magicResist: 8,
    critChance: 0.1,
    projSpeed: 980,
  },
  fireQ: (p, d, scale) => {
    const dmg = (16 + 0.8 * p.stats.get('damage')) * p.stats.get('abilityDamage') * scale;
    p.combat.spawnProjectile({
      x: p.x + d.x * (p.radius + 6),
      y: p.y + d.y * (p.radius + 6),
      dirX: d.x,
      dirY: d.y,
      speed: 900,
      radius: 12,
      color: 0xff8ac0,
      team: 'player',
      maxDist: 620,
      onHit: (t) => {
        p.combat.ring(t.x, t.y, 0xff8ac0, 150);
        for (const u of [...p.combat.units]) {
          if (!u.alive || u.team !== 'enemy') continue;
          if (Math.hypot(u.x - t.x, u.y - t.y) > 150 + u.radius * 0.4) continue;
          const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'physisch');
          p.combat.bus.emit('abilityHit', { ability: 'Q', target: u, dmg: dealt });
        }
      },
    });
  },
  castE: (p, dir) => {
    const target = p.combat.nearestEnemy(p, 640);
    const d = dir ?? (target ? norm(target.x - p.x, target.y - p.y) : p.facing);
    const dmg = (10 + 0.4 * p.stats.get('damage')) * p.stats.get('abilityDamage');
    p.combat.spawnProjectile({
      x: p.x + d.x * (p.radius + 6),
      y: p.y + d.y * (p.radius + 6),
      dirX: d.x,
      dirY: d.y,
      speed: 1250,
      radius: 9,
      color: 0xaaddff,
      team: 'player',
      maxDist: 640,
      onHit: (t) => {
        const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'magisch');
        p.combat.bus.emit('abilityHit', { ability: 'E', target: t, dmg: dealt });
        t.stats.set({ id: 'slow:zapper', stat: 'moveSpeed', pct: -0.7, expiresAt: p.combat.now + 1300 });
      },
    });
  },
  onAutoHit: (p, t) => {
    if (!t.alive) {
      p.stats.set({ id: 'buff:aufdrehen', stat: 'attackSpeed', pct: 0.5, expiresAt: p.combat.now + 4000 });
      p.combat.announce('Aufgedreht!', '#ff8ac0');
    }
  },
  sprite: [
    '.B..BBBB..B.',
    '.B.BBBBBB.B.',
    '.B.XSSSSX.B.',
    '.B.XSXXSX.B.',
    '.B.XSSSSX.B.',
    '.B.XsSSsX.B.',
    '.B..PPPP..B.',
    '.B.PPSSPP.B.',
    '.B..SSSS..B.',
    '.B..RRRR..B.',
    'BB..R..R..BB',
    '....X..X....',
    '...XX..XX...',
    '...XX..XX...',
  ],
  palette: PAL,
};

// ---------------------------------------------------------------------------
// Lux — Lichtmagierin (fan homage)
// Q: bindender Lichtstrahl · E: Lichtblume (verzögerte Explosion)
// ---------------------------------------------------------------------------

const lux: ChampionDef = {
  id: 'lux',
  name: 'Lux',
  tagline: 'Die Dame des Lichts',
  region: 'Demacia',
  kitLine: 'Q Lichtstrahl wurzelt (durchschlägt) · E Lichtblume: verzögerte Fläche',
  ranged: true,
  qRange: 700,
  cds: { Q: 5200, E: 6800, Dash: 5400 },
  base: {
    maxHP: 180,
    moveSpeed: 290,
    damage: 17,
    abilityPower: 20,
    attackSpeed: 0.9,
    attackRange: 480,
    armor: 8,
    magicResist: 10,
    projSpeed: 920,
  },
  fireQ: (p, d, scale) => {
    const dmg =
      (20 + 0.4 * p.stats.get('damage') + 0.8 * p.stats.get('abilityPower')) *
      p.stats.get('abilityDamage') *
      scale;
    p.combat.spawnProjectile({
      x: p.x + d.x * (p.radius + 6),
      y: p.y + d.y * (p.radius + 6),
      dirX: d.x,
      dirY: d.y,
      speed: 1000,
      radius: 12,
      color: 0xfff0a0,
      team: 'player',
      maxHits: 2,
      maxDist: 700,
      onHit: (t) => {
        const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'magisch');
        p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
        t.stats.set({ id: 'slow:lichtbann', stat: 'moveSpeed', pct: -1, expiresAt: p.combat.now + 1100 });
      },
    });
  },
  castE: (p, dir) => {
    // Lichtblume: marks the ground, blooms after a beat
    const target = p.combat.nearestEnemy(p, 650);
    const at = dir
      ? { x: p.x + dir.x * 460, y: p.y + dir.y * 460 }
      : target
        ? { x: target.x, y: target.y }
        : { x: p.x + p.facing.x * 400, y: p.y + p.facing.y * 400 };
    const dmg =
      (14 + 0.9 * p.stats.get('abilityPower') + 0.3 * p.stats.get('damage')) * p.stats.get('abilityDamage');
    p.combat.ring(at.x, at.y, 0xfff0a0, 170);
    p.combat.delay(650, () => {
      p.combat.ring(at.x, at.y, 0xffffff, 180);
      for (const u of [...p.combat.units]) {
        if (!u.alive || u.team !== 'enemy') continue;
        if (Math.hypot(u.x - at.x, u.y - at.y) > 170 + u.radius * 0.4) continue;
        const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'magisch');
        p.combat.bus.emit('abilityHit', { ability: 'E', target: u, dmg: dealt });
        u.stats.set({ id: 'slow:lichtblume', stat: 'moveSpeed', pct: -0.3, expiresAt: p.combat.now + 1200 });
      }
    });
  },
  sprite: [
    '...LLLLLL...',
    '..LLLLLLLL.M',
    '..LXSSSSXL.Y',
    '..LXSXXSXL.Y',
    '..LXSSSSXL.Y',
    '..LLsSSsLL.Y',
    '...WWWWWW..Y',
    '..WWYWWYWW.Y',
    '..WWWWWWWW.Y',
    '..wWWYYWWw.Y',
    '..wWWWWWWw..',
    '...ww..ww...',
    '...XX..XX...',
    '...XX..XX...',
  ],
  palette: PAL,
};

// ---------------------------------------------------------------------------
// Darius — die Hand von Noxus (fan homage)
// Q: Rundumhieb heilt pro Treffer · E: heranreißen · Blutungs-Passiv
// ---------------------------------------------------------------------------

const darius: ChampionDef = {
  id: 'darius',
  name: 'Darius',
  tagline: 'Die Hand von Noxus',
  region: 'Noxus',
  kitLine: 'Q Rundumhieb (heilt je Treffer) · E reißt Gegner heran · Treffer bluten',
  ranged: false,
  qRange: 240,
  cds: { Q: 6500, E: 9500, Dash: 6000 },
  base: {
    maxHP: 280,
    moveSpeed: 295,
    damage: 23,
    attackSpeed: 0.85,
    attackRange: 165,
    armor: 20,
    magicResist: 12,
    projSpeed: 900,
  },
  fireQ: (p, _d, scale) => {
    const dmg = (12 + 0.7 * p.stats.get('damage')) * p.stats.get('abilityDamage') * scale;
    p.combat.ring(p.x, p.y, 0xcc3344, 220);
    let hits = 0;
    for (const u of [...p.combat.units]) {
      if (!u.alive || u.team !== 'enemy') continue;
      if (Math.hypot(u.x - p.x, u.y - p.y) > 220 + u.radius * 0.4) continue;
      const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'physisch');
      p.combat.bus.emit('abilityHit', { ability: 'Q', target: u, dmg: dealt });
      hits++;
    }
    if (hits > 0) p.heal(p.maxHP * 0.08 * Math.min(2, hits));
  },
  castE: (p, dir) => {
    // Ergreifen: rake the axe, dragging enemies in front of you inward
    const d = dir ?? p.facing;
    p.combat.ring(p.x + d.x * 170, p.y + d.y * 170, 0xcc3344, 200);
    for (const u of [...p.combat.units]) {
      if (!u.alive || u.team !== 'enemy') continue;
      const dx = u.x - p.x;
      const dy = u.y - p.y;
      const distU = Math.hypot(dx, dy);
      if (distU > 360) continue;
      // only targets roughly in the aimed half-circle
      if ((dx * d.x + dy * d.y) / Math.max(1, distU) < 0.2) continue;
      const pull = Math.max(0, distU - 110);
      u.moveBy((-dx / distU) * pull, (-dy / distU) * pull);
      u.stats.set({ id: 'slow:ergreifen', stat: 'moveSpeed', pct: -0.3, expiresAt: p.combat.now + 1000 });
      const dealt = p.combat.dealDamage(
        p,
        u,
        (8 + 0.4 * p.stats.get('damage')) * p.stats.get('abilityDamage'),
        'ability',
        'physisch',
      );
      p.combat.bus.emit('abilityHit', { ability: 'E', target: u, dmg: dealt });
    }
  },
  onAutoHit: (p, t) => {
    // Blutung: hits leave a stacking bleed
    p.combat.addBurn(t, 2 + 0.08 * p.stats.get('damage'), 4000);
  },
  sprite: [
    '....hhhhh...',
    '...hhhhhhh..',
    '.X.XSSSSX...',
    '.X.XSXXSX...',
    'GX.XSSSSX...',
    'GGXXsSSsX...',
    'GX.RGGGGR...',
    'GX.GGRRGG...',
    '.X.GRRRRG...',
    '.X.GGRRGG...',
    '.X.gGGGGg...',
    '...gg..gg...',
    '...XX..XX...',
    '...XX..XX...',
  ],
  palette: PAL,
};

// ---------------------------------------------------------------------------
// Zed — Meister der Schatten (fan homage)
// Q: Doppel-Shuriken · E: Schattensprung mit Köder + Schattenkraft
// ---------------------------------------------------------------------------

const zed: ChampionDef = {
  id: 'zed',
  name: 'Zed',
  tagline: 'Der Meister der Schatten',
  region: 'Ionia',
  kitLine: 'Q Doppel-Shuriken (durchschlagen) · E Schattensprung: Blink + Köder + 3s verstärkte Hiebe',
  ranged: false,
  qRange: 620,
  cds: { Q: 4400, E: 10000, Dash: 4600 },
  base: {
    maxHP: 200,
    moveSpeed: 330,
    damage: 22,
    attackSpeed: 1.15,
    attackRange: 170,
    armor: 10,
    magicResist: 8,
    projSpeed: 900,
  },
  fireQ: (p, d, scale) => {
    const dmg = (14 + 0.8 * p.stats.get('damage')) * p.stats.get('abilityDamage') * scale;
    for (const side of [-1, 1]) {
      const ox = -d.y * 22 * side;
      const oy = d.x * 22 * side;
      p.combat.spawnProjectile({
        x: p.x + ox + d.x * (p.radius + 6),
        y: p.y + oy + d.y * (p.radius + 6),
        dirX: d.x,
        dirY: d.y,
        speed: 1100,
        radius: 10,
        color: 0xaa4455,
        team: 'player',
        maxHits: 3,
        maxDist: 620,
        spin: true,
        onHit: (t) => {
          const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch');
          p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
        },
      });
    }
  },
  castE: (p, dir) => {
    // Schattensprung: leave a shadow decoy, blink ahead, strike harder
    const d = dir ?? p.facing;
    p.combat.spawnDecoy(p.x, p.y, 1800);
    p.combat.flashLine(p.x, p.y, p.x + d.x * 260, p.y + d.y * 260, 0xaa4455);
    p.moveBy(d.x * 260, d.y * 260);
    p.memory.schattenUntil = p.combat.now + 3000;
    p.combat.ring(p.x, p.y, 0xaa4455, 90);
  },
  onAutoHit: (p, t) => {
    if ((p.memory.schattenUntil ?? 0) > p.combat.now && t.alive) {
      const bonus = 0.3 * p.stats.get('damage') * p.stats.get('abilityDamage');
      p.combat.dealDamage(p, t, bonus, 'ability', 'physisch');
    }
  },
  sprite: [
    '...GGGGGG...',
    '..GGGGGGGG..',
    '..GXXXXXXG..',
    '..GXRXXRXG..',
    '..GXXXXXXG..',
    '..GgXXXXgG..',
    'G..GGGGGG..G',
    'GG.GRGGRG.GG',
    '.G.GGGGGG.G.',
    '...gGGGGg...',
    '...gGGGGg...',
    '...gg..gg...',
    '...XX..XX...',
    '...XX..XX...',
  ],
  palette: PAL,
};

export const CHAMPIONS: ChampionDef[] = [koenig, yasuo, ashe, garen, jinx, lux, darius, zed];

export function championById(id: string): ChampionDef {
  return CHAMPIONS.find((c) => c.id === id) ?? koenig;
}

/** Bake each champion's pixel map into a texture once (16-bit look, zero per-frame cost). */
export function ensureChampionTextures(scene: Phaser.Scene, px = 5): void {
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
