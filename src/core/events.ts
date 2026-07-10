import type { Unit } from '../entities/Unit';

export type AbilityId = 'Q' | 'E' | 'Dash';
export type DamageType = 'auto' | 'ability' | 'burn' | 'reflect' | 'other';

/**
 * Typed combat events. The combat core only EMITS these; augments only
 * SUBSCRIBE. Adding an augment must never require touching emit sites.
 */
export interface EventMap {
  roundStart: void;
  roundEnd: { win: boolean };
  autoHit: { target: Unit; dmg: number };
  abilityCast: { ability: AbilityId };
  abilityHit: { ability: AbilityId; target: Unit; dmg: number };
  dashStart: void;
  dashEnd: void;
  damageTaken: { source: Unit | null; dmg: number; melee: boolean };
  damageDealt: { target: Unit; dmg: number; type: DamageType };
  enemyDeath: { enemy: Unit };
  playerHpThreshold: { pct: number };
  /** Fires for ANY enemy death including minions — the on-kill economy. */
  killWindow: { victim: Unit };
}

type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => void;

export class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<never>>>();

  on<K extends keyof EventMap>(event: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<K>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
