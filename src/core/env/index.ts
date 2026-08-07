import type Phaser from 'phaser';
import type { MapDef } from '../maps';
import { activePaint } from '../maps';
import type { Unit } from '../../entities/Unit';
import { analyse } from './grid';
import { bakeGround } from './ground';
import { bakeFrame } from './frame';
import { Ambient } from './ambient';
import { GroundFx } from './groundFx';

/**
 * The arena's environment layer: everything between the painted backdrop and
 * the fight.
 *
 * Owns four things and nothing else —
 *   1. a baked pass that draws the map's real collision (chasm rims, wall
 *      shadows, shorelines) so solid ground is visible instead of learned by
 *      bumping into it,
 *   2. region weather in front of and behind the action,
 *   3. a vignette that makes the crop read as an arena boundary,
 *   4. ground that reacts to feet, dashes and water.
 *
 * Depth budget, chosen to stay strictly out of gameplay's way:
 *   0    painted map art          (ArenaScene)
 *   0.6  baked collision pass     <- here
 *   0.8  reactive ground FX       <- here
 *   2    ambient weather, behind  <- here
 *   2.5  vignette + frame         <- here
 *   3    hazards                  (ArenaScene)
 *   5    enemy telegraphs         (Enemy)
 *   10   unit gfx / 11 sprites    (Unit / Player / Enemy)
 *   12   ambient weather, in front<- here (fades out near the player)
 *
 * Nothing in this layer reads or writes gameplay state. It is given the unit
 * list once a frame so the floor can react to it, and that is the entire
 * contract.
 */
export class EnvLayer {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private bgGfx: Phaser.GameObjects.Graphics;
  private fgGfx: Phaser.GameObjects.Graphics;
  private fxGfx: Phaser.GameObjects.Graphics;
  private ambient: Ambient;
  private groundFx: GroundFx;

  constructor(scene: Phaser.Scene, map: MapDef) {
    // The collision the player actually fights against — never a second copy.
    const fields = analyse(activePaint());

    const ground = bakeGround(scene, map, fields);
    if (ground) this.objects.push(ground);

    this.fxGfx = scene.add.graphics().setDepth(0.8);
    this.bgGfx = scene.add.graphics().setDepth(2);
    this.objects.push(this.fxGfx, this.bgGfx);

    const frame = bakeFrame(scene, map);
    if (frame) this.objects.push(frame);

    this.fgGfx = scene.add.graphics().setDepth(12);
    this.objects.push(this.fgGfx);

    this.ambient = new Ambient(map.ambient, this.bgGfx, this.fgGfx);
    this.groundFx = new GroundFx(this.fxGfx, fields, map);
  }

  update(dt: number, now: number, units: Unit[], px: number, py: number): void {
    this.bgGfx.clear();
    this.fgGfx.clear();
    this.ambient.update(dt, now, px, py);
    this.groundFx.update(dt, now, units);
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }
}
