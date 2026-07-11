import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from './config';
import { ArenaScene } from './scenes/ArenaScene';
import { PickScene } from './scenes/PickScene';
import { MenuScene } from './scenes/MenuScene';
import { EndScene } from './scenes/EndScene';
import { ShopScene } from './scenes/ShopScene';
import { run, addAugment } from './core/run';
import { augmentById } from './augments/registry';

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
  scene: [MenuScene, ArenaScene, PickScene, ShopScene, EndScene],
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
      arena: () => unknown;
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
  // Test helper: grant an augment by id (takes effect on next goto/round)
  grant: (id: string) => {
    const def = augmentById(id);
    if (!def) return false;
    addAugment(def);
    return true;
  },
};

