// Logical game resolution (landscape). Scale.FIT maps it onto the device.
export const GAME_W = 1920;
export const GAME_H = 1080;

// Arena
export const ARENA_X = GAME_W / 2;
export const ARENA_Y = GAME_H / 2;
export const ARENA_R = 500;

// Pillars: static circular obstacles that block projectiles.
// Placed at 120° spokes so neither spawn lane (top/bottom center) is blocked.
export const PILLARS: { x: number; y: number; r: number }[] = [
  { x: ARENA_X + 280, y: ARENA_Y, r: 52 },
  { x: ARENA_X - 140, y: ARENA_Y + 242, r: 52 },
  { x: ARENA_X - 140, y: ARENA_Y - 242, r: 52 },
];

// Color language: player gold, enemies red family, high-contrast projectiles.
export const COLORS = {
  bg: 0x0a0a12,
  arenaFloor: 0x1a1a2a,
  arenaLine: 0x3a3a55,
  arenaRim: 0x8a6a2a,
  torch: 0xffaa44,
  pillar: 0x2e2e44,
  pillarLine: 0x55557a,
  player: 0xffc832,
  playerDark: 0xb8860b,
  playerProj: 0xffe680,
  enemy: 0xe03c3c,
  enemyDark: 0x8b1a1a,
  enemyProj: 0xff6a5e,
  telegraph: 0xff3333,
  hpGreen: 0x44dd66,
  hpRed: 0xdd3344,
  hpBack: 0x111118,
  shield: 0x88bbff,
  buff: 0xffee88,
  burn: 0xff7722,
  ui: 0xffffff,
  silver: 0x9fb4cc,
  gold: 0xf5c542,
  prisma: 0x5ff0e0,
} as const;

// Player base stats (starting values from spec; tune freely)
export const PLAYER_BASE = {
  maxHP: 200,
  moveSpeed: 300, // px/s
  damage: 20, // auto-attack damage
  attackSpeed: 1.0, // attacks per second
  attackRange: 450,
  projSpeed: 900,
  abilityDamage: 1.0, // % scaler
  cooldown: 1.0, // % scaler (lower = faster)
  lifesteal: 0,
} as const;

export const JOYSTICK_R = 110; // max stick travel

// Ability base values (ms / px; tune freely)
export const ABILITIES = {
  // Klingenwurf: boomerang blade — out and back, cuts on both legs
  Q: { dmg: 48, cd: 4200, speed: 1050, range: 640, radius: 13 },
  // Königsruf: golden nova (dmg + knockback) + empowered autos
  E: { cd: 8000, autos: 3, dmgBonus: 0.6, healPct: 0.2, novaDmg: 16, novaRange: 270, knockback: 95 },
  // Phasenschritt: dash that cuts everything it phases through
  Dash: { cd: 5000, dist: 220, duration: 0.18, slashDmg: 18 },
} as const;

