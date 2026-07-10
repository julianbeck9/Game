// Logical game resolution (landscape). Scale.FIT maps it onto the device.
export const GAME_W = 1920;
export const GAME_H = 1080;

// Arena
export const ARENA_X = GAME_W / 2;
export const ARENA_Y = GAME_H / 2;
export const ARENA_R = 500;

// Pillars: static circular obstacles that block projectiles.
export const PILLARS: { x: number; y: number; r: number }[] = [
  { x: ARENA_X - 220, y: ARENA_Y - 150, r: 52 },
  { x: ARENA_X + 220, y: ARENA_Y - 150, r: 52 },
  { x: ARENA_X, y: ARENA_Y + 180, r: 52 },
];

// Color language: player gold, enemies red family, high-contrast projectiles.
export const COLORS = {
  bg: 0x0a0a12,
  arenaFloor: 0x1a1a2a,
  arenaLine: 0x3a3a55,
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
} as const;

export const JOYSTICK_R = 110; // max stick travel
