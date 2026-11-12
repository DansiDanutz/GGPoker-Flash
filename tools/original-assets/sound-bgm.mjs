// Original calm lounge loop for the lobby: e-piano chords, soft pad, bass and a light shaker.
import { tone, noise, mix, at, rng, midi } from './sound-dsp.mjs';

const LOOP = 46.6;
const BARS = 16;
const BAR = LOOP / BARS;
const BEAT = BAR / 4;
const TAIL = 3;

const EPIANO = [[1, 1, 1], [2, 0.35, 0.5], [3, 0.1, 0.3], [4.01, 0.05, 0.2]];

// [bass root, chord voicing] per bar; the last C resolves back into the first F when looping.
const FMAJ7 = [41, [53, 57, 60, 64]];
const EM7 = [40, [52, 55, 59, 62]];
const DM9 = [38, [50, 53, 57, 60, 64]];
const CMAJ9 = [36, [48, 52, 55, 59, 62]];
const G6 = [43, [55, 59, 62, 64]];
const AM9 = [45, [57, 60, 64, 67, 71]];
const PROGRESSION = [
  FMAJ7, EM7, DM9, CMAJ9, FMAJ7, EM7, DM9, CMAJ9,
  FMAJ7, G6, EM7, AM9, FMAJ7, EM7, DM9, CMAJ9,
];
const MELODY_NOTES = [72, 74, 76, 79, 81, 84];

const ep = (n, amp, dur = 2.4) => tone({ f: midi(n), dur, amp, attack: 0.006, tau: 1.0, release: 0.3, partials: EPIANO });

function bar(index, [root, chord], rand) {
  const t0 = index * BAR;
  const layers = [
    ...chord.map((n, k) => at(t0 + k * 0.025, ep(n, 0.085))),
    ...chord.slice(-3).map((n, k) => at(t0 + 2.5 * BEAT + k * 0.02, ep(n, 0.045, 1.4))),
    ...chord.flatMap((n) => [1, 1.003].map((d) => at(t0, tone({
      f: midi(n) * d, dur: BAR + 0.4, amp: 0.022, attack: 0.9, release: 0.9, partials: [[1, 1], [2, 0.15]],
    })))),
    at(t0, tone({ f: midi(root), dur: 2 * BEAT, amp: 0.3, attack: 0.008, tau: 0.6, release: 0.2, partials: [[1, 1], [2, 0.25]] })),
    at(t0 + 2 * BEAT, tone({ f: midi(root + 7), dur: 2 * BEAT, amp: 0.22, attack: 0.008, tau: 0.6, release: 0.2, partials: [[1, 1], [2, 0.25]] })),
    ...Array.from({ length: 8 }, (_, k) => at(t0 + k * (BEAT / 2), noise({
      dur: 0.06, amp: k % 2 ? 0.02 : 0.034, seed: 5000 + index * 8 + k, hp: 7000, attack: 0.002, tau: 0.018,
    }))),
  ];
  if (index % 2 === 1) {
    const count = 2 + Math.floor(rand() * 2);
    for (let k = 0; k < count; k++) {
      const n = MELODY_NOTES[Math.floor(rand() * MELODY_NOTES.length)];
      layers.push(at(t0 + (1 + k) * BEAT + rand() * 0.05, ep(n, 0.05, 1.6)));
    }
  }
  return layers;
}

/** Render the loop and fold the decaying tail back onto the start so it loops without a seam. */
export function bgm() {
  const rand = rng(777);
  const full = mix(LOOP + TAIL, PROGRESSION.flatMap((chord, i) => bar(i, chord, rand)));
  const n = Math.round(LOOP * 44100);
  const data = full.slice(0, n).map((x, i) => x + (i < full.length - n ? full[n + i] : 0));
  return { dur: LOOP, data, post: 'aecho=0.8:0.5:180|290:0.18|0.1,lowpass=f=9000' };
}
