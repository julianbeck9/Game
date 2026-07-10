export type StatName =
  | 'maxHP'
  | 'moveSpeed'
  | 'damage' // auto-attack damage
  | 'attackSpeed'
  | 'attackRange'
  | 'abilityDamage' // % scaler for ability base damage (base 1.0)
  | 'cooldown' // % scaler for cooldowns (base 1.0, lower = faster)
  | 'lifesteal' // fraction of damage healed (base 0)
  | 'projSpeed';

export interface StatMod {
  id: string;
  stat: StatName;
  flat?: number;
  pct?: number; // +0.5 = +50%
  /** Absolute scene-time (ms) after which the mod is removed. */
  expiresAt?: number;
}

/**
 * Single stat pipeline: derived = (base + Σflat) * (1 + Σpct).
 * Nothing outside this class may mutate a derived stat.
 */
export class StatBlock {
  private mods: StatMod[] = [];

  constructor(private base: Partial<Record<StatName, number>>) {}

  get(stat: StatName): number {
    let flat = 0;
    let pct = 0;
    for (const m of this.mods) {
      if (m.stat !== stat) continue;
      flat += m.flat ?? 0;
      pct += m.pct ?? 0;
    }
    return ((this.base[stat] ?? 0) + flat) * (1 + pct);
  }

  getBase(stat: StatName): number {
    return this.base[stat] ?? 0;
  }

  add(mod: StatMod): void {
    this.mods.push(mod);
  }

  /** Replace any existing mod with the same id (for refreshing timed buffs / dynamic mods). */
  set(mod: StatMod): void {
    this.remove(mod.id);
    this.mods.push(mod);
  }

  remove(id: string): void {
    this.mods = this.mods.filter((m) => m.id !== id);
  }

  removeByPrefix(prefix: string): void {
    this.mods = this.mods.filter((m) => !m.id.startsWith(prefix));
  }

  has(id: string): boolean {
    return this.mods.some((m) => m.id === id);
  }

  /** Purge expired timed mods. Call once per frame with scene time. */
  update(now: number): void {
    this.mods = this.mods.filter((m) => m.expiresAt === undefined || m.expiresAt > now);
  }
}
