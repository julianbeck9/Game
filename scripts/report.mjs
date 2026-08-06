// Builds quality-report.html: every captured screenshot set side by side with
// the baseline, plus each area's critic verdict.
//
//   node scripts/report.mjs
//
// Screenshot sets live in shots/<name>/ (see scripts/shots.mjs). Critic verdicts
// live in shots/verdicts.json, written by hand or by the orchestrator as critic
// agents report back.
//
// The reference column is deliberately TEXT, not images: we cannot ship
// screenshots of Hades/Gungeon/Skul, and a report that pretended to would be
// worse than one that states the criteria plainly.
import { readdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const OUT = path.join(ROOT, 'quality-report.html');

const SCENES = [
  ['01-menu', 'Champion select'],
  ['02-fight-early', 'Combat · early round'],
  ['03-fight-mid', 'Combat · mid round'],
  ['04-fight-late', 'Combat · late round'],
  ['05-fight-crowd', 'Combat · crowded'],
  ['06-pick', 'Augment pick'],
  ['07-shop', 'Shop'],
];

/** What the reference does, per scene. The bar each shot is judged against. */
const REFERENCE = {
  '01-menu':
    'Hades character/boon screens: heavy framing, depth, material (metal, stone, cloth), hover states with motion. Never a flat grid of boxes on a flat background.',
  '02-fight-early':
    'Gungeon/Hades: the player reads instantly, enemies read instantly, floor has texture and reacts. Lighting establishes mood; nothing is uniformly lit.',
  '03-fight-mid':
    'Mid-fight the screen is busy but never confusing — telegraphs cut through effects, hits throw directional debris, the floor carries scorch history.',
  '04-fight-late':
    'Effects stack without becoming soup. Silhouettes hold. Damage feedback stays legible at volume.',
  '05-fight-crowd':
    'Crowds read as individual threats, not a blob. Depth sorting and contact shadows separate overlapping bodies.',
  '06-pick':
    'Hades boon screen: each choice is a designed card with rarity language, iconography and motion. The choice feels like an event.',
  '07-shop':
    'Gungeon shop / Hades well: a place with character, not a row of rectangles. Items have icons with identity.',
};

function dirsIn(p) {
  if (!existsSync(p)) return [];
  return readdirSync(p).filter((d) => statSync(path.join(p, d)).isDirectory());
}

const sets = dirsIn(SHOTS).filter((d) => d !== 'baseline').sort();
const verdictsPath = path.join(SHOTS, 'verdicts.json');
const verdicts = existsSync(verdictsPath) ? JSON.parse(readFileSync(verdictsPath, 'utf8')) : {};

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const statusChip = (v) => {
  if (!v) return '<span class="chip pending">no verdict yet</span>';
  const s = (v.status ?? 'open').toLowerCase();
  const cls = s === 'passed' ? 'passed' : s === 'close' ? 'close' : 'open';
  const label = s === 'passed' ? 'critic: indistinguishable' : s === 'close' ? 'critic: close' : 'critic: gap remains';
  return `<span class="chip ${cls}">${label}</span>`;
};

let body = '';
for (const set of sets) {
  const v = verdicts[set];
  body += `<section class="area"><h2>${esc(set)} ${statusChip(v)}</h2>`;
  if (v?.summary) body += `<p class="summary">${esc(v.summary)}</p>`;
  if (v?.gaps?.length) {
    body += '<div class="gaps"><h3>Named gaps against the reference</h3><ul>';
    for (const g of v.gaps) body += `<li>${esc(g)}</li>`;
    body += '</ul></div>';
  }
  for (const [file, title] of SCENES) {
    const after = path.join(SHOTS, set, `${file}.png`);
    if (!existsSync(after)) continue;
    const before = path.join(SHOTS, 'baseline', `${file}.png`);
    body += `<div class="row"><h4>${esc(title)}</h4><div class="cols">`;
    body += `<figure><figcaption>Before (baseline)</figcaption>${
      existsSync(before) ? `<img src="shots/baseline/${file}.png" loading="lazy">` : '<div class="missing">not captured</div>'
    }</figure>`;
    body += `<figure><figcaption>After (${esc(set)})</figcaption><img src="shots/${esc(set)}/${file}.png" loading="lazy"></figure>`;
    body += `<figure class="ref"><figcaption>Reference bar</figcaption><div class="reftext">${esc(
      REFERENCE[file] ?? '',
    )}</div></figure>`;
    body += '</div></div>';
  }
  body += '</section>';
}

if (!sets.length) body = '<p class="summary">No screenshot sets yet. Run <code>node scripts/shots.mjs --out shots/&lt;name&gt;</code>.</p>';

const html = `<!doctype html>
<meta charset="utf-8">
<title>Crown &amp; Clash — Quality Pass</title>
<style>
  :root { color-scheme: dark; --bg:#0d0d14; --panel:#15151f; --line:#2a2a3a; --ink:#e8e8f0; --dim:#9a9ab0; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.55 system-ui, sans-serif; }
  header { padding:28px 32px; border-bottom:1px solid var(--line); }
  h1 { margin:0 0 6px; font-size:26px; }
  header p { margin:0; color:var(--dim); max-width:70ch; }
  section.area { padding:26px 32px; border-bottom:1px solid var(--line); }
  h2 { font-size:20px; margin:0 0 10px; display:flex; align-items:center; gap:12px; }
  h3 { font-size:14px; text-transform:uppercase; letter-spacing:.06em; color:var(--dim); margin:16px 0 6px; }
  h4 { font-size:15px; margin:22px 0 8px; color:var(--dim); font-weight:600; }
  .summary { color:var(--dim); max-width:80ch; }
  .gaps ul { margin:0; padding-left:20px; } .gaps li { margin:3px 0; }
  .cols { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px; }
  figure { margin:0; background:var(--panel); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  figcaption { padding:8px 12px; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--dim); border-bottom:1px solid var(--line); }
  img { display:block; width:100%; height:auto; }
  .reftext { padding:14px; color:var(--dim); font-size:14px; }
  .missing { padding:40px 14px; text-align:center; color:var(--dim); }
  .chip { font-size:11px; text-transform:uppercase; letter-spacing:.06em; padding:4px 10px; border-radius:999px; border:1px solid; }
  .chip.pending { color:#8a8aa0; border-color:#3a3a50; }
  .chip.open { color:#ff9a7a; border-color:#7a3a2a; background:#2a1512; }
  .chip.close { color:#ffd24a; border-color:#7a6320; background:#2a2412; }
  .chip.passed { color:#7ee08a; border-color:#2a6a35; background:#122a18; }
  code { background:#20202c; padding:2px 5px; border-radius:4px; }
</style>
<header>
  <h1>Crown &amp; Clash — Quality Pass</h1>
  <p>Before / after / reference bar per area. The reference column is written criteria rather than
  screenshots of Hades, Gungeon and Skul — we cannot ship those images, and a comparison that faked
  them would be worth less than one that states the bar plainly. An area counts as done only when its
  critic states it can no longer name a qualitative gap.</p>
  <p style="margin-top:8px">Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</p>
</header>
${body}
`;

writeFileSync(OUT, html, 'utf8');
console.log(`[report] wrote ${OUT} (${sets.length} set(s))`);
