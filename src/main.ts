import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from './config';
import { ArenaScene } from './scenes/ArenaScene';
import { PickScene } from './scenes/PickScene';
import { MenuScene } from './scenes/MenuScene';
import { EndScene } from './scenes/EndScene';
import { ShopScene } from './scenes/ShopScene';
import { BuildScene } from './scenes/BuildScene';
import { EditorScene } from './scenes/EditorScene';
import { AdminScene } from './scenes/AdminScene';
import { applyBalance } from './core/balance';
import { setAutopilot } from './core/autopilot';

// Fold any admin balance overrides into the registries before the game starts.
applyBalance();
import { run, addAugment, newRun, upgradeItem } from './core/run';
import { augmentById, AUGMENTS } from './augments/registry';
import { championUsesAP } from './champions/registry';
import { itemById } from './items/registry';

const game = new Phaser.Game({
  // ?renderer=canvas — headless test environments render Canvas2D far faster
  // than software WebGL; real devices stay on AUTO (WebGL)
  type: location.search.includes('renderer=canvas') ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 4,
  },
  scene: [MenuScene, ArenaScene, PickScene, ShopScene, BuildScene, EditorScene, AdminScene, EndScene],
});

// iOS Safari leaves the canvas offset/mis-scaled after rotating the device:
// re-measure once the browser has settled, and pin the page back to the top.
const refreshScale = () => {
  window.scrollTo(0, 0);
  setTimeout(() => {
    window.scrollTo(0, 0);
    game.scale.refresh();
  }, 250);
  setTimeout(() => game.scale.refresh(), 600);
};
window.addEventListener('orientationchange', refreshScale);
window.addEventListener('resize', refreshScale);
window.visualViewport?.addEventListener('resize', refreshScale);

// Debug/testing handle (read-only introspection; not used by game code)
declare global {
  interface Window {
    __CC?: {
      run: unknown;
      scenes: () => string[];
      goto: (round: number) => void;
      grant: (id: string) => boolean;
      grantItem: (id: string) => boolean;
      forgeItem: (id: string) => boolean;
      arena: () => unknown;
      augIds: () => {
        id: string;
        tier: string;
        name: string;
        description: string;
        hooks: string[];
        onUpdate: boolean;
        onCombatInit: boolean;
        statMods: boolean;
        ruleFlags: boolean;
        champion: string | null;
        needs: string[];
        statModsList: { stat: string; flat?: number; pct?: number }[];
        ruleFlagsObj: Record<string, number | boolean>;
      }[];
      champUsesAP: (id: string) => boolean;
      /** Test helper: wipe the run back to its fresh starting state (S3-1 effect-matrix). */
      reset: () => void;
      /** Measurement: hand the controls to the scripted player (core/autopilot). */
      autopilot: (on: boolean) => void;
      /**
       * Measurement: advance the game by `ms` of game time as fast as the CPU
       * allows, instead of waiting for it in real time. Returns the game clock.
       */
      stepMs: (ms: number, dtMs?: number) => number;
      /** Measurement: hand the RAF-driven clock back after stepMs. */
      resumeClock: () => void;
    };
  }
}
window.__CC = {
  get run() {
    return run;
  },
  scenes: () => game.scene.getScenes(true).map((s) => s.scene.key),
  // Test helper: jump straight to a round
  goto: (round: number) => {
    run.round = round;
    for (const key of ['menu', 'pick', 'end', 'arena']) game.scene.stop(key);
    game.scene.start('arena');
  },
  arena: () => game.scene.getScene('arena'),
  // Test helper: enumerate the full augment pool with capability metadata
  augIds: () =>
    AUGMENTS.map((a) => ({
      id: a.id,
      tier: a.tier,
      name: a.name,
      description: a.description,
      hooks: a.hooks ? Object.keys(a.hooks) : [],
      onUpdate: !!a.onUpdate,
      onCombatInit: !!a.onCombatInit,
      statMods: !!a.statMods,
      ruleFlags: !!a.ruleFlags,
      champion: a.champion ?? null,
      needs: a.needs ?? [],
      statModsList: a.statMods ?? [],
      ruleFlagsObj: a.ruleFlags ?? {},
    })),
  // Test helper: does this champion's kit use AP? (augment gating input)
  champUsesAP: (id: string) => championUsesAP(id),
  // Test helper: wipe the run back to its fresh starting state (S3-1 effect-matrix)
  reset: () => { newRun(); },
  autopilot: (on: boolean) => setAutopilot(on),
  /**
   * Drive Phaser's own step function with a synthetic clock so a sim can play
   * hundreds of rounds without waiting for them. RAF is put to sleep first,
   * otherwise the browser keeps stepping the same game in parallel and every
   * measurement is taken from a world that advanced twice per frame.
   *
   * Not a substitute for real-time play when judging feel: this changes only
   * how fast the clock is turned, but a fixed dt is steadier than a real frame
   * budget, so numbers from here must be validated against a real-time run
   * before they are believed.
   */
  stepMs: (ms: number, dtMs = 1000 / 60) => {
    const loop = game.loop;
    loop.sleep();
    const steps = Math.max(1, Math.round(ms / dtMs));
    let t = loop.time;
    for (let i = 0; i < steps; i++) {
      t += dtMs;
      game.step(t, dtMs);
    }
    loop.time = t;
    return t;
  },
  resumeClock: () => { game.loop.wake(); },
  // Test helper: grant an augment by id (takes effect on next goto/round)
  grant: (id: string) => {
    const def = augmentById(id);
    if (!def) return false;
    return addAugment(def);
  },
  // Test helper: grant an item by id without paying (takes effect on next goto/round)
  grantItem: (id: string) => {
    const def = itemById(id);
    if (!def) return false;
    run.items.push(def);
    if (def.ruleFlags) Object.assign(run.flags, def.ruleFlags);
    return true;
  },
  // Test helper: forge an owned item one star up (charges gold, like the shop)
  forgeItem: (id: string) => upgradeItem(id),
};

