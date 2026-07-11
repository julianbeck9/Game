import Phaser from 'phaser';
import { Unit } from './Unit';
import { StatBlock } from '../core/stats';
import { Combat } from '../core/combat';
import { AbilityId } from '../core/events';
import { clampToArena, resolvePillars, norm, len, Vec } from '../core/geometry';
import { COLORS, PLAYER_BASE, ABILITIES } from '../config';
import { run } from '../core/run';
import { crown, shadedDisc } from '../core/draw';

export class Player extends Unit {
  /** Last non-zero movement direction; used for facing (Q quick-cast, dash). */
  facing: Vec = { x: 1, y: 0 };
  /** Remaining Königsruf-empowered autos. */
  empoweredAutos = 0;
  dashing = false;
  /** Direction of the last Q cast (Echo re-fires along it). */
  lastQDir: Vec = { x: 1, y: 0 };

  private nextAttackAt = 0;
  private readyAt: Record<AbilityId, number> = { Q: 0, E: 0, Dash: 0 };
  private lastCd: Record<AbilityId, number> = { Q: 1, E: 1, Dash: 1 };
  private dashDir: Vec = { x: 1, y: 0 };
  private dashUntil = 0;
  private dashChargesUsed = 0;

  constructor(
    scene: Phaser.Scene,
    protected combat: Combat,
    x: number,
    y: number,
  ) {
    super(scene, x, y, 'player', new StatBlock({ ...PLAYER_BASE }));
  }

  // ---- Movement ----

  /** moveVec: normalized-ish input vector (joystick or WASD), magnitude 0..1. */
  move(dt: number, moveVec: Vec): void {
    if (!this.alive) return;
    if (this.dashing) {
      const speed = ABILITIES.Dash.dist / ABILITIES.Dash.duration;
      this.applyMove(this.dashDir.x * speed * dt, this.dashDir.y * speed * dt);
      return;
    }
    const mag = Math.min(1, len(moveVec.x, moveVec.y));
    if (mag > 0.05) {
      const n = norm(moveVec.x, moveVec.y);
      this.facing = n;
      const speed = this.stats.get('moveSpeed');
      this.applyMove(n.x * speed * mag * dt, n.y * speed * mag * dt);
    }
  }

  private applyMove(dx: number, dy: number): void {
    const p1 = resolvePillars(this.x + dx, this.y + dy, this.radius);
    const p2 = clampToArena(p1.x, p1.y, this.radius);
    this.x = p2.x;
    this.y = p2.y;
  }

  // ---- Cooldowns ----

  /** Scaled cooldown duration for an ability, in ms. */
  cooldownDuration(ability: AbilityId): number {
    return ABILITIES[ability].cd * Math.max(0.05, this.stats.get('cooldown'));
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

  // ---- Abilities ----

  /** Klingenwurf: line skillshot, pierces the first target. */
  castQ(dir?: Vec): boolean {
    if (!this.isReady('Q')) return false;
    const d = dir && len(dir.x, dir.y) > 0.01 ? norm(dir.x, dir.y) : this.facing;
    this.lastQDir = { ...d };
    this.startCooldown('Q');
    this.combat.bus.emit('abilityCast', { ability: 'Q' });
    this.fireQ(d);
    return true;
  }

  /** Actual Q projectile spawn — separate so augments (Echo) can re-fire it. */
  fireQ(d: Vec, dmgScale = 1): void {
    const a = ABILITIES.Q;
    const dmg = a.dmg * this.stats.get('abilityDamage') * dmgScale;
    this.combat.spawnProjectile({
      x: this.x + d.x * (this.radius + 6),
      y: this.y + d.y * (this.radius + 6),
      dirX: d.x,
      dirY: d.y,
      speed: a.speed,
      radius: a.radius,
      color: COLORS.playerProj,
      team: 'player',
      maxHits: 2,
      maxDist: a.range,
      onHit: (t) => {
        const dealt = this.combat.dealDamage(this, t, dmg, 'ability');
        this.combat.bus.emit('abilityHit', { ability: 'Q', target: t, dmg: dealt });
      },
    });
  }

  /** Königsruf: next N autos hit harder and heal. */
  castE(): boolean {
    if (!this.isReady('E')) return false;
    this.startCooldown('E');
    this.empoweredAutos = ABILITIES.E.autos;
    this.combat.bus.emit('abilityCast', { ability: 'E' });
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
    this.combat.bus.emit('dashStart', undefined);
    return true;
  }

  // ---- Frame ----

  update(time: number, _dt: number): void {
    if (!this.alive) return;
    this.stats.update(time);

    if (this.dashing && time >= this.dashUntil) {
      this.dashing = false;
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
    const range = this.stats.get('attackRange');
    const target = this.combat.nearestEnemy(this, range);
    if (!target) return;

    const atkSpeed = Math.max(0.1, this.stats.get('attackSpeed'));
    this.nextAttackAt = time + 1000 / atkSpeed;

    let dmg = this.stats.get('damage');
    const empowered = this.empoweredAutos > 0;
    if (empowered) {
      this.empoweredAutos--;
      dmg *= 1 + ABILITIES.E.dmgBonus;
    }

    this.combat.spawnProjectile({
      x: this.x,
      y: this.y,
      dirX: target.x - this.x,
      dirY: target.y - this.y,
      speed: this.stats.get('projSpeed'),
      radius: empowered ? 11 : 8,
      color: empowered ? COLORS.buff : COLORS.playerProj,
      team: 'player',
      homing: target,
      maxDist: range + 200,
      onHit: (t) => {
        const dealt = this.combat.dealDamage(this, t, dmg, 'auto');
        if (empowered) this.heal(dealt * ABILITIES.E.healPct);
        this.combat.bus.emit('autoHit', { target: t, dmg: dealt });
      },
    });
  }

  // ---- Rendering ----

  protected drawBody(g: Phaser.GameObjects.Graphics): void {
    // Königsruf glow while empowered
    if (this.empoweredAutos > 0) {
      g.fillStyle(COLORS.buff, 0.16);
      g.fillCircle(this.x, this.y, this.radius + 14);
      g.lineStyle(3, COLORS.buff, 0.8);
      g.strokeCircle(this.x, this.y, this.radius + 10);
    }

    shadedDisc(g, this.x, this.y, this.radius, this.dashing ? 0xffe680 : COLORS.player);

    // Facing wedge: a small blade tip pointing where the king looks
    const f = this.facing;
    const tipX = this.x + f.x * (this.radius + 7);
    const tipY = this.y + f.y * (this.radius + 7);
    g.fillStyle(COLORS.playerDark, 1);
    g.fillTriangle(
      tipX, tipY,
      this.x + f.x * (this.radius - 6) - f.y * 8, this.y + f.y * (this.radius - 6) + f.x * 8,
      this.x + f.x * (this.radius - 6) + f.y * 8, this.y + f.y * (this.radius - 6) - f.x * 8,
    );

    crown(g, this.x, this.y - this.radius - 9, 26, COLORS.player);

    // Königsruf ammo pips: one dot per empowered auto still loaded
    if (this.empoweredAutos > 0) {
      g.fillStyle(COLORS.buff, 1);
      for (let i = 0; i < this.empoweredAutos; i++) {
        g.fillCircle(this.x - (this.empoweredAutos - 1) * 6 + i * 12, this.y - this.radius - 26, 4);
      }
    }
  }

  protected drawHpBar(g: Phaser.GameObjects.Graphics): void {
    // Player HP bar sits below (crown occupies the top)
    const w = this.radius * 2.4;
    const h = 7;
    const x = this.x - w / 2;
    const y = this.y + this.radius + 12;
    g.fillStyle(COLORS.hpBack, 0.9);
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(COLORS.hpGreen, 1);
    g.fillRect(x, y, w * Phaser.Math.Clamp(this.hpPct, 0, 1), h);
  }
}
