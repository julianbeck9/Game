// Can a ranged champion actually fight at range, or is it a melee champion
// with worse stats?
//
// This exists because "alle Charaktere sind melee" was reported twice and both
// times I answered it by reading code instead of measuring. Reading code said
// four of the eight champions set `ranged: true` and spawn a projectile, so the
// complaint looked wrong. It was not wrong. Two separate things made every
// champion play as a melee champion:
//
//   1. championConfig.ts had no entry for any of the eight, so all of them
//      animated with the default melee lunge and a white slash arc.
//   2. The enemy Marksman's auto reached 520 while the longest-reaching
//      playable champion reached 490 — so to attack anything, an archer had to
//      first walk inside the enemy's range.
//
// Neither is visible in a kit file. Both are obvious in a measurement.
//
// The probe pins one enemy at just inside the champion's own reach and lets
// three seconds pass. A ranged champion must damage it and take nothing back.
// The melee champions are the CONTROL: they must fail that same test, because
// if everything "passes" the test is measuring nothing.
//
//   node scripts/rangecheck.mjs
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

const champs = await page.evaluate(() => window.__CC.champIds());
const results = [];

for (const id of champs) {
  const r = await page.evaluate(async (champId) => {
    const CC = window.__CC;
    CC.reset();
    CC.autopilot(false);
    CC.run.champion = champId;
    CC.forceMap('highland'); // pin scenery: a wall would block the shot
    CC.goto(1);              // round 1 is a single enemy — no bystander lands the hit
    await new Promise((res) => setTimeout(res, 900));
    const a = CC.arena();
    const p = a.player;
    p.hp = p.maxHP = 1e6;

    const reach = p.stats.get('attackRange');
    const es = a.units.filter((u) => u.team === 'enemy' && u.alive);
    if (!es.length) return { id: champId, skipped: 'no enemies' };

    const probe = es[0];
    es.slice(1).forEach((u, i) => { u.x = 60; u.y = 60 + i * 34; u.hp = 1e6; u.maxHP = 1e6; });

    // Every champion faces the SAME opponent: a pinned archer with 430 reach,
    // no melee swing and no abilities. Round 1 rolls a random archetype, so
    // without this the result depends on which enemy showed up. Abilities are
    // removed on purpose — they are telegraphed and dodgeable, so they are not
    // what "man bekommt immer Schaden" is about. Autos are: they are
    // undodgeable chip damage, and reach is the only defence against them.
    probe.cfg.melee = undefined;
    probe.cfg.abilities = [];
    probe.cfg.rangedAuto = { range: 430, dmg: 8, intervalMs: 900, projSpeed: 780 };
    probe.hp = probe.maxHP = 1e6;
    probe.x = p.x + (reach - 25);
    probe.y = p.y;
    // Pin it: the question under test is whose reach is longer, not who walks
    // faster. Without this the enemy simply closes the gap and every champion
    // "takes damage", which measures pathfinding, not range.
    probe.stats.set({ id: 'probe:pin', stat: 'moveSpeed', pct: -1, expiresAt: p.combat.now + 1e7 });

    const pBefore = p.hp;
    const eBefore = probe.hp;
    await new Promise((res) => setTimeout(res, 3000));

    return {
      id: champId,
      ranged: !!p.champ.ranged,
      reach: Math.round(reach),
      dealt: Math.round(eBefore - probe.hp),
      taken: Math.round(pBefore - p.hp),
    };
  }, id);
  results.push(r);
}

const PROBE_REACH = 430; // matches the archer the probe is dressed as, above

let failed = 0;
for (const r of results) {
  if (r.skipped) { console.log(`[range] ${r.id.padEnd(12)} SKIP  (${r.skipped})`); continue; }
  // Same instrument, opposite expectations — that is what makes it a control.
  // Ranged out-reaches the archer, so it must trade for free.
  // Melee cannot, so it MUST take damage; a melee champion that comes back
  // clean means the probe stopped shooting and the ranged PASS means nothing.
  const ok = r.ranged ? r.dealt > 0 && r.taken === 0 : r.dealt > 0 && r.taken > 0;
  if (!ok) failed++;
  console.log(
    `[range] ${r.id.padEnd(12)} ${ok ? 'PASS' : 'FAIL'}  ${(r.ranged ? 'ranged' : 'melee ')} ` +
      `reach=${String(r.reach).padStart(3)} dealt=${String(r.dealt).padStart(4)} taken=${r.taken}`,
  );
}

const rangedReaches = results.filter((r) => r.ranged).map((r) => r.reach);
if (rangedReaches.length) {
  const shortest = Math.min(...rangedReaches);
  const ok = shortest > PROBE_REACH;
  if (!ok) failed++;
  console.log(
    `[range] contract ${ok ? 'PASS' : 'FAIL'}  shortest ranged champion=${shortest} vs enemy auto=${PROBE_REACH}`,
  );
}

if (errors.length) console.log('[range] console errors:', errors.slice(0, 4));
console.log(failed === 0 ? '[range] ranged champions fight at range' : `[range] ${failed} FAILED`);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
