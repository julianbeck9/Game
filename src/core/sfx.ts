/**
 * Synthesized SFX. No assets, never blocking, every call safe to fail silently
 * (autoplay policies, missing WebAudio, jsdom under test).
 *
 * What was here before: one oscillator per event, a fixed frequency, an
 * exponential fade, peak gain 0.03–0.08. Every hit in the game played the same
 * 50ms square-wave blip regardless of whether it took 3% or 60% of a health
 * bar. That is the audio equivalent of the flat impact `core/impact.ts` was
 * written to fix, and it is a large part of why the game "sounds the same"
 * however much the visuals change — half of what a player calls *feel* arrives
 * through the speakers, and a blip has no weight to give.
 *
 * The rebuild keeps the constraint (no asset files) and changes the method:
 *
 * - **Layers, not tones.** A real impact is a transient (noise, a few ms), a
 *   body (a pitched thump that drops) and, when it is heavy, a sub. One
 *   oscillator can be any one of those and never all three.
 * - **Severity drives it**, read from the same `severityOf` the hit-stop,
 *   shake, kick and particles already use — so a blow that freezes the screen
 *   also lands low and long in the ear, instead of the two disagreeing.
 * - **Detuned per shot.** Fixed pitch is what makes repeated hits read as a
 *   machine gun rather than as combat.
 * - **Voice-capped and rate-limited.** Eight enemies hit in one frame used to
 *   be eight identical blips at the same instant, which sums to a click and
 *   clips. Now near-simultaneous repeats of the same cue are dropped.
 *
 * Everything runs through one compressor so a busy fight stays audible without
 * the peaks tearing.
 */

let actx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

/** Global headroom. The compressor below catches the rest. */
const MASTER_GAIN = 0.5;

/** Hard ceiling on voices started in one frame — past this it is mush anyway. */
const MAX_VOICES_PER_FRAME = 5;
let voicesThisFrame = 0;
let frameStamp = 0;

/** Per-cue throttle, in ms. Two of the same cue closer than this = one cue. */
const lastPlayed = new Map<string, number>();

/** Call from a user-gesture handler; no-op if already running. */
export function initAudio(): void {
  try {
    if (!actx) {
      actx = new AudioContext();
      // Limiter first, then the master trim: a fight with six enemies dying at
      // once should duck, not clip.
      const comp = actx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-16, actx.currentTime);
      comp.knee.setValueAtTime(22, actx.currentTime);
      comp.ratio.setValueAtTime(9, actx.currentTime);
      comp.attack.setValueAtTime(0.003, actx.currentTime);
      comp.release.setValueAtTime(0.14, actx.currentTime);
      master = actx.createGain();
      master.gain.setValueAtTime(MASTER_GAIN, actx.currentTime);
      master.connect(comp).connect(actx.destination);

      // One second of white noise, reused by every transient. Generating it
      // per shot would allocate a buffer on every sword swing.
      const n = Math.floor(actx.sampleRate);
      noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') void actx.resume();
  } catch {
    actx = null;
    master = null;
  }
}

/** True when a voice may start: audio is live, and we are inside the budget. */
function budget(cue: string, minGapMs: number): boolean {
  if (!actx || !master || actx.state !== 'running') return false;
  const nowMs = actx.currentTime * 1000;
  const prev = lastPlayed.get(cue);
  if (prev !== undefined && nowMs - prev < minGapMs) return false;
  lastPlayed.set(cue, nowMs);
  // Frames are ~16ms; anything inside that window counts as simultaneous.
  const f = Math.floor(nowMs / 16);
  if (f !== frameStamp) {
    frameStamp = f;
    voicesThisFrame = 0;
  }
  if (voicesThisFrame >= MAX_VOICES_PER_FRAME) return false;
  voicesThisFrame++;
  return true;
}

interface NoiseOpts {
  dur: number;
  vol: number;
  type?: BiquadFilterType;
  freq: number;
  /** Sweep the filter to this frequency across the life of the burst. */
  freqTo?: number;
  q?: number;
  /** Fraction of the duration spent rising to peak. Small = a crack. */
  attack?: number;
  delay?: number;
}

/** A filtered noise burst — the transient half of any impact. */
function noise(o: NoiseOpts): void {
  if (!actx || !master || !noiseBuf) return;
  const t0 = actx.currentTime + (o.delay ?? 0);
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.setValueAtTime(0.7 + Math.random() * 0.6, t0);

  const filt = actx.createBiquadFilter();
  filt.type = o.type ?? 'bandpass';
  filt.frequency.setValueAtTime(o.freq, t0);
  if (o.freqTo !== undefined) {
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.freqTo), t0 + o.dur);
  }
  filt.Q.setValueAtTime(o.q ?? 1, t0);

  const g = actx.createGain();
  const atk = Math.max(0.001, o.dur * (o.attack ?? 0.04));
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

  src.connect(filt).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + o.dur + 0.02);
}

interface ToneOpts {
  f0: number;
  f1?: number;
  dur: number;
  vol: number;
  type?: OscillatorType;
  attack?: number;
  delay?: number;
  /** Exponential pitch slides read as impact; linear reads as a siren. */
  linear?: boolean;
}

/** A pitched layer — the body or the sub. */
function tone(o: ToneOpts): void {
  if (!actx || !master) return;
  const t0 = actx.currentTime + (o.delay ?? 0);
  const osc = actx.createOscillator();
  osc.type = o.type ?? 'triangle';
  osc.frequency.setValueAtTime(o.f0, t0);
  if (o.f1 !== undefined) {
    const to = Math.max(20, o.f1);
    if (o.linear) osc.frequency.linearRampToValueAtTime(to, t0 + o.dur);
    else osc.frequency.exponentialRampToValueAtTime(to, t0 + o.dur);
  }
  const g = actx.createGain();
  const atk = Math.max(0.0008, o.dur * (o.attack ?? 0.03));
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

/** ±`cents` of random detune as a frequency multiplier. */
function vary(cents: number): number {
  return Math.pow(2, ((Math.random() * 2 - 1) * cents) / 1200);
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export const sfx = {
  /**
   * Weapon connects. `sev` is the shared 0..1 severity; at 0 this is a light
   * tick high in the spectrum, at 1 it is a low crack with a sub under it.
   */
  hit: (sev = 0.25): void => {
    const s = clamp01(sev);
    if (!budget('hit', 28)) return;
    const p = vary(140);
    // Transient: the crack. Brighter and shorter for glancing blows.
    noise({
      dur: 0.05 + s * 0.07,
      vol: 0.16 + s * 0.2,
      type: 'highpass',
      freq: (2600 - s * 1500) * p,
      freqTo: (700 - s * 350) * p,
      attack: 0.02,
      q: 0.7,
    });
    // Body: a pitched thump that falls. This is what carries the size.
    tone({
      f0: (330 - s * 170) * p,
      f1: (110 - s * 55) * p,
      dur: 0.09 + s * 0.13,
      vol: 0.1 + s * 0.16,
      type: 'triangle',
    });
    // Sub: only heavy blows get one, so it stays a signal rather than a mud.
    if (s > 0.4) {
      tone({ f0: 84 * p, f1: 44, dur: 0.16 + s * 0.16, vol: 0.14 + s * 0.16, type: 'sine' });
    }
  },

  /** Ability connects: same anatomy as `hit`, tuned brighter so it reads apart. */
  abilityHit: (sev = 0.4): void => {
    const s = clamp01(sev);
    if (!budget('abilityHit', 32)) return;
    const p = vary(120);
    noise({
      dur: 0.09 + s * 0.11,
      vol: 0.14 + s * 0.18,
      type: 'bandpass',
      freq: 3200 * p,
      freqTo: 500,
      q: 1.4,
      attack: 0.03,
    });
    tone({ f0: 460 * p, f1: 120, dur: 0.16 + s * 0.14, vol: 0.11 + s * 0.14, type: 'sawtooth' });
    if (s > 0.3) tone({ f0: 96 * p, f1: 40, dur: 0.22, vol: 0.15 + s * 0.14, type: 'sine' });
  },

  /** Spell leaves the hand: a rising body with air moving over it. */
  cast: (): void => {
    if (!budget('cast', 45)) return;
    const p = vary(90);
    tone({ f0: 220 * p, f1: 660 * p, dur: 0.16, vol: 0.13, type: 'triangle', attack: 0.16 });
    noise({ dur: 0.2, vol: 0.09, type: 'bandpass', freq: 700, freqTo: 3400, q: 2.2, attack: 0.3 });
  },

  /** Dash: air, not a tone. A pitched blip here reads as a menu sound. */
  dash: (): void => {
    if (!budget('dash', 60)) return;
    noise({ dur: 0.24, vol: 0.16, type: 'bandpass', freq: 480, freqTo: 2600, q: 1.1, attack: 0.22 });
    tone({ f0: 150, f1: 60, dur: 0.14, vol: 0.08, type: 'sine' });
  },

  /**
   * The player is hit. Deliberately the loudest, dirtiest cue in the set: it
   * is the one piece of information the player must never miss.
   */
  hurt: (sev = 0.4): void => {
    const s = clamp01(sev);
    if (!budget('hurt', 55)) return;
    noise({ dur: 0.16, vol: 0.2 + s * 0.16, type: 'lowpass', freq: 1400, freqTo: 300, q: 0.8, attack: 0.02 });
    tone({ f0: 200, f1: 62, dur: 0.24, vol: 0.16 + s * 0.14, type: 'square' });
    tone({ f0: 70, f1: 36, dur: 0.34, vol: 0.2, type: 'sine' });
  },

  /** Something died: a crunch, then the sub drops out from under it. */
  kill: (): void => {
    if (!budget('kill', 45)) return;
    const p = vary(110);
    noise({ dur: 0.2, vol: 0.22, type: 'lowpass', freq: 2200 * p, freqTo: 260, q: 0.7, attack: 0.015 });
    tone({ f0: 260 * p, f1: 58, dur: 0.26, vol: 0.16, type: 'sawtooth' });
    tone({ f0: 110, f1: 32, dur: 0.4, vol: 0.22, type: 'sine' });
    // A short tail a beat later, so a kill has a decay instead of a cut-off.
    noise({ dur: 0.3, vol: 0.07, type: 'lowpass', freq: 900, freqTo: 160, attack: 0.25, delay: 0.06 });
  },

  /** UI confirm — the one place a clean interval is right. */
  pick: (): void => {
    if (!budget('pick', 40)) return;
    tone({ f0: 523, dur: 0.1, vol: 0.1, type: 'triangle', attack: 0.08 });
    tone({ f0: 784, dur: 0.16, vol: 0.09, type: 'triangle', attack: 0.08, delay: 0.085 });
  },

  victory: (): void => {
    if (!budget('victory', 400)) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      tone({ f0: f, dur: 0.26, vol: 0.12, type: 'triangle', attack: 0.05, delay: i * 0.13 });
      tone({ f0: f / 2, dur: 0.3, vol: 0.06, type: 'sine', attack: 0.05, delay: i * 0.13 });
    });
  },

  defeat: (): void => {
    if (!budget('defeat', 400)) return;
    [330, 262, 196].forEach((f, i) => {
      tone({ f0: f, f1: f * 0.94, dur: 0.4, vol: 0.11, type: 'sawtooth', attack: 0.06, delay: i * 0.17 });
    });
    tone({ f0: 90, f1: 40, dur: 0.9, vol: 0.16, type: 'sine', delay: 0.2 });
  },
};
