import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { MAPS, MAP_IMAGE_KEYS, MapWall, TerrainZone } from '../core/maps';
import { getEdit, setEdit, clearEdit, exportEdits } from '../core/mapEdits';

type Tool = 'wall' | 'water' | 'lava' | 'erase';

const TOOL_COLOR: Record<Exclude<Tool, 'erase'>, number> = {
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
    this.drawing = true;
    this.sx = p.worldX;
    this.sy = p.worldY;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.drawing) return;
    this.redraw();
    // preview rectangle
    const g = this.zoneGfx;
    const c = TOOL_COLOR[this.tool as Exclude<Tool, 'erase'>];
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
    const zone = { x: Math.round(x + w / 2), y: Math.round(y + h / 2), w: Math.round(w), h: Math.round(h) };
    if (this.tool === 'wall') this.walls.push(zone);
    else this.terrain.push({ kind: this.tool as 'water' | 'lava', ...zone });
    this.save();
    this.redraw();
  }

  private eraseAt(x: number, y: number): void {
    const hit = (z: { x: number; y: number; w: number; h: number }) =>
      Math.abs(x - z.x) <= z.w / 2 && Math.abs(y - z.y) <= z.h / 2;
    // topmost (last drawn) first
    for (let i = this.terrain.length - 1; i >= 0; i--) {
      if (hit(this.terrain[i])) {
        this.terrain.splice(i, 1);
        this.save();
        this.redraw();
        return;
      }
    }
    for (let i = this.walls.length - 1; i >= 0; i--) {
      if (hit(this.walls[i])) {
        this.walls.splice(i, 1);
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
    const drawRect = (z: { x: number; y: number; w: number; h: number }, color: number, tag: string) => {
      const x = z.x - z.w / 2;
      const y = z.y - z.h / 2;
      g.fillStyle(color, 0.32);
      g.fillRect(x, y, z.w, z.h);
      g.lineStyle(3, color, 0.95);
      g.strokeRect(x, y, z.w, z.h);
      void tag;
    };
    for (const t of this.terrain) drawRect(t, TOOL_COLOR[t.kind], t.kind);
    for (const w of this.walls) drawRect(w, TOOL_COLOR.wall, 'W');
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

    const tools: Tool[] = ['wall', 'water', 'lava', 'erase'];
    const btnW = 150;
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
      ['UNDO', 0x3a3a55, () => this.undo()],
      ['CLEAR', 0x553030, () => this.clearThis()],
      ['EXPORT', 0x2a553a, () => this.doExport()],
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
      const col = b.tool === 'erase' ? 0x883333 : TOOL_COLOR[b.tool as Exclude<Tool, 'erase'>];
      b.rect.setFillStyle(active ? col : 0x222233, 1);
      b.rect.setStrokeStyle(3, active ? 0xffffff : 0x556677);
      b.label.setColor(active && b.tool !== 'wall' ? '#ffffff' : active ? '#111111' : '#ffffff');
    }
  }

  private undo(): void {
    if (this.terrain.length || this.walls.length) {
      // remove whichever was added last isn't tracked; pop terrain then walls
      if (this.terrain.length) this.terrain.pop();
      else this.walls.pop();
      this.save();
      this.redraw();
    }
  }

  private clearThis(): void {
    this.walls = [];
    this.terrain = [];
    clearEdit(MAPS[this.idx].id);
    setEdit(MAPS[this.idx].id, { walls: [], terrain: [] });
    this.redraw();
    this.updateStatus();
  }

  private async doExport(): Promise<void> {
    const text = exportEdits();
    try {
      await navigator.clipboard.writeText(text);
      this.flash('Copied all map collision to clipboard ✔  (paste it to Claude)');
    } catch {
      // eslint-disable-next-line no-console
      console.log('=== MAP COLLISION EXPORT ===\n' + text);
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
