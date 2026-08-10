// Does each ability HIT where its declared shape says it does?
//
// The kits carry an AbilitySpec — `{ kind: 'circle', radius, at: 'cursor' }`
// and so on — and the aim preview, the description and the VFX are all drawn
// from it. Nothing checked that the DAMAGE agreed. It did not: five champions
// declared `at: 'cursor'` while their code placed the blast at maximum range,
// so the game drew a reticle in one place and hit another. A playtester found
// that, twice, before any tooling did.
//
// This is that check. For every playable champion it parks two enemies — one
// inside the declared shape, one clearly outside — casts, and asserts that the
// inside one takes damage and the outside one does not. The shape is the
// contract; the animation is decoration laid on top of it.
//
//   node scripts/hitboxcheck.mjs
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
    // Pin the map: obstacles vary per roll and a wall between the probes would
    // block a projectile, making this check fail on scenery rather than code.
    CC.forceMap('highland');
    CC.goto(4);
    await new Promise((res) => setTimeout(res, 900));
    const a = CC.arena();
    a.player.hp = 9e9;
    const spec = CC.qSpec(champId);
    if (!spec) return { id: champId, skipped: 'no q spec' };
    // 'self' with no declared radius is a personal effect — Master Yi's Q is a
    // channelled heal that damages nothing. There is no hitbox to check.
    if (spec.kind === 'self' && spec.radius == null) return { id: champId, skipped: 'self, no zone' };
    // Silence auto-attacks: they land during the settle window and would be
    // read as ability damage. This is the difference between measuring the
    // ability and measuring whatever happened to be standing in melee range.
    CC.run.flags.noAutoAttacks = true;

    const es = a.units.filter((u) => u.team === 'enemy' && u.alive);
    if (es.length < 2) return { id: champId, skipped: 'needs 2 enemies' };
    // Park the rest far away so only the two probes can be in the shape.
    es.slice(2).forEach((u, i) => { u.x = 60; u.y = 60 + i * 30; });

    // Aim straight right. "Inside" sits at 60% of the declared reach, "outside"
    // well beyond it — both on the aim line, so only reach is under test.
    const reach = spec.range ?? spec.radius ?? 200;
    const inside = es[0];
    const outside = es[1];
    inside.x = a.player.x + reach * 0.6;
    inside.y = a.player.y;
    outside.x = a.player.x + reach * 2.2;
    outside.y = a.player.y;
    for (const u of [inside, outside]) { u.hp = u.maxHP = 1e6; }
    a.player.facing = { x: 1, y: 0 };

    const before = [inside.hp, outside.hp];
    a.player.castQ({ x: reach * 0.6, y: 0 });
    // Long enough for delayed blasts (Karthus 350ms) and travelling projectiles.
    await new Promise((res) => setTimeout(res, 1100));
    return {
      id: champId,
      kind: spec.kind,
      reach: Math.round(reach),
      insideHit: Math.round(before[0] - inside.hp),
      outsideHit: Math.round(before[1] - outside.hp),
    };
  }, id);
  results.push(r);
}

let failed = 0;
for (const r of results) {
  if (r.skipped) {
    console.log(`[hitbox] ${r.id.padEnd(12)} SKIP  (${r.skipped})`);
    continue;
  }
  // A "line" ability legitimately passes through and may hit both; only its
  // maximum reach is asserted. Placed shapes must not reach the far probe.
  const wantsOutsideMiss = r.kind !== 'line';
  const ok = r.insideHit > 0 && (!wantsOutsideMiss || r.outsideHit === 0);
  if (!ok) failed++;
  console.log(
    `[hitbox] ${r.id.padEnd(12)} ${ok ? 'PASS' : 'FAIL'}  kind=${r.kind} reach=${r.reach} ` +
      `inside=${r.insideHit} outside=${r.outsideHit}`,
  );
}
if (errors.length) console.log('[hitbox] console errors:', errors.slice(0, 4));
console.log(failed === 0 ? '[hitbox] all abilities hit their declared shape' : `[hitbox] ${failed} FAILED`);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
