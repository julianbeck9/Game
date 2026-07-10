import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from './config';
import { ArenaScene } from './scenes/ArenaScene';
import { PickScene } from './scenes/PickScene';
import { MenuScene } from './scenes/MenuScene';
import { EndScene } from './scenes/EndScene';
import { run } from './core/run';

const game = new Phaser.Game({
  type: Phaser.AUTO,
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
  scene: [MenuScene, ArenaScene, PickScene, EndScene],
});

// Debug/testing handle (read-only introspection; not used by game code)
declare global {
  interface Window {
    __CC?: { run: unknown; scenes: () => string[]; goto: (round: number) => void };
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
};

