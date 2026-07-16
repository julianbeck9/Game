/**
 * ChampionVfx — Referenz-VFX-Layer, getrieben von AnimatedChampion-Events.
 *
 * Selbstständig: nutzt nur Phaser-Shapes + Tweens, KEINE externen Assets, alle Effekte
 * räumen sich per onComplete selbst weg (kein GameObject-Leak). Falls du eine eigene
 * VFX-Pipeline hast: entweder diese Klasse ersetzen oder in den Event-Handlern deine
 * Emitter füttern — der Event-Vertrag (ChampEvents/ChampVfxEvent) bleibt gleich.
 *
 *   const vfx = new ChampionVfx(scene);   // einmal pro Gameplay-Scene
 *   vfx.bind(champion);                    // nach jedem new AnimatedChampion(...)
 */

import Phaser from 'phaser';
import { AnimatedChampion, ChampEvents, ChampVfxEvent } from './AnimatedChampion';
import { VfxSpec } from './championConfig';

const DEPTH = 1000;

export class ChampionVfx {
  constructor(private scene: Phaser.Scene) {}

  bind(champ: AnimatedChampion): void {
    champ.on(ChampEvents.AttackHit, (e: ChampVfxEvent) => this.play(e));
    champ.on(ChampEvents.CastRelease, (e: ChampVfxEvent) => this.play(e));
    champ.on(ChampEvents.Hurt, (e: ChampVfxEvent) => this.hurt(e));
  }

  private shake(intensity?: number): void {
    if (intensity) this.scene.cameras.main.shake(120, intensity * 0.001);
  }

  private play(e: ChampVfxEvent): void {
    const s = e.spec;
    if (!s) return;
    this.shake(s.shake);
    switch (s.kind) {
      case 'meleeArc':   return this.meleeArc(e, s);
      case 'projectile': return this.projectile(e, s);
      case 'lob':        return this.lob(e, s);
      case 'puff':       return this.puff(e, s);
      case 'beam':       return this.beam(e, s);
      case 'grab':       return this.grab(e, s);
      case 'aoe':        return this.aoe(e, s);
      case 'flash':      return this.flash(e, s);
      default:           return this.puff(e, s);
    }
  }

  private hurt(e: ChampVfxEvent): void {
    this.shake(2);
    const spark = this.scene.add.circle(e.x, e.y, 6, 0xff5555, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH);
    this.scene.tweens.add({ targets: spark, scale: 2.2, alpha: 0, duration: 180, onComplete: () => spark.destroy() });
  }

  // --- Effekte ---
  private meleeArc(e: ChampVfxEvent, s: VfxSpec): void {
    const [a0, a1] = e.dir > 0 ? [-55, 55] : [125, 235];
    const slash = this.scene.add.arc(e.x, e.y, s.size ?? 16, a0, a1, false, s.color, 0.85)
      .setDepth(DEPTH).setScale(0.6);
    this.scene.tweens.add({ targets: slash, scale: 1.3, alpha: 0, duration: 140, ease: 'Quad.out', onComplete: () => slash.destroy() });
  }

  private projectile(e: ChampVfxEvent, s: VfxSpec): void {
    const dist = s.dist ?? 260, speed = s.speed ?? 520;
    const p = this.scene.add.circle(e.x, e.y, s.size ?? 4, s.color)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH);
    this.scene.tweens.add({
      targets: p, x: e.x + e.dir * dist, duration: (dist / speed) * 1000, ease: 'Linear',
      onComplete: () => { this.hitPuff(p.x, p.y, s.color); p.destroy(); },
    });
  }

  private lob(e: ChampVfxEvent, s: VfxSpec): void {
    const dist = s.dist ?? 140, speed = s.speed ?? 320, arcH = 60;
    const startX = e.x, startY = e.y;
    const b = this.scene.add.circle(startX, startY, s.size ?? 5, s.color).setDepth(DEPTH);
    const ref = { t: 0 };
    this.scene.tweens.add({
      targets: ref, t: 1, duration: (dist / speed) * 1000, ease: 'Linear',
      onUpdate: () => { b.x = startX + e.dir * dist * ref.t; b.y = startY - arcH * Math.sin(Math.PI * ref.t); },
      onComplete: () => { this.aoeAt(b.x, startY, s.color, 30); b.destroy(); },
    });
  }

  private puff(e: ChampVfxEvent, s: VfxSpec): void {
    const dist = s.dist ?? 100;
    const c = this.scene.add.circle(e.x + e.dir * dist * 0.4, e.y, s.size ?? 6, s.color, 0.7)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH);
    this.scene.tweens.add({ targets: c, x: e.x + e.dir * dist, scale: 2.4, alpha: 0, duration: 260, onComplete: () => c.destroy() });
  }

  private beam(e: ChampVfxEvent, s: VfxSpec): void {
    const len = s.dist ?? 200, h = s.size ?? 10;
    const beam = this.scene.add.rectangle(e.x, e.y, len, h, s.color, 0.85)
      .setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH);
    if (e.dir < 0) beam.setScale(-1, 1);
    this.scene.tweens.add({ targets: beam, alpha: 0, scaleY: 0.2, duration: 220, onComplete: () => beam.destroy() });
  }

  private grab(e: ChampVfxEvent, s: VfxSpec): void {
    const len = s.dist ?? 200, w = s.size ?? 6;
    const arm = this.scene.add.rectangle(e.x, e.y, len, w, s.color, 0.9).setOrigin(0, 0.5).setDepth(DEPTH);
    arm.setScale(0, 1); // aus der Mündung ausfahren; Vorzeichen = Blickrichtung
    this.scene.tweens.add({ targets: arm, scaleX: e.dir, duration: 120, yoyo: true, hold: 40, ease: 'Quad.out', onComplete: () => arm.destroy() });
  }

  private aoe(e: ChampVfxEvent, s: VfxSpec): void {
    this.aoeAt(e.champ.x, e.champ.y, s.color, s.dist ?? 46);
  }

  private aoeAt(x: number, y: number, color: number, radius: number): void {
    const ring = this.scene.add.circle(x, y, radius, color, 0).setStrokeStyle(4, color, 0.9).setDepth(DEPTH).setScale(0.3);
    this.scene.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 300, ease: 'Quad.out', onComplete: () => ring.destroy() });
  }

  private flash(e: ChampVfxEvent, s: VfxSpec): void {
    const fl = this.scene.add.circle(e.champ.x, e.champ.y - e.champ.displayHeight * 0.5, 20, s.color, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH);
    this.scene.tweens.add({ targets: fl, scale: 2, alpha: 0, duration: 240, onComplete: () => fl.destroy() });
  }

  private hitPuff(x: number, y: number, color: number): void {
    const c = this.scene.add.circle(x, y, 4, color, 0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH);
    this.scene.tweens.add({ targets: c, scale: 2, alpha: 0, duration: 160, onComplete: () => c.destroy() });
  }
}
