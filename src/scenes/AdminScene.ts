import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config';
import { CHAMPIONS } from '../champions/registry';
import { AUGMENTS } from '../augments/registry';
import { ITEMS } from '../items/registry';
import type { StatName } from '../core/stats';
import { setChampBase, setItemCost, setStatMod, toggleDeleted, isDeleted, exportBalance } from '../core/balance';
import { setAdmin } from '../core/admin';

type Tab = 'champ' | 'item' | 'augment';

// [fine, coarse] step per numeric field
const STEP: Record<string, [number, number]> = {
  maxHP: [10, 50], damage: [1, 10], abilityPower: [2, 10], attackSpeed: [0.05, 0.2],
  critChance: [0.05, 0.1], armor: [2, 10], magicResist: [2, 10], moveSpeed: [5, 25],
  attackRange: [10, 50], abilityHaste: [5, 20], projSpeed: [50, 200], lifesteal: [0.02, 0.1],
  abilityDamage: [0.05, 0.2], cost: [10, 50], flat: [1, 10], pct: [0.05, 0.2],
};

const PAGE = 8;

export class AdminScene extends Phaser.Scene {
  private tab: Tab = 'champ';
  private page = 0;
  private sel: string | null = null; // selected entity id (detail view)
  private dyn: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('admin');
  }

  create(): void {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0a0a12, 1);
    this.render();
  }

  private clearDyn(): void {
    this.dyn.forEach((o) => o.destroy());
    this.dyn = [];
  }

  /** Tracked text: destroyed on the next render() so nothing stacks. */
  private txt(x: number, y: number, s: string, style: Phaser.Types.GameObjects.Text.TextStyle, ox = 0, oy = 0): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, s, style).setOrigin(ox, oy).setDepth(1);
    this.dyn.push(t);
    return t;
  }

  private list(): { id: string; name: string }[] {
    if (this.tab === 'champ') return CHAMPIONS.map((c) => ({ id: c.id, name: c.name }));
    if (this.tab === 'item') return ITEMS.map((i) => ({ id: i.id, name: i.name }));
    return AUGMENTS.map((a) => ({ id: a.id, name: a.name }));
  }

  private step(step: number, label: string, x: number, y: number, w: number, color: number, fn: () => void): void {
    const r = this.add.rectangle(x + w / 2, y, w, 46, color, 1).setStrokeStyle(2, 0x667).setInteractive({ useHandCursor: true });
    const t = this.add.text(x + w / 2, y, label, { fontFamily: 'sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5);
    r.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      fn();
      this.render();
    });
    void step;
    this.dyn.push(r, t);
  }

  private btn(label: string, x: number, y: number, w: number, color: number, fn: () => void): void {
    const r = this.add.rectangle(x + w / 2, y, w, 56, color, 1).setStrokeStyle(3, 0x778).setInteractive({ useHandCursor: true });
    const t = this.add.text(x + w / 2, y, label, { fontFamily: 'sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5);
    r.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      fn();
    });
    this.dyn.push(r, t);
  }

  private fmt(v: number): string {
    return Number.isInteger(v) ? `${v}` : v.toFixed(2);
  }

  // A value row: [«][‹]  label: value  [›][»]
  private valueRow(y: number, label: string, value: number, field: string, apply: (v: number) => void): void {
    const [fine, coarse] = STEP[field] ?? [1, 10];
    this.txt(80, y, `${label}`, { fontFamily: 'sans-serif', fontSize: '26px', color: '#b8c0d4' }, 0, 0.5);
    this.txt(660, y, this.fmt(value), { fontFamily: 'monospace', fontSize: '28px', fontStyle: 'bold', color: '#ffe28a' }, 0.5, 0.5);
    this.step(coarse, '«', 760, y, 60, 0x33334a, () => apply(value - coarse));
    this.step(fine, '‹', 826, y, 60, 0x33334a, () => apply(value - fine));
    this.step(fine, '›', 892, y, 60, 0x2a4a3a, () => apply(value + fine));
    this.step(coarse, '»', 958, y, 60, 0x2a4a3a, () => apply(value + coarse));
  }

  private render(): void {
    this.clearDyn();
    // Header
    this.txt(40, 40, 'Admin · Balance', { fontFamily: 'Georgia, serif', fontSize: '44px', fontStyle: 'bold', color: '#fff' });

    // Top action row
    this.btn('🛠 Map Editor', 40, 110, 220, 0x1e2a44, () => this.scene.start('editor'));
    this.btn('Export', 280, 110, 150, 0x2a553a, () => this.doExport());
    this.btn('Admin: OFF', 448, 110, 200, 0x553030, () => { setAdmin(false); this.scene.start('menu'); });
    this.btn('◀ Menu', 668, 110, 150, 0x2a3a55, () => this.scene.start('menu'));

    if (this.sel) {
      this.renderDetail();
      return;
    }

    // Tabs
    const tabs: [Tab, string][] = [['champ', 'Champions'], ['item', 'Items'], ['augment', 'Augments']];
    let tx = 40;
    for (const [t, label] of tabs) {
      this.btn(label, tx, 190, 220, this.tab === t ? 0x3a5a8a : 0x222233, () => { this.tab = t; this.page = 0; this.render(); });
      tx += 232;
    }

    // List
    const all = this.list();
    const start = this.page * PAGE;
    const shown = all.slice(start, start + PAGE);
    let y = 280;
    for (const e of shown) {
      const gone = isDeleted(e.id);
      const r = this.add.rectangle(GAME_W / 2, y + 24, GAME_W - 80, 56, gone ? 0x2a1414 : 0x161622, 1).setStrokeStyle(2, 0x33334a).setInteractive({ useHandCursor: true });
      const t = this.add.text(80, y + 24, `${e.name}${gone ? '  (deleted)' : ''}`, { fontFamily: 'sans-serif', fontSize: '28px', color: gone ? '#a06060' : '#e8ecf8' }).setOrigin(0, 0.5);
      r.on('pointerdown', () => { this.sel = e.id; this.render(); });
      this.dyn.push(r, t);
      y += 66;
    }

    // Pager
    const pages = Math.ceil(all.length / PAGE);
    this.btn('‹ Prev', 40, GAME_H - 60, 150, 0x2a3a55, () => { this.page = (this.page - 1 + pages) % pages; this.render(); });
    this.btn('Next ›', 210, GAME_H - 60, 150, 0x2a3a55, () => { this.page = (this.page + 1) % pages; this.render(); });
    this.txt(400, GAME_H - 60, `Page ${this.page + 1}/${pages} · ${all.length} entries`, { fontFamily: 'sans-serif', fontSize: '24px', color: '#8a94b0' }, 0, 0.5);
  }

  private renderDetail(): void {
    const id = this.sel!;
    this.btn('◀ Back to list', 40, 190, 260, 0x2a3a55, () => { this.sel = null; this.render(); });

    if (this.tab === 'champ') {
      const c = CHAMPIONS.find((x) => x.id === id)!;
      this.txt(GAME_W / 2, 200, `${c.name} — base stats`, { fontFamily: 'Georgia, serif', fontSize: '36px', fontStyle: 'bold', color: '#fff' }, 0.5, 0.5);
      let y = 290;
      for (const key of Object.keys(c.base) as StatName[]) {
        this.valueRow(y, key, c.base[key] ?? 0, key, (v) => setChampBase(id, key, Math.round(v * 100) / 100));
        y += 58;
      }
      this.txt(80, y + 10, 'Ability damage scales with these (damage / abilityPower / abilityDamage).', { fontFamily: 'sans-serif', fontSize: '22px', color: '#8a94b0' });
      return;
    }

    // item / augment
    const def = (this.tab === 'item' ? ITEMS : AUGMENTS).find((d) => d.id === id)!;
    const isItem = this.tab === 'item';
    this.txt(GAME_W / 2, 200, `${def.name}`, { fontFamily: 'Georgia, serif', fontSize: '36px', fontStyle: 'bold', color: '#fff' }, 0.5, 0.5);
    this.txt(GAME_W / 2, 238, def.description, { fontFamily: 'sans-serif', fontSize: '20px', color: '#b8c0d4', wordWrap: { width: 1200 }, align: 'center' }, 0.5, 0);
    let y = 320;
    if (isItem) {
      const cost = ITEMS.find((x) => x.id === id)!.cost;
      this.valueRow(y, 'Gold cost', cost, 'cost', (v) => setItemCost(id, Math.max(0, Math.round(v))));
      y += 62;
    }
    if (def.statMods?.length) {
      def.statMods.forEach((m, i) => {
        if (m.flat !== undefined) { this.valueRow(y, `${m.stat} flat`, m.flat, 'flat', (v) => setStatMod(id, i, 'flat', Math.round(v * 100) / 100)); y += 58; }
        if (m.pct !== undefined) { this.valueRow(y, `${m.stat} %`, m.pct, 'pct', (v) => setStatMod(id, i, 'pct', Math.round(v * 1000) / 1000)); y += 58; }
      });
    } else {
      this.txt(80, y, 'No stat numbers here (effect is coded in the hook).', { fontFamily: 'sans-serif', fontSize: '24px', color: '#8a94b0' });
      y += 50;
    }
    const gone = isDeleted(id);
    this.btn(gone ? 'Restore' : 'Delete', 80, y + 30, 220, gone ? 0x2a553a : 0x883030, () => { toggleDeleted(id); this.render(); });
  }

  private async doExport(): Promise<void> {
    const text = exportBalance();
    try {
      await navigator.clipboard.writeText(text);
      this.flash('Balance changes copied to clipboard ✔ (paste to Claude)');
    } catch {
      // eslint-disable-next-line no-console
      console.log('=== BALANCE EXPORT ===\n' + text);
      this.flash('Clipboard blocked — dumped to console');
    }
  }

  private flash(msg: string): void {
    const t = this.add
      .text(GAME_W / 2, GAME_H - 130, msg, {
        fontFamily: 'sans-serif', fontSize: '30px', fontStyle: 'bold',
        color: '#fff', backgroundColor: '#000000cc', padding: { x: 20, y: 14 },
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.time.delayedCall(2400, () => t.destroy());
  }
}
