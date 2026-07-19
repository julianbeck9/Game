import { COLORS } from '../config';
import { norm } from '../core/geometry';
import { run } from '../core/run';
import type { StatName } from '../core/stats';
import type { ChampionDef, AbilityInfo, AbilityShape } from './types';
import type { Player } from '../entities/Player';
import type { Unit } from '../entities/Unit';

/**
 * Per-champion kits, one bespoke entry per roster id. Passive + Ability 1 (Q) +
 * Ability 2 (E) + Dash. The game has no ability levels, so each of the four
 * spec values is round-scaled (rounds 1–4 / 5–9 / 10–14 / 15+). Sprites are
 * single static PNGs, so "animations" are rendered as VFX cues (coloured
 * pulses, beams, flashes, sprite fades). All code is original; this implements
 * a supplied design for a private fan homage.
 */
export interface Kit {
  ranged: boolean;
  qRange: number;
  cds: { Q: number; E: number; Dash: number };
  base: Partial<Record<StatName, number>>;
  info: { passive: AbilityInfo; q: AbilityInfo; e: AbilityInfo; dash: AbilityInfo };
  spec?: { q?: AbilityShape; e?: AbilityShape; dash?: AbilityShape };
  kitLine: string;
  scales: ('ad' | 'ap')[];
  qCdFromAS?: boolean;
  critMult?: number;
  fireQ: ChampionDef['fireQ'];
  castE: ChampionDef['castE'];
  onDash?: ChampionDef['onDash'];
  onAutoHit?: ChampionDef['onAutoHit'];
  onCombatInit?: ChampionDef['onCombatInit'];
  passiveTick?: ChampionDef['passiveTick'];
}

// ---- shared helpers ----
const AD = (p: Player) => p.stats.get('damage');
const AP = (p: Player) => p.stats.get('abilityPower');
const AMP = (p: Player) => p.stats.get('abilityDamage');
const bAD = (p: Player) => Math.max(0, AD(p) - p.stats.getBase('damage'));
const T = (p: Player) => p.combat.now;
const rs = (a: number, b: number, c: number, d: number) => {
  const r = run.round;
  return r <= 4 ? a : r <= 9 ? b : r <= 14 ? c : d;
};
const near = (p: Player, r = 900): Unit | null => p.combat.nearestEnemy(p, r);
const enemiesIn = (p: Player, x: number, y: number, r: number): Unit[] =>
  p.combat.units.filter((u) => u.alive && u.team === 'enemy' && Math.hypot(u.x - x, u.y - y) <= r);
const slowU = (u: Unit, id: string, pct: number, ms: number, t: number) =>
  u.stats.set({ id: `slow:${id}`, stat: 'moveSpeed', pct: -Math.min(0.99, pct), expiresAt: t + ms });
const stun = (u: Unit, ms: number, t: number) => {
  u.ctrlUntil = Math.max(u.ctrlUntil, t + ms);
  slowU(u, 'stun', 1, ms, t);
};
const hit = (p: Player, u: Unit, dmg: number, school: 'physisch' | 'magisch' | 'wahr', slot: 'Q' | 'E' | 'Dash') => {
  if (!u.alive) return 0;
  const dealt = p.combat.dealDamage(p, u, dmg, 'ability', school);
  p.combat.bus.emit('abilityHit', { ability: slot, target: u, dmg: dealt });
  return dealt;
};
const leapTo = (p: Player, x: number, y: number, gap = 60): boolean => {
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy) || 1;
  const dist = Math.max(0, d - gap);
  p.moveBy((dx / d) * dist, (dy / d) * dist, true);
  return true;
};
const asBuff = (p: Player, pct: number, ms: number, id = 'passiveAS') =>
  p.stats.set({ id: `buff:${id}`, stat: 'attackSpeed', pct, expiresAt: T(p) + ms });

// per-unit passive state
const firstHit = new WeakMap<Unit, number>(); // Jarvan: round marker of first strike
const luxMark = new WeakMap<Unit, number>(); // Lux: mark expiry
const stacks = new WeakMap<Unit, { n: number; until: number }>(); // Brand blaze / Varus blight

function addStack(u: Unit, t: number, max: number): number {
  const s = stacks.get(u);
  const n = (s && s.until > t ? s.n : 0) + 1;
  stacks.set(u, { n, until: t + 4000 });
  if (n >= max) { stacks.set(u, { n: 0, until: t + 4000 }); return max; }
  return n;
}

const RANGED = { maxHP: 185, moveSpeed: 300, damage: 20, attackSpeed: 1.05, attackRange: 500, armor: 9, magicResist: 9, projSpeed: 1000 };
const CASTER = { maxHP: 180, moveSpeed: 295, damage: 16, abilityPower: 26, attackSpeed: 0.9, attackRange: 480, armor: 8, magicResist: 12, projSpeed: 920 };
const MELEE = { maxHP: 235, moveSpeed: 335, damage: 23, attackSpeed: 1.1, attackRange: 160, armor: 15, magicResist: 12, projSpeed: 900 };
const TANK = { maxHP: 320, moveSpeed: 320, damage: 19, abilityPower: 20, attackSpeed: 0.95, attackRange: 165, armor: 22, magicResist: 18, projSpeed: 900 };

const AI = (name: string, desc: string): AbilityInfo => ({ name, desc });

export const KITS: Record<string, Kit> = {
  // ---------------------------------------------------------------- Zac
  zac: {
    ranged: false, qRange: 240, cds: { Q: 4500, E: 9000, Dash: 6000 }, scales: ['ap'],
    base: { ...TANK, maxHP: 360, attackRange: 175 },
    kitLine: 'Passive reform · Q unstable pulse · E stretching strikes · Dash slingshot',
    // fireQ hits enemiesIn(p, p.x, p.y, 200) around self — radius 200, not qRange.
    spec: { q: { kind: 'circle', radius: 200, at: 'self' } },
    info: {
      passive: AI('Cell Division', 'The first time you would fall each fight, split and reform at 20% health.'),
      q: AI('Unstable Matter', 'Erupt for AoE magic damage around you. [green pulse ring expands outward]'),
      e: AI('Stretching Strikes', 'Your next 3 attacks stretch to splash nearby foes. [arm elongates to each target]'),
      dash: AI('Elastic Slingshot', 'Sling to the nearest enemy, dealing damage and knocking up. [squash-and-stretch blur]'),
    },
    passiveTick: (p) => {
      if (p.memory.zacUsed || !p.alive || p.hpPct > 0.2) return;
      p.memory.zacUsed = 1; p.heal(p.maxHP * 0.2);
      p.combat.ring(p.x, p.y, 0x66cc44, 220); p.combat.announce('Cell Division!', '#66cc44');
    },
    fireQ: (p) => { p.combat.ring(p.x, p.y, 0x66cc44, 200); for (const u of enemiesIn(p, p.x, p.y, 200)) hit(p, u, (rs(60, 90, 120, 150) + 0.4 * AP(p)) * AMP(p), 'magisch', 'Q'); },
    castE: (p) => { p.memory.zacSplash = 3; p.combat.ring(p.x, p.y, 0x88dd66, 60); },
    onAutoHit: (p, t) => {
      if ((p.memory.zacSplash ?? 0) <= 0 || !t.alive) return; p.memory.zacSplash!--;
      const dmg = (rs(20, 30, 40, 50) + 0.15 * AP(p)) * AMP(p);
      for (const u of enemiesIn(p, t.x, t.y, 130)) if (u !== t) hit(p, u, dmg, 'magisch', 'E');
    },
    onDash: (p) => {
      const t = near(p, 700); if (!t) return false; leapTo(p, t.x, t.y, 40);
      for (const u of enemiesIn(p, p.x, p.y, 150)) { hit(p, u, (rs(50, 75, 100, 125) + 0.3 * AP(p)) * AMP(p), 'magisch', 'Dash'); stun(u, 1000, T(p)); }
      p.combat.ring(p.x, p.y, 0x66cc44, 150); return true;
    },
  },

  // ---------------------------------------------------------------- Fizz
  fizz: {
    ranged: false, qRange: 300, cds: { Q: 5000, E: 8000, Dash: 4500 }, scales: ['ap'],
    base: { ...MELEE, maxHP: 200, moveSpeed: 345, abilityPower: 18, attackRange: 210, damage: 22, projSpeed: 850 },
    kitLine: 'Passive nimble · Q trident lunge · E empowered strike · Dash untargetable hop',
    info: {
      passive: AI('Nimble Fighter', 'Your attacks reach a little farther and slip through the crowd.'),
      q: AI('Trident Lunge', 'Leap to a target, slam for magic damage + 30% slow. [arcing jump, splash on landing]'),
      e: AI('Seastone Trident', 'Your next attack deals bonus magic damage and slows. [trident glows cyan]'),
      dash: AI('Playful Trickster', 'Hop away, briefly untargetable; your next attack hits harder. [semi-transparent flip]'),
    },
    fireQ: (p, d) => {
      const t = near(p, 360); const tx = t ? t.x : p.x + d.x * 200, ty = t ? t.y : p.y + d.y * 200; leapTo(p, tx, ty, 30);
      for (const u of enemiesIn(p, p.x, p.y, 140)) { hit(p, u, (rs(65, 100, 135, 170) + 0.5 * AP(p)) * AMP(p), 'magisch', 'Q'); slowU(u, 'fizz', 0.3, 1500, T(p)); }
      p.combat.ring(p.x, p.y, 0x66ccff, 140);
    },
    castE: (p) => { p.memory.fizzE = 1; p.combat.ring(p.x, p.y, 0x66ccff, 50); },
    onAutoHit: (p, t) => { if (!p.memory.fizzE || !t.alive) return; p.memory.fizzE = 0; hit(p, t, (rs(40, 60, 80, 100) + 0.3 * AP(p)) * AMP(p), 'magisch', 'E'); slowU(t, 'fizzE', 0.3, 1200, T(p)); },
    onDash: (p, d) => { p.invulnUntil = T(p) + 500; p.memory.fizzHop = 1; p.moveBy(d.x * 120, d.y * 120, true); p.combat.ring(p.x, p.y, 0x66ccff, 60); return true; },
  },

  // ---------------------------------------------------------------- Jarvan
  jarvan: {
    ranged: false, qRange: 300, cds: { Q: 6000, E: 8000, Dash: 7000 }, scales: ['ad'],
    base: { ...MELEE, maxHP: 260, armor: 18 },
    kitLine: 'Passive first-strike · Q flag return · E aegis shield · Dash planted lance',
    info: {
      passive: AI('Martial Cadence', 'Your first strike on a foe deals bonus % max health as magic. [gold flash on hit]'),
      q: AI('Standard Return', 'Dash back to your planted banner, damaging on arrival. [fade out and reappear at flag]'),
      e: AI('Golden Aegis', 'Shield yourself and slow nearby enemies. [gold hex-shield + slow ring]'),
      dash: AI('Dragon Strike', 'Plant a banner and leap to it, striking the area. [spear arc then blur-dash]'),
    },
    onAutoHit: (p, t) => {
      if (!t.alive || firstHit.get(t) === run.round) return; firstHit.set(t, run.round);
      p.combat.dealDamage(p, t, t.maxHP * (rs(3, 4, 5, 6) / 100), 'ability', 'magisch');
    },
    fireQ: (p) => {
      const fx = p.memory.jarvanFx ?? p.x, fy = p.memory.jarvanFy ?? p.y; leapTo(p, fx, fy, 0);
      for (const u of enemiesIn(p, p.x, p.y, 150)) hit(p, u, (rs(50, 80, 110, 140) + 0.6 * bAD(p)) * AMP(p), 'physisch', 'Q');
      p.combat.ring(p.x, p.y, 0xffd24a, 150);
    },
    castE: (p) => { p.addShield((rs(60, 90, 120, 150) + 0.4 * bAD(p)) * AMP(p)); p.combat.ring(p.x, p.y, 0xffe0a0, 240); for (const u of enemiesIn(p, p.x, p.y, 240)) slowU(u, 'aegis', 0.2, 2000, T(p)); },
    onDash: (p, d) => {
      const t = near(p, 600); const tx = t ? t.x : p.x + d.x * 260, ty = t ? t.y : p.y + d.y * 260;
      p.memory.jarvanFx = tx; p.memory.jarvanFy = ty; leapTo(p, tx, ty, 20);
      for (const u of enemiesIn(p, p.x, p.y, 160)) hit(p, u, (rs(70, 100, 130, 160) + 0.7 * bAD(p)) * AMP(p), 'physisch', 'Dash');
      p.combat.ring(p.x, p.y, 0xffd24a, 160); return true;
    },
  },

  // ---------------------------------------------------------------- Taric
  taric: {
    ranged: false, qRange: 500, cds: { Q: 5000, E: 7000, Dash: 6000 }, scales: ['ap'],
    base: { ...TANK, maxHP: 280, abilityPower: 24, attackRange: 175 },
    kitLine: 'Passive bravado CDR · Q starlight heal · E dazzle stun · Dash radiance blink',
    info: {
      passive: AI('Bravado', 'Your attacks reduce your cooldowns by 1s. [yellow spark on hit]'),
      q: AI("Starlight's Touch", 'Heal yourself for a burst of health. [rising star particles]'),
      e: AI('Dazzle', 'A line of light stuns and damages. [beam flash + spinning stars]'),
      dash: AI('Radiance Step', 'Blink to a nearby foe and shield yourself. [sparkle fade + shield flash]'),
    },
    onAutoHit: (p) => p.reduceCooldowns(1000),
    fireQ: (p) => { p.heal((rs(50, 75, 100, 125) + 0.3 * AP(p)) * AMP(p)); p.combat.ring(p.x, p.y, 0xff9bd0, 120); },
    castE: (p, dir) => {
      const d = dir ?? p.facing; p.combat.flashLine(p.x, p.y, p.x + d.x * 500, p.y + d.y * 500, 0xffe680);
      const dmg = (rs(40, 60, 80, 100) + 0.25 * AP(p)) * AMP(p);
      for (const u of p.combat.units) { if (!u.alive || u.team !== 'enemy') continue; const rx = u.x - p.x, ry = u.y - p.y, along = rx * d.x + ry * d.y; if (along < 0 || along > 500 || Math.abs(rx * d.y - ry * d.x) > 55 + u.radius) continue; hit(p, u, dmg, 'magisch', 'E'); stun(u, 1200, T(p)); }
    },
    onDash: (p, d) => { const t = near(p, 420); if (t) leapTo(p, t.x, t.y, 40); else p.moveBy(d.x * 180, d.y * 180, true); p.addShield((rs(40, 60, 80, 100) + 0.2 * AP(p)) * AMP(p)); p.combat.ring(p.x, p.y, 0xffd6f0, 70); return true; },
  },

  // ---------------------------------------------------------------- Teemo
  teemo: {
    ranged: true, qRange: 560, cds: { Q: 6000, E: 0, Dash: 5000 }, scales: ['ap'],
    base: { ...CASTER, moveSpeed: 320, attackRange: 500 },
    kitLine: 'Passive camouflage · Q blinding dart · E toxic autos · Dash scout hop',
    info: {
      passive: AI('Camouflage', 'Stand still and you fade from sight; your first attack from hiding hits harder. [alpha fades when idle]'),
      q: AI('Blinding Dart', 'Blind and damage a target so its attacks miss. [flashing X over eyes]'),
      e: AI('Toxic Shot', 'Your attacks poison, dealing damage over time. [green tint + bubbles]'),
      dash: AI('Swift Scout', 'Sprint-hop and drop a slowing trap where you left. [mushroom pops up]'),
    },
    passiveTick: (p) => {
      const still = p.isStationary;
      p.memory.teemoIdle = still ? (p.memory.teemoIdle ?? 0) + 1 : 0;
      if (still && (p.memory.teemoIdle ?? 0) > 90) p.memory.stealthUntil = T(p) + 200;
    },
    fireQ: (p, d) => {
      const t = near(p, 600); const dx = t ? t.x - p.x : d.x, dy = t ? t.y - p.y : d.y;
      p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: dx, dirY: dy, speed: 1100, radius: 8, color: 0x88dd55, team: 'player', homing: t ?? undefined, maxDist: 700,
        onHit: (u) => { hit(p, u, (rs(60, 90, 120, 150) + 0.4 * AP(p)) * AMP(p), 'magisch', 'Q'); slowU(u, 'blind', 0.45, rs(1500, 1750, 2000, 2250), T(p)); } });
    },
    castE: () => { /* passive on-hit */ },
    onAutoHit: (p, t) => {
      if (!t.alive) return; p.combat.addBurn(t, (rs(10, 15, 20, 25) + 0.15 * AP(p)) / 4 * AMP(p), 4000);
      if ((p.memory.stealthUntil ?? 0) > T(p)) { p.memory.stealthUntil = 0; hit(p, t, (rs(30, 45, 60, 75) + 0.2 * AP(p)) * AMP(p), 'magisch', 'Q'); }
    },
    onDash: (p, d) => {
      const hx = p.x, hy = p.y; p.moveBy(d.x * 200, d.y * 200, true);
      p.combat.addHazard({ x: hx, y: hy, r: 90, until: T(p) + 5000, dps: 4 * AMP(p), team: 'player', color: 0x88dd55 });
      for (const u of enemiesIn(p, hx, hy, 90)) slowU(u, 'shroom', 0.3, 2000, T(p)); return true;
    },
  },

  // ---------------------------------------------------------------- Kog'Maw
  kogmaw: {
    ranged: true, qRange: 620, cds: { Q: 8000, E: 6000, Dash: 5000 }, scales: ['ap'],
    base: { ...RANGED, maxHP: 175, attackRange: 540, abilityPower: 18 },
    kitLine: 'Passive death burst · Q bio-arcane range · E void ooze · Dash ooze lunge',
    info: {
      passive: AI('Icathian Surprise', 'When you fall, you burst — enemies nearby take a share of your max health.'),
      q: AI('Bio-Arcane Barrage', 'Gain attack range; your attacks add magic damage for a while. [mouth glows purple]'),
      e: AI('Void Ooze', 'Spray a lingering slow trail that damages. [puddle trail]'),
      dash: AI('Ooze Lunge', 'Dash forward, damaging across your ooze. [blur streak through puddle]'),
    },
    passiveTick: (p) => {
      if (p.memory.kogBoom || p.hpPct > 0.02 || p.alive) return; // rarely reached; player death ends the round
      p.memory.kogBoom = 1;
    },
    fireQ: (p) => { p.stats.set({ id: 'buff:kogrange', stat: 'attackRange', flat: rs(40, 60, 80, 100), expiresAt: T(p) + 6000 }); p.memory.kogUntil = T(p) + 6000; p.combat.ring(p.x, p.y, 0x66ffcc, 80); },
    castE: (p, dir) => {
      const d = dir ?? p.facing;
      p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: d.x, dirY: d.y, speed: 800, radius: 12, color: 0x88ffaa, team: 'player', maxDist: 620, maxHits: 99,
        onHit: (u) => { hit(p, u, (rs(50, 80, 110, 140) + 0.3 * AP(p)) * AMP(p), 'magisch', 'E'); slowU(u, 'ooze', 0.2, 2000, T(p)); } });
    },
    onAutoHit: (p, t) => { if (t.alive && (p.memory.kogUntil ?? 0) > T(p)) hit(p, t, (rs(15, 25, 35, 45) + 0.2 * AP(p)) * AMP(p), 'magisch', 'Q'); },
    onDash: (p, d) => { p.moveBy(d.x * 220, d.y * 220, true); for (const u of enemiesIn(p, p.x, p.y, 120)) hit(p, u, (rs(20, 30, 40, 50) + 0.15 * AP(p)) * AMP(p), 'magisch', 'Dash'); return true; },
  },

  // ---------------------------------------------------------------- Alistar
  alistar: {
    ranged: false, qRange: 260, cds: { Q: 6000, E: 7000, Dash: 6500 }, scales: ['ap'],
    base: { ...TANK, maxHP: 330 },
    kitLine: 'Passive roar-on-kill · Q trample knock-up · E roar shield · Dash headbutt',
    info: {
      passive: AI('Triumphant Roar', 'Takedowns heal you. [green plus particles on kill]'),
      q: AI('Trample-Hop', 'Leap in and knock up everything around you. [ground-crack, targets flip up]'),
      e: AI('Ancient Roar', 'Shield yourself and heal in a pulse. [expanding shockwave]'),
      dash: AI('Headbutt Charge', 'Charge a foe and knock it back. [head-first impact streak]'),
    },
    onAutoHit: (p, t) => { if (!t.alive) { p.heal(rs(30, 45, 60, 60) + 0.15 * AP(p)); p.combat.ring(p.x, p.y, 0x66cc66, 60); } },
    fireQ: (p, d) => { p.moveBy(d.x * 120, d.y * 120, true); p.combat.ring(p.x, p.y, 0xcc88ff, 180); for (const u of enemiesIn(p, p.x, p.y, 180)) { hit(p, u, (rs(50, 75, 100, 125) + 0.4 * AP(p)) * AMP(p), 'magisch', 'Q'); stun(u, 1000, T(p)); } },
    castE: (p) => { p.addShield((rs(60, 90, 120, 150) + 0.3 * AP(p)) * AMP(p)); p.heal(rs(30, 45, 60, 75)); p.combat.ring(p.x, p.y, 0xaaccff, 200); },
    onDash: (p, d) => { const t = near(p, 600); if (t) { leapTo(p, t.x, t.y, 50); const a = norm(t.x - p.x, t.y - p.y); t.moveBy(a.x * 200, a.y * 200); hit(p, t, (rs(40, 65, 90, 115) + 0.3 * AP(p)) * AMP(p), 'magisch', 'Dash'); stun(t, 500, T(p)); return true; } p.moveBy(d.x * 200, d.y * 200, true); return true; },
  },

  // ---------------------------------------------------------------- Cassiopeia
  cassiopeia: {
    ranged: true, qRange: 620, cds: { Q: 4000, E: 3000, Dash: 7000 }, scales: ['ap'],
    base: { ...CASTER, moveSpeed: 330 },
    kitLine: 'Passive serpentine speed · Q twin fang · E miasma · Dash slither',
    info: {
      passive: AI('Serpentine Grace', 'You glide faster than most — no boots needed. [tail motion-lines]'),
      q: AI('Twin Fang', 'Strike a target, far harder if it is poisoned. [purple spark on poisoned]'),
      e: AI('Miasma', 'Lay a poison cloud that slows and burns. [bubbling gas cloud]'),
      dash: AI('Serpentine Slither', 'A quick glide that ignores terrain. [low dust-trail glide]'),
    },
    fireQ: (p, d) => {
      const t = near(p, 600); const dx = t ? t.x - p.x : d.x, dy = t ? t.y - p.y : d.y;
      p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: dx, dirY: dy, speed: 1200, radius: 8, color: 0x99ff66, team: 'player', homing: t ?? undefined, maxDist: 650,
        onHit: (u) => { const pois = u.burns.length > 0; hit(p, u, (rs(40, 60, 80, 100) + 0.35 * AP(p)) * AMP(p) * (pois ? 1.6 : 1), 'magisch', 'Q'); if (pois) p.combat.ring(u.x, u.y, 0xcc66ff, 40); } });
    },
    castE: (p, dir) => {
      const d = dir ?? p.facing; const tx = p.x + d.x * 300, ty = p.y + d.y * 300; p.combat.ring(tx, ty, 0x77cc44, 150);
      p.combat.addHazard({ x: tx, y: ty, r: 150, until: T(p) + 3000, dps: (rs(15, 20, 25, 30) + 0.15 * AP(p)) * AMP(p), team: 'player', color: 0x77cc44 });
      for (const u of enemiesIn(p, tx, ty, 150)) { slowU(u, 'miasma', 0.2, 1000, T(p)); p.combat.addBurn(u, 3, 3000); }
    },
    onDash: (p, d) => { p.stats.set({ id: 'buff:slither', stat: 'moveSpeed', pct: 0.4, expiresAt: T(p) + 1500 }); p.moveBy(d.x * 160, d.y * 160, true); return true; },
  },

  // ---------------------------------------------------------------- Lee Sin
  leesin: {
    ranged: false, qRange: 300, cds: { Q: 4500, E: 7000, Dash: 5000 }, scales: ['ad'],
    base: { ...MELEE, moveSpeed: 340 },
    kitLine: 'Passive flurry · Q sonic dash-strike · E tempest slow · Dash charge',
    info: {
      passive: AI('Flurry', 'After casting an ability, your attack speed surges. [wind swirl on fists]'),
      q: AI('Sonic Wave', 'Send a wave; dash to the first enemy it hits. [wave then blur-dash]'),
      e: AI('Tempest', 'Slam the ground for AoE damage and a slow. [ground shockwave]'),
      dash: AI("Dragon's Rage", 'Charge forward and knock back on impact. [kick-impact streak]'),
    },
    fireQ: (p, d) => { asBuff(p, 0.4, 3000); p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: d.x, dirY: d.y, speed: 1400, radius: 9, color: 0xffcc66, team: 'player', maxDist: 600, onHit: (u) => { leapTo(p, u.x, u.y, 50); hit(p, u, (rs(40, 65, 90, 115) + 0.5 * bAD(p)) * AMP(p), 'physisch', 'Q'); } }); },
    castE: (p) => { asBuff(p, 0.4, 3000); p.combat.ring(p.x, p.y, 0xffaa55, 260); for (const u of enemiesIn(p, p.x, p.y, 260)) { hit(p, u, (rs(50, 75, 100, 125) + 0.6 * bAD(p)) * AMP(p), 'physisch', 'E'); slowU(u, 'tempest', 0.3, 1000, T(p)); } },
    onDash: (p, d) => { asBuff(p, 0.4, 3000); p.moveBy(d.x * 240, d.y * 240, true); for (const u of enemiesIn(p, p.x, p.y, 130)) { const a = norm(u.x - p.x, u.y - p.y); u.moveBy(a.x * 160, a.y * 160); hit(p, u, (rs(60, 90, 120, 150) + 0.8 * bAD(p)) * AMP(p), 'physisch', 'Dash'); stun(u, 400, T(p)); } return true; },
  },

  // ---------------------------------------------------------------- Ziggs
  ziggs: {
    ranged: true, qRange: 650, cds: { Q: 4000, E: 7000, Dash: 6000 }, scales: ['ap'],
    base: { ...CASTER, attackRange: 520 },
    kitLine: 'Passive short fuse · Q bouncing bomb · E minefield · Dash satchel jump',
    info: {
      passive: AI('Short Fuse', 'Every 3rd hit carries a bonus explosion. [fuse spark on 3rd hit]'),
      q: AI('Bouncing Bomb', 'Lob a bomb that explodes on the nearest enemy. [bounce then starburst]'),
      e: AI('Hexplosive Minefield', 'Scatter mines that detonate on contact. [mines plant and flash]'),
      dash: AI('Satchel Charge', 'Blast yourself away, damaging where you were. [launch arc]'),
    },
    onAutoHit: (p, t) => { if (!t.alive) return; p.memory.fuse = (p.memory.fuse ?? 0) + 1; if (p.memory.fuse >= 3) { p.memory.fuse = 0; hit(p, t, (rs(20, 30, 40, 50) + 0.2 * AP(p)) * AMP(p), 'magisch', 'Q'); p.combat.ring(t.x, t.y, 0xffaa33, 40); } },
    fireQ: (p) => { const t = near(p, 800); if (!t) return; const tx = t.x, ty = t.y; p.combat.delay(250, () => { p.combat.ring(tx, ty, 0xff5555, 130); for (const u of enemiesIn(p, tx, ty, 130)) hit(p, u, (rs(60, 90, 120, 150) + 0.45 * AP(p)) * AMP(p), 'magisch', 'Q'); }); },
    castE: (p, dir) => {
      const d = dir ?? p.facing; const cx = p.x + d.x * 260, cy = p.y + d.y * 260;
      for (let i = 0; i < 5; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 120; p.combat.addHazard({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, r: 55, until: T(p) + 5000, dps: (rs(20, 30, 40, 50) + 0.15 * AP(p)) * AMP(p) * 3, team: 'player', color: 0xffaa33 }); }
      p.combat.ring(cx, cy, 0xffaa33, 150);
    },
    onDash: (p, d) => { const ox = p.x, oy = p.y; p.moveBy(-d.x * 240, -d.y * 240, true); p.combat.ring(ox, oy, 0xffcc33, 120); for (const u of enemiesIn(p, ox, oy, 120)) { hit(p, u, (rs(70, 100, 130, 160) + 0.4 * AP(p)) * AMP(p), 'magisch', 'Dash'); const a = norm(u.x - ox, u.y - oy); u.moveBy(a.x * 120, a.y * 120); } return true; },
  },

  // ---------------------------------------------------------------- Nocturne
  nocturne: {
    ranged: false, qRange: 500, cds: { Q: 6000, E: 8000, Dash: 6000 }, scales: ['ad'],
    base: { ...MELEE, damage: 24, attackSpeed: 1.2, lifesteal: 0.06 },
    kitLine: 'Passive umbra blades · Q paranoia leap · E fear · Dash reaping blade',
    info: {
      passive: AI('Umbra Blades', 'Attacks come faster and drink a little life. [dark slash trail]'),
      q: AI('Paranoia', 'Leap onto any enemy in the arena. [dissolve to shadow, reappear behind]'),
      e: AI('Unspeakable Horror', 'Terrify a target, damaging it over time. [dark tendrils, skull flash]'),
      dash: AI('Duskbringer', 'Hurl a blade and blink to it. [spinning sickle, shadow pull]'),
    },
    onAutoHit: (p, t) => { void t; p.heal(2); },
    fireQ: (p) => { const t = near(p, 2000); if (!t) return; leapTo(p, t.x, t.y, 40); hit(p, t, (rs(70, 110, 150, 190) + 0.6 * bAD(p)) * AMP(p), 'physisch', 'Q'); p.combat.ring(p.x, p.y, 0x5533aa, 120); },
    castE: (p) => { const t = near(p, 400); if (!t) return; stun(t, 1500, T(p)); p.combat.addBurn(t, (rs(30, 45, 60, 75) + 0.2 * AP(p)) / 3, 3000); p.combat.flashLine(p.x, p.y, t.x, t.y, 0x8844cc); },
    onDash: (p, d) => { const tx = p.x + d.x * 260, ty = p.y + d.y * 260; leapTo(p, tx, ty, 0); for (const u of enemiesIn(p, p.x, p.y, 120)) hit(p, u, (rs(50, 75, 100, 125) + 0.4 * bAD(p)) * AMP(p), 'physisch', 'Dash'); return true; },
  },

  // ---------------------------------------------------------------- Warwick
  warwick: {
    ranged: false, qRange: 300, cds: { Q: 5000, E: 8000, Dash: 6000 }, scales: ['ad'],
    base: { ...MELEE, maxHP: 250, lifesteal: 0.1 },
    kitLine: 'Passive eternal thirst · Q blood hunt · E primal howl · Dash leaping bite',
    info: {
      passive: AI('Eternal Thirst', 'Attacks on wounded prey heal you. [red glow when target is low]'),
      q: AI('Blood Hunt', 'Surge toward wounded prey with bonus speed. [red eyes, red trail]'),
      e: AI('Primal Howl', 'Shield yourself and terrify nearby foes. [grey shockwave]'),
      dash: AI('Jaws of the Beast', 'Leap and bite, healing for half the damage. [pounce, red particles]'),
    },
    onAutoHit: (p, t) => { if (t.alive && t.hpPct < 0.5) { p.heal(4); p.combat.ring(p.x, p.y, 0xcc2222, 40); } },
    fireQ: (p) => { p.stats.set({ id: 'buff:bloodhunt', stat: 'moveSpeed', pct: rs(0.2, 0.3, 0.4, 0.5), expiresAt: T(p) + 3000 }); p.combat.ring(p.x, p.y, 0xcc2222, 70); },
    castE: (p) => { p.addShield((rs(50, 80, 110, 140) + 0.3 * bAD(p)) * AMP(p)); for (const u of enemiesIn(p, p.x, p.y, 220)) stun(u, 1000, T(p)); p.combat.ring(p.x, p.y, 0xaa3333, 220); },
    onDash: (p, d) => { const t = near(p, 650); if (t) { leapTo(p, t.x, t.y, 40); const dealt = hit(p, t, (rs(60, 90, 120, 150) + 0.5 * bAD(p)) * AMP(p), 'physisch', 'Dash'); p.heal(dealt * 0.5); return true; } p.moveBy(d.x * 220, d.y * 220, true); return true; },
  },

  // ---------------------------------------------------------------- Blitzcrank
  blitzcrank: {
    ranged: false, qRange: 700, cds: { Q: 8000, E: 5000, Dash: 9000 }, scales: ['ad'],
    base: { ...TANK, abilityPower: 16, attackRange: 170 },
    kitLine: 'Passive mana barrier · Q power fist · E static field · Dash rocket grab',
    info: {
      passive: AI('Mana Barrier', 'The first time you drop low, a shield absorbs the blow. [blue hex flash]'),
      q: AI('Power Fist', 'Your next attack knocks the target up. [fist glows, target flips]'),
      e: AI('Static Field', 'Periodic shocks damage nearby enemies. [spark ring pulses]'),
      dash: AI('Rocket Grab', 'Fire a hook that drags an enemy to you. [chain retracts]'),
    },
    passiveTick: (p) => { if (!p.memory.manaBar && p.hpPct < 0.3 && p.alive) { p.memory.manaBar = 1; p.addShield(p.maxHP * 0.15); p.combat.ring(p.x, p.y, 0x66aaff, 90); } },
    fireQ: (p) => { p.memory.blitzFist = 1; p.combat.ring(p.x, p.y, 0xffcc33, 60); },
    onAutoHit: (p, t) => { if (!p.memory.blitzFist || !t.alive) return; p.memory.blitzFist = 0; hit(p, t, (rs(50, 80, 110, 140) + 0.5 * bAD(p)) * AMP(p), 'physisch', 'Q'); stun(t, 900, T(p)); },
    castE: (p) => { p.combat.ring(p.x, p.y, 0x66ccff, 220); for (const u of enemiesIn(p, p.x, p.y, 220)) { hit(p, u, (rs(30, 45, 60, 75) + 0.2 * AP(p)) * AMP(p), 'magisch', 'E'); stun(u, 500, T(p)); } },
    onDash: (p) => { const t = near(p, 700); if (!t) return false; p.combat.flashLine(p.x, p.y, t.x, t.y, 0xffcc33); const a = norm(p.x - t.x, p.y - t.y), d = Math.hypot(t.x - p.x, t.y - p.y); t.moveBy(a.x * Math.max(0, d - 100), a.y * Math.max(0, d - 100)); stun(t, 600, T(p)); hit(p, t, (rs(40, 65, 90, 115) + 0.3 * AP(p)) * AMP(p), 'magisch', 'Dash'); return true; },
  },

  // ---------------------------------------------------------------- Amumu
  amumu: {
    ranged: false, qRange: 300, cds: { Q: 4500, E: 8000, Dash: 7000 }, scales: ['ap'],
    base: { ...TANK, maxHP: 330 },
    kitLine: 'Passive cursed touch · Q tantrum · E despair aura · Dash bandage pull',
    info: {
      passive: AI('Cursed Touch', 'Your attacks carry bonus magic damage. [purple sparkle on hit]'),
      q: AI('Tantrum', 'Lash out for AoE magic damage. [flailing stomp, ground burst]'),
      e: AI('Despair', 'An aura burns nearby enemies for % of their health. [dark pulsing ring]'),
      dash: AI('Bandage Toss', 'Fling a bandage to a foe, pulling and stunning. [bandage unspools]'),
    },
    onAutoHit: (p, t) => { if (t.alive) hit(p, t, 6 + 0.1 * AP(p), 'magisch', 'Q'); },
    fireQ: (p) => { p.combat.ring(p.x, p.y, 0x88aa66, 190); for (const u of enemiesIn(p, p.x, p.y, 190)) hit(p, u, (rs(50, 75, 100, 125) + 0.3 * AP(p)) * AMP(p), 'magisch', 'Q'); },
    castE: (p) => { p.memory.despairUntil = T(p) + 5000; p.combat.ring(p.x, p.y, 0x668844, 240); },
    passiveTick: (p) => { if ((p.memory.despairUntil ?? 0) <= T(p) || (p.memory.despairNext ?? 0) > T(p)) return; p.memory.despairNext = T(p) + 500; for (const u of enemiesIn(p, p.x, p.y, 240)) p.combat.dealDamage(p, u, u.maxHP * (rs(1.5, 2, 2.5, 3) / 100) * 0.5, 'ability', 'magisch'); },
    onDash: (p) => { const t = near(p, 700); if (!t) return false; p.combat.flashLine(p.x, p.y, t.x, t.y, 0xddcc88); leapTo(p, t.x, t.y, 40); hit(p, t, (rs(40, 65, 90, 115) + 0.3 * AP(p)) * AMP(p), 'magisch', 'Dash'); stun(t, 1000, T(p)); return true; },
  },

  // ---------------------------------------------------------------- Brand
  brand: {
    ranged: true, qRange: 620, cds: { Q: 6000, E: 5000, Dash: 6000 }, scales: ['ap'],
    base: { ...CASTER, abilityPower: 30 },
    kitLine: 'Passive blaze · Q searing stun · E pillar of flame · Dash flame step',
    info: {
      passive: AI('Blaze', 'Your hits stack fire; the 3rd stack detonates. [flame icons, burst on 3rd]'),
      q: AI('Sear', 'A bolt that stuns and burns. [fireball, stun stars]'),
      e: AI('Pillar of Flame', 'Erupt a zone of fire for heavy damage. [flame pillar rises]'),
      dash: AI('Flame Step', 'Blink through your own flames. [dissolve to embers]'),
    },
    onAutoHit: (p, t) => { if (t.alive) blaze(p, t); },
    fireQ: (p, d) => {
      const t = near(p, 600); const dx = t ? t.x - p.x : d.x, dy = t ? t.y - p.y : d.y;
      p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: dx, dirY: dy, speed: 1100, radius: 9, color: 0xff6622, team: 'player', homing: t ?? undefined, maxDist: 650,
        onHit: (u) => { hit(p, u, (rs(60, 90, 120, 150) + 0.5 * AP(p)) * AMP(p), 'magisch', 'Q'); stun(u, 1200, T(p)); blaze(p, u); } });
    },
    castE: (p, dir) => { const d = dir ?? p.facing; const tx = p.x + d.x * 280, ty = p.y + d.y * 280; p.combat.ring(tx, ty, 0xff5511, 150); p.combat.delay(250, () => { for (const u of enemiesIn(p, tx, ty, 150)) { hit(p, u, (rs(70, 105, 140, 175) + 0.55 * AP(p)) * AMP(p), 'magisch', 'E'); blaze(p, u); } }); },
    onDash: (p, d) => { p.moveBy(d.x * 220, d.y * 220, true); p.combat.ring(p.x, p.y, 0xff6622, 70); return true; },
  },

  // ---------------------------------------------------------------- Varus
  varus: {
    ranged: true, qRange: 700, cds: { Q: 5000, E: 0, Dash: 5000 }, scales: ['ad'],
    base: { ...RANGED, attackRange: 540 },
    kitLine: 'Passive living vengeance · Q piercing arrow · E blight stacks · Dash blades',
    info: {
      passive: AI('Living Vengeance', 'Landing an ability surges your attack speed. [purple wing flare]'),
      q: AI('Piercing Arrow', 'A powerful long-range piercing arrow. [charging glow, fast streak]'),
      e: AI('Blighted Quiver', 'Attacks stack blight; three detonate for a burst. [corruption veins]'),
      dash: AI('Hail of Blades', 'Dash and seed blight on nearby foes. [purple ring pulse]'),
    },
    fireQ: (p, d) => { asBuff(p, 0.35, 3000); p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: d.x, dirY: d.y, speed: 1300, radius: 10, color: 0xaa66ff, team: 'player', maxHits: 3, maxDist: 720, onHit: (u) => hit(p, u, (rs(50, 90, 130, 150) + 1.1 * bAD(p)) * AMP(p), 'physisch', 'Q') }); },
    castE: () => { /* passive blight, on-hit */ },
    onAutoHit: (p, t) => { if (!t.alive) return; if (addStack(t, T(p), 3) >= 3) { hit(p, t, (rs(10, 15, 20, 25) + 0.1 * AP(p)) * 6 * AMP(p), 'magisch', 'E'); p.combat.ring(t.x, t.y, 0xaa66ff, 60); } },
    onDash: (p, d) => { asBuff(p, 0.35, 3000); p.moveBy(d.x * 230, d.y * 230, true); for (const u of enemiesIn(p, p.x, p.y, 130)) addStack(u, T(p), 3); return true; },
  },

  // ---------------------------------------------------------------- Master Yi
  masteryi: {
    ranged: false, qRange: 400, cds: { Q: 6000, E: 7000, Dash: 5000 }, scales: ['ad'],
    base: { ...MELEE, attackSpeed: 1.4, critChance: 0.15 },
    kitLine: 'Passive double strike · Q meditate · E wuju style · Dash alpha strike',
    info: {
      passive: AI('Double Strike', 'Every 2nd attack strikes twice. [duplicate slash]'),
      q: AI('Meditate', 'Channel to heal over a few seconds. [kneel, green particle ring]'),
      e: AI('Wuju Style', 'Your attacks deal bonus true damage for a while. [red blade glow]'),
      dash: AI('Alpha Strike', 'Blink through several enemies, briefly untargetable. [sequential hops]'),
    },
    onAutoHit: (p, t) => {
      if (t.alive && (p.memory.wujuUntil ?? 0) > T(p)) hit(p, t, (rs(15, 25, 35, 45) + 0.4 * bAD(p)) * AMP(p), 'wahr', 'E');
      p.memory.yiCount = (p.memory.yiCount ?? 0) + 1;
      if (p.memory.yiCount >= 2 && t.alive) { p.memory.yiCount = 0; p.combat.dealDamage(p, t, AD(p) * 0.5, 'auto', 'physisch'); }
    },
    fireQ: (p) => { for (let i = 0; i < 3; i++) p.combat.delay(i * 1000, () => { if (p.alive) p.heal((rs(20, 30, 40, 50) + 0.15 * AP(p)) * AMP(p)); }); p.combat.ring(p.x, p.y, 0xffe0a0, 80); },
    castE: (p) => { p.memory.wujuUntil = T(p) + 4000; p.combat.ring(p.x, p.y, 0xff8866, 60); },
    onDash: (p) => { const targets = enemiesIn(p, p.x, p.y, 500).slice(0, 4); if (targets.length === 0) return false; p.invulnUntil = T(p) + 700; targets.forEach((u, i) => p.combat.delay(i * 90, () => { if (u.alive) { leapTo(p, u.x, u.y, 30); hit(p, u, (rs(40, 60, 80, 100) + 0.5 * bAD(p)) * AMP(p), 'physisch', 'Dash'); } })); return true; },
  },

  // ---------------------------------------------------------------- Fiddlesticks
  fiddlesticks: {
    ranged: true, qRange: 500, cds: { Q: 7000, E: 8000, Dash: 6000 }, scales: ['ap'],
    base: { ...CASTER },
    kitLine: 'Passive dread · Q terrify · E drain channel · Dash spectral blink',
    info: {
      passive: AI('Dread', 'Stand still to fade away; your first strike from hiding terrifies. [alpha fades when idle]'),
      q: AI('Terrify', 'Frighten a target and damage it. [dark hand reach, skull flash]'),
      e: AI('Drain', 'Siphon life from a foe, healing yourself. [green energy beam]'),
      dash: AI('Spectral Blink', 'Teleport a short way, briefly untargetable. [wispy grey particles]'),
    },
    passiveTick: (p) => { const still = p.isStationary; p.memory.fidIdle = still ? (p.memory.fidIdle ?? 0) + 1 : 0; if (still && (p.memory.fidIdle ?? 0) > 90) p.memory.stealthUntil = T(p) + 200; },
    onAutoHit: (p, t) => { if (t.alive && (p.memory.stealthUntil ?? 0) > T(p)) { p.memory.stealthUntil = 0; stun(t, 1200, T(p)); p.combat.ring(t.x, t.y, 0x66aa66, 50); } },
    fireQ: (p) => { const t = near(p, 520); if (!t) return; stun(t, 1500, T(p)); hit(p, t, (rs(50, 75, 100, 125) + 0.35 * AP(p)) * AMP(p), 'magisch', 'Q'); p.combat.flashLine(p.x, p.y, t.x, t.y, 0x448844); },
    castE: (p) => { const t = near(p, 500); if (!t) return; p.combat.flashLine(p.x, p.y, t.x, t.y, 0x66aa66); for (let i = 0; i < 3; i++) p.combat.delay(i * 500, () => { const tt = near(p, 550); if (tt) { const dealt = hit(p, tt, (rs(30, 45, 60, 75) + 0.25 * AP(p)) / 2 * AMP(p), 'magisch', 'E'); p.heal(dealt * 0.5); } }); },
    onDash: (p, d) => { p.moveBy(d.x * 200, d.y * 200, true); p.invulnUntil = T(p) + 500; p.combat.ring(p.x, p.y, 0x66aa66, 60); return true; },
  },

  // ---------------------------------------------------------------- Lux
  lux: {
    ranged: true, qRange: 700, cds: { Q: 6000, E: 6000, Dash: 6000 }, scales: ['ap'],
    base: { ...CASTER, abilityPower: 28, attackRange: 480 },
    kitLine: 'Passive illumination · Q light binding root · E prismatic barrier · Dash light blink',
    // fireQ: spawnProjectile maxDist 700, hit-radius 12 (width = 2*radius).
    spec: { q: { kind: 'line', range: 700, width: 24, speed: 1100 } },
    info: {
      passive: AI('Illumination', 'Ability hits mark a target; your next hit on it pops the mark. [pink glowing dot]'),
      q: AI('Light Binding', 'A piercing beam that roots enemies. [pink orb, light-bar root]'),
      e: AI('Prismatic Barrier', 'Shield yourself for a burst. [light ribbon, pink hex]'),
      dash: AI('Singularity Step', 'Blink and leave a slowing field. [light streak, glow zone]'),
    },
    onAutoHit: (p, t) => { if (t.alive && (luxMark.get(t) ?? 0) > T(p)) { luxMark.delete(t); hit(p, t, (rs(20, 30, 40, 50) + 0.3 * AP(p)) * AMP(p), 'magisch', 'Q'); p.combat.ring(t.x, t.y, 0xffb3f0, 40); } },
    fireQ: (p, d) => { p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: d.x, dirY: d.y, speed: 1100, radius: 12, color: 0xfff0a0, team: 'player', maxHits: 2, maxDist: 700, onHit: (u) => { hit(p, u, (rs(60, 90, 120, 150) + 0.45 * AP(p)) * AMP(p), 'magisch', 'Q'); stun(u, 1500, T(p)); luxMark.set(u, T(p) + 5000); } }); },
    castE: (p) => { p.addShield((rs(50, 75, 100, 125) + 0.3 * AP(p)) * AMP(p)); p.combat.ring(p.x, p.y, 0xfff0a0, 90); },
    onDash: (p, d) => { const ox = p.x, oy = p.y; p.moveBy(d.x * 200, d.y * 200, true); p.combat.addHazard({ x: ox, y: oy, r: 100, until: T(p) + 2000, dps: 0.01, team: 'player', color: 0xfff0a0 }); for (const u of enemiesIn(p, ox, oy, 100)) slowU(u, 'singularity', 0.2, 2000, T(p)); return true; },
  },

  // ---------------------------------------------------------------- Sivir
  sivir: {
    ranged: true, qRange: 640, cds: { Q: 4200, E: 8000, Dash: 5000 }, scales: ['ad'],
    base: { ...RANGED, damage: 100, attackRange: 500 },
    kitLine: 'Passive fleet of foot · Q boomerang blade · E spell shield · Dash ricochet step',
    info: {
      passive: AI('Fleet of Foot', 'Takedowns leave you fleet-footed. [blue speed lines on kill]'),
      q: AI('Boomerang Blade', 'Hurl a blade that flies out and back. [crossblade spins out and back]'),
      e: AI('Spell Shield', 'Briefly ward off enemy damage. [blue shield outline]'),
      dash: AI('Ricochet Step', 'Dash forward while your blade returns. [synced dust-trail dash]'),
    },
    onAutoHit: (p, t) => { if (!t.alive) p.stats.set({ id: 'buff:fleet', stat: 'moveSpeed', pct: 0.3, expiresAt: T(p) + 2000 }); },
    fireQ: (p, d) => { const dmg = (rs(45, 70, 95, 120) + 0.45 * bAD(p)) * AMP(p); p.combat.spawnProjectile({ x: p.x + d.x * (p.radius + 6), y: p.y + d.y * (p.radius + 6), dirX: d.x, dirY: d.y, speed: 1050, radius: 13, color: COLORS.playerProj, team: 'player', maxHits: 2, maxDist: 640, boomerangTo: p, spin: true, onHit: (u) => hit(p, u, dmg, 'physisch', 'Q') }); },
    castE: (p) => { p.invulnUntil = T(p) + 1200; p.combat.ring(p.x, p.y, 0xffe066, 60); p.combat.announce('Spell Shield!', '#ffe066'); },
    onDash: (p, d) => { p.moveBy(d.x * 220, d.y * 220, true); return true; },
  },

  // ---------------------------------------------------------------- Cho'Gath
  chogath: {
    ranged: false, qRange: 400, cds: { Q: 6000, E: 7000, Dash: 6000 }, scales: ['ap'],
    base: { ...TANK, maxHP: 360, damage: 22 },
    kitLine: 'Passive carnivore · Q rupture knock-up · E feral scream · Dash feast lunge',
    info: {
      passive: AI('Carnivore', 'Takedowns permanently grow your max health. [brief size pulse]'),
      q: AI('Rupture', 'Spikes burst from the ground, knocking up. [cracks glow, spikes erupt]'),
      e: AI('Feral Scream', 'A cone that silences and damages. [sound-wave ripple]'),
      dash: AI('Ravenous Lunge', 'Leap and bite. [pounce, bite clamp]'),
    },
    onAutoHit: (p, t) => { if (!t.alive) { p.stats.set({ id: 'perm:carn', stat: 'maxHP', flat: (p.memory.carn = (p.memory.carn ?? 0) + 20) }); p.heal(20); } },
    fireQ: (p, dir) => { const d = dir ?? p.facing; const tx = p.x + d.x * 260, ty = p.y + d.y * 260; p.combat.ring(tx, ty, 0x9955cc, 130); p.combat.delay(600, () => { for (const u of enemiesIn(p, tx, ty, 130)) { hit(p, u, (rs(60, 90, 120, 150) + 0.35 * AP(p)) * AMP(p), 'magisch', 'Q'); stun(u, 1000, T(p)); } }); },
    castE: (p, dir) => { const d = dir ?? p.facing; for (const u of p.combat.units) { if (!u.alive || u.team !== 'enemy') continue; const rx = u.x - p.x, ry = u.y - p.y, along = rx * d.x + ry * d.y; if (along < 0 || along > 380 || Math.abs(rx * d.y - ry * d.x) > 140) continue; hit(p, u, (rs(50, 80, 110, 140) + 0.35 * AP(p)) * AMP(p), 'magisch', 'E'); stun(u, 1000, T(p)); } p.combat.ring(p.x, p.y, 0x9955cc, 100); },
    onDash: (p, d) => { const t = near(p, 600); if (t) { leapTo(p, t.x, t.y, 40); hit(p, t, (rs(40, 65, 90, 115) + 0.25 * AP(p)) * AMP(p), 'magisch', 'Dash'); return true; } p.moveBy(d.x * 200, d.y * 200, true); return true; },
  },

  // ---------------------------------------------------------------- Ashe
  ashe: {
    ranged: true, qRange: 620, cds: { Q: 5000, E: 12000, Dash: 5500 }, scales: ['ad'],
    base: { ...RANGED, attackRange: 520, critChance: 0.15 },
    kitLine: 'Passive frost shot · Q volley (slow) · E enchanted arrow stun · Dash ranger focus',
    // fireQ: 5-bolt fan, i in [-2..2] * 0.14 rad each → 0.56 rad (~32°) total spread, maxDist 620.
    spec: { q: { kind: 'cone', range: 620, angle: 32 } },
    info: {
      passive: AI('Frost Shot', 'Your attacks slow. [icy-blue tint on hit]'),
      q: AI('Volley', 'Fan of arrows that slow. [cone of arrows, frost bursts]'),
      e: AI('Enchanted Arrow', 'A long arrow that stuns; longer flight, longer stun. [big blue arrow streak]'),
      dash: AI("Ranger's Focus", 'Sprint, then fire from farther for a few seconds. [bow glows blue]'),
    },
    onAutoHit: (p, t) => { if (t.alive) slowU(t, 'frostshot', 0.2, 1200, T(p)); },
    fireQ: (p, d) => { const dmg = (rs(50, 75, 100, 125) + 0.5 * bAD(p)) * AMP(p); for (let i = -2; i <= 2; i++) { const a = Math.atan2(d.y, d.x) + i * 0.14; p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: Math.cos(a), dirY: Math.sin(a), speed: 1000, radius: 7, color: 0x9fe8ff, team: 'player', maxDist: 620, onHit: (u) => { hit(p, u, dmg, 'physisch', 'Q'); slowU(u, 'volley', 0.3, 1500, T(p)); } }); } },
    castE: (p, dir) => { const d = dir ?? p.facing; const start = T(p); p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: d.x, dirY: d.y, speed: 700, radius: 12, color: 0x66ccff, team: 'player', maxDist: 1400, onHit: (u) => { hit(p, u, (rs(100, 150, 200, 250) + 1.0 * bAD(p)) * AMP(p), 'physisch', 'E'); stun(u, Math.min(2500, 1500 + (T(p) - start)), T(p)); } }); },
    onDash: (p, d) => { p.moveBy(d.x * 200, d.y * 200, true); p.stats.set({ id: 'buff:focus', stat: 'attackRange', flat: 150, expiresAt: T(p) + 3000 }); return true; },
  },

  // ---------------------------------------------------------------- Gragas
  gragas: {
    ranged: true, qRange: 600, cds: { Q: 5000, E: 8000, Dash: 6000 }, scales: ['ap'],
    base: { ...TANK, maxHP: 300, abilityPower: 22, attackRange: 300, moveSpeed: 330 },
    kitLine: 'Passive happy hour · Q barrel roll · E explosive cask · Dash body slam',
    info: {
      passive: AI('Happy Hour', 'Casting an ability tops you off with a little health. [beer-mug flash]'),
      q: AI('Barrel Roll', 'Roll a cask that bursts for damage and slow. [spinning barrel, splash]'),
      e: AI('Explosive Cask', 'Blast a zone, knocking enemies away. [barrel arcs and bursts]'),
      dash: AI('Body Slam', 'Charge into a foe, knocking it back. [rolling belly-flop]'),
    },
    fireQ: (p, dir) => { p.heal(8 + 0.05 * AP(p)); const d = dir ?? p.facing; const tx = p.x + d.x * 300, ty = p.y + d.y * 300; p.combat.ring(tx, ty, 0xcc8844, 140); for (const u of enemiesIn(p, tx, ty, 140)) { hit(p, u, (rs(60, 90, 120, 150) + 0.35 * AP(p)) * AMP(p), 'magisch', 'Q'); slowU(u, 'barrel', 0.25, 1500, T(p)); } },
    castE: (p, dir) => { p.heal(8 + 0.05 * AP(p)); const d = dir ?? p.facing; const tx = p.x + d.x * 260, ty = p.y + d.y * 260; p.combat.ring(tx, ty, 0xffaa55, 170); for (const u of enemiesIn(p, tx, ty, 170)) { hit(p, u, (rs(60, 90, 120, 150) + 0.35 * AP(p)) * AMP(p), 'magisch', 'E'); const a = norm(u.x - tx, u.y - ty); u.moveBy(a.x * 200, a.y * 200); } },
    onDash: (p, d) => { p.heal(8 + 0.05 * AP(p)); const t = near(p, 600); if (t) { leapTo(p, t.x, t.y, 50); const a = norm(t.x - p.x, t.y - p.y); t.moveBy(a.x * 160, a.y * 160); hit(p, t, (rs(50, 80, 110, 140) + 0.3 * AP(p)) * AMP(p), 'magisch', 'Dash'); stun(t, 500, T(p)); return true; } p.moveBy(d.x * 220, d.y * 220, true); return true; },
  },

  // ---------------------------------------------------------------- Karthus
  karthus: {
    ranged: true, qRange: 650, cds: { Q: 3500, E: 16000, Dash: 6000 }, scales: ['ap'],
    base: { ...CASTER, maxHP: 190 },
    kitLine: 'Passive death defied · Q lay waste · E requiem global · Dash spectral slide',
    info: {
      passive: AI('Death Defied', 'A whisper of the grave clings to you. [ghostly grey tint]'),
      q: AI('Lay Waste', 'A delayed blast at a point. [orb travels, jagged burst]'),
      e: AI('Requiem', 'A long-cooldown nuke that hits every enemy. [beam from above on each]'),
      dash: AI('Spectral Slide', 'A ghostly glide over terrain. [wispy trailing streak]'),
    },
    fireQ: (p, dir) => { const t = near(p, 700); const d = dir ?? p.facing; const tx = t ? t.x : p.x + d.x * 300, ty = t ? t.y : p.y + d.y * 300; p.combat.ring(tx, ty, 0x8866cc, 90); p.combat.delay(300, () => { for (const u of enemiesIn(p, tx, ty, 90)) hit(p, u, (rs(50, 80, 110, 140) + 0.4 * AP(p)) * AMP(p), 'magisch', 'Q'); }); },
    castE: (p) => { p.combat.announce('Requiem…', '#aa88ff'); const dmg = (rs(150, 150, 225, 300) + 0.7 * AP(p)) * AMP(p); p.combat.delay(700, () => { for (const u of p.combat.units) if (u.alive && u.team === 'enemy') { hit(p, u, dmg, 'magisch', 'E'); p.combat.ring(u.x, u.y, 0xaa88ff, 70); } }); },
    onDash: (p, d) => { p.moveBy(d.x * 200, d.y * 200, true); p.stats.set({ id: 'buff:slide', stat: 'moveSpeed', pct: 0.25, expiresAt: T(p) + 1000 }); return true; },
  },

  // ---------------------------------------------------------------- Lucian
  lucian: {
    ranged: true, qRange: 560, cds: { Q: 5000, E: 9000, Dash: 4000 }, scales: ['ad'],
    base: { ...RANGED, attackSpeed: 1.15 },
    kitLine: 'Passive lightslinger · Q piercing light · E culling burst · Dash relentless pursuit',
    info: {
      passive: AI('Lightslinger', 'Every 2nd ability fires a bonus shot at the nearest foe. [double muzzle flash]'),
      q: AI('Piercing Light', 'A line of light through enemies. [horizontal light-bullet]'),
      e: AI('The Culling', 'A burst of attack speed and a volley of shots. [rapid muzzle flashes]'),
      dash: AI('Relentless Pursuit', 'Dash; your next attack hits harder. [guns glow after]'),
    },
    fireQ: (p, dir) => { lightslinger(p); const d = dir ?? p.facing; p.combat.flashLine(p.x, p.y, p.x + d.x * 560, p.y + d.y * 560, 0xffee99); const dmg = (rs(45, 70, 95, 120) + 0.55 * bAD(p)) * AMP(p); for (const u of p.combat.units) { if (!u.alive || u.team !== 'enemy') continue; const rx = u.x - p.x, ry = u.y - p.y, along = rx * d.x + ry * d.y; if (along < 0 || along > 560 || Math.abs(rx * d.y - ry * d.x) > 45 + u.radius) continue; hit(p, u, dmg, 'physisch', 'Q'); } },
    castE: (p) => { lightslinger(p); p.stats.set({ id: 'buff:culling', stat: 'attackSpeed', pct: 0.4, expiresAt: T(p) + 3000 }); const t = near(p, 600); if (!t) return; const dmg = (rs(20, 30, 40, 50) + 0.2 * bAD(p)) * AMP(p); for (let i = 0; i < 3; i++) p.combat.delay(i * 150, () => { const tt = near(p, 700) ?? t; if (tt.alive) p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: tt.x - p.x, dirY: tt.y - p.y, speed: 1300, radius: 6, color: 0xffee99, team: 'player', homing: tt, maxDist: 700, onHit: (u) => hit(p, u, dmg, 'physisch', 'E') }); }); },
    onDash: (p, d) => { p.moveBy(d.x * 180, d.y * 180, true); p.memory.lucianE = 1; return true; },
    onAutoHit: (p, t) => { if (!p.memory.lucianE || !t.alive) return; p.memory.lucianE = 0; hit(p, t, (rs(20, 30, 40, 50) + 0.2 * bAD(p)) * AMP(p), 'physisch', 'Dash'); },
  },

  // ---------------------------------------------------------------- Shen
  shen: {
    ranged: false, qRange: 300, cds: { Q: 6000, E: 8000, Dash: 6000 }, scales: ['ad'],
    base: { ...TANK, damage: 20, attackRange: 165, magicResist: 20 },
    kitLine: 'Passive ki barrier · Q twilight %HP autos · E spirit refuge · Dash shadow taunt',
    info: {
      passive: AI('Ki Barrier', 'Casting an ability grants a shield. [blue-white hex flash]'),
      q: AI('Twilight Assault', 'Your attacks deal bonus % max-HP damage for a while. [white blade glow]'),
      e: AI("Spirit's Refuge", 'A zone that blocks attacks briefly. [blue dome]'),
      dash: AI('Shadow Dash', 'Dash through enemies, taunting them. [blur streak, taunt flash]'),
    },
    fireQ: (p) => { p.addShield(20 + 0.1 * bAD(p)); p.memory.shenQ = T(p) + 4000; p.combat.ring(p.x, p.y, 0x66ccff, 70); },
    onAutoHit: (p, t) => { if (t.alive && (p.memory.shenQ ?? 0) > T(p)) p.combat.dealDamage(p, t, t.maxHP * (rs(3, 4, 5, 6) / 100), 'ability', 'magisch'); },
    castE: (p) => { p.addShield((rs(40, 60, 80, 100) + 0.2 * bAD(p)) * AMP(p)); p.combat.ring(p.x, p.y, 0x66ccff, 140); },
    onDash: (p, d) => { p.addShield(20 + 0.1 * bAD(p)); p.moveBy(d.x * 240, d.y * 240, true); for (const u of enemiesIn(p, p.x, p.y, 140)) { hit(p, u, (rs(40, 60, 80, 100) + 0.2 * bAD(p)) * AMP(p), 'physisch', 'Dash'); stun(u, 800, T(p)); } return true; },
  },
};

// Brand Blaze: stack fire on a target; the 3rd stack detonates.
function blaze(p: Player, u: Unit): void {
  if (addStack(u, T(p), 3) >= 3) { hit(p, u, (12 + 0.25 * AP(p)) * AMP(p), 'magisch', 'E'); p.combat.ring(u.x, u.y, 0xff6622, 50); }
  else p.combat.addBurn(u, 2, 2000);
}

// Lucian Lightslinger: every 2nd ability cast fires a bonus shot.
function lightslinger(p: Player): void {
  p.memory.slinger = (p.memory.slinger ?? 0) + 1;
  if (p.memory.slinger % 2 !== 0) return;
  const t = near(p, 700); if (!t) return;
  p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: t.x - p.x, dirY: t.y - p.y, speed: 1400, radius: 6, color: 0xffffcc, team: 'player', homing: t, maxDist: 700,
    onHit: (u) => hit(p, u, 0.6 * AD(p) * AMP(p), 'physisch', 'Q') });
}
