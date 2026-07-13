import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { MAPS, MAP_IMAGE_KEYS } from '../core/maps';
import { getEdit, setEdit } from '../core/mapEdits';
import { exportAll } from '../core/exportAll';
import { CELL, COLS, ROWS, PaintKind } from '../core/paintgrid';

type Tool = PaintKind | 'erase';

const KIND_COLOR: Record<PaintKind, number> = {
  wall: 0xcfcfd8,
  air: 0x9a5cff, // void / no-dash gap (only shown in the editor)
  water: 0x2a8ad0,
  lava: 0xe0561a,
};

const BAR = 92;

/**
 * Freehand collision editor. Brush Wall / Water / Lava straight onto the
 * painted map (drag to paint, Erase to remove), pick a brush size, cycle maps.
 * Saves per map to the browser and applies live; COPY ALL exports everything.
 */
export class EditorScene extends Phaser.Scene {
  private idx = 0;
  private tool: Tool = 'wall';
  private brush = 1; // cell radius: 0=small, 1=med, 2=large
  private cells: Record<PaintKind, Set<number>> = { wall: new Set(), air: new Set(), water: new Set(), lava: new Set() };
  private undoStack: Record<PaintKind, number[]>[] = [];
  private clearArmed = false;
  private zoneGfx!: Phaser.GameObjects.Graphics;
  private bg?: Phaser.GameObjects.Image;
  private status!: Phaser.GameObjects.Text;
  private toolBtns: { tool: Tool; rect: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];
  private brushBtns: { size: number; rect: Phaser.GameObjects.Rectangle }[] = [];
  private clearBtn?: { rect: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text };
  private painting = false;

  constructor() {
    super('editor');
  }

  preload(): void {
    for (const k of MAP_IMAGE_KEYS) {
      if (!this.textures.exists(`map:${k}`)) this.load.image(`map:${k}`, `maps/${k}.png`);
    }
  }

  create(): void {
    this.zoneGfx = this.add.graphics().setDepth(2);
    this.buildToolbar();
    this.loadMap(0);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => (this.painting = false));
  }

  // ---- maps ----

  private loadMap(i: number): void {
    this.idx = (i + MAPS.length) % MAPS.length;
    const m = MAPS[this.idx];
    this.bg?.destroy();
    const key = `map:${m.bgImage}`;
    if (this.textures.exists(key)) {
      this.bg = this.add.image(GAME_W / 2, GAME_H / 2, key).setDepth(0);
      this.bg.setDisplaySize(GAME_W, GAME_H);
    } else {
      this.bg = undefined;
      this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, m.floor[0]).setDepth(0);
    }
    const p = getEdit(m.id)?.paint;
    this.cells = {
      wall: new Set(p?.wall ?? []),
      air: new Set(p?.air ?? []),
      water: new Set(p?.water ?? []),
      lava: new Set(p?.lava ?? []),
    };
    this.undoStack = [];
    this.clearArmed = false;
    this.redraw();
    this.updateStatus();
  }

  private save(): void {
    // Painting a map replaces its default box collision entirely.
    setEdit(MAPS[this.idx].id, {
      walls: [],
      terrain: [],
      paint: {
        wall: [...this.cells.wall],
        air: [...this.cells.air],
        water: [...this.cells.water],
        lava: [...this.cells.lava],
      },
    });
    this.updateStatus();
  }

  // ---- painting ----

  private inCanvas(p: Phaser.Input.Pointer): boolean {
    return p.y > BAR && p.y < GAME_H - BAR;
  }

  private snapshot(): void {
    this.undoStack.push({
      wall: [...this.cells.wall],
      air: [...this.cells.air],
      water: [...this.cells.water],
      lava: [...this.cells.lava],
    });
    if (this.undoStack.length > 24) this.undoStack.shift();
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.inCanvas(p)) return;
    this.snapshot();
    this.painting = true;
    this.paintAt(p.worldX, p.worldY);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.painting || !this.inCanvas(p)) return;
    this.paintAt(p.worldX, p.worldY);
  }

  private paintAt(x: number, y: number): void {
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    const R = this.brush;
    for (let dr = -R; dr <= R; dr++) {
      for (let dc = -R; dc <= R; dc++) {
        if (dc * dc + dr * dr > R * R + 0.5) continue;
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
        const idx = r * COLS + c;
        // a cell belongs to one kind at a time
        this.cells.wall.delete(idx);
        this.cells.air.delete(idx);
        this.cells.water.delete(idx);
        this.cells.lava.delete(idx);
        if (this.tool !== 'erase') this.cells[this.tool].add(idx);
      }
    }
    this.save();
    this.redraw();
  }

  private undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.cells = { wall: new Set(s.wall), air: new Set(s.air), water: new Set(s.water), lava: new Set(s.lava) };
    this.save();
    this.redraw();
  }

  private clearThis(): void {
    // Two-step: first press arms (button turns red), second within 3s wipes.
    if (!this.clearArmed) {
      this.clearArmed = true;
      this.refreshBtns();
      this.flash('Tap CLEAR again to wipe this map');
      this.time.delayedCall(3000, () => {
        this.clearArmed = false;
        this.refreshBtns();
      });
      return;
    }
    this.clearArmed = false;
    this.snapshot();
    this.cells = { wall: new Set(), air: new Set(), water: new Set(), lava: new Set() };
    this.save();
    this.redraw();
    this.refreshBtns();
  }

  // ---- rendering ----

  private redraw(): void {
    const g = this.zoneGfx;
    g.clear();
    // faint default box collision as reference (until painted over)
    const m = MAPS[this.idx];
    if (this.total() === 0) {
      g.lineStyle(2, 0xffffff, 0.25);
      for (const w of m.walls) g.strokeRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h);
      for (const t of m.terrain) g.strokeRect(t.x - t.w / 2, t.y - t.h / 2, t.w, t.h);
    }
    const fillCells = (set: Set<number>, color: number, a: number) => {
      g.fillStyle(color, a);
      set.forEach((i) => g.fillRect((i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL));
    };
    fillCells(this.cells.water, KIND_COLOR.water, 0.42);
    fillCells(this.cells.lava, KIND_COLOR.lava, 0.46);
    fillCells(this.cells.air, KIND_COLOR.air, 0.4);
    fillCells(this.cells.wall, KIND_COLOR.wall, 0.6);
  }

  private total(): number {
    return this.cells.wall.size + this.cells.air.size + this.cells.water.size + this.cells.lava.size;
  }

  // ---- toolbar ----

  private buildToolbar(): void {
    this.add.rectangle(GAME_W / 2, BAR / 2, GAME_W, BAR, 0x0c0c16, 0.9).setDepth(5);
    this.status = this.add.text(24, BAR / 2, '', { fontFamily: 'sans-serif', fontSize: '28px', color: '#e8ecf8' }).setOrigin(0, 0.5).setDepth(6);

    this.add.rectangle(GAME_W / 2, GAME_H - BAR / 2, GAME_W, BAR, 0x0c0c16, 0.92).setDepth(5);
    const y = GAME_H - BAR / 2;

    const tools: Tool[] = ['wall', 'air', 'water', 'lava', 'erase'];
    const btnW = 116;
    let x = 20;
    for (const t of tools) {
      const rect = this.add.rectangle(x + btnW / 2, y, btnW, 64, 0x222233, 1).setStrokeStyle(3, 0x556).setDepth(6).setInteractive({ useHandCursor: true });
      const label = this.add.text(x + btnW / 2, y, t.toUpperCase(), { fontFamily: 'sans-serif', fontSize: '25px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5).setDepth(7);
      rect.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.tool = t;
        this.refreshBtns();
      });
      this.toolBtns.push({ tool: t, rect, label });
      x += btnW + 10;
    }

    // brush size S / M / L
    x += 8;
    this.add.text(x, y, 'Brush', { fontFamily: 'sans-serif', fontSize: '22px', color: '#8a94b0' }).setOrigin(0, 0.5).setDepth(7);
    x += 80;
    ['S', 'M', 'L'].forEach((s, i) => {
      const rect = this.add.rectangle(x + 30, y, 56, 64, 0x222233, 1).setStrokeStyle(3, 0x556).setDepth(6).setInteractive({ useHandCursor: true });
      this.add.text(x + 30, y, s, { fontFamily: 'sans-serif', fontSize: '25px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5).setDepth(7);
      rect.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.brush = i;
        this.refreshBtns();
      });
      this.brushBtns.push({ size: i, rect });
      x += 62;
    });
    this.refreshBtns();

    // right-side actions
    const actions: [string, number, () => void][] = [
      ['◀', 0x2a3a55, () => this.loadMap(this.idx - 1)],
      ['▶', 0x2a3a55, () => this.loadMap(this.idx + 1)],
      ['UNDO', 0x3a3a55, () => this.undo()],
      ['CLEAR', 0x553030, () => this.clearThis()],
      ['COPY ALL', 0x2a553a, () => this.doExport()],
      ['PLAY', 0x1f6f4a, () => this.scene.start('menu')],
    ];
    let ax = GAME_W - 20;
    for (const [txt, col, fn] of [...actions].reverse()) {
      const w = txt.length <= 2 ? 72 : 132;
      ax -= w;
      const rect = this.add.rectangle(ax + w / 2, y, w, 64, col, 1).setStrokeStyle(3, 0x667).setDepth(6).setInteractive({ useHandCursor: true });
      const label = this.add.text(ax + w / 2, y, txt, { fontFamily: 'sans-serif', fontSize: '23px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5).setDepth(7);
      rect.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        fn();
      });
      if (txt === 'CLEAR') this.clearBtn = { rect, label };
      ax -= 10;
    }
  }

  private refreshBtns(): void {
    for (const b of this.toolBtns) {
      const active = b.tool === this.tool;
      const col = b.tool === 'erase' ? 0x883333 : KIND_COLOR[b.tool];
      b.rect.setFillStyle(active ? col : 0x222233, 1);
      b.rect.setStrokeStyle(3, active ? 0xffffff : 0x556677);
      b.label.setColor(active && b.tool === 'wall' ? '#111111' : '#ffffff');
    }
    for (const b of this.brushBtns) {
      const active = b.size === this.brush;
      b.rect.setFillStyle(active ? 0x3a5a8a : 0x222233, 1);
      b.rect.setStrokeStyle(3, active ? 0xffffff : 0x556677);
    }
    if (this.clearBtn) {
      this.clearBtn.rect.setFillStyle(this.clearArmed ? 0xcc3333 : 0x553030, 1);
      this.clearBtn.label.setText(this.clearArmed ? 'SURE?' : 'CLEAR');
    }
  }

  private updateStatus(): void {
    const m = MAPS[this.idx];
    this.status.setText(`Paint · ${m.name} (${this.idx + 1}/${MAPS.length}) · ${this.total()} cells · drag to paint`);
  }

  private async doExport(): Promise<void> {
    const text = exportAll();
    try {
      await navigator.clipboard.writeText(text);
      this.flash('Copied ALL changes (maps + balance) ✔  paste it to Claude');
    } catch {
      // eslint-disable-next-line no-console
      console.log(text);
      this.flash('Clipboard blocked — dumped to console (F12)');
    }
  }

  private flash(msg: string): void {
    const t = this.add
      .text(GAME_W / 2, GAME_H / 2, msg, {
        fontFamily: 'sans-serif', fontSize: '32px', fontStyle: 'bold',
        color: '#fff', backgroundColor: '#000000cc', padding: { x: 22, y: 14 },
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.time.delayedCall(2200, () => t.destroy());
  }
}
