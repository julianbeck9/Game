import Phaser from 'phaser';
import { Unit } from './Unit';
import { StatBlock, StatName } from '../core/stats';
import { Combat } from '../core/combat';
import { AbilityId } from '../core/events';
import { norm, len, Vec, pointInTerrain } from '../core/geometry';
import { COLORS, ABILITIES } from '../config';
import { run } from '../core/run';
import { crown } from '../core/draw';
import { ChampionDef } from '../champions/types';
import { championById } from '../champions/registry';

/** Stats every champion shares unless their sheet overrides them. */
const CHAMP_DEFAULTS: Partial<Record<StatName, number>> = {
  abilityPower: 0,
  armor: 0,
  magicResist: 0,
  critChance: 0,
  abilityHaste: 0,
  abilityDamage: 1.0,
  cooldown: 1.0,
  lifesteal: 0,
  projSpeed: 900,
};

export class Player extends Unit {
  readonly champ: ChampionDef;
  /** Last non-zero movement direction; used for facing (Q quick-cast, dash). */
  facing: Vec = { x: 1, y: 0 };
  /** Remaining Königsruf-empowered autos (König kit). */
  empoweredAutos = 0;
  dashing = false;
  /** Direction of the last Q cast (Echo re-fires along it). */
  lastQDir: Vec = { x: 1, y: 0 };
  /** Kit-local state for champion scripts (Yasuo Q stacks, Ashe focus timer…). */
  memory: Record<string, number> = {};

  private sprite: Phaser.GameObjects.Image;
  private nextAttackAt = 0;
  private readyAt: Record<AbilityId, number> = { Q: 0, E: 0, Dash: 0 };
  private lastCd: Record<AbilityId, number> = { Q: 1, E: 1, Dash: 1 };
  private dashDir: Vec = { x: 1, y: 0 };
  private dashUntil = 0;
  private dashChargesUsed = 0;
  /** Enemies already cut by the current Phasenschritt. */
  private dashSlashed = new Set<Unit>();
  private isMoving = false;

  constructor(
    scene: Phaser.Scene,
    readonly combat: Combat,
    x: number,
    y: number,
  ) {
    const champ = championById(run.champion);
    super(scene, x, y, 'player', new StatBlock({ ...CHAMP_DEFAULTS, ...champ.base }));
    this.champ = champ;
    this.sprite = scene.add.image(x, y, `champ:${champ.id}`).setDepth(11);
    // Passive setup (reset per combat — Player is recreated each round)
    this.champ.onCombatInit?.(this);
  }

  /** Passive reaction to taking damage (routed from the combat core). */
  onDamageTaken(dmg: number, source: Unit | null): void {
    this.champ.onDamageTaken?.(this, dmg, source);
  }

  get qRange(): number {
    return this.champ.qRange;
  }

  /** Planted feet (attacks flow while standing; some augments reward it too). */
  get isStationary(): boolean {
    return !this.isMoving && !this.dashing;
  }

  // ---- Movement ----

  /** moveVec: normalized-ish input vector (joystick or WASD), magnitude 0..1. */
  move(dt: number, moveVec: Vec): void {
    if (!this.alive) return;
    if (this.dashing) {
      const speed = ABILITIES.Dash.dist / ABILITIES.Dash.duration;
      // Dashes cross impassable terrain (water/lava)
      this.moveBy(this.dashDir.x * speed * dt, this.dashDir.y * speed * dt, true);
      this.phaseSlash();
      this.isMoving = true;
      return;
    }
    const mag = Math.min(1, len(moveVec.x, moveVec.y));
    this.isMoving = mag > 0.05;
    if (this.isMoving) {
      const n = norm(moveVec.x, moveVec.y);
      this.facing = n;
      const speed = this.stats.get('moveSpeed');
      this.moveBy(n.x * speed * mag * dt, n.y * speed * mag * dt);
    }
  }

  /**
   * If a dash ends inside water/lava, carry the champion the rest of the way
   * out along the dash direction so the dash "completes across" instead of
   * dumping them mid-pool and snapping them back.
   */
  private ejectFromTerrain(): void {
    if (!pointInTerrain(this.x, this.y, this.radius)) return;
    const d = this.dashDir;
    for (let i = 0; i < 40 && pointInTerrain(this.x, this.y, this.radius); i++) {
      const px = this.x;
      const py = this.y;
      this.moveBy(d.x * 12, d.y * 12, true); // keep crossing forward
      if (this.x === px && this.y === py) break; // blocked by a wall / field edge
    }
    if (pointInTerrain(this.x, this.y, this.radius)) this.moveBy(0, 0, false); // dead-ended: normal push-out
  }

  /** Phasenschritt cuts everything the champion phases through. */
  private phaseSlash(): void {
    const dmg = (8 + 0.5 * this.stats.get('damage')) * this.stats.get('abilityDamage');
    for (const u of [...this.combat.units]) {
      if (!u.alive || u.team !== 'enemy' || this.dashSlashed.has(u)) continue;
      if (len(u.x - this.x, u.y - this.y) <= u.radius + this.radius + 8) {
        this.dashSlashed.add(u);
        const dealt = this.combat.dealDamage(this, u, dmg, 'ability', 'physisch');
        this.combat.bus.emit('abilityHit', { ability: 'Dash', target: u, dmg: dealt });
      }
    }
  }

  // ---- Cooldowns (LoL-like: base × cooldown-mult × 100/(100+haste)) ----

  cooldownDuration(ability: AbilityId): number {
    const base = ability === 'Dash' ? ABILITIES.Dash.cd : this.champ.cds[ability];
    const flagMult =
      ability === 'Q' ? run.flags.qCdMult : ability === 'E' ? run.flags.eCdMult : run.flags.dashCdMult;
    // Yasuo-style Q: cooldown shrinks with attack speed, ignores haste
    if (ability === 'Q' && this.champ.qCdFromAS) {
      const ratio = this.stats.getBase('attackSpeed') / Math.max(0.1, this.stats.get('attackSpeed'));
      return base * flagMult * Math.max(0.05, this.stats.get('cooldown')) * Math.max(0.3, Math.min(1, ratio));
    }
    const haste = this.stats.get('abilityHaste');
    return base * flagMult * Math.max(0.05, this.stats.get('cooldown')) * (100 / (100 + haste));
  }

  get maxDashCharges(): number {
    return run.flags.dashCharges;
  }

  get dashChargesAvail(): number {
    return this.maxDashCharges - this.dashChargesUsed;
  }

  /** For UI: fraction of cooldown remaining, 0 = ready. */
  cooldownPct(ability: AbilityId): number {
    if (ability === 'Dash' && this.dashChargesUsed < this.maxDashCharges) return 0;
    const remaining = this.readyAt[ability] - this.combat.now;
    if (remaining <= 0) return 0;
    return Math.min(1, remaining / this.lastCd[ability]);
  }

  isReady(ability: AbilityId): boolean {
    if (!this.alive) return false;
    if (ability === 'Dash') return this.dashChargesUsed < this.maxDashCharges;
    return this.combat.now >= this.readyAt[ability];
  }

  /** Flat cooldown reduction on running cooldowns (Kühlung etc.). */
  reduceCooldowns(ms: number): void {
    for (const a of ['Q', 'E', 'Dash'] as AbilityId[]) {
      this.readyAt[a] = Math.max(this.combat.now, this.readyAt[a] - ms);
    }
  }

  resetCooldowns(): void {
    for (const a of ['Q', 'E', 'Dash'] as AbilityId[]) this.readyAt[a] = 0;
    this.dashChargesUsed = 0;
  }

  private startCooldown(ability: AbilityId): void {
    const cd = this.cooldownDuration(ability);
    this.lastCd[ability] = cd;
    this.readyAt[ability] = this.combat.now + cd;
  }

  // ---- Abilities (kit delegated to the champion script) ----

  /** Quick-cast (no dir) aims at the nearest enemy, not the walk direction. */
  castQ(dir?: Vec): boolean {
    if (!this.isReady('Q')) return false;
    let d: Vec;
    if (dir && len(dir.x, dir.y) > 0.01) {
      d = norm(dir.x, dir.y);
    } else {
      const target = this.combat.nearestEnemy(this, this.champ.qRange + 150);
      d = target ? norm(target.x - this.x, target.y - this.y) : this.facing;
    }
    this.lastQDir = { ...d };
    this.startCooldown('Q');
    this.combat.bus.emit('abilityCast', { ability: 'Q' });
    this.fireQ(d);
    return true;
  }

  /** Actual Q effect — separate so augments (Echo) can re-fire it. */
  fireQ(d: Vec, dmgScale = 1): void {
    this.champ.fireQ(this, d, dmgScale);
  }

  /** dir: optional aim (mouse on desktop); champions fall back to facing. */
  castE(dir?: Vec): boolean {
    if (!this.isReady('E')) return false;
    this.startCooldown('E');
    this.combat.bus.emit('abilityCast', { ability: 'E' });
    this.champ.castE(this, dir && len(dir.x, dir.y) > 0.01 ? norm(dir.x, dir.y) : undefined);
    return true;
  }

  /** Phasenschritt: short dash in current move direction (charge system). */
  dash(): boolean {
    if (!this.isReady('Dash') || this.dashing) return false;
    const wasIdle = this.dashChargesUsed === 0;
    this.dashChargesUsed++;
    if (wasIdle) this.startCooldown('Dash');
    this.dashing = true;
    this.dashDir = { ...this.facing };
    this.dashUntil = this.combat.now + ABILITIES.Dash.duration * 1000;
    this.dashSlashed.clear();
    this.combat.bus.emit('dashStart', undefined);
    return true;
  }

  // ---- Frame ----

  update(time: number, dt: number): void {
    if (!this.alive) return;
    this.stats.update(time);
    this.champ.passiveTick?.(this, dt);

    if (this.dashing && time >= this.dashUntil) {
      this.dashing = false;
      this.ejectFromTerrain();
      this.combat.bus.emit('dashEnd', undefined);
    }

    // Dash charge regeneration, one at a time
    if (this.dashChargesUsed > 0 && time >= this.readyAt.Dash) {
      this.dashChargesUsed--;
      if (this.dashChargesUsed > 0) this.startCooldown('Dash');
    }

    this.tryAutoAttack(time);
  }

  private tryAutoAttack(time: number): void {
    if (run.flags.noAutoAttacks) return; // Kronlos rule flag
    if (time < this.nextAttackAt) return;
    // Planted feet: champions only attack while standing still
    if (this.isMoving || this.dashing) return;
    const range = this.stats.get('attackRange');
    const target = this.combat.nearestEnemy(this, range);
    if (!target) return;

    const atkSpeed = Math.max(0.1, this.stats.get('attackSpeed'));
    this.nextAttackAt = time + 1000 / atkSpeed;
    this.facing = norm(target.x - this.x, target.y - this.y);

    let dmg = this.stats.get('damage');
    // Yasuo: crit chance counts double
    const crit = Math.random() < this.stats.get('critChance') * (this.champ.critMult ?? 1);
    if (crit) dmg *= 1.75;
    const empowered = this.empoweredAutos > 0;
    if (empowered) {
      this.empoweredAutos--;
      dmg *= 1 + ABILITIES.E.dmgBonus;
    }

    const onHit = (t: Unit) => {
      const dealt = this.combat.dealDamage(this, t, dmg, 'auto', 'physisch');
      if (empowered) this.heal(dealt * ABILITIES.E.healPct);
      this.combat.bus.emit('autoHit', { target: t, dmg: dealt });
      this.champ.onAutoHit?.(this, t);
    };

    if (this.champ.ranged) {
      this.combat.spawnProjectile({
        x: this.x,
        y: this.y,
        dirX: target.x - this.x,
        dirY: target.y - this.y,
        speed: this.stats.get('projSpeed'),
        radius: empowered || crit ? 11 : 8,
        color: empowered ? COLORS.buff : crit ? 0xffffff : COLORS.playerProj,
        team: 'player',
        homing: target,
        maxDist: range + 200,
        onHit,
      });
    } else {
      // Melee swing: instant, with a slash flash
      this.combat.flashLine(this.x, this.y, target.x, target.y, crit ? 0xffffff : COLORS.playerProj);
      onHit(target);
    }
  }

  // ---- Rendering (8-bit sprite + effect overlays) ----

  protected drawBody(g: Phaser.GameObjects.Graphics): void {
    // Drop shadow under the sprite (stays grounded while the sprite bobs — 3D feel)
    g.fillStyle(0x000000, 0.32);
    g.fillEllipse(this.x + 2, this.y + this.radius * 0.95, this.radius * 2.15, this.radius * 0.7);

    // Königsruf glow while empowered
    if (this.empoweredAutos > 0) {
      g.fillStyle(COLORS.buff, 0.16);
      g.fillCircle(this.x, this.y, this.radius + 14);
      g.lineStyle(3, COLORS.buff, 0.8);
      g.strokeCircle(this.x, this.y, this.radius + 10);
      g.fillStyle(COLORS.buff, 1);
      for (let i = 0; i < this.empoweredAutos; i++) {
        g.fillCircle(this.x - (this.empoweredAutos - 1) * 6 + i * 12, this.y - this.radius - 26, 4);
      }
    }

    // Crown marker above whoever you play — you are the would-be king
    crown(g, this.x, this.y - this.radius - 12, 18, COLORS.player, 0.9);

    // Walk bounce + sprite sync
    const bob = this.isMoving && !this.dashing ? Math.sin(this.combat.now / 105) * 2.2 : 0;
    this.sprite.setPosition(this.x, this.y - 4 - Math.abs(bob));
    this.sprite.setFlipX(this.facing.x < 0);
    this.sprite.setAlpha(this.dashing ? 0.6 : 1);
    this.sprite.setVisible(this.alive);
  }

  draw(): void {
    super.draw();
    if (!this.alive) this.sprite.setVisible(false);
  }

  protected drawHpBar(g: Phaser.GameObjects.Graphics): void {
    // Player HP bar sits below (crown + buff pips occupy the top)
    const w = this.radius * 2.4;
    const h = 7;
    const x = this.x - w / 2;
    const y = this.y + this.radius + 12;
    g.fillStyle(COLORS.hpBack, 0.9);
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(COLORS.hpGreen, 1);
    g.fillRect(x, y, w * Phaser.Math.Clamp(this.hpPct, 0, 1), h);
  }

  destroy(): void {
    this.sprite.destroy();
    super.destroy();
  }
}
