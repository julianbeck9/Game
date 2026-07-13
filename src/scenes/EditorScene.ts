import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { MAPS, MAP_IMAGE_KEYS, MapWall, TerrainZone } from '../core/maps';
import { getEdit, setEdit, clearEdit } from '../core/mapEdits';
import { exportAll } from '../core/exportAll';

type Tool = 'wall' | 'water' | 'lava' | 'erase' | 'select';

const TOOL_COLOR: Record<'wall' | 'water' | 'lava', number> = {
  wall: 0xcfcfd8,
  water: 0x2a8ad0,
  lava: 0xe0561a,
};

const BAR = 92; // toolbar height (top + bottom reserved)

/**
 * In-game collision editor. Draw rectangles onto each painted map to mark
 * Walls / Water / Lava; it saves to the browser (applied live in the arena)
 * and Export copies the coordinates to the clipboard to bake in permanently.
 */
export class EditorScene extends Phaser.Scene {
  private idx = 0;
  private tool: Tool = 'wall';
  private walls: MapWall[] = [];
  private terrain: TerrainZone[] = [];
  private zoneGfx!: Phaser.GameObjects.Graphics;
  private bg?: Phaser.GameObjects.Image;
  private status!: Phaser.GameObjects.Text;
  private toolBtns: { tool: Tool; rect: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];
  private drawing = false;
  private sx = 0;
  private sy = 0;
  /** Currently selected zone (for rotate). */
  private sel: { kind: 'wall' | 'terrain'; idx: number } | null = null;

  constructor() {
    super('editor');
  }

  private corners(z: { x: number; y: number; w: number; h: number; rot?: number }): { x: number; y: number }[] {
    const a = ((z.rot ?? 0) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const hw = z.w / 2;
    const hh = z.h / 2;
    return [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ].map(([lx, ly]) => ({ x: z.x + lx * c - ly * s, y: z.y + lx * s + ly * c }));
  }

  private contains(px: number, py: number, z: { x: number; y: number; w: number; h: number; rot?: number }): boolean {
    const a = -((z.rot ?? 0) * Math.PI) / 180;
    const dx = px - z.x;
    const dy = py - z.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) <= z.w / 2 && Math.abs(ly) <= z.h / 2;
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
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  // ---- map switching ----

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
    const saved = getEdit(m.id);
    // Deep-copy so editing doesn't mutate the saved/default arrays
    this.walls = (saved?.walls ?? m.walls).map((w) => ({ ...w }));
    this.terrain = (saved?.terrain ?? m.terrain).map((t) => ({ ...t }));
    this.sel = null;
    this.redraw();
    this.updateStatus();
  }

  private save(): void {
    setEdit(MAPS[this.idx].id, { walls: this.walls, terrain: this.terrain });
    this.updateStatus();
  }

  // ---- drawing input ----

  private inCanvas(p: Phaser.Input.Pointer): boolean {
    return p.y > BAR && p.y < GAME_H - BAR;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.inCanvas(p)) return;
    if (this.tool === 'erase') {
      this.eraseAt(p.worldX, p.worldY);
      return;
    }
    if (this.tool === 'select') {
      this.selectAt(p.worldX, p.worldY);
      return;
    }
    this.drawing = true;
    this.sx = p.worldX;
    this.sy = p.worldY;
  }

  private selectAt(x: number, y: number): void {
    for (let i = this.terrain.length - 1; i >= 0; i--) {
      if (this.contains(x, y, this.terrain[i])) {
        this.sel = { kind: 'terrain', idx: i };
        this.redraw();
        return;
      }
    }
    for (let i = this.walls.length - 1; i >= 0; i--) {
      if (this.contains(x, y, this.walls[i])) {
        this.sel = { kind: 'wall', idx: i };
        this.redraw();
        return;
      }
    }
    this.sel = null;
    this.redraw();
  }

  private rotateSel(delta: number): void {
    if (!this.sel) return;
    const z = this.sel.kind === 'wall' ? this.walls[this.sel.idx] : this.terrain[this.sel.idx];
    if (!z) return;
    z.rot = Math.round((((z.rot ?? 0) + delta) % 360) * 10) / 10;
    this.save();
    this.redraw();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.drawing) return;
    this.redraw();
    // preview rectangle
    const g = this.zoneGfx;
    const c = TOOL_COLOR[this.tool as 'wall' | 'water' | 'lava'];
    const x = Math.min(this.sx, p.worldX);
    const y = Math.min(this.sy, p.worldY);
    const w = Math.abs(p.worldX - this.sx);
    const h = Math.abs(p.worldY - this.sy);
    g.fillStyle(c, 0.35);
    g.fillRect(x, y, w, h);
    g.lineStyle(3, c, 1);
    g.strokeRect(x, y, w, h);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (!this.drawing) return;
    this.drawing = false;
    const x = Math.min(this.sx, p.worldX);
    const y = Math.min(this.sy, p.worldY);
    const w = Math.abs(p.worldX - this.sx);
    const h = Math.abs(p.worldY - this.sy);
    if (w < 24 || h < 24) {
      this.redraw();
      return; // ignore stray taps
    }
    const zone = { x: Math.round(x + w / 2), y: Math.round(y + h / 2), w: Math.round(w), h: Math.round(h), rot: 0 };
    if (this.tool === 'wall') {
      this.walls.push(zone);
      this.sel = { kind: 'wall', idx: this.walls.length - 1 };
    } else {
      this.terrain.push({ kind: this.tool as 'water' | 'lava', ...zone });
      this.sel = { kind: 'terrain', idx: this.terrain.length - 1 };
    }
    this.save();
    this.redraw();
  }

  private eraseAt(x: number, y: number): void {
    for (let i = this.terrain.length - 1; i >= 0; i--) {
      if (this.contains(x, y, this.terrain[i])) {
        this.terrain.splice(i, 1);
        this.sel = null;
        this.save();
        this.redraw();
        return;
      }
    }
    for (let i = this.walls.length - 1; i >= 0; i--) {
      if (this.contains(x, y, this.walls[i])) {
        this.walls.splice(i, 1);
        this.sel = null;
        this.save();
        this.redraw();
        return;
      }
    }
  }

  // ---- rendering ----

  private redraw(): void {
    const g = this.zoneGfx;
    g.clear();
    const drawZone = (z: { x: number; y: number; w: number; h: number; rot?: number }, color: number, selected: boolean) => {
      const pts = this.corners(z);
      g.fillStyle(color, 0.32);
      g.fillPoints(pts, true);
      g.lineStyle(selected ? 5 : 3, selected ? 0xffffff : color, selected ? 1 : 0.95);
      g.strokePoints(pts, true, true);
      if (selected) {
        // little handle marking the "top" edge so rotation is readable
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        g.fillStyle(0xffff00, 1);
        g.fillCircle(mid.x, mid.y, 8);
      }
    };
    this.terrain.forEach((t, i) => drawZone(t, TOOL_COLOR[t.kind], this.sel?.kind === 'terrain' && this.sel.idx === i));
    this.walls.forEach((w, i) => drawZone(w, TOOL_COLOR.wall, this.sel?.kind === 'wall' && this.sel.idx === i));
  }

  // ---- toolbar ----

  private buildToolbar(): void {
    // Top status bar
    this.add.rectangle(GAME_W / 2, BAR / 2, GAME_W, BAR, 0x0c0c16, 0.9).setDepth(5);
    this.status = this.add
      .text(24, BAR / 2, '', { fontFamily: 'sans-serif', fontSize: '30px', color: '#e8ecf8' })
      .setOrigin(0, 0.5)
      .setDepth(6);

    // Bottom toolbar
    this.add.rectangle(GAME_W / 2, GAME_H - BAR / 2, GAME_W, BAR, 0x0c0c16, 0.92).setDepth(5);

    const tools: Tool[] = ['wall', 'water', 'lava', 'erase', 'select'];
    const btnW = 132;
    let x = 24;
    const y = GAME_H - BAR / 2;
    for (const t of tools) {
      const rect = this.add.rectangle(x + btnW / 2, y, btnW, 64, 0x222233, 1).setStrokeStyle(3, 0x556).setDepth(6).setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x + btnW / 2, y, t.toUpperCase(), { fontFamily: 'sans-serif', fontSize: '26px', fontStyle: 'bold', color: '#ffffff' })
        .setOrigin(0.5)
        .setDepth(7);
      rect.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.tool = t;
        this.refreshToolBtns();
      });
      this.toolBtns.push({ tool: t, rect, label });
      x += btnW + 12;
    }
    this.refreshToolBtns();

    // Right-side action buttons
    const actions: [string, number, () => void][] = [
      ['◀', 0x2a3a55, () => this.loadMap(this.idx - 1)],
      ['▶', 0x2a3a55, () => this.loadMap(this.idx + 1)],
      ['↺', 0x3a4a6a, () => this.rotateSel(-15)],
      ['↻', 0x3a4a6a, () => this.rotateSel(15)],
      ['UNDO', 0x3a3a55, () => this.undo()],
      ['CLEAR', 0x553030, () => this.clearThis()],
      ['COPY ALL', 0x2a553a, () => this.doExport()],
      ['PLAY', 0x1f6f4a, () => this.exit()],
    ];
    let ax = GAME_W - 24;
    for (const [txt, col, fn] of [...actions].reverse()) {
      const w = txt.length <= 2 ? 74 : 130;
      ax -= w;
      const rect = this.add.rectangle(ax + w / 2, y, w, 64, col, 1).setStrokeStyle(3, 0x667).setDepth(6).setInteractive({ useHandCursor: true });
      this.add.text(ax + w / 2, y, txt, { fontFamily: 'sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(7);
      rect.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        fn();
      });
      ax -= 12;
    }
  }

  private refreshToolBtns(): void {
    for (const b of this.toolBtns) {
      const active = b.tool === this.tool;
      const col = b.tool === 'erase' ? 0x883333 : b.tool === 'select' ? 0x3a5a8a : TOOL_COLOR[b.tool as 'wall' | 'water' | 'lava'];
      b.rect.setFillStyle(active ? col : 0x222233, 1);
      b.rect.setStrokeStyle(3, active ? 0xffffff : 0x556677);
      b.label.setColor(active && b.tool === 'wall' ? '#111111' : '#ffffff');
    }
  }

  private undo(): void {
    if (this.terrain.length || this.walls.length) {
      // remove whichever was added last isn't tracked; pop terrain then walls
      if (this.terrain.length) this.terrain.pop();
      else this.walls.pop();
      this.sel = null;
      this.save();
      this.redraw();
    }
  }

  private clearThis(): void {
    this.walls = [];
    this.terrain = [];
    this.sel = null;
    clearEdit(MAPS[this.idx].id);
    setEdit(MAPS[this.idx].id, { walls: [], terrain: [] });
    this.redraw();
    this.updateStatus();
  }

  private async doExport(): Promise<void> {
    const text = exportAll();
    try {
      await navigator.clipboard.writeText(text);
      this.flash('Copied ALL changes (maps + balance) to clipboard ✔  paste it to Claude');
    } catch {
      // eslint-disable-next-line no-console
      console.log(text);
      this.flash('Clipboard blocked — dumped to console (F12)');
    }
  }

  private exit(): void {
    this.scene.start('menu');
  }

  private updateStatus(): void {
    const m = MAPS[this.idx];
    this.status.setText(
      `Editor · ${m.name} (${this.idx + 1}/${MAPS.length}) · walls ${this.walls.length} · water/lava ${this.terrain.length} · drag to draw`,
    );
  }

  private flash(msg: string): void {
    const t = this.add
      .text(GAME_W / 2, GAME_H / 2, msg, {
        fontFamily: 'sans-serif',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#000000cc',
        padding: { x: 24, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.time.delayedCall(2200, () => t.destroy());
  }
}
