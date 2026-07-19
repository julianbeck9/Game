// Headless boot check: serves the built dist/, boots the game in Chromium for
// both renderers (webgl + canvas), and fails if the console logs errors or the
// arena scene leaks display objects across a played round.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'playwright';

const { chromium } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const PORT = 4196;
const LEAK_TOLERANCE = 40;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let filePath = path.join(distDir, urlPath === '/' ? 'index.html' : urlPath);
      if (!filePath.startsWith(distDir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      let data;
      try {
        data = await readFile(filePath);
      } catch {
        filePath = path.join(distDir, 'index.html');
        data = await readFile(filePath);
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      res.end(data);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  return new Promise((resolve) => {
    server.listen(PORT, () => resolve(server));
  });
}

async function checkRenderer(browser, renderer) {
  const errors = [];
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });

  await page.goto(`http://localhost:${PORT}/index.html?renderer=${renderer}`);
  await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 20000 });
  // Let the menu scene's own preload (champion + map thumbnails) finish before
  // jumping straight into the arena, otherwise its in-flight image loads race
  // with the arena's own asset requests and Phaser logs bogus duplicate-key
  // texture errors that have nothing to do with the code under test.
  await page.waitForTimeout(1000);

  await page.evaluate(() => window.__CC.goto(1));
  await page.waitForTimeout(300);
  const start = await page.evaluate(() => window.__CC.arena().children.list.length);

  await page.waitForTimeout(2000);
  // let in-flight VFX (particles, tweened text, hit-flashes) finish clearing
  await page.waitForTimeout(1500);
  const end = await page.evaluate(() => window.__CC.arena().children.list.length);

  await page.close();

  const leaked = end > start + LEAK_TOLERANCE;
  return { renderer, errors, start, end, leaked, pass: errors.length === 0 && !leaked };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  let allPass = true;
  try {
    for (const renderer of ['webgl', 'canvas']) {
      const result = await checkRenderer(browser, renderer);
      const status = result.pass ? 'PASS' : 'FAIL';
      console.log(`[verify] ${renderer}: ${status} (objects ${result.start} -> ${result.end})`);
      for (const e of result.errors) console.log(`  ${e}`);
      if (result.leaked) {
        console.log(`  [leak] ${result.end} > ${result.start} + ${LEAK_TOLERANCE}`);
      }
      if (!result.pass) allPass = false;
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (allPass) {
    console.log('[verify] all renderers passed, 0 console errors, no leak');
    process.exit(0);
  } else {
    console.log('[verify] FAILED');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[verify] crashed:', err);
  process.exit(1);
});
