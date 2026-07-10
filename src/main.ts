import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from './config';
import { ArenaScene } from './scenes/ArenaScene';

new Phaser.Game({
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
  scene: [ArenaScene],
});
