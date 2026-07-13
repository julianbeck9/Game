import { COLORS } from '../config';
import { norm } from '../core/geometry';
import type { StatName } from '../core/stats';
import type { ChampionDef, AbilityInfo } from './types';
import type { Player } from '../entities/Player';
import type { Unit } from '../entities/Unit';

/**
 * Reusable kit archetypes. Each new roster champion picks one of these and
 * supplies only its own name / stats / sprite, so a big roster stays playable
 * without hand-authoring 26 unique kits. All ability text here is original,
 * generic-descriptive flavour (this is a private fan homage).
 */
export interface Kit {
  ranged: boolean;
  qRange: number;
  cds: { Q: number; E: number; Dash: number };
  base: Partial<Record<StatName, number>>;
  info: { passive: AbilityInfo; q: AbilityInfo; e: AbilityInfo; dash: AbilityInfo };
  kitLine: string;
  scales: ('ad' | 'ap')[];
  qCdFromAS?: boolean;
  critMult?: number;
  fireQ: ChampionDef['fireQ'];
  castE: ChampionDef['castE'];
  onAutoHit?: ChampionDef['onAutoHit'];
  onCombatInit?: ChampionDef['onCombatInit'];
  passiveTick?: ChampionDef['passiveTick'];
  onDamageTaken?: ChampionDef['onDamageTaken'];
}

const AD = (p: Player) => p.stats.get('damage');
const AP = (p: Player) => p.stats.get('abilityPower');
const AMP = (p: Player) => p.stats.get('abilityDamage');
const slow = (u: Unit, id: string, pct: number, ms: number, now: number) =>
  u.stats.set({ id: `slow:${id}`, stat: 'moveSpeed', pct: -Math.min(0.95, pct), expiresAt: now + ms });
const nearest = (p: Player, r = 900) => p.combat.nearestEnemy(p, r);

// ---------------------------------------------------------------------------
// boomerang — spinning blade out and back, nova + empowered strikes (König/Sivir)
// ---------------------------------------------------------------------------
export const boomerang: Kit = {
  ranged: true, qRange: 640, cds: { Q: 4200, E: 8000, Dash: 5000 }, scales: ['ad'],
  base: { maxHP: 210, moveSpeed: 300, damage: 21, attackSpeed: 1.0, attackRange: 450, armor: 12, magicResist: 12, projSpeed: 900 },
  kitLine: 'Q spinning blade (out & back) · E shockwave + empowered strikes',
  info: {
    passive: { name: 'Warpath', desc: 'Landing your blade refreshes your next steps of speed.' },
    q: { name: 'Spinning Blade', desc: 'Hurl a blade that flies out and back, hitting for 25 (+110% AD) on each leg.' },
    e: { name: 'Shockwave', desc: 'A ring of force deals 8 (+40% AD) and empowers your next 3 attacks.' },
    dash: { name: 'Quickstep', desc: 'A short dash that cuts everything it crosses.' },
  },
  fireQ: (p, d, scale) => {
    const dmg = (25 + 1.1 * AD(p)) * AMP(p) * scale;
    p.combat.spawnProjectile({ x: p.x + d.x * (p.radius + 6), y: p.y + d.y * (p.radius + 6), dirX: d.x, dirY: d.y,
      speed: 1050, radius: 13, color: COLORS.playerProj, team: 'player', maxHits: 2, maxDist: 640, boomerangTo: p, spin: true,
      onHit: (t) => { const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch'); p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt }); } });
  },
  castE: (p) => {
    p.empoweredAutos = 3;
    const dmg = (8 + 0.4 * AD(p)) * AMP(p);
    p.combat.ring(p.x, p.y, COLORS.buff, 270);
    for (const u of [...p.combat.units]) {
      if (!u.alive || u.team !== 'enemy' || Math.hypot(u.x - p.x, u.y - p.y) > 270) continue;
      const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'physisch');
      p.combat.bus.emit('abilityHit', { ability: 'E', target: u, dmg: dealt });
      const a = norm(u.x - p.x, u.y - p.y); u.moveBy(a.x * 95, a.y * 95);
    }
  },
};

// ---------------------------------------------------------------------------
// windblade — attack-speed thrust, dash-slash, doubled crit (Yasuo/Yi/Lee Sin)
// ---------------------------------------------------------------------------
export const windblade: Kit = {
  ranged: false, qRange: 280, cds: { Q: 3600, E: 11000, Dash: 4200 }, scales: ['ad'], qCdFromAS: true, critMult: 2,
  base: { maxHP: 215, moveSpeed: 335, damage: 22, attackSpeed: 1.3, attackRange: 150, armor: 14, magicResist: 10, critChance: 0.15, projSpeed: 900 },
  kitLine: 'Q attack-speed thrust · E blade wall · doubled crit',
  info: {
    passive: { name: 'Flow', desc: 'Moving builds momentum; your crit chance counts double.' },
    q: { name: 'Thrust', desc: 'A quick strike for 12 (+90% AD); cooldown scales with attack speed.' },
    e: { name: 'Wind Wall', desc: 'Raise a wall of wind toward your aim that eats enemy projectiles.' },
    dash: { name: 'Sweeping Blade', desc: 'A short dash that cuts everything it passes.' },
  },
  fireQ: (p, d, scale) => {
    const dmg = (12 + 0.9 * AD(p)) * AMP(p) * scale;
    p.combat.flashLine(p.x, p.y, p.x + d.x * 200, p.y + d.y * 200, 0xbfeef8);
    for (const u of [...p.combat.units]) {
      if (!u.alive || u.team !== 'enemy') continue;
      const rel = { x: u.x - p.x, y: u.y - p.y }; const along = rel.x * d.x + rel.y * d.y;
      if (along < 0 || along > 240) continue; const perp = Math.abs(rel.x * d.y - rel.y * d.x);
      if (perp > 70 + u.radius) continue;
      const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'physisch');
      p.combat.bus.emit('abilityHit', { ability: 'Q', target: u, dmg: dealt });
    }
  },
  castE: (p, dir) => { const d = dir ?? p.facing; p.combat.addWall(p.x + d.y * 90, p.y - d.x * 90, p.x - d.y * 90, p.y + d.x * 90, p.combat.now + 3500); p.combat.ring(p.x, p.y, 0xbfeef8, 60); },
};

// ---------------------------------------------------------------------------
// frostarrow — homing arrows that chill (Ashe/Vayne)
// ---------------------------------------------------------------------------
export const frostarrow: Kit = {
  ranged: true, qRange: 620, cds: { Q: 5000, E: 9000, Dash: 5200 }, scales: ['ad'],
  base: { maxHP: 180, moveSpeed: 305, damage: 20, attackSpeed: 1.15, attackRange: 520, armor: 9, magicResist: 9, critChance: 0.15, projSpeed: 1000 },
  kitLine: 'Q frost volley (slow) · E scouting shot',
  info: {
    passive: { name: 'Frostbite', desc: 'Your hits chill: slowed targets take a touch more.' },
    q: { name: 'Frost Volley', desc: 'Fire three chilling arrows that slow on hit.' },
    e: { name: 'Scouting Shot', desc: 'A long arrow that damages and heavily slows the first enemy.' },
    dash: { name: 'Backstep', desc: 'A short dash to reposition.' },
  },
  fireQ: (p, d, scale) => {
    const dmg = (14 + 0.7 * AD(p)) * AMP(p) * scale;
    for (let i = -1; i <= 1; i++) {
      const a = Math.atan2(d.y, d.x) + i * 0.16; const dx = Math.cos(a), dy = Math.sin(a);
      p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: dx, dirY: dy, speed: 1000, radius: 8, color: 0x9fe8ff, team: 'player', maxDist: 700,
        onHit: (t) => { const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch'); slow(t, 'frost', 0.3, 1400, p.combat.now); p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt }); } });
    }
  },
  castE: (p, dir) => {
    const d = dir ?? p.facing; const t = nearest(p, 900);
    const dx = t ? t.x - p.x : d.x, dy = t ? t.y - p.y : d.y; const dmg = (20 + 0.9 * AD(p)) * AMP(p);
    p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: dx, dirY: dy, speed: 1200, radius: 10, color: 0x66ccff, team: 'player', homing: t ?? undefined, maxDist: 1100,
      onHit: (hit) => { const dealt = p.combat.dealDamage(p, hit, dmg, 'ability', 'physisch'); slow(hit, 'scout', 0.6, 1600, p.combat.now); p.combat.bus.emit('abilityHit', { ability: 'E', target: hit, dmg: dealt }); } });
  },
};

// ---------------------------------------------------------------------------
// cleavetank — sturdy melee, empowered strike + spin (Garen/Jarvan/Shen/Pantheon/Gragas)
// ---------------------------------------------------------------------------
export const cleavetank: Kit = {
  ranged: false, qRange: 220, cds: { Q: 4000, E: 9000, Dash: 5000 }, scales: ['ad'],
  base: { maxHP: 280, moveSpeed: 320, damage: 20, attackSpeed: 0.95, attackRange: 160, armor: 20, magicResist: 16, projSpeed: 900 },
  kitLine: 'Q empowered strike · E spinning cleave',
  info: {
    passive: { name: 'Bulwark', desc: 'Standing firm, you shrug off a share of incoming blows.' },
    q: { name: 'Decisive Strike', desc: 'Your next strike lands for 18 (+80% AD) and silences briefly.' },
    e: { name: 'Whirlwind', desc: 'Spin for 14 (+50% AD) to everything around you.' },
    dash: { name: 'Charge', desc: 'A short dash that shoves enemies aside.' },
  },
  fireQ: (p, d, scale) => {
    p.empoweredAutos = 1; const dmg = (18 + 0.8 * AD(p)) * AMP(p) * scale; const t = nearest(p, 240);
    if (t) { const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch'); p.combat.flashLine(p.x, p.y, t.x, t.y, 0xffe0a0); p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt }); }
  },
  castE: (p) => {
    const dmg = (14 + 0.5 * AD(p)) * AMP(p); p.combat.ring(p.x, p.y, 0xffd24a, 200);
    for (const u of [...p.combat.units]) { if (!u.alive || u.team !== 'enemy' || Math.hypot(u.x - p.x, u.y - p.y) > 200) continue;
      const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'physisch'); p.combat.bus.emit('abilityHit', { ability: 'E', target: u, dmg: dealt }); }
  },
};

// ---------------------------------------------------------------------------
// rockets — burst of homing shots (Jinx/Kog'Maw/Lucian)
// ---------------------------------------------------------------------------
export const rockets: Kit = {
  ranged: true, qRange: 560, cds: { Q: 4500, E: 8500, Dash: 5000 }, scales: ['ad'],
  base: { maxHP: 175, moveSpeed: 300, damage: 19, attackSpeed: 1.2, attackRange: 500, armor: 8, magicResist: 8, projSpeed: 1000 },
  kitLine: 'Q rocket burst · E blast zone',
  info: {
    passive: { name: 'Get Excited', desc: 'Takedowns leave you faster and firing harder.' },
    q: { name: 'Rocket Burst', desc: 'Fire four homing rockets at nearby enemies.' },
    e: { name: 'Blast Zone', desc: 'Detonate an area at the nearest enemy for 24 (+60% AD).' },
    dash: { name: 'Hop', desc: 'A short dash to kite.' },
  },
  fireQ: (p, _d, scale) => {
    const t = nearest(p, 700); if (!t) return; const dmg = (10 + 0.35 * AD(p)) * AMP(p) * scale;
    for (let i = 0; i < 4; i++) p.combat.delay(i * 90, () => { const tt = nearest(p, 800) ?? t; if (!tt.alive) return;
      p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: tt.x - p.x, dirY: tt.y - p.y + (Math.random() - 0.5) * 50, speed: 950, radius: 7, color: 0xff8855, team: 'player', homing: tt, maxDist: 800,
        onHit: (hit) => { const dealt = p.combat.dealDamage(p, hit, dmg, 'ability', 'physisch'); p.combat.bus.emit('abilityHit', { ability: 'Q', target: hit, dmg: dealt }); } }); });
  },
  castE: (p) => {
    const t = nearest(p, 800); if (!t) return; const tx = t.x, ty = t.y; const dmg = (24 + 0.6 * AD(p)) * AMP(p);
    p.combat.ring(tx, ty, 0xff8855, 140); p.combat.delay(400, () => { p.combat.ring(tx, ty, 0xffaa55, 150);
      for (const u of [...p.combat.units]) { if (!u.alive || u.team !== 'enemy' || Math.hypot(u.x - tx, u.y - ty) > 140) continue;
        const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'physisch'); p.combat.bus.emit('abilityHit', { ability: 'E', target: u, dmg: dealt }); } });
  },
};

// ---------------------------------------------------------------------------
// mage — piercing beam that roots + delayed bloom (Lux/Taric/Ziggs) — AP
// ---------------------------------------------------------------------------
export const mage: Kit = {
  ranged: true, qRange: 700, cds: { Q: 5200, E: 6800, Dash: 5400 }, scales: ['ap'],
  base: { maxHP: 180, moveSpeed: 290, damage: 16, abilityPower: 25, attackSpeed: 0.9, attackRange: 480, armor: 8, magicResist: 12, projSpeed: 920 },
  kitLine: 'Q piercing beam (root) · E light bloom',
  info: {
    passive: { name: 'Kindle', desc: 'Ability hits mark a target; your next attack pops it for magic damage.' },
    q: { name: 'Piercing Beam', desc: 'A beam for 20 (+90% AP) that roots the first two enemies.' },
    e: { name: 'Bloom', desc: 'Mark the ground; after a beat it bursts for 16 (+100% AP) and slows.' },
    dash: { name: 'Light Step', desc: 'A short dash of pure light.' },
  },
  fireQ: (p, d, scale) => {
    const dmg = (20 + 0.9 * AP(p)) * AMP(p) * scale;
    p.combat.spawnProjectile({ x: p.x + d.x * (p.radius + 6), y: p.y + d.y * (p.radius + 6), dirX: d.x, dirY: d.y, speed: 1000, radius: 12, color: 0xfff0a0, team: 'player', maxHits: 2, maxDist: 700,
      onHit: (t) => { const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'magisch'); t.stats.set({ id: 'slow:bind', stat: 'moveSpeed', pct: -1, expiresAt: p.combat.now + 1100 }); p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt }); } });
  },
  castE: (p, dir) => {
    const t = nearest(p, 650); const at = dir ? { x: p.x + dir.x * 460, y: p.y + dir.y * 460 } : t ? { x: t.x, y: t.y } : { x: p.x + p.facing.x * 400, y: p.y + p.facing.y * 400 };
    const dmg = (16 + 1.0 * AP(p)) * AMP(p); p.combat.ring(at.x, at.y, 0xfff0a0, 170);
    p.combat.delay(650, () => { p.combat.ring(at.x, at.y, 0xffffff, 180); for (const u of [...p.combat.units]) { if (!u.alive || u.team !== 'enemy' || Math.hypot(u.x - at.x, u.y - at.y) > 180) continue;
      const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'magisch'); slow(u, 'bloom', 0.3, 1200, p.combat.now); p.combat.bus.emit('abilityHit', { ability: 'E', target: u, dmg: dealt }); } });
  },
};

// ---------------------------------------------------------------------------
// casterdot — bolt + area that burns (Cassiopeia/Brand/Karthus/Teemo/Fiddlesticks) — AP
// ---------------------------------------------------------------------------
export const casterdot: Kit = {
  ranged: true, qRange: 620, cds: { Q: 4000, E: 8500, Dash: 5400 }, scales: ['ap'],
  base: { maxHP: 175, moveSpeed: 295, damage: 15, abilityPower: 28, attackSpeed: 0.9, attackRange: 470, armor: 7, magicResist: 12, projSpeed: 900 },
  kitLine: 'Q venom bolt (burn) · E plague cloud',
  info: {
    passive: { name: 'Contagion', desc: 'Your magic lingers, dealing damage over time.' },
    q: { name: 'Venom Bolt', desc: 'A bolt for 12 (+45% AP) that poisons for 5s.' },
    e: { name: 'Plague Cloud', desc: 'A cloud at the nearest enemy burns everything inside.' },
    dash: { name: 'Slither', desc: 'A short dash to reposition.' },
  },
  fireQ: (p, d, scale) => {
    const dmg = (12 + 0.45 * AP(p)) * AMP(p) * scale;
    p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: d.x, dirY: d.y, speed: 900, radius: 9, color: 0x88dd55, team: 'player', maxDist: 700,
      onHit: (t) => { const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'magisch'); p.combat.addBurn(t, (0.05 * AP(p) + 4) / 5 * AMP(p), 5000); p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt }); } });
  },
  castE: (p) => {
    const t = nearest(p, 800); if (!t) return; const tx = t.x, ty = t.y;
    p.combat.ring(tx, ty, 0x77cc44, 170); p.combat.addHazard({ x: tx, y: ty, r: 170, until: p.combat.now + 3000, dps: (0.2 * AP(p) + 10) * AMP(p), team: 'player', color: 0x77cc44 });
    p.combat.delay(60, () => p.combat.bus.emit('abilityHit', { ability: 'E', target: t, dmg: 0 }));
  },
};

// ---------------------------------------------------------------------------
// bruiserbleed — heavy strikes that bleed + a heal (Darius/Warwick)
// ---------------------------------------------------------------------------
export const bruiserbleed: Kit = {
  ranged: false, qRange: 220, cds: { Q: 4200, E: 9500, Dash: 5000 }, scales: ['ad'],
  base: { maxHP: 250, moveSpeed: 330, damage: 23, attackSpeed: 1.0, attackRange: 160, armor: 16, magicResist: 12, lifesteal: 0.08, projSpeed: 900 },
  kitLine: 'Q bleeding cleave · E hunt & heal',
  info: {
    passive: { name: 'Hemorrhage', desc: 'Your hits stack bleed that ticks for a share of max HP.' },
    q: { name: 'Bleeding Cleave', desc: 'A wide swing for 16 (+70% AD) that applies heavy bleed.' },
    e: { name: 'Bloodhunt', desc: 'Leap to the nearest enemy, striking and healing for the damage.' },
    dash: { name: 'Lunge', desc: 'A short dash forward.' },
  },
  fireQ: (p, d, scale) => {
    const dmg = (16 + 0.7 * AD(p)) * AMP(p) * scale; p.combat.ring(p.x, p.y, 0xcc3a3a, 220);
    for (const u of [...p.combat.units]) { if (!u.alive || u.team !== 'enemy' || Math.hypot(u.x - p.x, u.y - p.y) > 220) continue;
      const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'physisch'); p.combat.addBurn(u, (u.maxHP * 0.03) / 5, 5000); p.combat.bus.emit('abilityHit', { ability: 'Q', target: u, dmg: dealt }); }
  },
  castE: (p) => {
    const t = nearest(p, 650); if (!t) return; const a = norm(t.x - p.x, t.y - p.y); p.moveBy(a.x * 200, a.y * 200);
    const dmg = (18 + 0.9 * AD(p)) * AMP(p); const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch'); p.heal(dealt * 0.5); p.combat.bus.emit('abilityHit', { ability: 'E', target: t, dmg: dealt });
  },
};

// ---------------------------------------------------------------------------
// assassin — shuriken + shadow dash that executes (Zed/Nocturne/Fizz)
// ---------------------------------------------------------------------------
export const assassin: Kit = {
  ranged: true, qRange: 560, cds: { Q: 3800, E: 7000, Dash: 4000 }, scales: ['ad'],
  base: { maxHP: 190, moveSpeed: 335, damage: 24, attackSpeed: 1.1, attackRange: 170, armor: 12, magicResist: 10, critChance: 0.1, projSpeed: 1000 },
  kitLine: 'Q blade throw · E shadow dash (execute)',
  info: {
    passive: { name: 'Contempt', desc: 'Your strikes hit low-health targets far harder.' },
    q: { name: 'Blade Throw', desc: 'Throw a blade for 14 (+80% AD).' },
    e: { name: 'Shadow Dash', desc: 'Blink to the nearest enemy; struck low-HP foes take bonus true damage.' },
    dash: { name: 'Fade', desc: 'A short dash that leaves a decoy.' },
  },
  fireQ: (p, d, scale) => {
    const dmg = (14 + 0.8 * AD(p)) * AMP(p) * scale;
    p.combat.spawnProjectile({ x: p.x, y: p.y, dirX: d.x, dirY: d.y, speed: 1100, radius: 8, color: 0xaa4455, team: 'player', maxDist: 620,
      onHit: (t) => { const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch'); p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt }); } });
  },
  castE: (p) => {
    const t = nearest(p, 600); if (!t) return; const a = norm(t.x - p.x, t.y - p.y); p.moveBy((Math.hypot(t.x - p.x, t.y - p.y) - 60) * a.x, (Math.hypot(t.x - p.x, t.y - p.y) - 60) * a.y);
    const dmg = (16 + 0.6 * AD(p)) * AMP(p); const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch');
    if (t.alive && t.hpPct < 0.4) p.combat.dealDamage(p, t, t.maxHP * 0.08, 'ability', 'wahr');
    p.combat.ring(p.x, p.y, 0xaa4455, 90); p.combat.bus.emit('abilityHit', { ability: 'E', target: t, dmg: dealt });
  },
  onAutoHit: (p, t) => { if (t.alive && t.hpPct < 0.35) p.combat.dealDamage(p, t, t.maxHP * 0.04, 'ability', 'magisch'); },
};

// ---------------------------------------------------------------------------
// hooktank — pull the nearest enemy + knockback nova (Zac/Alistar/Blitzcrank/Cho'Gath)
// ---------------------------------------------------------------------------
export const hooktank: Kit = {
  ranged: false, qRange: 700, cds: { Q: 9000, E: 7000, Dash: 5500 }, scales: ['ad'],
  base: { maxHP: 320, moveSpeed: 315, damage: 19, attackSpeed: 0.9, attackRange: 165, armor: 22, magicResist: 18, projSpeed: 900 },
  kitLine: 'Q grapple pull · E shockwave + hardening',
  info: {
    passive: { name: 'Colossus', desc: 'The bigger the fight, the tougher your hide.' },
    q: { name: 'Grapple', desc: 'Reel the nearest enemy to you and root them briefly.' },
    e: { name: 'Ground Slam', desc: 'Knock back all nearby enemies and harden your resists.' },
    dash: { name: 'Trample', desc: 'A short dash that bowls through.' },
  },
  fireQ: (p) => {
    const t = nearest(p, 750); if (!t) return; p.combat.flashLine(p.x, p.y, t.x, t.y, 0xffcc66);
    const d = Math.max(30, Math.hypot(t.x - p.x, t.y - p.y)); const pull = Math.max(0, d - 120);
    t.moveBy(((p.x - t.x) / d) * pull, ((p.y - t.y) / d) * pull); slow(t, 'grapple', 1, 900, p.combat.now);
    const dmg = (10 + 0.4 * AD(p)) * AMP(p); const dealt = p.combat.dealDamage(p, t, dmg, 'ability', 'physisch'); p.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
  },
  castE: (p) => {
    const dmg = (12 + 0.5 * AD(p)) * AMP(p); p.combat.ring(p.x, p.y, 0xffffff, 260);
    p.stats.set({ id: 'buff:harden-r', stat: 'armor', flat: 40, expiresAt: p.combat.now + 3000 });
    p.stats.set({ id: 'buff:harden-m', stat: 'magicResist', flat: 40, expiresAt: p.combat.now + 3000 });
    for (const u of [...p.combat.units]) { if (!u.alive || u.team !== 'enemy' || Math.hypot(u.x - p.x, u.y - p.y) > 260) continue;
      const a = norm(u.x - p.x, u.y - p.y); u.moveBy(a.x * 180, a.y * 180); const dealt = p.combat.dealDamage(p, u, dmg, 'ability', 'physisch'); p.combat.bus.emit('abilityHit', { ability: 'E', target: u, dmg: dealt }); }
  },
};

export const KITS = { boomerang, windblade, frostarrow, cleavetank, rockets, mage, casterdot, bruiserbleed, assassin, hooktank } as const;
export type KitName = keyof typeof KITS;
