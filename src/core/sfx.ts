/**
 * Tiny synthesized SFX — no assets, never blocking. Every call is safe to
 * fail silently (autoplay policies, missing WebAudio, etc.).
 */

let actx: AudioContext | null = null;

/** Call from a user-gesture handler; no-op if already running. */
export function initAudio(): void {
  try {
    if (!actx) actx = new AudioContext();
    if (actx.state === 'suspended') void actx.resume();
  } catch {
    actx = null;
  }
}

function tone(
  freq: number,
  durS: number,
  type: OscillatorType = 'square',
  vol = 0.06,
  slideHz = 0,
): void {
  try {
    if (!actx || actx.state !== 'running') return;
    const t0 = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideHz !== 0) osc.frequency.linearRampToValueAtTime(Math.max(30, freq + slideHz), t0 + durS);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    osc.connect(gain).connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + durS + 0.02);
  } catch {
    // sound is garnish, never a crash
  }
}

export const sfx = {
  hit: () => tone(240, 0.05, 'square', 0.03, -80),
  cast: () => tone(440, 0.09, 'triangle', 0.05, 260),
  dash: () => tone(700, 0.12, 'sine', 0.05, -450),
  hurt: () => tone(150, 0.12, 'square', 0.05, -50),
  kill: () => {
    tone(110, 0.22, 'sawtooth', 0.07, -50);
    tone(55, 0.3, 'sine', 0.08, -20);
  },
  pick: () => {
    tone(523, 0.1, 'triangle', 0.05);
    setTimeout(() => tone(784, 0.14, 'triangle', 0.05), 90);
  },
  victory: () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.06), i * 140));
  },
  defeat: () => {
    [330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.05), i * 180));
  },
};
