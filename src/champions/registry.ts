import Phaser from 'phaser';
import { ChampionDef } from './types';
import { COLORS } from '../config';
import { norm } from '../core/geometry';
import type { Unit } from '../entities/Unit';
import type { Player } from '../entities/Player';

/**
 * The champion roster. König is this game's own hero; the rest are private
 * fan-homage adaptations of familiar kits, rebuilt for the 3-slot control
 * scheme with original 16-bit pixel art, original text, and a passive each.
 */

const PAL: Record<string, number> = {
  X: 0x14141c, S: 0xf0c8a0, s: 0xc89870, W: 0xf0f4ff, w: 0xb8c0d8,
  B: 0x3a6ad0, b: 0x24448a, C: 0x7fd8f0, c: 0x4898b8, Y: 0xffc832, y: 0xb8860b,
  R: 0xe03c3c, r: 0x8b1a1a, G: 0xb8c0d0, g: 0x707a90, H: 0x6a4a2a, h: 0x2a2a34,
  L: 0xf0d878, M: 0xcc66ff, P: 0xff8ac0, N: 0x44aa66, O: 0xff8c3a,
};

// Lux mark bookkeeping: an ability hit lights a target; the next auto pops it.
const luxMarks = new WeakMap<Unit, number>();
// Darius bleed stacks per target.
const dariusBleed = new WeakMap<Unit, { stacks: number; until: number }>();
// Zed execute proc rate-limit per target.
const zedProc = new WeakMap<Unit, number>();

// ---------------------------------------------------------------------------
// König — the game's own exiled king
// ---------------------------------------------------------------------------

const koenig: ChampionDef = {
  id: 'koenig',
  name: 'The King',
  tagline: 'Exiled Sovereign',
  region: 'The Crown',
  kitLine: 'Q Boomerang blade · E Nova + empowered strikes · Passive: Undying Will',
  info: {
    passive: {
      name: 'Undying Will',
      desc: 'The first time you drop below 30% health each round, gain a shield for 25% of max health and +40% attack speed for 4s.',
    },
    q: { name: 'Boomerang Blade', desc: 'Hurl a spinning blade that flies out and back, hitting for 25 (+110% AD) physical on each leg.' },
    e: { name: 'Royal Nova', desc: 'A shockwave deals 8 (+40% AD) physical and knocks back, then empowers your next 3 attacks.' },
    dash: { name: 'Phase Step', desc: 'A short dash that slices every enemy it passes through.' },
  },
  ranged: true,
  qRange: 640,
  cds: { Q: 4200, E: 8000, Dash: 5000 },
  base: {
    maxHP: 220, moveSpeed: 300, damage: 20, attackSpeed: 1.0, attackRange: 450,
    armor: 12, magicResist: 12, projSpeed: 900,
  },
  onCombatInit: (p) => {
    p.memory.undyingUsed = 0;
  },
  passiveTick: (p) => {
    if (!p.memory.undyingUsed && p.alive && p.hpPct < 0.3) {
      p.memory.undyingUsed = 1;
      p.addShield(p.maxHP * 0.25);
      p.stats.set({ id: 'buff:undying', stat: 'attackSpeed', pct: 0.4, expiresAt: p.combat.now + 4000 });
      p.combat.announce('Undying Will!', '#ffd24a');
      p.combat.ring(p.x, p.y, COLORS.player, 200);
    }
  },
  fireQ: (p, d, scale) => {
    const dmg = (25 + 1.1 * p.stats.get('damage')) * p.stats.get('abilityDamage') * scale;
    p.combat.spawnProjectile({
      x: p.x + d.x * (p.radius + 6), y: p.y + d.y * (p.radius + 6), dirX: d.x, dirY: d.y,
      speed: 1050, radius: 13, color: COLORS.playerProj, team: 'player',
      maxHits: 2, maxDist: 640, boomerangTo: p, spin: true,
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
    '..Y..Y..Y...', '..YYYYYYY...', '..XSSSSSX...', '..XSXSXSX...', '..XSSSSSX...',
    '..XsSSSsX...', '.RXYYYYYXR..', 'RRYYYYYYYRR.', 'RRYyYYYyYRR.', '.RYYYYYYYR..',
    '.RyYYYYYyR..', '..yYY.YYy...', '..XX...XX...', '..XX...XX...',
  ],
  palette: PAL,
};

// ---------------------------------------------------------------------------
// Yasuo — the Wanderer (fan homage)
// ---------------------------------------------------------------------------

const yasuo: ChampionDef = {
  id: 'yasuo',
  name: 'Yasuo',
  tagline: 'The Wandering Blade',
  region: 'Ionia',
  kitLine: 'Q scales with attack speed, every 3rd is a tornado · E Windwall · double crit · Passive: Flow',
  info: {
    passive: {
      name: 'Way of the Wanderer',
      desc: 'Moving builds Flow. At full Flow, taking damage spends it for a shield (12% max HP + bonus AD). Your crit chance is doubled.',
    },
    q: { name: 'Steel Tempest', desc: 'A thrust for 12 (+85% AD) physical; every 3rd cast is a tornado (knock-up + 60% slow). Cooldown scales with attack speed.' },
    e: { name: 'Wind Wall', desc: 'Raise a wall of wind toward your aim that devours enemy projectiles.' },
    dash: { name: 'Sweeping Blade', desc: 'A short dash that cuts everything it passes through.' },
  },
  ranged: false,
  qRange: 280,
  cds: { Q: 3600, E: 11000, Dash: 4200 },
  qCdFromAS: true,
  critMult: 2,
  base: {
    maxHP: 215, moveSpeed: 335, damage: 22, attackSpeed: 1.3, attackRange: 150,
    armor: 14, magicResist: 10, critChance: 0.2, projSpeed: 900,
  },
  onCombatInit: (p) => {
    p.memory.flow = 0;
  },
  passiveTick: (p, dt) => {
    if (!p.isStationary) p.memory.flow = Math.min(100, (p.memory.flow ?? 0) + dt * 40);
  },
  onDamageTaken: (p) => {
    if ((p.memory.flow ?? 0) >= 100) {
      p.memory.flow = 0;
      const bonusAD = Math.max(0, p.stats.get('damage') - p.stats.getBase('damage'));
      p.addShield(p.maxHP * 0.12 + bonusAD);
      p.combat.announce('Flow Shield!', '#bfeef8');
    }
  },
  fireQ: (p, d, scale) => {
    p.memory.qStacks = (p.memory.qStacks ?? 0) + 1;
    const dmg = (12 + 0.85 * p.stats.get('damage')) * p.stats.get('abilityDamage') * scale;
    if (p.memory.qStacks >= 3) {
      p.memory.qStacks = 0;
      p.combat.spawnProjectile({
        x: p.x + d.x * (p.radius + 6), y: p.y + d.y * (p.radius + 6), dirX: d.x, dirY: d.y,
        speed: 820, radius: 20, color: 0xbfeef8, team: 'player', maxHits: 4, maxDist: 620, spin: true,
        onHit: (t) => {
          const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch');
          p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
          t.stats.set({ id: 'slow:tornado', stat: 'moveSpeed', pct: -0.6, expiresAt: p.combat.now + 800 });
        },
      });
      return;
    }
    const L = 270, W = 46;
    p.combat.flashLine(p.x, p.y, p.x + d.x * L, p.y + d.y * L, 0xd8f4ff);
    for (const u of [...p.combat.units]) {
      if (!u.alive || u.team !== 'enemy') continue;
      const rx = u.x - p.x, ry = u.y - p.y;
      const along = rx * d.x + ry * d.y;
      if (along < 0 || along > L + u.radius) continue;
      if (Math.abs(rx * -d.y + ry * d.x) > W + u.radius) continue;
      const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'physisch');
      p.combat.bus.emit('abilityHit', { ability: 'Q', target: u, dmg: dealt });
    }
  },
  castE: (p, dir) => {
    const d = dir ?? p.facing;
    const cx = p.x + d.x * 130, cy = p.y + d.y * 130, half = 140;
    p.combat.addWall(cx - d.y * half, cy + d.x * half, cx + d.y * half, cy - d.x * half, p.combat.now + 2600);
  },
  sprite: [
    '....hhhh....', '...hhhhhh...', '...XSSSSX...', '...RRRRRR...', '...XSXXSX...',
    '...XsSSsX...', 'h..XBBBBX..G', 'hh.BBWWBB..G', '.h.BWWWWB..G', '...BBWWBB..G',
    '...bBBBBb..G', '...bb..bb..y', '...XX..XX...', '...XX..XX...',
  ],
  palette: PAL,
};

// ---------------------------------------------------------------------------
// Ashe — the Frost Archer (fan homage)
// ---------------------------------------------------------------------------

const ashe: ChampionDef = {
  id: 'ashe',
  name: 'Ashe',
  tagline: 'The Frost Archer',
  region: 'Freljord',
  kitLine: 'Autos slow · Q arrow volley · E Focus Fire · Passive: extra damage to slowed foes',
  info: {
    passive: {
      name: 'Frost Shot',
      desc: 'Your attacks slow the target. You deal +15% damage to enemies that are already slowed.',
    },
    q: { name: 'Volley', desc: 'Fire 5 frost arrows, 4 (+70% AD) physical each, slowing everything hit.' },
    e: { name: 'Focus Fire', desc: '+80% attack speed for 3s; your frost slow bites harder while it lasts.' },
    dash: { name: 'Backstep', desc: 'A short dash to reposition and kite.' },
  },
  ranged: true,
  qRange: 560,
  cds: { Q: 5000, E: 9000, Dash: 5200 },
  base: {
    maxHP: 185, moveSpeed: 290, damage: 19, attackSpeed: 0.95, attackRange: 500,
    armor: 8, magicResist: 10, critChance: 0.1, projSpeed: 950,
  },
  fireQ: (p, d, scale) => {
    const dmg = (4 + 0.7 * p.stats.get('damage')) * p.stats.get('abilityDamage') * scale;
    const base = Math.atan2(d.y, d.x);
    for (const off of [-0.42, -0.21, 0, 0.21, 0.42]) {
      p.combat.spawnProjectile({
        x: p.x + Math.cos(base + off) * (p.radius + 6), y: p.y + Math.sin(base + off) * (p.radius + 6),
        dirX: Math.cos(base + off), dirY: Math.sin(base + off), speed: 980, radius: 9, color: 0x9fe8ff,
        team: 'player', maxDist: 560,
        onHit: (t) => {
          const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch');
          p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
          applyFrost(p, t, 0.35, 1600);
        },
      });
    }
  },
  castE: (p) => {
    p.stats.set({ id: 'buff:focusfire', stat: 'attackSpeed', pct: 0.8, expiresAt: p.combat.now + 3000 });
    p.memory.focusUntil = p.combat.now + 3000;
    p.combat.ring(p.x, p.y, 0x9fe8ff, 120);
  },
  onAutoHit: (p, t) => {
    const strong = (p.memory.focusUntil ?? 0) > p.combat.now;
    applyFrost(p, t, strong ? 0.35 : 0.15, strong ? 1500 : 1000);
    // Frost Shot: bonus damage vs already-slowed targets
    if (t.alive && t.stats.hasPrefix('slow:')) {
      p.combat.dealDamage(p, t, p.stats.get('damage') * 0.15, 'auto', 'physisch');
    }
  },
  sprite: [
    '....CCCC....', '...CCCCCC...', '...CWSSWC...', '...CSXXSC...', '...CSSSSC...',
    '...CsSSsC...', 'C..WWWWWW..C', 'C..WCWWCW..C', '.C.WWWWWW.C.', '.C.wWWWWw.C.',
    '...wWWWWw...', '...ww..ww...', '...XX..XX...', '...XX..XX...',
  ],
  palette: PAL,
};

function applyFrost(p: { combat: { now: number } }, t: Unit, pct: number, ms: number): void {
  t.stats.set({ id: 'slow:frost', stat: 'moveSpeed', pct: -pct, expiresAt: p.combat.now + ms });
}

// ---------------------------------------------------------------------------
// Garen — Might of Demacia (fan homage)
// ---------------------------------------------------------------------------

const garen: ChampionDef = {
  id: 'garen',
  name: 'Garen',
  tagline: 'The Might of Demacia',
  region: 'Demacia',
  kitLine: 'Q speed + heavy strike · E spinning blades (AoE) · Passive: Perseverance regen',
  info: {
    passive: {
      name: 'Perseverance',
      desc: 'After 4 seconds without taking damage, rapidly regenerate 3% of max health per second.',
    },
    q: { name: 'Decisive Strike', desc: 'Surge forward (+30% move speed); your next attack hits for +14 (+90% AD) physical.' },
    e: { name: 'Judgment', desc: 'Spin for 6 pulses, 9 (+45% AD) physical each, in a wide area as you move.' },
    dash: { name: 'Courage', desc: 'A short dash into the fray.' },
  },
  ranged: false,
  qRange: 300,
  cds: { Q: 6000, E: 9000, Dash: 5600 },
  base: {
    maxHP: 265, moveSpeed: 305, damage: 21, attackSpeed: 0.9, attackRange: 160,
    armor: 18, magicResist: 14, projSpeed: 900,
  },
  onCombatInit: (p) => {
    p.memory.lastHurt = p.combat.now;
  },
  onDamageTaken: (p) => {
    p.memory.lastHurt = p.combat.now;
  },
  passiveTick: (p, dt) => {
    if (p.alive && p.combat.now - (p.memory.lastHurt ?? 0) > 4000) {
      p.heal(p.maxHP * 0.03 * dt);
    }
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
      const bonus = (14 + 0.9 * p.stats.get('damage')) * p.stats.get('abilityDamage') * (p.memory.qEmpowerScale || 1);
      const dealt = p.combat.dealDamage(p, t, bonus, 'ability', 'physisch');
      p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
      p.combat.ring(t.x, t.y, 0xffe680, 60);
    }
  },
  sprite: [
    '...GGGGGG...', '...GgGGgG...', '...GSSSSG...', '...XSXXSX...', '...GSSSSG...',
    '...GsSSsG...', '.GGGGGGGG..G', 'GGGBBBBGGG.G', 'GGGBYYBGGG.G', '.GGBBBBGG..G',
    '..GBBBBG...y', '..gg..gg....', '..XX..XX....', '..XX..XX....',
  ],
  palette: PAL,
};

// ---------------------------------------------------------------------------
// Jinx — the Loose Cannon (fan homage)
// ---------------------------------------------------------------------------

const jinx: ChampionDef = {
  id: 'jinx',
  name: 'Jinx',
  tagline: 'The Loose Cannon',
  region: 'Zaun',
  kitLine: 'Q rocket (splash) · E zap (heavy slow) · Passive: attacks ramp attack speed, kills go wild',
  info: {
    passive: {
      name: 'Get Excited!',
      desc: 'Consecutive attacks ramp your attack speed (+8% each, up to +48%, decays out of combat). Takedowns grant +100% move speed and +50% attack speed for 4s.',
    },
    q: { name: 'Rocket', desc: 'Fire a rocket that explodes for 16 (+80% AD) physical, splashing around the target.' },
    e: { name: 'Zap!', desc: 'A fast bolt dealing 10 (+40% AD) magic and a 70% slow to the first enemy hit.' },
    dash: { name: 'Scram', desc: 'A short dash to relocate the chaos.' },
  },
  ranged: true,
  qRange: 600,
  cds: { Q: 4800, E: 7000, Dash: 5200 },
  base: {
    maxHP: 175, moveSpeed: 285, damage: 18, attackSpeed: 1.05, attackRange: 520,
    armor: 8, magicResist: 8, critChance: 0.1, projSpeed: 980,
  },
  onCombatInit: (p) => {
    p.memory.spin = 0;
    p.memory.spinDecayAt = 0;
  },
  passiveTick: (p) => {
    if ((p.memory.spin ?? 0) > 0 && p.combat.now > (p.memory.spinDecayAt ?? 0)) {
      p.memory.spin = 0;
      p.stats.remove('dyn:spin');
    }
  },
  fireQ: (p, d, scale) => {
    const dmg = (16 + 0.8 * p.stats.get('damage')) * p.stats.get('abilityDamage') * scale;
    p.combat.spawnProjectile({
      x: p.x + d.x * (p.radius + 6), y: p.y + d.y * (p.radius + 6), dirX: d.x, dirY: d.y,
      speed: 900, radius: 12, color: 0xff8ac0, team: 'player', maxDist: 620,
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
      x: p.x + d.x * (p.radius + 6), y: p.y + d.y * (p.radius + 6), dirX: d.x, dirY: d.y,
      speed: 1250, radius: 9, color: 0xaaddff, team: 'player', maxDist: 640,
      onHit: (t) => {
        const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'magisch');
        p.combat.bus.emit('abilityHit', { ability: 'E', target: t, dmg: dealt });
        t.stats.set({ id: 'slow:zap', stat: 'moveSpeed', pct: -0.7, expiresAt: p.combat.now + 1300 });
      },
    });
  },
  onAutoHit: (p, t) => {
    // Minigun spin-up
    p.memory.spin = Math.min(6, (p.memory.spin ?? 0) + 1);
    p.memory.spinDecayAt = p.combat.now + 2500;
    p.stats.set({ id: 'dyn:spin', stat: 'attackSpeed', pct: 0.08 * (p.memory.spin ?? 0) });
    // Get Excited on takedown
    if (!t.alive) {
      p.stats.set({ id: 'buff:excited-as', stat: 'attackSpeed', pct: 0.5, expiresAt: p.combat.now + 4000 });
      p.stats.set({ id: 'buff:excited-ms', stat: 'moveSpeed', pct: 1.0, expiresAt: p.combat.now + 4000 });
      p.combat.announce('Get Excited!', '#ff8ac0');
    }
  },
  sprite: [
    '.B..BBBB..B.', '.B.BBBBBB.B.', '.B.XSSSSX.B.', '.B.XSXXSX.B.', '.B.XSSSSX.B.',
    '.B.XsSSsX.B.', '.B..PPPP..B.', '.B.PPSSPP.B.', '.B..SSSS..B.', '.B..RRRR..B.',
    'BB..R..R..BB', '....X..X....', '...XX..XX...', '...XX..XX...',
  ],
  palette: PAL,
};

// ---------------------------------------------------------------------------
// Lux — the Lady of Luminosity (fan homage) — mark/detonate passive
// ---------------------------------------------------------------------------

const lux: ChampionDef = {
  id: 'lux',
  name: 'Lux',
  tagline: 'The Lady of Luminosity',
  region: 'Demacia',
  kitLine: 'Q piercing beam roots · E delayed light bloom · Passive: spells mark, autos detonate for magic damage',
  info: {
    passive: {
      name: 'Illumination',
      desc: 'Hitting an enemy with an ability marks them with light for 5s. Your next auto-attack detonates the mark for 15 (+70% AP) magic damage.',
    },
    q: { name: 'Light Binding', desc: 'A piercing beam for 20 (+90% AP +30% AD) magic that roots the first two enemies hit.' },
    e: { name: 'Lucent Bloom', desc: 'Mark the ground; after a beat it blooms for 16 (+100% AP +20% AD) magic and a slow.' },
    dash: { name: 'Light Step', desc: 'A short dash of pure light.' },
  },
  ranged: true,
  qRange: 700,
  cds: { Q: 5200, E: 6800, Dash: 5400 },
  base: {
    maxHP: 180, moveSpeed: 290, damage: 17, abilityPower: 25, attackSpeed: 0.9, attackRange: 480,
    armor: 8, magicResist: 10, projSpeed: 920,
  },
  fireQ: (p, d, scale) => {
    const dmg = (20 + 0.3 * p.stats.get('damage') + 0.9 * p.stats.get('abilityPower')) * p.stats.get('abilityDamage') * scale;
    p.combat.spawnProjectile({
      x: p.x + d.x * (p.radius + 6), y: p.y + d.y * (p.radius + 6), dirX: d.x, dirY: d.y,
      speed: 1000, radius: 12, color: 0xfff0a0, team: 'player', maxHits: 2, maxDist: 700,
      onHit: (t) => {
        const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'magisch');
        p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
        t.stats.set({ id: 'slow:bind', stat: 'moveSpeed', pct: -1, expiresAt: p.combat.now + 1100 });
        markLux(p, t);
      },
    });
  },
  castE: (p, dir) => {
    const target = p.combat.nearestEnemy(p, 650);
    const at = dir ? { x: p.x + dir.x * 460, y: p.y + dir.y * 460 }
      : target ? { x: target.x, y: target.y } : { x: p.x + p.facing.x * 400, y: p.y + p.facing.y * 400 };
    const dmg = (16 + 1.0 * p.stats.get('abilityPower') + 0.2 * p.stats.get('damage')) * p.stats.get('abilityDamage');
    p.combat.ring(at.x, at.y, 0xfff0a0, 170);
    p.combat.delay(650, () => {
      p.combat.ring(at.x, at.y, 0xffffff, 180);
      for (const u of [...p.combat.units]) {
        if (!u.alive || u.team !== 'enemy') continue;
        if (Math.hypot(u.x - at.x, u.y - at.y) > 170 + u.radius * 0.4) continue;
        const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'magisch');
        p.combat.bus.emit('abilityHit', { ability: 'E', target: u, dmg: dealt });
        u.stats.set({ id: 'slow:bloom', stat: 'moveSpeed', pct: -0.3, expiresAt: p.combat.now + 1200 });
        markLux(p, u);
      }
    });
  },
  onAutoHit: (p, t) => {
    if (!t.alive) return;
    if ((luxMarks.get(t) ?? 0) > p.combat.now) {
      luxMarks.delete(t);
      const dmg = 15 + 0.7 * p.stats.get('abilityPower');
      p.combat.ring(t.x, t.y, 0xffffff, 60);
      p.combat.dealDamage(p, t, dmg, 'ability', 'magisch');
      p.combat.announce('Illumination!', '#fff0a0');
    }
  },
  sprite: [
    '...LLLLLL...', '..LLLLLLLL.M', '..LXSSSSXL.Y', '..LXSXXSXL.Y', '..LXSSSSXL.Y',
    '..LLsSSsLL.Y', '...WWWWWW..Y', '..WWYWWYWW.Y', '..WWWWWWWW.Y', '..wWWYYWWw.Y',
    '..wWWWWWWw..', '...ww..ww...', '...XX..XX...', '...XX..XX...',
  ],
  palette: PAL,
};

function markLux(p: { combat: { now: number } }, t: Unit): void {
  luxMarks.set(t, p.combat.now + 5000);
}

// ---------------------------------------------------------------------------
// Darius — the Hand of Noxus (fan homage) — bleed → Noxian Might
// ---------------------------------------------------------------------------

const darius: ChampionDef = {
  id: 'darius',
  name: 'Darius',
  tagline: 'The Hand of Noxus',
  region: 'Noxus',
  kitLine: 'Q spin heals per hit · E drags enemies in · Passive: bleed stacks to Noxian Might',
  info: {
    passive: {
      name: 'Hemorrhage',
      desc: 'Attacks and abilities apply a bleed stack (max 5). At 5 stacks the target takes a burst and you gain Noxian Might: +40% AD for 5s.',
    },
    q: { name: 'Decimate', desc: 'Sweep the axe for 12 (+70% AD) physical in a ring, healing 8% max HP per enemy struck.' },
    e: { name: 'Apprehend', desc: 'Rake the axe, dealing 8 (+40% AD) physical while dragging enemies in and slowing them.' },
    dash: { name: 'Crushing Blow', desc: 'A short dash to close the gap.' },
  },
  ranged: false,
  qRange: 240,
  cds: { Q: 6500, E: 9500, Dash: 6000 },
  base: {
    maxHP: 280, moveSpeed: 295, damage: 23, attackSpeed: 0.85, attackRange: 165,
    armor: 20, magicResist: 12, projSpeed: 900,
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
      dariusBleedApply(p, u);
      hits++;
    }
    if (hits > 0) p.heal(p.maxHP * 0.08 * Math.min(2, hits));
  },
  castE: (p, dir) => {
    const d = dir ?? p.facing;
    p.combat.ring(p.x + d.x * 170, p.y + d.y * 170, 0xcc3344, 200);
    for (const u of [...p.combat.units]) {
      if (!u.alive || u.team !== 'enemy') continue;
      const dx = u.x - p.x, dy = u.y - p.y;
      const distU = Math.hypot(dx, dy);
      if (distU > 360) continue;
      if ((dx * d.x + dy * d.y) / Math.max(1, distU) < 0.2) continue;
      const pull = Math.max(0, distU - 110);
      u.moveBy((-dx / distU) * pull, (-dy / distU) * pull);
      u.stats.set({ id: 'slow:apprehend', stat: 'moveSpeed', pct: -0.3, expiresAt: p.combat.now + 1000 });
      const dealt = p.combat.dealDamage(p, u, (8 + 0.4 * p.stats.get('damage')) * p.stats.get('abilityDamage'), 'ability', 'physisch');
      p.combat.bus.emit('abilityHit', { ability: 'E', target: u, dmg: dealt });
      dariusBleedApply(p, u);
    }
  },
  onAutoHit: (p, t) => {
    if (t.alive) dariusBleedApply(p, t);
  },
  sprite: [
    '....hhhhh...', '...hhhhhhh..', '.X.XSSSSX...', '.X.XSXXSX...', 'GX.XSSSSX...',
    'GGXXsSSsX...', 'GX.RGGGGR...', 'GX.GGRRGG...', '.X.GRRRRG...', '.X.GGRRGG...',
    '.X.gGGGGg...', '...gg..gg...', '...XX..XX...', '...XX..XX...',
  ],
  palette: PAL,
};

function dariusBleedApply(p: Player, t: Unit): void {
  const rec = dariusBleed.get(t);
  const now = p.combat.now;
  const stacks = rec && rec.until > now ? Math.min(5, rec.stacks + 1) : 1;
  dariusBleed.set(t, { stacks, until: now + 5000 });
  const ad = p.stats.get('damage');
  p.combat.addBurn(t, 1.5 + 0.06 * ad, 5000);
  if (stacks >= 5) {
    dariusBleed.set(t, { stacks: 5, until: now + 5000 });
    p.combat.dealDamage(p, t, ad * 1.2, 'ability', 'physisch');
    p.stats.set({ id: 'buff:might', stat: 'damage', pct: 0.4, expiresAt: now + 5000 });
    p.combat.announce('Noxian Might!', '#ff5533');
  }
}

// ---------------------------------------------------------------------------
// Zed — Master of Shadows (fan homage) — execute passive
// ---------------------------------------------------------------------------

const zed: ChampionDef = {
  id: 'zed',
  name: 'Zed',
  tagline: 'Master of Shadows',
  region: 'Ionia',
  kitLine: 'Q twin shuriken · E shadow leap (blink + decoy) · Passive: bonus damage to wounded foes',
  info: {
    passive: {
      name: 'Contempt for the Weak',
      desc: 'Your attacks against enemies below 50% health deal +6% of their max health as magic damage (1.5s cooldown per target).',
    },
    q: { name: 'Twin Shuriken', desc: 'Throw two shuriken, 14 (+80% AD) physical each, piercing every enemy in their path.' },
    e: { name: 'Shadow Leap', desc: 'Leave a taunting shadow and blink forward; for 3s your attacks deal +30% AD bonus physical.' },
    dash: { name: 'Living Shadow', desc: 'A short dash through the shadows.' },
  },
  ranged: false,
  qRange: 620,
  cds: { Q: 4400, E: 10000, Dash: 4600 },
  base: {
    maxHP: 200, moveSpeed: 330, damage: 22, attackSpeed: 1.15, attackRange: 170,
    armor: 10, magicResist: 8, projSpeed: 900,
  },
  fireQ: (p, d, scale) => {
    const dmg = (14 + 0.8 * p.stats.get('damage')) * p.stats.get('abilityDamage') * scale;
    for (const side of [-1, 1]) {
      const ox = -d.y * 22 * side, oy = d.x * 22 * side;
      p.combat.spawnProjectile({
        x: p.x + ox + d.x * (p.radius + 6), y: p.y + oy + d.y * (p.radius + 6), dirX: d.x, dirY: d.y,
        speed: 1100, radius: 10, color: 0xaa4455, team: 'player', maxHits: 3, maxDist: 620, spin: true,
        onHit: (t) => {
          const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch');
          p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
        },
      });
    }
  },
  castE: (p, dir) => {
    const d = dir ?? p.facing;
    p.combat.spawnDecoy(p.x, p.y, 1800);
    p.combat.flashLine(p.x, p.y, p.x + d.x * 260, p.y + d.y * 260, 0xaa4455);
    p.moveBy(d.x * 260, d.y * 260);
    p.memory.shadowUntil = p.combat.now + 3000;
    p.combat.ring(p.x, p.y, 0xaa4455, 90);
  },
  onAutoHit: (p, t) => {
    if (!t.alive) return;
    // Shadow-empowered strikes
    if ((p.memory.shadowUntil ?? 0) > p.combat.now) {
      p.combat.dealDamage(p, t, 0.3 * p.stats.get('damage') * p.stats.get('abilityDamage'), 'ability', 'physisch');
    }
    // Contempt for the Weak: execute-flavored bonus vs low HP
    if (t.hpPct < 0.5 && (zedProc.get(t) ?? 0) <= p.combat.now) {
      zedProc.set(t, p.combat.now + 1500);
      p.combat.dealDamage(p, t, t.maxHP * 0.06, 'ability', 'magisch');
    }
  },
  sprite: [
    '...GGGGGG...', '..GGGGGGGG..', '..GXXXXXXG..', '..GXRXXRXG..', '..GXXXXXXG..',
    '..GgXXXXgG..', 'G..GGGGGG..G', 'GG.GRGGRG.GG', '.G.GGGGGG.G.', '...gGGGGg...',
    '...gGGGGg...', '...gg..gg...', '...XX..XX...', '...XX..XX...',
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
