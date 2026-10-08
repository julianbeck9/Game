import type { Tag } from '../augments/types';
import { run } from '../core/run';

/**
 * Evolutions (SCHLACHTPLAN 3.3): an ability turns into something else once
 * its recipe is met — the Vampire Survivors moment, the build "clicking".
 *
 * A recipe is the champion's own ability plus one path at step 4. Each
 * champion has two, on two different paths, so which one a run reaches is
 * decided by what it bought and picked — and the recipes are printed on the
 * champion screen and in the shop, so it is a goal, not a surprise.
 *
 * The kits read `evolved(id)` (champions/newKits.ts); this file is only the
 * recipe book. Keep the descriptions in step with that code.
 */

export interface Evolution {
  id: string;
  champion: string;
  tag: Tag;
  ability: 'Q' | 'E' | 'Dash';
  name: string;
  description: string;
}

/** Path step a recipe needs. */
export const EVOLVE_AT = 4;

export const EVOLUTIONS: Evolution[] = [
  { id: 'evo_meltdown', champion: 'brannoc', tag: 'Bruch', ability: 'Q', name: 'Meltdown',
    description: 'Melt Arc leaves a 220-wide molten pool for 6s that sets an ember on everything inside every half second.' },
  { id: 'evo_hearth', champion: 'brannoc', tag: 'Ward', ability: 'E', name: 'Hearth Guard',
    description: 'Stoke no longer costs health — it grants 30 ward (up to 60) instead.' },

  { id: 'evo_fortress', champion: 'skorrvald', tag: 'Ward', ability: 'Q', name: 'Glacier Fortress',
    description: 'Rime Wall blocks from every side, not only the front.' },
  { id: 'evo_landslide', champion: 'skorrvald', tag: 'Bruch', ability: 'E', name: 'Landslide',
    description: 'Avalanche reaches 320 and drags every chilled enemy to you before it shatters them.' },

  { id: 'evo_riftlash', champion: 'nyth', tag: 'Sturm', ability: 'Q', name: 'Rift Lash',
    description: 'Umbra Lash tears a 450 line that does not come back — it passes through and marks everything on it.' },
  { id: 'evo_veilnova', champion: 'nyth', tag: 'Arkan', ability: 'E', name: 'Veil Nova',
    description: 'Veilbreak also detonates: 60 (+100% AD) to everything within 220.' },

  { id: 'evo_twinsuns', champion: 'sunna', tag: 'Arkan', ability: 'Q', name: 'Twin Suns',
    description: 'Sunnail throws two glaives in a V. Both pin and burn; the second is the one you recall.' },
  { id: 'evo_solarshell', champion: 'sunna', tag: 'Ward', ability: 'E', name: 'Solar Shell',
    description: 'Every Zenith strike that lands grants 4 ward (up to 50).' },

  { id: 'evo_sunken', champion: 'mirelle', tag: 'Ward', ability: 'Q', name: 'Sunken Garden',
    description: 'A bog roots everything it lands on for 0.8s.' },
  { id: 'evo_undertow', champion: 'mirelle', tag: 'Sturm', ability: 'E', name: 'Undertow',
    description: 'Drowned Tether drags its target 30 toward you with every tick.' },

  { id: 'evo_slug', champion: 'kip', tag: 'Bruch', ability: 'Q', name: 'Slug Round',
    description: 'Scattershot fires one heavy slug instead: 380 in a line, through everything, 130 (+160% AD) each.' },
  { id: 'evo_bunker', champion: 'kip', tag: 'Ward', ability: 'E', name: 'Bunker Turret',
    description: 'Every turret shot that lands grants you 4 ward (up to 40).' },

  { id: 'evo_crimson', champion: 'tessaly', tag: 'Arkan', ability: 'Q', name: 'Crimson Harpoon',
    description: 'The harpoon bursts the bleed it finds: 14 per stack to the target and everything within 120.' },
  { id: 'evo_grapple', champion: 'tessaly', tag: 'Sturm', ability: 'Dash', name: 'Grapple',
    description: 'Chainpull with nothing ahead yanks the nearest enemy within 300 to you instead.' },

  { id: 'evo_stormwall', champion: 'aeren', tag: 'Arkan', ability: 'E', name: 'Storm Front',
    description: 'Stormline is 600 long and stands for 6s.' },
  { id: 'evo_windshield', champion: 'aeren', tag: 'Ward', ability: 'Dash', name: 'Wind Shield',
    description: 'Every Gust Step grants 15 ward (up to 45).' },
];

export function evolutionsFor(champion: string): Evolution[] {
  return EVOLUTIONS.filter((e) => e.champion === champion);
}

/** True while this run's champion meets the recipe. */
export function evolved(id: string): boolean {
  const e = EVOLUTIONS.find((x) => x.id === id);
  return !!e && e.champion === run.champion && run.tagCounts[e.tag] >= EVOLVE_AT;
}
