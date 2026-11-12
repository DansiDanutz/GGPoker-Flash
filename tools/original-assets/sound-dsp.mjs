// Tiny deterministic synthesis kit for the original DanGG sound set.
// Every primitive returns a NEW Float32Array (mono, 44.1 kHz); `mix` places layers on a timeline.
export const SR = 44100;

/** Seeded PRNG (mulberry32) so every render is byte-for-byte reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const samples = (sec) => Math.max(1, Math.round(sec * SR));

/** Attack ramp, exponential decay (tau seconds) and a short linear release at the end. */
function envelope(i, n, { attack = 0.003, tau = Infinity, release = 0.01 }) {
  const t = i / SR;
  const a = attack > 0 ? Math.min(1, t / attack) : 1;
  const d = Number.isFinite(tau) ? Math.exp(-t / tau) : 1;
  const relN = samples(release);
  const r = i > n - relN ? (n - i) / relN : 1;
  return a * d * r;
}

/**
 * Additive tone. partials: [ratio, gain, tauMul]. f1 = end frequency (exponential glide).
 * vib = vibrato depth (fraction), vibRate in Hz.
 */
export function tone({ f, dur, amp = 0.5, partials = [[1, 1]], f1 = null, vib = 0, vibRate = 5, attack, tau, release }) {
  const n = samples(dur);
  const out = new Float32Array(n);
  const phases = partials.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const base = (f1 ? f * (f1 / f) ** (t / dur) : f) * (1 + vib * Math.sin(2 * Math.PI * vibRate * t));
    let s = 0;
    for (let p = 0; p < partials.length; p++) {
      const [ratio, gain, tauMul = 1] = partials[p];
      const fp = base * ratio;
      if (fp > SR * 0.45) continue;
      phases[p] += (2 * Math.PI * fp) / SR;
      const decay = Number.isFinite(tau) ? Math.exp(-t / (tau * tauMul)) : 1;
      s += Math.sin(phases[p]) * gain * decay;
    }
    out[i] = s * amp * envelope(i, n, { attack, tau: Infinity, release });
  }
  return out;
}

/** RBJ biquad (lowpass | highpass | bandpass) applied to a copy of `data`. */
export function biquad(data, type, freq, q = 0.707) {
  const w = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const coef = {
    lowpass: [(1 - cos) / 2, 1 - cos, (1 - cos) / 2],
    highpass: [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2],
    bandpass: [alpha, 0, -alpha],
  }[type];
  const [b0, b1, b2] = coef;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const out = new Float32Array(data.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}

/** State-variable band-pass whose centre glides exponentially from f0 to f1 (card swishes). */
export function sweepBand(data, f0, f1, q = 1) {
  const out = new Float32Array(data.length);
  let low = 0, band = 0;
  const damp = 1 / q;
  for (let i = 0; i < data.length; i++) {
    const fc = f0 * (f1 / f0) ** (i / data.length);
    const k = 2 * Math.sin((Math.PI * Math.min(fc, SR / 7)) / SR);
    low += k * band;
    const high = data[i] - low - damp * band;
    band += k * high;
    out[i] = band;
  }
  return out;
}

/** Filtered noise burst. color: white | pink | brown. Optional hp/lp/bp/sweep shaping. */
export function noise({ dur, amp = 0.5, seed = 1, color = 'white', hp, lp, bp, sweep, attack, tau, release }) {
  const n = samples(dur);
  const rand = rng(seed);
  let raw = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, brown = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      raw[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
    } else if (color === 'brown') {
      brown = (brown + w * 0.02) * 0.998;
      raw[i] = brown * 3;
    } else raw[i] = w;
  }
  if (hp) raw = biquad(raw, 'highpass', hp);
  if (lp) raw = biquad(raw, 'lowpass', lp);
  if (bp) raw = biquad(raw, 'bandpass', bp[0], bp[1] ?? 1);
  if (sweep) raw = sweepBand(raw, sweep[0], sweep[1], sweep[2] ?? 1);
  return raw.map((x, i) => x * amp * envelope(i, n, { attack, tau, release }));
}

/** Multiply by a smooth seeded random LFO (crowd/shimmer movement). */
export function wobble(data, { seed = 1, rates = [3, 5.3, 8.1], depth = 0.6 }) {
  const rand = rng(seed);
  const phases = rates.map(() => rand() * Math.PI * 2);
  return data.map((x, i) => {
    const t = i / SR;
    const m = rates.reduce((s, r, k) => s + Math.sin(2 * Math.PI * r * t + phases[k]), 0) / rates.length;
    return x * (1 - depth + depth * (0.5 + 0.5 * m));
  });
}

/** Place layers [{ at, data, gain }] on a timeline of `dur` seconds (layers are clipped). */
export function mix(dur, layers) {
  const n = samples(dur);
  const out = new Float32Array(n);
  for (const { at = 0, data, gain = 1 } of layers) {
    const start = Math.round(at * SR);
    for (let i = 0; i < data.length && start + i < n; i++) if (start + i >= 0) out[start + i] += data[i] * gain;
  }
  return out;
}

/** Final short fade-in/out so no file starts or ends on a click. */
export function edgeFade(data, inSec = 0.002, outSec = 0.02) {
  const nIn = samples(inSec);
  const nOut = Math.min(samples(outSec), data.length);
  return data.map((x, i) => x * Math.min(1, i / nIn, (data.length - 1 - i) / nOut));
}

export const at = (time, data, gain = 1) => ({ at: time, data, gain });
