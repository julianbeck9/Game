import { AugmentCtx, AugmentDef } from './types';
import { run } from '../core/run';
import type { Combat } from '../core/combat';
import type { Player } from '../entities/Player';
import type { EventMap } from '../core/events';

/**
 * Bridges the run's owned augments into one combat scene:
 * applies stat mods through the pipeline, subscribes hooks to the event bus,
 * ticks dynamic augments. Rebuilt fresh every combat (subscriptions die with it).
 */
export class AugmentManager {
  readonly ctx: AugmentCtx;
  private unsubs: (() => void)[] = [];

  constructor(combat: Combat, player: Player) {
    this.ctx = {
      combat,
      player,
      run,
      power: (def: AugmentDef): number => {
        let p = 1;
        if (def.tier === 'silber' && run.flags.silverHalved) p *= 0.5;
        return p;
      },
      grantTemp: (def: AugmentDef) => this.activate(def),
    };
  }

  /** Call once after the combat scene has created the player. */
  init(): void {
    for (const def of run.augments) this.activate(def);
    // Items are augment-shaped: same stat pipeline, same hook bus
    for (const item of run.items) this.activate(item);
  }

  /** Activate one augment for this combat (also used for mid-fight temp grants — Narrenwürfel). */
  activate(def: AugmentDef): void {
    const power = this.ctx.power(def);
    if (def.statMods) {
      for (let i = 0; i < def.statMods.length; i++) {
        const m = def.statMods[i];
        this.ctx.player.stats.set({
          id: `aug:${def.id}:${i}`,
          stat: m.stat,
          flat: m.flat !== undefined ? m.flat * power : undefined,
          pct: m.pct !== undefined ? m.pct * power : undefined,
        });
      }
    }
    if (def.hooks) {
      for (const key of Object.keys(def.hooks) as (keyof EventMap)[]) {
        this.subscribe(key, def.hooks);
      }
    }
    def.onCombatInit?.(this.ctx);
  }

  private subscribe<K extends keyof EventMap>(key: K, hooks: NonNullable<AugmentDef['hooks']>): void {
    const handler = hooks[key];
    if (!handler) return;
    this.unsubs.push(this.ctx.combat.bus.on(key, (payload) => handler(payload, this.ctx)));
  }

  /** Remove a temp-granted augment's stat mods (hooks die with the fight anyway). */
  deactivateStatMods(def: AugmentDef): void {
    this.ctx.player.stats.removeByPrefix(`aug:${def.id}:`);
  }

  update(dt: number): void {
    for (const def of run.augments) def.onUpdate?.(dt, this.ctx);
    for (const item of run.items) item.onUpdate?.(dt, this.ctx);
  }

  destroy(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }
}
