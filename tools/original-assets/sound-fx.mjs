// Alerts, rewards, bubbles, coins, wheel and celebration cues. Each recipe returns { dur, data, post? }.
import { tone, noise, mix, at, rng, midi, wobble } from './sound-dsp.mjs';

const BELL = [[1, 1], [2.01, 0.35, 0.6], [3.02, 0.12, 0.4], [4.2, 0.06, 0.3]];
const CHIME = [[1, 1], [2, 0.18], [3, 0.05]];
const METAL = [[1, 1], [2.52, 0.6, 0.7], [4.13, 0.4, 0.5], [6.0, 0.25, 0.4]];
const BRASS = [[1, 1], [2, 0.6], [3, 0.42], [4, 0.28], [5, 0.18], [6, 0.1]];

const bell = (n, amp = 0.3, tau = 0.3, dur = 1) => tone({ f: midi(n), dur, amp, attack: 0.003, tau, partials: BELL });
const chime = (n, amp = 0.35, tau = 0.2, dur = 0.5) => tone({ f: midi(n), dur, amp, attack: 0.006, tau, partials: CHIME });

/** A single rising water bubble. */
const bubble = (f, amp = 0.45, dur = 0.1) => tone({ f, f1: f * 1.8, dur, amp, attack: 0.004, tau: dur * 0.4, partials: [[1, 1]] });

/** Small metallic coin contact. */
const clink = (seed, amp = 0.3) => {
  const r = rng(seed);
  return tone({ f: 2600 + r() * 2400, dur: 0.25, amp, attack: 0.0005, tau: 0.05 + r() * 0.08, partials: METAL });
};

/** Firework: rising whistle, a low burst, then seeded crackle. */
function firework(seed, amp = 1) {
  const r = rng(seed);
  const crackle = Array.from({ length: 36 }, (_, k) => at(
    0.68 + r() * 1.4 * (k / 36) ** 0.7,
    noise({ dur: 0.02, amp: amp * 0.7 * (1 - k / 45), seed: seed * 13 + k, hp: 2800, attack: 0.0003, tau: 0.004 }),
  ));
  return mix(2.3, [
    at(0, tone({ f: 900, f1: 2600, dur: 0.6, amp: amp * 0.18, attack: 0.15, release: 0.1, partials: [[1, 1], [2, 0.2]] })),
    at(0, noise({ dur: 0.6, amp: amp * 0.2, seed, sweep: [1500, 6000, 1.5], attack: 0.3, release: 0.15 })),
    at(0.62, noise({ dur: 0.9, amp: amp * 0.35, seed: seed + 1, color: 'brown', lp: 420, attack: 0.002, tau: 0.3 })),
    at(0.62, tone({ f: 75, f1: 42, dur: 0.7, amp: amp * 0.3, attack: 0.002, tau: 0.22 })),
    ...crackle,
  ]);
}

/** Crowd cheer: wobbling band-limited noise plus scattered claps. */
function cheer(seed, dur, amp = 1) {
  const r = rng(seed);
  const crowd = [[700, 0.7], [1500, 0.8], [2800, 1.1]].map(([f, q], k) => at(0, wobble(
    noise({ dur, amp: amp * 0.45, seed: seed + k, color: 'pink', bp: [f, q], attack: 0.15, release: dur * 0.45 }),
    { seed: seed + 10 + k, rates: [3.1 + k, 5.7 + k, 8.3 + k], depth: 0.55 },
  )));
  const claps = Array.from({ length: Math.round(dur * 18) }, (_, k) => at(
    0.05 + r() * (dur * 0.8),
    noise({ dur: 0.04, amp: amp * (0.2 + r() * 0.2), seed: seed * 17 + k, bp: [1400 + r() * 900, 1.2], attack: 0.0005, tau: 0.01 }),
  ));
  return mix(dur, [...crowd, ...claps]);
}

/** Brass-like fanfare chord (rooted at MIDI notes) with a soft swell. */
const brassChord = (notes, dur, amp = 0.09) => mix(dur, notes.map((n) => at(0, tone({
  f: midi(n), dur, amp, attack: 0.03, release: Math.min(0.6, dur * 0.4), vib: 0.004, vibRate: 5.2, partials: BRASS,
}))));

/** Shared celebration: fanfare, sparkles, coin rain, fireworks and a cheer. */
function celebration({ seed, dur, key, fireworks, cheerAt }) {
  const r = rng(seed);
  const k = (n) => n + key;
  const stabs = [0, 0.22, 0.44].map((t) => at(t, brassChord([k(60), k(64), k(67)], 0.18, 0.1)));
  const prog = [
    [0.7, [k(60), k(64), k(67), k(72)], 1.3],
    [2.0, [k(65), k(69), k(72), k(77)], 1.1],
    [3.1, [k(67), k(71), k(74), k(79)], 1.1],
    [4.2, [k(60), k(64), k(67), k(72), k(76)], dur - 4.4],
  ].map(([t, notes, d]) => at(t, brassChord(notes, d, 0.075)));
  const bass = [[0.7, 48], [2.0, 53], [3.1, 55], [4.2, 48]].map(([t, n]) => at(t, tone({
    f: midi(k(n) - 12), dur: 1.6, amp: 0.35, attack: 0.005, tau: 0.5, partials: [[1, 1], [2, 0.3]],
  })));
  const penta = [0, 2, 4, 7, 9].map((s) => k(84 + s));
  const sparkles = Array.from({ length: 40 }, (_, i) => at(
    0.8 + (dur - 2.5) * (i / 40) ** 1.3 + r() * 0.1,
    bell(penta[Math.floor(r() * penta.length)] + (r() > 0.6 ? 12 : 0), 0.09 * (1 - i / 55), 0.25, 0.8),
  ));
  const coins = Array.from({ length: 30 }, (_, i) => at(0.8 + r() * (dur - 3), clink(seed * 3 + i, 0.08 + r() * 0.06)));
  return mix(dur, [
    ...stabs, ...prog, ...bass, ...sparkles, ...coins,
    ...fireworks.map((t, i) => at(t, firework(seed + 100 + i, 0.7))),
    at(cheerAt, cheer(seed + 200, Math.min(4, dur - cheerAt), 0.7)),
  ]);
}

export const FX = {
  'NotificationTimeTurnToAct.mp3': () => ({ dur: 0.49, data: mix(0.49, [at(0, chime(76)), at(0.13, chime(81, 0.4, 0.22, 0.36))]) }),
  'NotificationTimeBank.mp3': () => ({
    dur: 0.69,
    data: mix(0.69, [at(0, chime(84, 0.3)), at(0.12, chime(88, 0.3)), at(0.24, chime(91, 0.32, 0.25, 0.45))]),
  }),
  'NotificationTimeWinding.mp3': () => ({
    dur: 0.26,
    data: mix(0.26, [0, 0.12].map((t) => at(t, tone({ f: 1320, dur: 0.06, amp: 0.35, attack: 0.004, release: 0.02, partials: [[1, 1], [3, 0.08]] })))),
  }),
  'SoundWinPot.mp3': () => {
    const r = rng(161);
    return {
      dur: 0.9,
      data: mix(0.9, [
        ...[84, 88, 91, 96].map((n, i) => at(i * 0.08, bell(n, 0.3, 0.28, 0.6))),
        ...Array.from({ length: 5 }, (_, i) => at(0.05 + r() * 0.3, clink(1610 + i, 0.08))),
      ]),
    };
  },
  'CoinDrop.mp3': () => {
    // Coin lands, then spins down on the table with an accelerating rattle (Euler's-disk style).
    const ticks = [];
    for (let t = 0.35, gap = 0.13, k = 0; t < 4.6; t += gap, gap = Math.max(0.011, gap * 0.94), k++) {
      const fade = Math.min(1, (4.6 - t) / 1.2);
      ticks.push(at(t, tone({ f: 3300 + (k % 2) * 400, dur: 0.05, amp: 0.35 * fade, attack: 0.0004, tau: 0.012, partials: METAL })));
    }
    return {
      dur: 5.18,
      data: mix(5.18, [
        at(0, tone({ f: 2100, dur: 1.5, amp: 0.45, attack: 0.0005, tau: 0.35, partials: METAL })),
        at(0, noise({ dur: 0.02, amp: 0.3, seed: 171, hp: 3000, tau: 0.003 })),
        ...ticks,
        at(4.62, tone({ f: 2300, dur: 0.5, amp: 0.25, attack: 0.0005, tau: 0.12, partials: METAL })),
      ]),
    };
  },
  'SoundJackPotToast.mp3': () => ({
    dur: 1.32,
    data: mix(1.32, [
      ...[72, 74, 76, 79, 81, 84, 86, 88, 91, 96].map((n, i) => at(i * 0.045, bell(n, 0.22, 0.35, 0.9))),
      at(0.1, noise({ dur: 1.0, amp: 0.06, seed: 181, hp: 6500, attack: 0.2, release: 0.6 })),
    ]),
  }),
  'MissionReward.mp3': () => ({
    dur: 0.73,
    data: mix(0.73, [at(0, bell(91, 0.3, 0.3, 0.7)), at(0.11, bell(98, 0.3, 0.3, 0.6)), at(0.1, noise({ dur: 0.5, amp: 0.05, seed: 191, hp: 7000, attack: 0.05, release: 0.35 }))]),
  }),
  'SoundSngFireworks.mp3': () => ({ dur: 2.36, data: mix(2.36, [at(0, firework(201))]) }),
  'SoundSngPrizeCheers.mp3': () => ({ dur: 1.55, data: cheer(211, 1.55) }),
  'BubbleInWater.mp3': () => ({
    dur: 0.69,
    data: mix(0.69, [[0, 500], [0.12, 720], [0.25, 610], [0.4, 880]].map(([t, f]) => at(t, bubble(f)))),
    post: 'aecho=0.8:0.5:40:0.25',
  }),
  'FishBubblePop.mp3': () => ({
    dur: 1.5,
    data: mix(1.5, [
      ...[420, 520, 480, 640, 600, 760, 900].map((f, i) => at(i * 0.14, bubble(f, 0.35, 0.09))),
      at(1.08, noise({ dur: 0.03, amp: 0.5, seed: 221, hp: 900, tau: 0.006 })),
      at(1.08, tone({ f: 1200, f1: 300, dur: 0.08, amp: 0.4, attack: 0.0005, tau: 0.025 })),
    ]),
    post: 'aecho=0.8:0.5:45:0.25',
  }),
  'SoundSngWheelBaseLight.mp3': () => {
    // Prize wheel spinning down: ticks slow from ~22/s to ~2/s, then settle.
    const ticks = [];
    for (let t = 0, k = 0; t < 4.3; k++) {
      ticks.push(at(t, mix(0.04, [
        at(0, tone({ f: 2400, dur: 0.04, amp: 0.3, attack: 0.0004, tau: 0.008, partials: [[1, 1], [1.6, 0.5]] })),
        at(0, noise({ dur: 0.01, amp: 0.25, seed: 230 + k, hp: 3000, tau: 0.002 })),
      ])));
      t += 1 / (22 * (1 - t / 4.6) ** 1.6 + 2);
    }
    return {
      dur: 4.78,
      data: mix(4.78, [
        ...ticks,
        at(0, noise({ dur: 4.4, amp: 0.15, seed: 239, color: 'pink', lp: 700, attack: 0.1, release: 3.5 })),
        at(4.35, bell(84, 0.25, 0.25, 0.43)),
      ]),
    };
  },
  'SoundSngWheelFrameLight.mp3': () => ({
    dur: 2.91,
    data: mix(2.91, Array.from({ length: 24 }, (_, i) => at(i * 0.12, tone({
      f: midi(i % 2 ? 83 : 88), dur: 0.12, amp: 0.16 * (0.75 + 0.25 * Math.sin(i * 0.8)), attack: 0.002, tau: 0.04, partials: CHIME,
    })))),
  }),
  'SoundSngBigWin.mp3': () => ({
    dur: 10.8,
    data: celebration({ seed: 241, dur: 10.8, key: 0, fireworks: [1.4, 3.6, 6.2], cheerAt: 4.4 }),
    post: 'aecho=0.8:0.55:80|131:0.25|0.15',
  }),
  'SoundTournamentWin.mp3': () => ({
    dur: 11.5,
    data: celebration({ seed: 251, dur: 11.5, key: 2, fireworks: [0.9, 2.5, 4.3, 6.8, 8.4], cheerAt: 2.2 }),
    post: 'aecho=0.8:0.55:80|131:0.25|0.15',
  }),
  'SoundCashdropBig.mp3': () => {
    const r = rng(261);
    const coins = Array.from({ length: 110 }, (_, i) => at(0.05 + 4.6 * (i / 110) ** 1.8 + r() * 0.03, clink(2610 + i, 0.07 + r() * 0.08)));
    return {
      dur: 5.56,
      data: mix(5.56, [
        at(0, noise({ dur: 1.0, amp: 0.6, seed: 262, color: 'brown', lp: 300, attack: 0.002, tau: 0.3 })),
        at(0, tone({ f: 70, f1: 45, dur: 0.8, amp: 0.45, attack: 0.002, tau: 0.25 })),
        ...coins,
        ...[84, 88, 91, 96, 100].map((n, i) => at(0.1 + i * 0.12, bell(n, 0.12, 0.6, 2.5))),
      ]),
      post: 'aecho=0.8:0.5:60|97:0.2|0.12',
    };
  },
};
