// How much gold is on hand when the player reaches each shop?
//
// Written because a playtest reported that the first item shop after the
// starter boots never has enough money. It did: 458 gold on hand at the
// round-3 shop against a cheapest core item of 640, so the first shop a player
// ever reaches stocked only budget gear they had just bought a version of.
//
// The numbers come out identical on every run because enemy counts per round
// are fixed and this harness resolves each round by killing everything at
// once — so it measures the ECONOMY, not the variance a real fight adds. Treat
// it as a structural check, not a distribution.
//
//   node scripts/goldcheck.mjs
import pkg from 'playwright';

const { chromium } = pkg;
const RUNS = Number(process.argv.includes('--runs') ? process.argv[process.argv.indexOf('--runs') + 1] : 6);
const PORT = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '5173';

const browser = await chromium.launch({ headless: true });
const rows = [];
for (let r = 0; r < RUNS; r++) {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await page.goto(`http://localhost:${PORT}/index.html?renderer=canvas`);
  await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 30000 });
  await page.waitForTimeout(700);
  rows.push(
    await page.evaluate(async () => {
      const CC = window.__CC;
      CC.reset();
      CC.autopilot(true);
      const log = [];
      // Starter shop: buy the cheapest boots, which is what a player does.
      for (const id of ['it_windsohlen', 'it_kettenschuhe', 'it_panzerstiefel', 'it_sporensohlen']) {
        if (CC.run.gold >= 280 && CC.grantItem(id)) {
          CC.run.gold -= 280;
          break;
        }
      }
      for (let round = 1; round <= 6; round++) {
        CC.goto(round);
        await new Promise((res) => setTimeout(res, 60));
        const a = CC.arena();
        for (const u of a.units) if (u.team === 'enemy' && u.alive) a.dealDamage(a.player, u, 999999, 'ability');
        await new Promise((res) => setTimeout(res, 120));
        // Shops sit before odd rounds (PickScene: (round - 1) % 2 === 0).
        if (round > 1 && (round - 1) % 2 === 0) log.push({ shopBefore: round, gold: CC.run.gold });
      }
      return log;
    }),
  );
  await page.close();
}

for (const n of [3, 5]) {
  const v = rows.map((r) => (r.find((x) => x.shopBefore === n) || {}).gold).filter((x) => x != null).sort((a, b) => a - b);
  if (v.length) console.log(`[gold] shop before round ${n}: median ${v[Math.floor(v.length / 2)]} (min ${v[0]}, max ${v[v.length - 1]})`);
}
console.log('[gold] reference: budget items 280-350, core 640-780, luxury 1100');
await browser.close();
