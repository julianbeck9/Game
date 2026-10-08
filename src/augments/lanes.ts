import type { AugmentDef, Tag } from './types';

/**
 * Champion build lanes for the eight pack champions (SCHLACHTPLAN Phase 3).
 *
 * Why this exists: in July the build axis of the benchmark went from 24 to 54
 * on one thing alone — every champion had lanes of augments that changed what
 * its kit DOES and that disagreed with each other. The augment rebuild and the
 * roster swap switched that off and the new champions never got any, which is
 * the literal "es gibt keine Builds".
 *
 * Shape, per champion: two lanes that pull in opposite directions. Each lane
 * is two enablers and one capstone. The capstone `requires` both enablers, is
 * never offered before them, and is offered the moment they are owned (see
 * championOffer in offers.ts) — it is the "the build comes online" moment,
 * the way an evolution is in Vampire Survivors.
 *
 * Behaviour lives in the kit (champions/newKits.ts, read through `has(id)`)
 * when it changes what an ability does, and in hooks here when it only reacts
 * to events. Descriptions are written against that code; keep them in step.
 */

type Spec = Omit<AugmentDef, 'tags' | 'champion' | 'lane'> & { tags?: Tag[] };

function laneOf(champion: string, lane: string, tags: Tag[], defs: Spec[]): AugmentDef[] {
  return defs.map((d) => ({ ...d, tags: d.tags ?? tags, champion, lane }));
}

const cap = (a: string, b: string) => ({ requires: [a, b] });

// ------------------------------------------------------------------ Brannoc
// Glutofen wants long fights and many stacks; Blutofen wants to be at low
// health. Both spend Stoke — they disagree about what it is for.
const BRANNOC = [
  ...laneOf('brannoc', 'Glutofen', ['Bruch'], [
    { id: 'bra_banked', name: 'Banked Coals', tier: 'gold',
      description: 'Ember stacks up to 8 instead of 5, and each stack lasts 5s instead of 3.' },
    { id: 'bra_flashpoint', name: 'Flashpoint', tier: 'gold',
      description: 'An enemy at full embers detonates: 30 (+60% AD) to everything within 110, and every enemy caught gains two embers — which can set off the next.' },
    { id: 'bra_furnace_heart', name: 'Furnace Heart', tier: 'prisma', ...cap('bra_banked', 'bra_flashpoint'),
      description: 'CAPSTONE. Furnace Run no longer spends embers — it DOUBLES them on everything it passes. Melt Arc detonates every ember within 300 of where you land: 12 per stack.' },
  ]),
  ...laneOf('brannoc', 'Blutofen', ['Blut'], [
    { id: 'bra_candle', name: 'Burn the Candle', tier: 'gold',
      description: 'Stoke costs 25 health, but lasts 9s, adds 25% move speed, and each hit applies three embers.' },
    { id: 'bra_pyre', name: 'Pyre Heart', tier: 'gold',
      description: 'Below half health you have 35% more attack damage.',
      onUpdate: (_dt, ctx) => {
        const p = ctx.player;
        if (p.hp > p.maxHP * 0.5) return;
        p.stats.set({ id: 'buff:pyre', stat: 'damage', pct: 0.35, expiresAt: ctx.combat.now + 120 });
      } },
    { id: 'bra_martyr', name: "Martyr's Forge", tier: 'prisma', ...cap('bra_candle', 'bra_pyre'),
      description: 'CAPSTONE. Every 10 health you lose — Stoke included — sets an ember on every enemy within 250. At 30% health or less your swings set the ground alight (40/s for 2s).' },
  ]),
];

// ---------------------------------------------------------------- Skorrvald
// Bollwerk is about the block; Permafrost is about the chill. One wants you to
// stand and face it, the other to keep swinging.
const SKORRVALD = [
  ...laneOf('skorrvald', 'Bollwerk', ['Ward'], [
    { id: 'sko_mirror', name: 'Mirror Ice', tier: 'gold',
      description: 'Every hit Rime Wall blocks sends 60% of it back to the attacker.' },
    { id: 'sko_glacial', name: 'Glacial Patience', tier: 'gold',
      description: 'Rime Wall stands for 3s, and the ward it banks caps at 80.' },
    { id: 'sko_bastion', name: 'Living Bastion', tier: 'prisma', ...cap('sko_mirror', 'sko_glacial'),
      description: 'CAPSTONE. Stand still for half a second and Rime Wall rises on its own, with no cooldown, for as long as you hold your ground.' },
  ]),
  ...laneOf('skorrvald', 'Permafrost', ['Arkan'], [
    { id: 'sko_blackice', name: 'Black Ice', tier: 'gold',
      description: 'Every swing chills, not every third.' },
    { id: 'sko_shatter', name: 'Shatterpoint', tier: 'gold',
      description: 'Each enemy Avalanche shatters chills everything within 120 of it — ready for the next Avalanche.' },
    { id: 'sko_deepfreeze', name: 'Deep Freeze', tier: 'prisma', ...cap('sko_blackice', 'sko_shatter'),
      description: 'CAPSTONE. An enemy chilled three times within 6s freezes solid for 1.2s. Avalanche deals 50% more to frozen enemies.' },
  ]),
];

// --------------------------------------------------------------------- Nyth
// Reaper lives on marked kills; Phantom lives on the dash and its crit.
const NYTH = [
  ...laneOf('nyth', 'Reaper', ['Blut'], [
    { id: 'nyt_harvest', name: 'Harvest', tier: 'gold',
      description: 'Killing a marked enemy also resets Umbra Lash.' },
    { id: 'nyt_longshadow', name: 'Long Shadow', tier: 'gold',
      description: 'Marks last 8s, and a marked enemy has 30 less armor and magic resist.' },
    { id: 'nyt_ledger', name: "Death's Ledger", tier: 'prisma', ...cap('nyt_harvest', 'nyt_longshadow'),
      description: 'CAPSTONE. Umbra Lash cracks twice. Each marked kill this round adds 10% damage (up to ten times).' },
  ]),
  ...laneOf('nyth', 'Phantom', ['Sturm'], [
    { id: 'nyt_threesteps', name: 'Three Steps', tier: 'gold',
      description: 'A third dash charge.', ruleFlags: { dashCharges: 2 } },
    { id: 'nyt_ambush', name: 'Ambush', tier: 'gold',
      description: 'The +150% strike after Phase Tear hits every enemy within 160, not only your target.' },
    { id: 'nyt_veilwalk', name: 'Veilwalker', tier: 'prisma', ...cap('nyt_threesteps', 'nyt_ambush'),
      description: 'CAPSTONE. Phase Tear marks everything it passes through, and the strike after it hands the charge straight back.' },
  ]),
];

// -------------------------------------------------------------------- Sunna
// Anchor fights around the pinned glaive; Dancer keeps it orbiting her.
const SUNNA = [
  ...laneOf('sunna', 'Anchor', ['Bruch'], [
    { id: 'sun_sunwell', name: 'Sunwell', tier: 'gold',
      description: 'The pinned glaive burns everything within 130 instead of 70, for 18 per second.' },
    { id: 'sun_tether', name: 'Solar Tether', tier: 'gold',
      description: 'While the glaive is pinned, every swing also strikes everything within 90 of it for half damage.' },
    { id: 'sun_return', name: 'Return Arc', tier: 'prisma', ...cap('sun_sunwell', 'sun_tether'),
      description: 'CAPSTONE. Recalling the glaive hurls it straight back out along your leap: 60 (+120% AD) to everything on the line, and it pins again where it stops.' },
  ]),
  ...laneOf('sunna', 'Dancer', ['Sturm'], [
    { id: 'sun_noon', name: 'Endless Noon', tier: 'gold',
      description: 'Zenith lasts 6s, and you can attack while the glaive orbits.' },
    { id: 'sun_corona', name: 'Corona', tier: 'gold',
      description: 'Zenith strikes everything within 120 instead of 70.' },
    { id: 'sun_dawnstep', name: 'Dawnstep', tier: 'prisma', ...cap('sun_noon', 'sun_corona'),
      description: 'CAPSTONE. During Zenith, Sunleap has no cooldown and each leap extends Zenith by 1s, up to 10s in all.' },
  ]),
];

// ------------------------------------------------------------------ Mirelle
// Moor spreads the bog; Tether commits to one long beam.
const MIRELLE = [
  ...laneOf('mirelle', 'Moor', ['Arkan'], [
    { id: 'mir_rising', name: 'Rising Water', tier: 'gold',
      description: 'Bogs are 160 wide and last 9s.' },
    { id: 'mir_swarm', name: "Will-o'-Swarm", tier: 'gold',
      description: 'Wisps released by bog deaths jump on to two more enemies.' },
    { id: 'mir_spread', name: 'The Moor Remembers', tier: 'prisma', ...cap('mir_rising', 'mir_swarm'),
      description: 'CAPSTONE. Your bolts landing on an enemy standing in a bog start a new small bog under it (60 wide, 3s).' },
  ]),
  ...laneOf('mirelle', 'Tether', ['Blut'], [
    { id: 'mir_unbroken', name: 'Unbroken', tier: 'gold',
      description: 'Drowned Tether reaches 420 and lasts 4.5s.' },
    { id: 'mir_siphon', name: 'Siphon', tier: 'gold',
      description: 'Each tick of Drowned Tether hits 20% harder than the last.' },
    { id: 'mir_twin', name: 'Twin Chains', tier: 'prisma', ...cap('mir_unbroken', 'mir_siphon'),
      description: 'CAPSTONE. Drowned Tether forks to a second enemy, and holding it pays ward for both (up to 60).' },
  ]),
];

// ---------------------------------------------------------------------- Kip
// Gunslinger lives in the magazine; Engineer lets the turret do the work.
const KIP = [
  ...laneOf('kip', 'Gunslinger', ['Sturm'], [
    { id: 'kip_extmag', name: 'Extended Mag', tier: 'gold',
      description: 'Ten rounds in the magazine instead of six.', ruleFlags: { magazineBonus: 4 } },
    { id: 'kip_lastround', name: 'Last Round', tier: 'gold',
      description: 'The final round of each magazine deals triple damage and punches through three enemies.' },
    { id: 'kip_speedloader', name: 'Speed Loader', tier: 'prisma', ...cap('kip_extmag', 'kip_lastround'),
      description: 'CAPSTONE. Reloading takes 0.5s, and every time the magazine runs dry a ring of eight pellets bursts out around you: 20 (+30% AD) each.',
      ruleFlags: { reloadMs: 500 } },
  ]),
  ...laneOf('kip', 'Engineer', ['Arkan'], [
    { id: 'kip_twin', name: 'Twin Turrets', tier: 'gold',
      description: 'Clockwork Turret recharges twice as fast — two can stand at once.', ruleFlags: { eCdMult: 0.5 } },
    { id: 'kip_overclock', name: 'Overclock', tier: 'gold',
      description: 'Turrets fire every 0.3s.' },
    { id: 'kip_scrap', name: 'Scrap Shot', tier: 'prisma', ...cap('kip_twin', 'kip_overclock'),
      description: 'CAPSTONE. A turret explodes when it runs out: 80 (+120% AD) within 160. Your shots at enemies near a turret ricochet to a second enemy.' },
  ]),
];

// ------------------------------------------------------------------ Tessaly
// Hemorrhage stacks the bleed; Whaler is all about the harpoon.
const TESSALY = [
  ...laneOf('tessaly', 'Hemorrhage', ['Blut'], [
    { id: 'tes_wound', name: 'Open Wound', tier: 'gold',
      description: 'Bleed stacks up to six, and each stack lasts 5s.' },
    { id: 'tes_letting', name: 'Bloodletting', tier: 'gold',
      description: 'A bleeding enemy has 25 less armor.' },
    { id: 'tes_redtide', name: 'Red Tide', tier: 'prisma', ...cap('tes_wound', 'tes_letting'),
      description: 'CAPSTONE. A bleeding enemy that dies bursts, passing all its bleed stacks to everything within 160.' },
  ]),
  ...laneOf('tessaly', 'Whaler', ['Bruch'], [
    { id: 'tes_barbed', name: 'Barbed Line', tier: 'gold',
      description: 'The harpoon passes through, hooking and reeling in every enemy on its line.' },
    { id: 'tes_keelhaul', name: 'Keelhaul', tier: 'gold',
      description: 'An enemy reeled into another enemy stuns both for 1s and deals 40 (+60% AD) to each.' },
    { id: 'tes_reel', name: 'Reel and Strike', tier: 'prisma', ...cap('tes_barbed', 'tes_keelhaul'),
      description: 'CAPSTONE. A harpoon hit resets Chainpull, and Chainpull onto a rooted enemy strikes for triple.' },
  ]),
];

// -------------------------------------------------------------------- Aeren
// Marksman is rewarded for standing still; Skirmisher for never stopping.
// The two cannot be played at once — that is the point of them.
const AEREN = [
  ...laneOf('aeren', 'Marksman', ['Bruch'], [
    { id: 'aer_steady', name: 'Steady Aim', tier: 'gold',
      description: 'After standing still for 0.8s you have 40% more attack damage.',
      onUpdate: (_dt, ctx) => {
        const p = ctx.player;
        const now = ctx.combat.now;
        // Reset on every moving frame (and the first one) — the timer runs from there
        if (!p.isStationary || p.memory.steadySince === undefined) p.memory.steadySince = now;
        else if (now - p.memory.steadySince >= 800) {
          p.stats.set({ id: 'buff:steady', stat: 'damage', pct: 0.4, expiresAt: now + 120 });
        }
      } },
    { id: 'aer_volley', name: 'Gale Volley', tier: 'gold',
      description: 'The standing Splitshaft fires five arrows instead of three.' },
    { id: 'aer_eye', name: 'Eye of the Storm', tier: 'prisma', ...cap('aer_steady', 'aer_volley'),
      description: 'CAPSTONE. Standing still, every third attack also looses a full Splitshaft fan at your target, free.' },
  ]),
  ...laneOf('aeren', 'Skirmisher', ['Sturm'], [
    { id: 'aer_running', name: 'Running Shot', tier: 'gold',
      description: 'You can attack while moving.', ruleFlags: { attackWhileMoving: true } },
    { id: 'aer_tailwind', name: 'Tailwind', tier: 'gold',
      description: 'Every dash grants 35% attack speed for 3s.',
      hooks: {
        dashStart: (_e, ctx) => {
          ctx.player.stats.set({ id: 'buff:tailwind', stat: 'attackSpeed', pct: 0.35, expiresAt: ctx.combat.now + 3000 });
        },
      } },
    { id: 'aer_cyclone', name: 'Cyclone Step', tier: 'prisma', ...cap('aer_running', 'aer_tailwind'),
      description: 'CAPSTONE. Every Gust Step looses a full Splitshaft fan in the direction you dash.' },
  ]),
];

export const LANE_AUGMENTS: AugmentDef[] = [
  ...BRANNOC, ...SKORRVALD, ...NYTH, ...SUNNA, ...MIRELLE, ...KIP, ...TESSALY, ...AEREN,
];
