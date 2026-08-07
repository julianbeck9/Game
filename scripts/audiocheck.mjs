// Does the game actually make a sound?
//
// A silent audio layer is invisible to every other check in this repo: it
// throws nothing, renders nothing and leaks nothing, so `verify` stays green
// while the game plays in total silence. That is not hypothetical — WebAudio
// needs a user gesture, and `initAudio` hangs off the arena's input handlers,
// so a first attempt at this probe measured zero voices purely because the
// synthetic click landed on the menu scene instead of the arena.
//
// This instruments AudioContext BEFORE the page loads and counts voices that
// actually reach .start(), which is the only evidence that survives being
// wrong about the rest.
//
//   node scripts/audiocheck.mjs
import pkg from 'playwright';

const { chromium } = pkg;
const PORT = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '5173';

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.addInitScript(() => {
  window.__A = { ctx: 0, osc: 0, buf: 0, started: 0, filters: 0, comp: 0 };
  const Orig = window.AudioContext;
  window.AudioContext = function (...a) { window.__A.ctx++; return new Orig(...a); };
  window.AudioContext.prototype = Orig.prototype;
  const P = Orig.prototype;
  const taps = [
    ['createOscillator', 'osc'],
    ['createBufferSource', 'buf'],
    ['createBiquadFilter', 'filters'],
    ['createDynamicsCompressor', 'comp'],
  ];
  for (const [m, k] of taps) {
    const o = P[m];
    P[m] = function (...a) { window.__A[k]++; return o.apply(this, a); };
  }
  const os = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...a) { window.__A.started++; return os.apply(this, a); };
  const bs = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { window.__A.started++; return bs.apply(this, a); };
});

await page.goto(`http://localhost:${PORT}/`);
await page.waitForFunction(() => !!window.__CC, undefined, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  window.__CC.autopilot(true);
  window.__CC.reset();
  window.__CC.goto(5);
});
await page.waitForTimeout(1800);
// The gesture has to land inside the arena — that is where initAudio is bound.
await page.mouse.click(600, 350);
await page.waitForTimeout(500);
const before = await page.evaluate(() => ({ ...window.__A }));
await page.waitForTimeout(9000);
const after = await page.evaluate(() => ({ ...window.__A }));

const voices = after.started - before.started;
const noiseLayers = after.buf - before.buf;
console.log(`[audio] voices started in a 9s fight: ${voices}`);
console.log(`[audio] noise bursts among them:      ${noiseLayers}`);
console.log(`[audio] compressors (expect 1):       ${after.comp}`);
if (errors.length) console.log('[audio] console errors:', errors.slice(0, 4));

// A fight with no voices means the whole sound design is dead on arrival.
// Noise bursts specifically prove the LAYERED path runs, not just the old
// single-oscillator one — an important distinction, since a regression that
// silently fell back to bare tones would still count voices.
//
// The thresholds are deliberately far below what a healthy run produces.
// Two observed runs gave 68 and 17 voices: the count depends entirely on how
// much fighting the bot happens to get done in nine seconds, so a bound set
// near the observed minimum would fail on luck rather than on a defect. This
// check answers "is the audio alive", not "is it loud enough".
const ok = voices >= 8 && noiseLayers >= 3 && errors.length === 0;
console.log(ok ? '[audio] PASS' : '[audio] FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
