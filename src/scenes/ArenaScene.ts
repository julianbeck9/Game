import Phaser from 'phaser';
import { Combat, Hazard } from '../core/combat';
import { EventBus, DamageType, School } from '../core/events';
import { ensureChampionTextures } from '../champions/registry';
import { Unit } from '../entities/Unit';
import { Player } from '../entities/Player';
import { Clone } from '../entities/Clone';
import { Decoy } from '../entities/Decoy';
import { spawnEnemy } from '../entities/enemies';
import { ChampionVfx } from '../champions/ChampionVfx';
import { Projectile, ProjectileOpts } from '../entities/Projectile';
import { roundSpec, MAX_ROUND, ModifierId, MODIFIER_NAMES } from '../core/rounds';
import { Joystick } from '../ui/Joystick';
import { AbilityButton } from '../ui/AbilityButton';
import { AugmentManager } from '../augments/AugmentManager';
import { rollOffers } from '../augments/offers';
import { run, earnGold } from '../core/run';
import { dist, findOpenSpawn, pointInPillar, Vec } from '../core/geometry';
import { autopilotEnabled, autopilotIntent } from '../core/autopilot';
import { hitStopMs, numberSize, procLabel, severityOf, shakeFor } from '../core/impact';
import { Particles } from '../core/particles'; // [vfx-agent]
import { ARENA_X, ARENA_Y, COLORS, GAME_W, GAME_H, UNIT_RADIUS } from '../config';
import { MapDef, FIELD, setActiveMap, activeWalls, activeTerrain } from '../core/maps';
import { drawItemIcon } from '../items/icons';
import { STR } from '../core/strings';
import { initAudio, sfx } from '../core/sfx';
import { crown, shade } from '../core/draw';
import { EnvLayer } from '../core/env'; // [env-agent]
import { addFullscreenButton } from '../core/fullscreen';
import { CameraRig, hudTransform } from '../core/camera';

/** Feuerring geometry: the safe circle starts covering the whole screen. */
const FIRE_MAX_R = Math.hypot(GAME_W / 2, GAME_H / 2) + 40;

/**
 * Hits smaller than this are pooled into one periodic number instead of each
 * spawning their own. Roughly "a single tick of a damage-over-time aura".
 */
const TICK_NUMBER_THRESHOLD = 12;

export class ArenaScene extends Phaser.Scene implements Combat {
  readonly bus = new EventBus();
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  player!: Player;
  champVfx!: ChampionVfx;
  /** [vfx-agent] Pooled combat particles — see core/particles.ts. */
  particles!: Particles;

  private augments!: AugmentManager;
  private joystick!: Joystick;
  private buttons: AbilityButton[] = [];
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private projGfx!: Phaser.GameObjects.Graphics;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private hazardGfx!: Phaser.GameObjects.Graphics;
  private aimPreview: Vec | null = null;
  hazards: Hazard[] = [];
  private walls: { x1: number; y1: number; x2: number; y2: number; until: number }[] = [];
  private taunt: { unit: Unit; until: number } | null = null;
  private flashes: { x1: number; y1: number; x2: number; y2: number; color: number; until: number }[] = [];

  // Juice
  // [env-agent] replaces the old ambientGfx + motes pair: terrain rendering,
  // weather, vignette and reactive ground now live in core/env.
  private env: EnvLayer | null = null;
  private map!: MapDef;
  private slowmoUntil = 0;
  private dashTrail: { x: number; y: number; until: number }[] = [];
  private rings: { x: number; y: number; start: number; color: number; maxR: number }[] = [];
  private sparks: { x: number; y: number; start: number; color: number; a: number }[] = [];
  private burnNumAcc = new Map<Unit, { sum: number; showAt: number }>();

  // Arena modifier state (R5+)
  private modifier: ModifierId | null = null;
  private roundStartedAt = 0;
  private fireSafeR = FIRE_MAX_R;
  private flowers: { x: number; y: number }[] = [];
  private nextFlowerAt = 0;
  private bruchzone: { x: number; y: number; r: number } | null = null;
  private strikes: { x: number; y: number; at: number }[] = [];
  private nextStrikeAt = 0;

  constructor() {
    super('arena');
  }

  private fightState: 'fighting' | 'won' | 'lost' = 'fighting';

  /**
   * Everything pinned to the screen rather than to the world. The camera zooms
   * and follows now, so anything that must stay at its authored pixel goes in
   * here and the container carries the counter-transform (core/camera).
   * Floating damage numbers deliberately do NOT: they belong to a unit and
   * should ride the world.
   */
  private uiLayer!: Phaser.GameObjects.Container;
  /** Null until create() finishes; augments can deal damage before that. */
  private rig: CameraRig | null = null;
  /** Edge chevrons for enemies the zoom pushed out of view. */
  private offGfx: Phaser.GameObjects.Graphics | null = null;
  private goldHudText: Phaser.GameObjects.Text | null = null;
  private buildChips: Phaser.GameObjects.Container | null = null;
  private buildChipsTop = 250;

  /** Combat.now — scene clock in ms (Phaser's `time` is the clock plugin itself). */
  get now(): number {
    return this.time.now;
  }

  get playerUnit(): Unit {
    return this.player;
  }

  create(): void {
    // Scene restarts reuse the instance — reset state
    this.units = [];
    this.projectiles = [];
    this.buttons = [];
    this.hazards = [];
    this.walls = [];
    this.flashes = [];
    this.dashTrail = [];
    this.rings = [];
    this.sparks = [];
    this.burnNumAcc = new Map();
    this.slowmoUntil = 0;
    this.taunt = null;
    this.fightState = 'fighting';
    this.aimPreview = null;
    this.bus.clear();

    const spec = roundSpec(run.round);
    this.map = spec.map;
    setActiveMap(spec.map);
    this.drawMap(spec.map);
    // [env-agent] must come after setActiveMap — it reads the active paint grid.
    this.env?.destroy();
    this.env = new EnvLayer(this, spec.map);
    ensureChampionTextures(this);

    // Champion-sprite VFX layer — created before any Player/Enemy so their
    // constructors can bind their animated sprite to it.
    // [vfx-agent] Particle pool. Built before champVfx (which emits into it) and
    // before any unit, and it allocates its whole pool up front — so its display
    // objects are already counted when verify.mjs takes its baseline snapshot,
    // and the count never moves again.
    this.particles = new Particles(this);

    this.champVfx = new ChampionVfx(this, this.particles);

    this.player = new Player(this, this, ARENA_X, GAME_H - 220);
    this.units.push(this.player);

    // Enemies spread along the top of the field. The row is authored as fixed
    // coordinates but collision is painted per map, so each slot is nudged to
    // somewhere the enemy can actually walk out of — dropping one into a sealed
    // pocket used to hang the round forever (B9).
    const n = spec.enemies.length;
    spec.enemies.forEach((cfg, i) => {
      const x = ARENA_X + (i - (n - 1) / 2) * Math.min(340, (GAME_W - 400) / Math.max(1, n - 1) || 0);
      const at = findOpenSpawn(x, 210, UNIT_RADIUS, { x: this.player.x, y: this.player.y });
      this.units.push(spawnEnemy(this, this, at.x, at.y, cfg));
    });

    this.projGfx = this.add.graphics().setDepth(9);
    this.aimGfx = this.add.graphics().setDepth(8);
    this.hazardGfx = this.add.graphics().setDepth(3);
    this.input.addPointer(3);
    // Screen-locked layer, created before anything that belongs in it. Depth
    // sits above every world object; children keep their authored coordinates
    // and are depth-sorted once the HUD is fully built.
    this.uiLayer = this.add.container(0, 0).setDepth(2000).setScrollFactor(0);
    this.offGfx = this.add.graphics().setDepth(1003);
    this.uiLayer.add(this.offGfx);
    this.joystick = new Joystick(this, this.uiLayer);
    this.createButtons();
    this.setupKeyboard();

    // Augments plug in before the round starts so roundStart hooks fire
    this.augments = new AugmentManager(this, this.player);
    this.augments.init();
    this.events.once('shutdown', () => {
      this.augments.destroy();
      this.env?.destroy(); // [env-agent]
      this.env = null;
    });

    this.initModifier(spec.modifier ?? null);
    this.createHud(spec.boss, spec.title, spec.bossAugments);
    // Containers render children in list order, not by depth, and the HUD was
    // built after the ability buttons — so sort once, now that every child
    // exists, or the panels would paint over the buttons.
    this.uiLayer.sort('depth');
    this.rig = new CameraRig(this, this.player.x, this.player.y);

    // Presentation-layer event subscribers (SFX)
    this.input.on('pointerdown', initAudio);
    // WebAudio needs a user gesture, and a keyboard player can finish a whole
    // round without ever clicking — in which case the game was silent and the
    // sound design was moot.
    this.input.keyboard?.on('keydown', initAudio);
    // Severity is passed through so a scratch and a killing blow do not make
    // the same noise; it is the same number the hit-stop, kick and spray read.
    this.bus.on('autoHit', ({ target, dmg }) => sfx.hit(severityOf(dmg, target)));
    this.bus.on('abilityCast', () => sfx.cast());
    this.bus.on('dashStart', () => sfx.dash());
    this.bus.on('damageTaken', ({ dmg }) => sfx.hurt(severityOf(dmg, this.player)));
    this.bus.on('enemyDeath', () => sfx.kill());
    // Ability hits throw a bright spark burst so spells read clearly
    this.bus.on('abilityHit', ({ target, ability, dmg }) => {
      const col = ability === 'E' ? 0xffe680 : ability === 'Q' ? 0xffd24a : 0xa8d8ff;
      this.sparks.push({ x: target.x, y: target.y, start: this.now, color: col, a: Math.random() * Math.PI });
      sfx.abilityHit(severityOf(dmg, target));
    });

    this.bus.emit('roundStart', undefined);
  }

  // ---- Arena modifiers (R5+) ----

  private initModifier(mod: ModifierId | null): void {
    this.modifier = mod;
    this.roundStartedAt = this.now;
    this.fireSafeR = FIRE_MAX_R;
    this.flowers = [];
    this.nextFlowerAt = this.now + 6000;
    this.bruchzone = null;
    this.strikes = [];
    this.nextStrikeAt = this.now + 4500;
    if (mod === 'bruchzone') {
      const ang = Math.random() * Math.PI * 2;
      this.bruchzone = {
        x: ARENA_X + Math.cos(ang) * 220,
        y: ARENA_Y + Math.sin(ang) * 220,
        r: 150,
      };
    }
  }

  private updateModifier(dt: number): void {
    switch (this.modifier) {
      case 'feuerring': {
        // Fire creeps in from the screen edges over ~45s, forcing engagement
        const t = Math.min(1, (this.now - this.roundStartedAt) / 45000);
        this.fireSafeR = FIRE_MAX_R - (FIRE_MAX_R - 300) * t;
        for (const u of this.units) {
          if (!u.alive) continue;
          if (dist(u.x, u.y, ARENA_X, ARENA_Y) + u.radius * 0.5 > this.fireSafeR) {
            u.dotAcc += 12 * dt;
            if (u.dotAcc >= 1) {
              const amt = Math.floor(u.dotAcc);
              u.dotAcc -= amt;
              this.dealDamage(null, u, amt, 'burn');
            }
          }
        }
        break;
      }
      case 'heilblumen': {
        // Flowers spawn on a timer; first unit to touch one consumes it
        if (this.now >= this.nextFlowerAt && this.flowers.length < 2) {
          this.nextFlowerAt = this.now + 12000;
          for (let tries = 0; tries < 20; tries++) {
            const x = FIELD.x1 + 120 + Math.random() * (FIELD.x2 - FIELD.x1 - 240);
            const y = FIELD.y1 + 140 + Math.random() * (FIELD.y2 - FIELD.y1 - 280);
            if (!pointInPillar(x, y, 30)) {
              this.flowers.push({ x, y });
              break;
            }
          }
        }
        this.flowers = this.flowers.filter((f) => {
          for (const u of this.units) {
            if (!u.alive || u.radius < 16) continue; // Diener/decoys don't graze
            if (dist(u.x, u.y, f.x, f.y) <= u.radius + 24) {
              u.heal(u.maxHP * 0.2);
              this.announce(
                u === this.player ? 'Heilblume!' : 'Der Gegner nimmt die Heilblume!',
                u === this.player ? '#7ee08a' : '#ff9a8a',
              );
              return false;
            }
          }
          return true;
        });
        break;
      }
      case 'bruchzone': {
        // +25% damage to whoever holds the zone
        const z = this.bruchzone!;
        for (const u of this.units) {
          if (!u.alive) continue;
          const inside = dist(u.x, u.y, z.x, z.y) <= z.r + u.radius * 0.3;
          if (inside) {
            u.stats.set({ id: 'zone:bruch', stat: 'damage', pct: 0.25 });
          } else {
            u.stats.remove('zone:bruch');
          }
        }
        break;
      }
      case 'blitzsturm': {
        // Telegraphed lightning aimed near a random champion — keep moving
        if (this.now >= this.nextStrikeAt) {
          this.nextStrikeAt = this.now + 3200 + Math.random() * 1600;
          const targets = this.units.filter((u) => u.alive && u.radius >= 16);
          const t = targets[Math.floor(Math.random() * targets.length)];
          if (t) {
            this.strikes.push({
              x: t.x + (Math.random() - 0.5) * 140,
              y: t.y + (Math.random() - 0.5) * 140,
              at: this.now + 950,
            });
          }
        }
        for (const s of this.strikes) {
          if (this.now < s.at) continue;
          for (const u of this.units) {
            if (!u.alive) continue;
            if (dist(u.x, u.y, s.x, s.y) <= 140 + u.radius * 0.4) {
              this.dealDamage(null, u, 24, 'other');
            }
          }
          this.flashLine(s.x, s.y - 620, s.x, s.y, 0xaaddff);
          this.ring(s.x, s.y, 0xaaddff, 140);
          this.rig?.shake(0.005);
        }
        this.strikes = this.strikes.filter((s) => this.now < s.at);
        break;
      }
    }
  }

  private drawModifier(g: Phaser.GameObjects.Graphics): void {
    switch (this.modifier) {
      case 'feuerring': {
        if (this.fireSafeR >= FIRE_MAX_R - 2) break;
        const w = Math.min(700, FIRE_MAX_R - this.fireSafeR);
        g.lineStyle(w, COLORS.burn, 0.3);
        g.strokeCircle(ARENA_X, ARENA_Y, this.fireSafeR + w / 2);
        g.lineStyle(3, COLORS.burn, 0.8);
        g.strokeCircle(ARENA_X, ARENA_Y, this.fireSafeR);
        break;
      }
      case 'heilblumen': {
        for (const f of this.flowers) {
          g.fillStyle(0x2a8a4a, 1);
          g.fillCircle(f.x, f.y, 10);
          g.fillStyle(0x7ee08a, 1);
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 + this.now / 900;
            g.fillCircle(f.x + Math.cos(a) * 16, f.y + Math.sin(a) * 16, 8);
          }
        }
        break;
      }
      case 'bruchzone': {
        const z = this.bruchzone!;
        g.fillStyle(0x9955ff, 0.14);
        g.fillCircle(z.x, z.y, z.r);
        g.lineStyle(3, 0xbb88ff, 0.7);
        g.strokeCircle(z.x, z.y, z.r);
        break;
      }
      case 'blitzsturm': {
        for (const s of this.strikes) {
          const prog = 1 - (s.at - this.now) / 950;
          g.lineStyle(3, 0xaaddff, 0.85);
          g.strokeCircle(s.x, s.y, 140);
          g.fillStyle(0xaaddff, 0.08 + prog * 0.2);
          g.fillCircle(s.x, s.y, 140 * prog);
        }
        break;
      }
    }
  }

  private createHud(boss: boolean, title: string, bossAugments?: string[]): void {
    const style = { fontFamily: 'sans-serif', fontSize: '32px', color: '#e8ecf8' };
    /** Adopt into the screen-locked layer — every HUD element is pinned. */
    const ui = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.uiLayer.add(o);
      return o;
    };
    const hud = ui(this.add.graphics().setDepth(99));

    // Left panel: round + gold + map (+ modifier)
    const leftW = 340;
    const leftH = this.modifier ? 168 : 134;
    hud.fillStyle(0x0a0a14, 0.72);
    hud.fillRoundedRect(18, 16, leftW, leftH, 14);
    hud.lineStyle(2, 0x3a3a55, 0.8);
    hud.strokeRoundedRect(18, 16, leftW, leftH, 14);
    const roundLabel =
      run.round > MAX_ROUND ? `Endless · Round ${run.round}` : `${STR.round} ${run.round} / ${MAX_ROUND}`;
    ui(this.add.text(38, 27, roundLabel, style).setDepth(100));
    hud.fillStyle(0xffd24a, 1);
    hud.fillCircle(50, 84, 11);
    hud.fillStyle(0xb8912a, 1);
    hud.fillCircle(50, 84, 6);
    this.goldHudText = ui(
      this.add.text(70, 70, `${run.gold}`, { ...style, fontSize: '28px', color: '#ffd24a' }).setDepth(100),
    );
    ui(
      this.add
        .text(38, 104, `${this.map.name} · ${this.map.region}`, {
          ...style,
          fontSize: '23px',
          color: '#8a94b0',
        })
        .setDepth(100),
    );
    if (this.modifier) {
      ui(
        this.add
          .text(38, 136, `✦ ${MODIFIER_NAMES[this.modifier]}`, { ...style, fontSize: '26px', color: '#cba6ff' })
          .setDepth(100),
      );
    }

    // Build button: opens the stats/augments/items overlay (also TAB)
    const buildY = 30 + leftH + 86;
    hud.fillStyle(0x0a0a14, 0.72);
    hud.fillRoundedRect(18, buildY - 26, 200, 52, 12);
    hud.lineStyle(2, 0x3a3a55, 0.9);
    hud.strokeRoundedRect(18, buildY - 26, 200, 52, 12);
    const buildTxt = ui(
      this.add
        .text(118, buildY, '☰ Build & Stats', { ...style, fontSize: '25px', color: '#a8d8ff' })
        .setOrigin(0.5)
        .setDepth(100),
    );
    const buildZone = ui(
      this.add
        .zone(118, buildY, 200, 52)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setDepth(101),
    );
    const openBuild = () => {
      if (this.scene.isPaused('arena')) return;
      this.scene.launch('build', { from: 'arena' });
      this.scene.pause('arena');
    };
    buildZone.on('pointerdown', openBuild);

    // Your build, on screen, always. Until now the only way to see which
    // augments a run had picked was to open an overlay that pauses the game —
    // so during a fight the build was invisible, and picks that change how an
    // ability behaves had no presence at all (B5). One chip per augment, tinted
    // by tier, is enough to make the run feel like it is accumulating.
    this.buildChips = ui(this.add.container(0, 0).setDepth(100));
    this.buildChipsTop = buildY + 44;
    this.refreshBuildChips();
    buildTxt.setInteractive({ useHandCursor: true }).on('pointerdown', openBuild);
    this.input.keyboard?.addKey('TAB').on('down', openBuild);

    // Item icons under the panel (16-bit thematic tiles)
    const itemG = ui(this.add.graphics().setDepth(100));
    run.items.forEach((it, i) => {
      const ix = 38 + i * 44;
      const iy = 30 + leftH + 16;
      itemG.fillStyle(it.color, 0.2);
      itemG.fillRoundedRect(ix - 18, iy - 18, 36, 36, 8);
      itemG.lineStyle(2, it.color, 0.9);
      itemG.strokeRoundedRect(ix - 18, iy - 18, 36, 36, 8);
      drawItemIcon(itemG, it.icon ?? 'orb', ix, iy, 28, it.color);
    });

    // One life — no heart HUD needed; just the fullscreen button
    addFullscreenButton(this, GAME_W - 56, 56, this.uiLayer);

    // "Know your enemy": the Usurpator's augments stay visible all round
    if (bossAugments?.length) {
      ui(
        this.add
          .text(ARENA_X, 26, `Usurper: ${bossAugments.join(' · ')}`, {
            fontFamily: 'sans-serif',
            fontSize: '28px',
            color: '#ff9a8a',
          })
          .setOrigin(0.5, 0)
          .setDepth(100),
      );
    }

    // Round intro banner. Screen-locked, not world-locked: it announces the
    // round to the player, so it should not slide off as the camera follows.
    const banner = ui(this.add
      .text(ARENA_X, ARENA_Y - 80, title, {
        fontFamily: 'sans-serif',
        fontSize: '84px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(150)
      .setAlpha(0));
    const sub = boss
      ? ui(this.add
          .text(ARENA_X, ARENA_Y + 10, STR.usurpatorComes, {
            fontFamily: 'sans-serif',
            fontSize: '38px',
            fontStyle: 'italic',
            color: '#ff9a8a',
            stroke: '#000000',
            strokeThickness: 6,
          })
          .setOrigin(0.5)
          .setDepth(150)
          .setAlpha(0))
      : null;
    this.tweens.add({
      targets: sub ? [banner, sub] : banner,
      alpha: 1,
      duration: 350,
      yoyo: true,
      hold: 1300,
      onComplete: () => {
        banner.destroy();
        sub?.destroy();
      },
    });
  }

  private createButtons(): void {
    const bx = GAME_W - 190;
    const by = GAME_H - 190;
    this.buttons.push(
      // Dash — biggest, corner anchor; double chevron icon
      new AbilityButton(this, {
        x: bx + 60,
        y: by + 60,
        r: 84,
        label: 'SPACE',
        color: 0x4488dd,
        drawIcon: (g, x, y, r) => {
          g.fillStyle(0xffffff, 0.95);
          for (const off of [-r * 0.42, r * 0.18]) {
            g.fillTriangle(x + off - r * 0.3, y - r * 0.55, x + off - r * 0.3, y + r * 0.55, x + off + r * 0.42, y);
          }
        },
        onCast: () => this.player.dash(),
        getCooldownPct: () => this.player.cooldownPct('Dash'),
          getCharges: () => ({ avail: this.player.dashChargesAvail, max: this.player.maxDashCharges }),
        },
        this.uiLayer,
      ),
      // Q — aimable; thrown-blade icon
      new AbilityButton(this, {
        x: bx - 150,
        y: by + 40,
        r: 68,
        label: 'Q',
        color: 0xcc8833,
        drawIcon: (g, x, y, r) => {
          g.fillStyle(0xffffff, 0.95);
          g.fillTriangle(x - r * 0.7, y + r * 0.55, x - r * 0.25, y + r * 0.1, x + r * 0.75, y - r * 0.65);
          g.fillTriangle(x - r * 0.7, y + r * 0.55, x + r * 0.1, y + r * 0.28, x + r * 0.75, y - r * 0.65);
          g.fillCircle(x - r * 0.62, y + r * 0.5, r * 0.16);
        },
        aimable: true,
        onCast: (dir) => this.player.castQ(dir ?? undefined),
        onAimPreview: (dir) => (this.aimPreview = dir),
          getCooldownPct: () => this.player.cooldownPct('Q'),
        },
        this.uiLayer,
      ),
      // E — crown icon
      new AbilityButton(this, {
        x: bx + 40,
        y: by - 150,
        r: 68,
        label: 'E',
        color: 0xbbaa33,
        drawIcon: (g, x, y, r) => {
          crown(g, x, y + r * 0.4, r * 1.3, 0xffffff, 0.95);
        },
        onCast: () => this.player.castE(),
          getCooldownPct: () => this.player.cooldownPct('E'),
        },
        this.uiLayer,
      ),
    );
  }

  private setupKeyboard(): void {
    const kb = this.input.keyboard!;
    this.keys = {
      W: kb.addKey('W'),
      A: kb.addKey('A'),
      S: kb.addKey('S'),
      D: kb.addKey('D'),
    };
    // Desktop: Q and E aim toward the mouse cursor, Space dash
    kb.addKey('Q').on('down', () => {
      const p = this.input.activePointer;
      this.player.castQ({ x: p.worldX - this.player.x, y: p.worldY - this.player.y });
    });
    kb.addKey('E').on('down', () => {
      const p = this.input.activePointer;
      this.player.castE({ x: p.worldX - this.player.x, y: p.worldY - this.player.y });
    });
    kb.addKey('SPACE').on('down', () => this.player.dash());
  }

  // ---- Combat API ----

  spawnProjectile(opts: ProjectileOpts): Projectile {
    const p = new Projectile(opts);
    this.projectiles.push(p);
    return p;
  }

  dealDamage(source: Unit | null, target: Unit, amount: number, type: DamageType, school?: School): number {
    if (!target.alive || amount <= 0) return 0;
    // Phasensprung rule flag: invulnerable while dashing
    if (target === this.player && this.player.dashing && run.flags.dashIFrames) return 0;
    // Champion dash i-frames (Fizz/Yi/Fiddlesticks) grant brief invulnerability.
    if (target === this.player && this.now < this.player.invulnUntil) return 0;

    // LoL-like mitigation: Rüstung vs physisch, MR vs magisch, wahr ignores both
    const sch: School =
      school ?? (type === 'burn' ? 'magisch' : type === 'other' ? 'wahr' : 'physisch');
    if (sch === 'physisch') {
      amount *= 100 / (100 + Math.max(0, target.stats.get('armor')));
    } else if (sch === 'magisch') {
      amount *= 100 / (100 + Math.max(0, target.stats.get('magicResist')));
    }

    const prevPct = target.hpPct;
    const dealt = Math.min(amount, target.hp + target.shield);
    target.applyDamage(amount);
    // Deaths caused by re-entrant dealDamage inside a hook (e.g. an execute)
    // are credited to that inner call, not this one
    const killedByThisCall = !target.alive;

    if (source === this.player) {
      run.totalDamageDealt += dealt;
      if (dealt > run.maxHit) run.maxHit = dealt;
      this.bus.emit('damageDealt', { target, dmg: dealt, type });
      const ls = this.player.stats.get('lifesteal');
      if (ls > 0 && type !== 'reflect') this.player.heal(dealt * ls);
    }
    if (target === this.player) {
      const melee = source !== null && dist(source.x, source.y, target.x, target.y) < 120;
      this.bus.emit('damageTaken', { source, dmg: dealt, melee });
      this.player.onDamageTaken(dealt, source);
      // Threshold events (Zweiter Wind etc.): fire when crossing downward
      for (const pct of [0.5, 0.15]) {
        if (prevPct > pct && this.player.hpPct <= pct && this.player.alive) {
          this.bus.emit('playerHpThreshold', { pct });
        }
      }
    }
    // ---- Juice: numbers, flashes, shake, hit-stop ----
    // Everything scales off one severity so the effects agree with each other;
    // see core/impact.ts for why a flat impact made every hit feel the same.
    const sev = severityOf(dealt, target);
    const opts = { onPlayer: target === this.player, killing: killedByThisCall, ability: type === 'ability' };
    target.hitFlashUntil = this.now + (dealt > 0 ? 90 + Math.round(sev * 90) : 90);
    if (dealt > 0) target.notifyHurt();
    this.spawnDamageNumber(target, dealt, type, sev);

    if (dealt > 0) {
      // The damage vector, source -> target. Hoisted out of the particle block
      // below because the camera kick needs the same heading: shake says only
      // "something happened", a kick says the blow came *from there*, and the
      // two must not disagree about which way that is.
      let dx = 0;
      let dy = -1;
      if (source && source !== target) {
        const l = Math.hypot(target.x - source.x, target.y - source.y);
        if (l > 0.001) {
          dx = (target.x - source.x) / l;
          dy = (target.y - source.y) / l;
        }
      }
      const [dur, amp] = shakeFor(sev, opts);
      if (dur > 0) this.rig?.shake(amp);
      this.rig?.kick(dx, dy, sev);
      if (sev >= 0.4) this.rig?.punch(0.03 + sev * 0.07);
      // Hit-stop is the single biggest weight gain available, and it was only
      // ever applied on kills. Chip damage still gets none — a stutter on every
      // tick would read as lag rather than force.
      const stop = hitStopMs(sev, opts);
      if (stop > 0) this.slowmoUntil = Math.max(this.slowmoUntil, this.now + stop);
      // [vfx-agent] Directional impact. The damage vector is source -> target;
      // with no source (burns, hazards, environment) there is no direction to
      // show, so the spray falls back to "up and out" rather than inventing a
      // heading that would point at nothing.
      if (sev >= 0.12 || type === 'ability') {
        const col = target === this.player ? 0xff5555 : type === 'ability' ? 0xffd24a : 0xffffff;
        const hx = target.x;
        const hy = target.y - target.radius * 0.3;
        this.particles.shock(hx, hy, dx, dy, sev, col);
        this.particles.impact(hx, hy, dx, dy, sev, col);
      }
    }

    if (killedByThisCall && target.team === 'enemy') {
      run.kills++;
      // Kill gold + hit-stop + death burst
      earnGold(25);
      const gt = this.add
        .text(target.x, target.y - target.radius - 48, '+25', {
          fontFamily: 'sans-serif',
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#ffd24a',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(141);
      this.tweens.add({ targets: gt, y: gt.y - 46, alpha: 0, duration: 900, onComplete: () => gt.destroy() });
      this.goldHudText?.setText(`${run.gold}`);
      this.slowmoUntil = this.now + 110;
      this.ring(target.x, target.y, COLORS.enemy, 95);
      // [vfx-agent] Enemies used to just stop existing behind that ring. Bosses
      // come apart harder than trash — the radius is the only thing on a Unit
      // that reliably tracks "how big a deal was this".
      this.particles.death(target.x, target.y, COLORS.enemy, target.isBoss || target.radius > UNIT_RADIUS * 1.2);
      this.rig?.shake(0.006);
      this.rig?.punch(0.09);
      this.bus.emit('enemyDeath', { enemy: target });
      this.bus.emit('killWindow', { victim: target });
    }
    return dealt;
  }

  /** Green floating numbers for meaningful heals (lifesteal trickle stays quiet). */
  private flushHealNumbers(): void {
    for (const u of this.units) {
      if (u.healDisplayAcc < 8) continue;
      const amt = Math.round(u.healDisplayAcc);
      u.healDisplayAcc = 0;
      const t = this.add
        .text(u.x, u.y - u.radius - 26, `+${amt}`, {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          fontStyle: 'bold',
          color: '#7ee08a',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(140);
      this.tweens.add({
        targets: t,
        y: t.y - 50,
        alpha: 0,
        duration: 800,
        ease: 'Cubic.easeOut',
        onComplete: () => t.destroy(),
      });
    }
  }

  /** Floating damage numbers; burn ticks aggregate per unit to avoid spam. */
  private spawnDamageNumber(target: Unit, dealt: number, type: DamageType, sev = 0): void {
    if (dealt <= 0) return;
    // Aura-style damage (Karthus's Defile, hazards, any per-frame tick) arrives
    // as a stream of tiny hits. One number per tick buries the screen in a
    // column of 1s and 0s and hides the numbers that matter, so anything this
    // small is pooled through the same accumulator burn already uses.
    if (type !== 'burn' && dealt < TICK_NUMBER_THRESHOLD) type = 'burn';
    if (type === 'burn') {
      const acc = this.burnNumAcc.get(target) ?? { sum: 0, showAt: this.now + 450 };
      acc.sum += dealt;
      if (this.now < acc.showAt) {
        this.burnNumAcc.set(target, acc);
        return;
      }
      dealt = acc.sum;
      this.burnNumAcc.set(target, { sum: 0, showAt: this.now + 450 });
    }
    const color =
      target === this.player
        ? '#ff5555'
        : type === 'burn'
          ? '#ff9944'
          : type === 'ability'
            ? '#ffd24a'
            : '#ffffff';
    const t = this.add
      .text(target.x + (Math.random() - 0.5) * 30, target.y - target.radius - 26, `${Math.round(dealt)}`, {
        fontFamily: 'sans-serif',
        // Sized by how much of the bar it took, so a big hit is legible as big
        // before it is read as a figure.
        fontSize: `${numberSize(sev)}px`,
        fontStyle: 'bold',
        color,
        stroke: '#000000',
        strokeThickness: 4 + Math.round(sev * 3),
      })
      .setOrigin(0.5)
      .setDepth(140);
    // Heavy hits punch out and settle instead of drifting up politely.
    if (sev >= 0.3) {
      t.setScale(0.5);
      this.tweens.add({ targets: t, scale: 1, duration: 130, ease: 'Back.easeOut' });
    }
    this.tweens.add({
      targets: t,
      y: t.y - 55 - sev * 30,
      alpha: 0,
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  /**
   * Mid-round enemy spawn (reinforcements, splits). Goes through the same
   * walkability nudge as the opening row: a reinforcement dropped into sealed
   * geometry can never reach the player, and the round cannot end while it
   * lives (B9). This path is why the opening-row fix alone wasn't enough.
   */
  spawnEnemyUnit(cfg: Parameters<typeof spawnEnemy>[4], x: number, y: number): Unit {
    const at = findOpenSpawn(x, y, UNIT_RADIUS, { x: this.player.x, y: this.player.y });
    const e = spawnEnemy(this, this, at.x, at.y, cfg);
    this.units.push(e);
    return e;
  }

  nearestEnemy(of: Unit, maxDist = Infinity): Unit | null {
    let best: Unit | null = null;
    let bestD = maxDist;
    for (const u of this.units) {
      if (!u.alive || u.team === of.team) continue;
      const d = dist(of.x, of.y, u.x, u.y);
      if (d <= bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  botTarget(): Unit {
    if (this.taunt && this.taunt.unit.alive && this.now < this.taunt.until) {
      return this.taunt.unit;
    }
    return this.player;
  }

  setTaunt(unit: Unit, until: number): void {
    this.taunt = { unit, until };
  }

  addBurn(target: Unit, dps: number, durationMs: number): void {
    if (!target.alive) return;
    const forever = run.flags.burnForever;
    if (!forever && target.burns.length >= 10) return; // sane default cap; Ewige Flamme lifts it
    target.burns.push({ dps, until: forever ? Infinity : this.now + durationMs });
  }

  addHazard(h: Hazard): void {
    this.hazards.push(h);
  }

  delay(ms: number, fn: () => void): void {
    this.time.delayedCall(ms, () => {
      if (this.fightState === 'fighting') fn();
    });
  }

  procAt(x: number, y: number, text: string, color = '#ffd24a'): void {
    procLabel(this, x, y, text, color);
  }

  /** One chip per owned augment, down the left edge under the Build button. */
  private refreshBuildChips(): void {
    const c = this.buildChips;
    if (!c) return;
    c.removeAll(true);
    const tierColor: Record<string, number> = { silber: 0x9aa6bd, gold: 0xffc832, prisma: 0xcc7aff };
    run.augments.forEach((a, i) => {
      const y = this.buildChipsTop + i * 34;
      const col = tierColor[a.tier] ?? 0x9aa6bd;
      const g = this.add.graphics();
      g.fillStyle(0x0a0a14, 0.72);
      g.fillRoundedRect(18, y - 14, 200, 28, 8);
      g.lineStyle(2, col, 0.9);
      g.strokeRoundedRect(18, y - 14, 200, 28, 8);
      c.add(g);
      c.add(
        this.add
          .text(30, y, a.name, {
            fontFamily: 'sans-serif',
            fontSize: '17px',
            fontStyle: 'bold',
            color: '#' + col.toString(16).padStart(6, '0'),
          })
          .setOrigin(0, 0.5),
      );
    });
  }

  announce(text: string, color = '#ffee88'): void {
    const t = this.add
      .text(ARENA_X, ARENA_Y - 200, text, {
        fontFamily: 'sans-serif',
        fontSize: '36px',
        fontStyle: 'bold',
        color,
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(160);
    this.tweens.add({
      targets: t,
      y: ARENA_Y - 260,
      alpha: 0,
      duration: 1600,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  flashLine(x1: number, y1: number, x2: number, y2: number, color: number): void {
    this.flashes.push({ x1, y1, x2, y2, color, until: this.now + 160 });
  }

  ring(x: number, y: number, color: number, maxR: number): void {
    this.rings.push({ x, y, start: this.now, color, maxR });
  }

  addWall(x1: number, y1: number, x2: number, y2: number, until: number): void {
    this.walls.push({ x1, y1, x2, y2, until });
  }

  /** Windwand: enemy projectiles crossing a wall segment are devoured. */
  private tickWalls(): void {
    this.walls = this.walls.filter((w) => w.until > this.now);
    if (this.walls.length === 0) return;
    for (const p of this.projectiles) {
      if (p.team !== 'enemy' || !p.alive) continue;
      for (const w of this.walls) {
        // Distance from projectile to the wall segment
        const dx = w.x2 - w.x1;
        const dy = w.y2 - w.y1;
        const lenSq = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / lenSq));
        const cx = w.x1 + t * dx;
        const cy = w.y1 + t * dy;
        if (Math.hypot(p.x - cx, p.y - cy) <= 16 + p.radius) {
          p.alive = false;
          this.ring(p.x, p.y, 0xd8f4ff, 34);
          break;
        }
      }
    }
  }

  spawnMirror(scale: number): void {
    this.units.push(new Clone(this, this, this.player.x + 70, this.player.y, this.player, scale));
  }

  /** Schattenzwilling helper — decoys are combat-core citizens, spawned via augment hook. */
  spawnDecoy(x: number, y: number, durationMs: number): Unit {
    const d = new Decoy(this, x, y, this.now + durationMs);
    this.units.push(d);
    this.setTaunt(d, this.now + durationMs);
    return d;
  }

  /** Burn stacks + hazard zones tick every frame through the damage pipeline. */
  private tickDots(dt: number): void {
    for (const u of this.units) {
      if (!u.alive) continue;
      let dps = 0;
      if (u.burns.length > 0) {
        u.burns = u.burns.filter((b) => b.until > this.now);
        for (const b of u.burns) dps += b.dps;
      }
      for (const h of this.hazards) {
        if (h.team !== u.team && dist(u.x, u.y, h.x, h.y) <= h.r + u.radius) dps += h.dps;
      }
      if (dps <= 0) continue;
      u.dotAcc += dps * dt;
      if (u.dotAcc >= 1) {
        const amt = Math.floor(u.dotAcc);
        u.dotAcc -= amt;
        // Burns/hazards on enemies are the player's doing; on the player, the arena's
        this.dealDamage(u.team === 'enemy' ? this.player : null, u, amt, 'burn');
      }
    }
    this.hazards = this.hazards.filter((h) => h.until > this.now);
  }

  /**
   * Chevrons at the screen edge for enemies the camera cut off.
   *
   * This is the bill for zooming in. The old view showed the whole arena at
   * once, so "where is everyone" was free; at the current zoom roughly a third
   * of the field is outside the frame and an archer plinking from an unseen
   * corner would be a fairness regression, not a style choice. The marker is
   * drawn into the screen-locked layer in design coordinates, so it sits on the
   * border regardless of zoom or punch.
   */
  private drawOffscreenMarkers(): void {
    const g = this.offGfx;
    if (!g) return;
    g.clear();
    const cam = this.cameras.main;
    const z = cam.zoom;
    const inset = 44;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const hw = cx - inset;
    const hh = cy - inset;

    for (const u of this.units) {
      if (!u.alive || u.team !== 'enemy') continue;
      const sx = (u.x - cam.scrollX) * z;
      const sy = (u.y - cam.scrollY) * z;
      if (sx > inset && sx < GAME_W - inset && sy > inset && sy < GAME_H - inset) continue;

      let dx = sx - cx;
      let dy = sy - cy;
      const l = Math.hypot(dx, dy);
      if (l < 1) continue;
      dx /= l;
      dy /= l;
      // Push out along the heading until it meets the inset border — the
      // shorter of the two axis intersections is the one that hits an edge.
      const t = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
      const px = cx + dx * t;
      const py = cy + dy * t;

      const a = Math.atan2(dy, dx);
      const boss = u.isBoss;
      const size = boss ? 26 : 17;
      g.fillStyle(boss ? 0xffd24a : 0xff5a5a, boss ? 0.95 : 0.8);
      g.beginPath();
      g.moveTo(px + Math.cos(a) * size, py + Math.sin(a) * size);
      g.lineTo(px + Math.cos(a + 2.5) * size, py + Math.sin(a + 2.5) * size);
      g.lineTo(px + Math.cos(a - 2.5) * size, py + Math.sin(a - 2.5) * size);
      g.closePath();
      g.fillPath();
    }
  }

  // ---- Frame loop ----

  update(time: number, deltaMs: number): void {
    let dt = Math.min(deltaMs, 50) / 1000;
    // Kill hit-stop: world crawls for ~110ms (absolute-time cooldowns are unaffected;
    // the discrepancy is imperceptible at this length)
    if (time < this.slowmoUntil) dt *= 0.15;

    // Camera before anything draws, and on REAL time — during hit-stop the
    // world holds still but the camera must finish its kick, otherwise the
    // freeze swallows the very impact it exists to sell.
    if (this.rig) {
      const aim = this.input.activePointer;
      this.rig.update(Math.min(deltaMs, 50), this.player.x, this.player.y, aim.worldX, aim.worldY);
      const ht = hudTransform(this.rig.zoom);
      this.uiLayer.setPosition(ht.x, ht.y).setScale(ht.scale);
      this.drawOffscreenMarkers();
    }

    if (this.fightState === 'fighting') {
      // Movement input: autopilot (measurement only) wins, then joystick, else WASD
      let mv = this.joystick.vec;
      if (autopilotEnabled()) {
        // Enters through the same three controls a human has, so a sim run
        // cannot accidentally measure something the player could not do.
        const intent = autopilotIntent(this.player, this.units, this.hazards);
        mv = intent.move;
        if (intent.q) this.player.castQ(intent.aim);
        if (intent.e) this.player.castE(intent.aim);
        if (intent.dash) this.player.dash();
      } else if (!this.joystick.active) {
        mv = {
          x: (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0),
          y: (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0),
        };
      }
      this.player.move(dt, mv);
      if (this.player.dashing) {
        this.dashTrail.push({ x: this.player.x, y: this.player.y, until: time + 450 });
      }

      for (const u of this.units) u.update(time, dt);
      this.augments.update(dt);
      this.tickDots(dt);
      this.updateModifier(dt);
      this.flushHealNumbers();

      for (const p of this.projectiles) p.update(dt, this.units);
      // [vfx-agent] Trails are emitted here rather than in render() so they only
      // drop while the fight is actually running — a stationary projectile on a
      // paused field would otherwise keep shedding motes on the spot.
      for (const p of this.projectiles) {
        this.particles.trail(p, p.x, p.y, p.dir.x, p.dir.y, p.color, p.radius);
      }
      this.tickWalls();
      this.projectiles = this.projectiles.filter((p) => p.alive);

      this.checkFightEnd();
    }

    // [env-agent] weather, vignette and reactive ground. Given the unit list so
    // the floor can react to feet; it never writes to any of it.
    this.env?.update(dt, time, this.units, this.player.x, this.player.y);
    // [vfx-agent] Ticked with the already-slowmo-scaled dt, so the spray freezes
    // with the world during hit-stop instead of running on through it.
    this.particles.update(time, dt);
    this.champVfx.update(time);
    this.render();
  }

  private checkFightEnd(): void {
    if (!this.player.alive) {
      // Revive rule flag (Phönixherz): once per run, rise again mid-fight
      if ((run.memory.revivesUsed ?? 0) < run.flags.revives) {
        run.memory.revivesUsed = (run.memory.revivesUsed ?? 0) + 1;
        this.player.alive = true;
        this.player.hp = this.player.maxHP * 0.5;
        this.ring(this.player.x, this.player.y, 0xffd24a, 260);
        this.announce('Phönixherz!', '#ffd24a');
        this.rig?.shake(0.008);
        return;
      }
      this.endFight(false);
    } else if (this.units.every((u) => u.team === 'player' || !u.alive)) {
      this.endFight(true);
    }
  }

  private endFight(win: boolean): void {
    this.fightState = win ? 'won' : 'lost';
    this.bus.emit('roundEnd', { win });
    this.projectiles = [];

    // Zahltag nur jede 2. Runde (dafür doppelt) — Kills bleiben Kleingeld
    const payday = run.round % 2 === 0;
    const reward = payday ? (win ? 240 + 24 * run.round : 160) : 0;
    if (reward > 0) {
      earnGold(reward);
      // Screen-locked. These announce the round to the player rather than
      // marking a place in the arena, so with a following camera they have to
      // sit on the screen — left in world space they drift off-centre with
      // wherever the player happened to be standing when the round ended.
      this.uiLayer.add(
        this.add
          .text(ARENA_X, ARENA_Y + 110, `+${reward} Gold`, {
            fontFamily: 'sans-serif',
            fontSize: '34px',
            fontStyle: 'bold',
            color: '#ffd24a',
            stroke: '#000000',
            strokeThickness: 5,
          })
          .setOrigin(0.5)
          .setDepth(200),
      );
    }

    this.uiLayer.add(
      this.add
        .text(ARENA_X, ARENA_Y - 60, win ? STR.victory : STR.defeat, {
          fontFamily: 'sans-serif',
          fontSize: '110px',
          fontStyle: 'bold',
          color: win ? '#ffd24a' : '#e05555',
          stroke: '#000000',
          strokeThickness: 8,
        })
        .setOrigin(0.5)
        .setDepth(200),
    );

    if (!win) {
      // One life: any loss ends the run
      run.lives = 0;
      this.time.delayedCall(1400, () => this.scene.start('end', { victory: false }));
      return;
    }

    if (run.round === MAX_ROUND && !run.endless) {
      // Crown claimed — the EndScene offers the Endlosmodus from here
      this.time.delayedCall(1400, () => this.scene.start('end', { victory: true }));
      return;
    }

    // Onward: augment pick, then the next round. Offers gate on the round just played.
    const offers = rollOffers(run.round);
    run.round++;
    this.time.delayedCall(1300, () => this.scene.start('pick', { offers }));
  }

  private render(): void {
    for (const u of this.units) u.draw();

    // Dash trail (fading gold after-images under the player)
    this.dashTrail = this.dashTrail.filter((d) => d.until > this.now);
    this.aimGfx.clear();
    for (const d of this.dashTrail) {
      this.aimGfx.fillStyle(COLORS.player, 0.4 * ((d.until - this.now) / 450));
      this.aimGfx.fillCircle(d.x, d.y, this.player.radius * 0.9);
    }

    // Expanding rings (kill bursts, E nova, lightning impacts)
    // Expanding shockwave rings — bold and readable: filled core flash + a
    // thick colored ring + a bright white leading edge.
    this.rings = this.rings.filter((b) => this.now - b.start < 420);
    for (const b of this.rings) {
      const p = (this.now - b.start) / 420;
      const r = 18 + p * (b.maxR - 18);
      // soft filled flash that fades fast
      this.aimGfx.fillStyle(b.color, (1 - p) * 0.22);
      this.aimGfx.fillCircle(b.x, b.y, r);
      // main colored ring, thick early
      this.aimGfx.lineStyle(12 * (1 - p) + 2, b.color, (1 - p) * 0.95);
      this.aimGfx.strokeCircle(b.x, b.y, r);
      // bright white leading edge
      this.aimGfx.lineStyle(4 * (1 - p) + 1, 0xffffff, (1 - p) * 0.8);
      this.aimGfx.strokeCircle(b.x, b.y, r * 0.94);
    }

    // Ability-hit sparks: a quick radiating star burst at the impact point
    this.sparks = this.sparks.filter((s) => this.now - s.start < 240);
    for (const s of this.sparks) {
      const p = (this.now - s.start) / 240;
      const len = 10 + p * 26;
      this.aimGfx.fillStyle(s.color, (1 - p) * 0.5);
      this.aimGfx.fillCircle(s.x, s.y, (1 - p) * 14);
      this.aimGfx.lineStyle(3 * (1 - p) + 1, s.color, 1 - p);
      for (let i = 0; i < 6; i++) {
        const ang = s.a + (Math.PI * 2 * i) / 6;
        this.aimGfx.beginPath();
        this.aimGfx.moveTo(s.x + Math.cos(ang) * (len * 0.4), s.y + Math.sin(ang) * (len * 0.4));
        this.aimGfx.lineTo(s.x + Math.cos(ang) * len, s.y + Math.sin(ang) * len);
        this.aimGfx.strokePath();
      }
    }

    this.hazardGfx.clear();
    this.drawModifier(this.hazardGfx);
    // Wind walls: shimmering white-blue bands
    for (const w of this.walls) {
      const pulse = 0.5 + Math.sin(this.now / 90) * 0.2;
      this.hazardGfx.lineStyle(20, 0xd8f4ff, 0.22 * pulse + 0.1);
      this.hazardGfx.beginPath();
      this.hazardGfx.moveTo(w.x1, w.y1);
      this.hazardGfx.lineTo(w.x2, w.y2);
      this.hazardGfx.strokePath();
      this.hazardGfx.lineStyle(4, 0xffffff, 0.5 * pulse + 0.2);
      this.hazardGfx.beginPath();
      this.hazardGfx.moveTo(w.x1, w.y1);
      this.hazardGfx.lineTo(w.x2, w.y2);
      this.hazardGfx.strokePath();
    }
    for (const h of this.hazards) {
      this.hazardGfx.fillStyle(h.color, 0.22);
      this.hazardGfx.fillCircle(h.x, h.y, h.r);
      this.hazardGfx.lineStyle(2, h.color, 0.6);
      this.hazardGfx.strokeCircle(h.x, h.y, h.r);
    }

    this.projGfx.clear();
    for (const p of this.projectiles) {
      if (p.isSpinning) {
        // Boomerang blade: whirling cross of blades + glow
        const a = this.now / 55;
        this.projGfx.fillStyle(p.color, 0.2);
        this.projGfx.fillCircle(p.x, p.y, p.radius * 2.4);
        this.projGfx.lineStyle(5, p.color, 1);
        for (const off of [0, Math.PI / 2]) {
          const L = p.radius * 2.1;
          this.projGfx.beginPath();
          this.projGfx.moveTo(p.x - Math.cos(a + off) * L, p.y - Math.sin(a + off) * L);
          this.projGfx.lineTo(p.x + Math.cos(a + off) * L, p.y + Math.sin(a + off) * L);
          this.projGfx.strokePath();
        }
        this.projGfx.fillStyle(0xffffff, 0.9);
        this.projGfx.fillCircle(p.x, p.y, p.radius * 0.5);
        continue;
      }
      // [vfx-agent] Bolt as a tapered dart, not a stack of circles. A circle has
      // no heading, so a bolt coming at the player looked identical to one going
      // away; the dart's point and its dark keyline give it both a direction and
      // an edge that survives the painted maps underneath.
      const dx = p.dir.x;
      const dy = p.dir.y;
      const nx = -dy;
      const ny = dx;
      const tip = p.radius * 2.6;
      const tail = p.radius * 3.4;
      const half = p.radius * 0.95;
      const ax = p.x + dx * tip, ay = p.y + dy * tip; // nose
      const bx = p.x + nx * half, by = p.y + ny * half; // shoulders
      const cx = p.x - nx * half, cy = p.y - ny * half;
      const ex = p.x - dx * tail, ey = p.y - dy * tail; // tail

      // Soft glow first, so the keyline stays crisp on top of it.
      this.projGfx.fillStyle(p.color, 0.2);
      this.projGfx.fillCircle(p.x, p.y, p.radius * 2.1);
      // Dark keyline underneath the body, offset nowhere — just a fatter hull.
      this.projGfx.fillStyle(0x000000, 0.5);
      this.projGfx.beginPath();
      this.projGfx.moveTo(ax + dx * 1.6, ay + dy * 1.6);
      this.projGfx.lineTo(bx + nx * 1.6, by + ny * 1.6);
      this.projGfx.lineTo(ex - dx * 1.6, ey - dy * 1.6);
      this.projGfx.lineTo(cx - nx * 1.6, cy - ny * 1.6);
      this.projGfx.closePath();
      this.projGfx.fillPath();
      // Body
      this.projGfx.fillStyle(p.color, 1);
      this.projGfx.beginPath();
      this.projGfx.moveTo(ax, ay);
      this.projGfx.lineTo(bx, by);
      this.projGfx.lineTo(ex, ey);
      this.projGfx.lineTo(cx, cy);
      this.projGfx.closePath();
      this.projGfx.fillPath();
      // Hot core down the spine
      this.projGfx.lineStyle(Math.max(1, p.radius * 0.5), 0xffffff, 0.85);
      this.projGfx.beginPath();
      this.projGfx.moveTo(p.x + dx * tip * 0.5, p.y + dy * tip * 0.5);
      this.projGfx.lineTo(p.x - dx * tail * 0.45, p.y - dy * tail * 0.45);
      this.projGfx.strokePath();
    }
    this.flashes = this.flashes.filter((f) => f.until > this.now);
    for (const f of this.flashes) {
      this.projGfx.lineStyle(4, f.color, (f.until - this.now) / 160);
      this.projGfx.beginPath();
      this.projGfx.moveTo(f.x1, f.y1);
      this.projGfx.lineTo(f.x2, f.y2);
      this.projGfx.strokePath();
    }

    if (this.aimPreview) {
      const px = this.player.x;
      const py = this.player.y;
      const ax = this.aimPreview.x;
      const ay = this.aimPreview.y;

      // Legacy strip + core line + arrowhead — used for non-migrated champions
      // (no spec.q yet) and as the 'line'/'dash' renderer below.
      const drawArrow = (L: number, width: number) => {
        const hw = width / 2;
        this.aimGfx.fillStyle(COLORS.playerProj, 0.14);
        this.aimGfx.fillTriangle(
          px - ay * hw, py + ax * hw,
          px + ay * hw, py - ax * hw,
          px + ax * L, py + ay * L,
        );
        this.aimGfx.lineStyle(5, COLORS.playerProj, 0.6);
        this.aimGfx.beginPath();
        this.aimGfx.moveTo(px, py);
        this.aimGfx.lineTo(px + ax * L, py + ay * L);
        this.aimGfx.strokePath();
        this.aimGfx.fillStyle(COLORS.playerProj, 0.9);
        this.aimGfx.fillTriangle(
          px + ax * L, py + ay * L,
          px + ax * (L - 34) - ay * 16, py + ay * (L - 34) + ax * 16,
          px + ax * (L - 34) + ay * 16, py + ay * (L - 34) - ax * 16,
        );
      };

      const drawRing = (cx: number, cy: number, radius: number) => {
        this.aimGfx.fillStyle(COLORS.playerProj, 0.12);
        this.aimGfx.fillCircle(cx, cy, radius);
        this.aimGfx.lineStyle(4, COLORS.playerProj, 0.7);
        this.aimGfx.strokeCircle(cx, cy, radius);
      };

      const shape = this.player.champ.spec?.q;
      if (!shape) {
        // Fallback for champions without a spec yet — keep the original arrow.
        drawArrow(this.player.qRange, 40);
      } else if (shape.kind === 'line') {
        drawArrow(shape.range, shape.width);
      } else if (shape.kind === 'dash') {
        this.aimGfx.lineStyle(5, COLORS.playerProj, 0.6);
        this.aimGfx.beginPath();
        this.aimGfx.moveTo(px, py);
        this.aimGfx.lineTo(px + ax * shape.range, py + ay * shape.range);
        this.aimGfx.strokePath();
      } else if (shape.kind === 'circle' && shape.at === 'self') {
        drawRing(px, py, shape.radius);
      } else if (shape.kind === 'circle') {
        const range = shape.range ?? this.player.qRange;
        drawRing(px + ax * range, py + ay * range, shape.radius);
      } else if (shape.kind === 'cone') {
        const half = (shape.angle * Math.PI) / 360;
        const facing = Math.atan2(ay, ax);
        this.aimGfx.fillStyle(COLORS.playerProj, 0.16);
        this.aimGfx.beginPath();
        this.aimGfx.moveTo(px, py);
        this.aimGfx.arc(px, py, shape.range, facing - half, facing + half, false);
        this.aimGfx.closePath();
        this.aimGfx.fillPath();
        this.aimGfx.lineStyle(3, COLORS.playerProj, 0.6);
        this.aimGfx.strokePath();
      }
      // 'self' (or any other formless spec) draws nothing — no targetable zone.
    }

    this.joystick.draw();
    for (const b of this.buttons) b.draw();
  }

  /** Fullscreen 16-bit map: seeded tile floor, region decals, themed obstacles. */
  /**
   * Subtle collision markers over painted-art maps: translucent tinted pools
   * for water/lava (shimmer is added by the ambient layer) and a faint raised
   * slab for each cover wall — enough to read the cover without hiding the art.
   */
  private rectCorners(r: { x: number; y: number; w: number; h: number; rot?: number }): { x: number; y: number }[] {
    const a = ((r.rot ?? 0) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const hw = r.w / 2;
    const hh = r.h / 2;
    return [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ].map(([lx, ly]) => ({ x: r.x + lx * c - ly * s, y: r.y + lx * s + ly * c }));
  }

  private drawCollisionOverlay(m: MapDef): void {
    const g = this.add.graphics().setDepth(1);
    for (const t of activeTerrain()) {
      const water = t.kind === 'water';
      const pts = this.rectCorners(t);
      g.fillStyle(water ? 0x2a6ad0 : 0xd8480e, 0.18);
      g.fillPoints(pts, true);
      g.fillStyle(water ? 0x2a6ad0 : 0xd8480e, 0.14);
      g.fillPoints(this.rectCorners({ ...t, w: t.w + 16, h: t.h + 16 }), true);
      g.lineStyle(2, water ? 0x9fd8ff : 0xffb35a, 0.35);
      g.strokePoints(pts, true, true);
    }
    // Solid stone cover blocks (rotated quad: shadow + body + lit top edge)
    for (const w of activeWalls()) {
      const pts = this.rectCorners(w);
      const sh = this.rectCorners({ ...w, x: w.x + 6, y: w.y + 10 });
      g.fillStyle(0x000000, 0.32);
      g.fillPoints(sh, true);
      g.fillStyle(shade(m.wallColor, -0.15), 1);
      g.fillPoints(pts, true);
      g.fillStyle(shade(m.wallColor, 0.28), 1);
      g.fillPoints([pts[0], pts[1], this.lerp(pts[1], pts[2], 0.22), this.lerp(pts[0], pts[3], 0.22)], true); // lit top strip
      g.lineStyle(3, shade(m.wallColor, -0.6), 0.9);
      g.strokePoints(pts, true, true);
    }
    // Painted collision is invisible during play (the art shows it); it's only
    // coloured in the editor. Air (chasm/void edges) is never tinted.
  }

  private lerp(a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  private drawMap(m: MapDef): void {
    // Painted region art: render the uploaded image fullscreen instead of the
    // procedural floor. Coded walls/water (if any) still render on top.
    if (m.bgImage) {
      const key = `map:${m.bgImage}`;
      const placeArt = () => {
        const img = this.add.image(GAME_W / 2, GAME_H / 2, key).setDepth(0);
        img.setDisplaySize(GAME_W, GAME_H);
        const fg = this.add.graphics().setDepth(0);
        fg.lineStyle(10, 0x0a0a10, 1);
        fg.strokeRect(5, 5, GAME_W - 10, GAME_H - 10);
      };
      if (this.textures.exists(key)) {
        placeArt();
      } else {
        // Fallback floor now; swap in the art once it finishes loading
        this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, m.floor[0]).setDepth(0);
        this.load.image(key, `maps/${m.bgImage}.png`);
        this.load.once('complete', () => this.scene.isActive() && placeArt());
        this.load.start();
      }
      this.drawCollisionOverlay(m);
      return; // [env-agent] weather is seeded by EnvLayer, not here
    }

    const g = this.add.graphics().setDepth(0);
    let seed = m.seed;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // Tile floor: 32px grid with tonal variation — reads as chunky 16-bit
    const T = 32;
    g.fillStyle(m.floor[0], 1);
    g.fillRect(0, 0, GAME_W, GAME_H);
    for (let ty = 0; ty < GAME_H / T; ty++) {
      for (let tx = 0; tx < GAME_W / T; tx++) {
        const r = rnd();
        if (r < 0.42) continue; // base tone stays
        g.fillStyle(r < 0.8 ? m.floor[1] : m.floor[2], 1);
        g.fillRect(tx * T, ty * T, T - 1, T - 1);
      }
    }
    // Sparse pixel clutter: pebbles / grass / cracks in the line color
    for (let i = 0; i < 220; i++) {
      const x = rnd() * GAME_W;
      const y = rnd() * GAME_H;
      g.fillStyle(rnd() < 0.6 ? m.line : m.floor[2], 0.5 + rnd() * 0.4);
      g.fillRect(x, y, 3 + rnd() * 5, 3 + rnd() * 5);
    }

    // Painted center emblem + midline, like a fighting court
    g.lineStyle(3, m.line, 0.55);
    g.strokeCircle(ARENA_X, ARENA_Y, 180);
    g.lineStyle(2, m.line, 0.3);
    g.strokeCircle(ARENA_X, ARENA_Y, 90);
    g.beginPath();
    g.moveTo(FIELD.x1 + 60, ARENA_Y);
    g.lineTo(ARENA_X - 190, ARENA_Y);
    g.moveTo(ARENA_X + 190, ARENA_Y);
    g.lineTo(FIELD.x2 - 60, ARENA_Y);
    g.strokePath();
    crown(g, ARENA_X, ARENA_Y + 20, 100, m.rim, 0.08);

    // Screen-edge frame in the region accent
    g.lineStyle(10, 0x0a0a10, 1);
    g.strokeRect(5, 5, GAME_W - 10, GAME_H - 10);
    g.lineStyle(4, m.rim, 0.5);
    g.strokeRect(FIELD.x1 - 8, FIELD.y1 - 8, FIELD.x2 - FIELD.x1 + 16, FIELD.y2 - FIELD.y1 + 16);

    // Impassable terrain (static base; a shimmer animates in the ambient layer)
    const tg = this.add.graphics().setDepth(1);
    for (const t of m.terrain) {
      const x = t.x - t.w / 2;
      const y = t.y - t.h / 2;
      if (t.kind === 'water') {
        tg.fillStyle(0x1a3a6a, 1);
        tg.fillRoundedRect(x, y, t.w, t.h, 26);
        tg.fillStyle(0x2a5a9a, 0.9);
        tg.fillRoundedRect(x + 10, y + 10, t.w - 20, t.h - 20, 22);
        tg.fillStyle(0x4a8aca, 0.5);
        tg.fillRoundedRect(x + 22, y + 22, t.w - 44, t.h - 44, 18);
        tg.lineStyle(3, 0x9fd8ff, 0.5);
        for (let i = 1; i <= 3; i++) {
          const wy = y + (t.h * i) / 4;
          tg.beginPath();
          tg.moveTo(x + 24, wy);
          tg.lineTo(x + t.w - 24, wy);
          tg.strokePath();
        }
        tg.lineStyle(3, 0x7fb8e8, 0.8);
        tg.strokeRoundedRect(x, y, t.w, t.h, 26);
      } else {
        // lava
        tg.fillStyle(0x2a0e08, 1);
        tg.fillRoundedRect(x, y, t.w, t.h, 22);
        tg.fillStyle(0x7a1e0a, 1);
        tg.fillRoundedRect(x + 8, y + 8, t.w - 16, t.h - 16, 18);
        tg.fillStyle(0xd8480e, 0.9);
        let seed = m.seed + t.x;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 6; i++) {
          tg.fillCircle(x + 24 + rnd() * (t.w - 48), y + 24 + rnd() * (t.h - 48), 14 + rnd() * 18);
        }
        tg.fillStyle(0xff9a3a, 0.8);
        for (let i = 0; i < 5; i++) {
          tg.fillCircle(x + 30 + rnd() * (t.w - 60), y + 30 + rnd() * (t.h - 60), 6 + rnd() * 8);
        }
        tg.lineStyle(3, 0xffb35a, 0.7);
        tg.strokeRoundedRect(x, y, t.w, t.h, 22);
      }
    }

    // Solid stone walls (hard cover): chunky blocks with a lit top face + seams
    const wg = this.add.graphics().setDepth(4);
    for (const w of m.walls) {
      const x = w.x - w.w / 2;
      const y = w.y - w.h / 2;
      const lip = 10; // pseudo-3D raised top
      // Cast shadow on the floor
      wg.fillStyle(0x000000, 0.3);
      wg.fillRect(x + 6, y + 8, w.w, w.h);
      // Dark body
      wg.fillStyle(shade(m.wallColor, -0.5), 1);
      wg.fillRect(x, y - lip, w.w, w.h + lip);
      // Lit top face
      wg.fillStyle(m.wallColor, 1);
      wg.fillRect(x, y - lip, w.w, w.h - lip);
      // Highlight ridge along the top
      wg.fillStyle(shade(m.wallColor, 0.28), 0.9);
      wg.fillRect(x, y - lip, w.w, 6);
      // Block seams (mortar lines)
      wg.lineStyle(2, shade(m.wallColor, -0.55), 0.8);
      const horiz = w.w >= w.h;
      if (horiz) {
        for (let sx = x + 34; sx < x + w.w - 8; sx += 34) {
          wg.lineBetween(sx, y - lip, sx, y + w.h - lip);
        }
        wg.lineBetween(x, y + (w.h - lip) / 2, x + w.w, y + (w.h - lip) / 2);
      } else {
        for (let sy = y + 34 - lip; sy < y + w.h - 8; sy += 34) {
          wg.lineBetween(x, sy, x + w.w, sy);
        }
        wg.lineBetween(x + w.w / 2, y - lip, x + w.w / 2, y + w.h - lip);
      }
      wg.lineStyle(3, shade(m.wallColor, -0.65), 1);
      wg.strokeRect(x, y - lip, w.w, w.h);
    }

    // Obstacles in the map's style
    const og = this.add.graphics().setDepth(4);
    for (const o of m.obstacles) {
      og.fillStyle(0x000000, 0.35);
      og.fillEllipse(o.x, o.y + o.r * 0.55, o.r * 2.3, o.r * 0.9);
      switch (m.obstacleStyle) {
        case 'baum': {
          // Blossom tree: dark trunk + petal canopy of chunky circles
          og.fillStyle(0x4a3428, 1);
          og.fillRect(o.x - 8, o.y - 6, 16, o.r * 0.9);
          og.fillStyle(shade(m.obstacleColor, -0.3), 1);
          og.fillCircle(o.x - o.r * 0.4, o.y - o.r * 0.3, o.r * 0.62);
          og.fillCircle(o.x + o.r * 0.45, o.y - o.r * 0.2, o.r * 0.55);
          og.fillStyle(m.obstacleColor, 1);
          og.fillCircle(o.x, o.y - o.r * 0.5, o.r * 0.72);
          og.fillStyle(shade(m.obstacleColor, 0.3), 0.9);
          og.fillCircle(o.x - o.r * 0.2, o.y - o.r * 0.65, o.r * 0.4);
          break;
        }
        case 'obelisk': {
          // Sunstone obelisk: tapered slab with a glowing seam
          og.fillStyle(shade(m.obstacleColor, -0.45), 1);
          og.fillTriangle(o.x - o.r * 0.72, o.y + o.r * 0.7, o.x + o.r * 0.72, o.y + o.r * 0.7, o.x, o.y - o.r * 1.35);
          og.fillStyle(m.obstacleColor, 1);
          og.fillTriangle(o.x - o.r * 0.55, o.y + o.r * 0.6, o.x + o.r * 0.55, o.y + o.r * 0.6, o.x, o.y - o.r * 1.2);
          og.lineStyle(3, 0xfff0b0, 0.8);
          og.beginPath();
          og.moveTo(o.x, o.y + o.r * 0.4);
          og.lineTo(o.x, o.y - o.r * 0.9);
          og.strokePath();
          break;
        }
        case 'stachel': {
          // War-pit spikes: a cluster of iron thorns
          for (const [ox, oy, s] of [
            [-0.4, 0.2, 0.7],
            [0.4, 0.25, 0.6],
            [0, -0.1, 1],
          ] as const) {
            const bx = o.x + ox * o.r;
            const by = o.y + oy * o.r;
            og.fillStyle(shade(m.obstacleColor, -0.35), 1);
            og.fillTriangle(bx - o.r * 0.4 * s, by + o.r * 0.5 * s, bx + o.r * 0.4 * s, by + o.r * 0.5 * s, bx, by - o.r * 1.05 * s);
            og.fillStyle(m.obstacleColor, 1);
            og.fillTriangle(bx - o.r * 0.28 * s, by + o.r * 0.45 * s, bx + o.r * 0.28 * s, by + o.r * 0.45 * s, bx, by - o.r * 0.9 * s);
          }
          og.lineStyle(2, 0xcc3344, 0.5);
          og.strokeCircle(o.x, o.y, o.r * 0.9);
          break;
        }
        case 'saeule': {
          // Marble/sandstone column: round cap over a fluted shaft
          og.fillStyle(shade(m.obstacleColor, -0.4), 1);
          og.fillCircle(o.x, o.y, o.r + 4);
          og.fillStyle(m.obstacleColor, 1);
          og.fillCircle(o.x, o.y, o.r);
          og.fillStyle(shade(m.obstacleColor, 0.25), 0.6);
          og.fillCircle(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.5);
          og.lineStyle(2, shade(m.obstacleColor, -0.5), 0.7);
          og.strokeCircle(o.x, o.y, o.r * 0.6);
          og.strokeCircle(o.x, o.y, o.r * 0.28);
          break;
        }
        case 'fels': {
          // Wind-worn rock: chunky boulder with highlights
          og.fillStyle(shade(m.obstacleColor, -0.4), 1);
          og.fillCircle(o.x, o.y, o.r + 3);
          og.fillStyle(m.obstacleColor, 1);
          og.fillCircle(o.x - o.r * 0.15, o.y - o.r * 0.1, o.r * 0.9);
          og.fillStyle(shade(m.obstacleColor, 0.3), 0.7);
          og.fillCircle(o.x - o.r * 0.35, o.y - o.r * 0.35, o.r * 0.4);
          og.fillStyle(shade(m.obstacleColor, -0.25), 0.8);
          og.fillCircle(o.x + o.r * 0.3, o.y + o.r * 0.25, o.r * 0.35);
          break;
        }
      }
    }
    // [env-agent] weather is seeded by EnvLayer (core/env), not here.
  }

}
