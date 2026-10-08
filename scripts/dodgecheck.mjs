// Is enemy damage avoidable? (SCHLACHTPLAN Phase 1, Leitsatz L3)
//
// Two claims, each with its control:
//
//  1. A melee swing can be dodged. One melee enemy beside a melee champion.
//     CONTROL: the player stands still -> must take damage, or the enemy never
//     swung and the dodge result means nothing.
//     DODGE:   the player steps away 150ms after the wind-up starts (a human
//     reaction time) and walks back in afterwards -> must take nothing, while
//     the enemy demonstrably swung at least twice.
//
//  2. A crowd attacks in turns. Round 10, immortal player, eight seconds. The
//     number of enemies holding an attack token at once must never exceed the
//     round's budget (core/tokens.ts). Bosses and mini-bosses are exempt by
//     design and are not counted.
//
// Driven by __CC.stepMs so the result is the same on a slow machine: the clock
// advances in fixed 16ms steps and the scripted player reacts between steps.
// The synthetic clock is used EXCLUSIVELY until the very end. Mixing it with
// real-time waits makes game time jump backwards on resumeClock (synthetic time
// runs ahead of the wall clock), and every telegraph started in the 'future'
// then draws with negative progress — that crashed the first version.
//
//   node scripts/dodgecheck.mjs
import pkg from 'playwright';

const { chromium } = pkg;
const PORT = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '5173';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/index.html?renderer=canvas`);
await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 30000 });
await page.waitForTimeout(800);

async function duel(dodge) {
  return page.evaluate(async (dodge) => {
    const CC = window.__CC;
    CC.reset();
    CC.autopilot(false);
    CC.run.champion = 'brannoc';
    CC.forceMap('highland');
    CC.goto(1);
    CC.stepMs(900, 16); // synthetic clock only — see header
    const a = CC.arena();
    const p = a.player;
    CC.run.flags.noAutoAttacks = true; // measure the enemy, not a trade
    p.hp = p.maxHP = 1e6;

    const e = a.units.find((u) => u.team === 'enemy' && u.alive);
    // Same opponent every time: a plain melee brawler, no abilities, no gun.
    e.cfg.melee = { range: 55, dmg: 15, intervalMs: 900 };
    e.cfg.rangedAuto = undefined;
    e.cfg.abilities = [];
    e.cfg.preferredRange = 40;
    e.cfg.rangeBand = 30;
    // Drop anything already in flight: the round ran ~900ms before this setup,
    // and a skillshot wound up in that window still fires after the override —
    // which is exactly the stray 13 damage the first version of this check
    // blamed on the swing.
    e.telegraphing = null;
    e.lunge = null;
    e.nextSwingAt = 0;
    for (const pr of a.projectiles) if (pr.team === 'enemy') pr.alive = false; // shots already in the air
    e.hp = e.maxHP = 1e6;
    e.x = p.x + 70;
    e.y = p.y;

    const before = p.hp;
    let swings = 0;
    let wasCasting = false;
    let castSeenAt = 0;
    const DT = 16;
    for (let i = 0; i < 300; i++) {
      CC.stepMs(DT, DT);
      const casting = e.isCasting();
      if (casting && !wasCasting) { swings++; castSeenAt = p.combat.now; }
      wasCasting = casting;
      if (!dodge) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = 300 * (DT / 1000);
      if (casting && p.combat.now - castSeenAt >= 150) {
        // Back out of the wedge; if scenery is in the way, try the next best
        // heading — straight back, then the diagonals, then the sides. What a
        // human does; without it a run that backs into a corner 'fails'.
        const base = Math.atan2(dy, dx);
        for (const off of [0, 0.79, -0.79, 1.57, -1.57, 2.36, -2.36]) {
          const bx = p.x;
          const by = p.y;
          p.moveBy(Math.cos(base + off) * step, Math.sin(base + off) * step);
          if (Math.hypot(p.x - bx, p.y - by) >= step * 0.5) break;
        }
      } else if (!casting && d > 75) {
        p.moveBy((-dx / d) * step, (-dy / d) * step); // walk back in
      }
    }
    return { taken: Math.round(before - p.hp), swings };
  }, dodge);
}

async function crowd() {
  return page.evaluate(async () => {
    const CC = window.__CC;
    CC.reset();
    CC.autopilot(false);
    CC.run.champion = 'brannoc';
    CC.forceMap('highland');
    CC.goto(10);
    CC.stepMs(900, 16);
    const a = CC.arena();
    const p = a.player;
    let maxTokens = 0;
    let maxCasting = 0;
    for (let i = 0; i < 500; i++) {
      p.hp = Math.max(p.hp, 1e6);
      CC.stepMs(16, 16);
      const foes = a.units.filter((u) => u.team === 'enemy' && u.alive && !u.isBoss && !u.isElite);
      maxTokens = Math.max(maxTokens, foes.filter((u) => u.hasToken).length);
      maxCasting = Math.max(maxCasting, foes.filter((u) => u.isCasting()).length);
    }
    const foes = a.units.filter((u) => u.team === 'enemy' && u.alive && !u.isBoss && !u.isElite).length;
    return { foes, maxTokens, maxCasting, round: CC.run.round };
  });
}

let failed = 0;
const still = await duel(false);
const moving = await duel(true);
const okControl = still.taken > 0 && still.swings >= 2;
const okDodge = moving.taken === 0 && moving.swings >= 2;
if (!okControl) failed++;
if (!okDodge) failed++;
console.log(`[dodge] control (stand still)  ${okControl ? 'PASS' : 'FAIL'}  swings=${still.swings} taken=${still.taken}`);
console.log(`[dodge] dodge (step out)       ${okDodge ? 'PASS' : 'FAIL'}  swings=${moving.swings} taken=${moving.taken}`);

const c = await crowd();
const budget = c.round <= 4 ? 2 : c.round <= 12 ? 3 : 4; // mirrors tokenBudget()
const okCrowd = c.maxTokens <= budget && c.maxTokens > 0 && c.foes > budget;
if (!okCrowd) failed++;
console.log(
  `[dodge] crowd round ${c.round}         ${okCrowd ? 'PASS' : 'FAIL'}  foes=${c.foes} ` +
    `max attackers=${c.maxTokens} (budget ${budget}) max winding up=${c.maxCasting}`,
);

await page.evaluate(() => window.__CC.resumeClock());
if (errors.length) console.log('[dodge] console errors:', errors.slice(0, 4));
console.log(failed === 0 ? '[dodge] enemy damage is avoidable' : `[dodge] ${failed} FAILED`);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
