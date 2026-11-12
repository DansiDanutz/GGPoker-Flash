// Table sounds: cards, chips, knocks, shuffles. Each recipe returns { dur, data, post? }.
import { tone, noise, mix, at, rng, midi } from './sound-dsp.mjs';

/** One clay chip striking another: inharmonic ring plus a hard transient. */
export function chip(seed, amp = 0.6) {
  const r = rng(seed);
  const f = 2500 * (0.9 + r() * 0.2);
  return mix(0.07, [
    at(0, tone({ f, dur: 0.07, amp: amp * 0.5, attack: 0.0005, tau: 0.014, partials: [[1, 1], [1.47, 0.7, 0.8], [2.09, 0.5, 0.6], [2.78, 0.35, 0.5]] })),
    at(0, noise({ dur: 0.02, amp: amp * 0.6, seed, hp: 2200, attack: 0.0003, tau: 0.004 })),
  ]);
}

/** Chips spread over [from, to] with a seeded, slightly uneven rhythm. */
function chipRun(seed, count, from, to, amp = 0.6) {
  const r = rng(seed);
  return Array.from({ length: count }, (_, k) => {
    const t = from + ((to - from) * (k + r() * 0.5)) / count;
    return at(t, chip(seed * 31 + k, amp * (0.7 + r() * 0.3)));
  });
}

/** Card sliding over felt; band glides f0 -> f1. */
function swish(seed, dur, f0, f1, amp = 0.5, attack = 0.03) {
  return noise({ dur, amp, seed, sweep: [f0, f1, 0.9], attack, release: dur * 0.6 });
}

/** Card landing on felt: soft low-mid thump. */
function slap(seed, amp = 0.5) {
  return mix(0.05, [
    at(0, noise({ dur: 0.04, amp, seed, hp: 300, lp: 3200, attack: 0.0005, tau: 0.008 })),
    at(0, tone({ f: 170, dur: 0.05, amp: amp * 0.35, attack: 0.001, tau: 0.015 })),
  ]);
}

/** Knuckle on a padded rail. */
function knock(seed, amp = 0.8) {
  return mix(0.12, [
    at(0, tone({ f: 140, dur: 0.12, amp, attack: 0.001, tau: 0.03, partials: [[1, 1], [2.3, 0.45, 0.5], [3.9, 0.2, 0.3]] })),
    at(0, noise({ dur: 0.06, amp: amp * 0.45, seed, hp: 90, lp: 1300, attack: 0.0005, tau: 0.01 })),
  ]);
}

/** Riffle: a fast burst of tiny card-edge clicks. */
function riffle(seed, count, span) {
  const r = rng(seed);
  return mix(span + 0.02, Array.from({ length: count }, (_, k) => at(
    (span * k) / count + r() * 0.004,
    noise({ dur: 0.012, amp: 0.25 + r() * 0.3, seed: seed * 7 + k, hp: 2500, lp: 9000, attack: 0.0003, tau: 0.003 }),
  )));
}

export const TABLE = {
  'tick.mp3': () => ({
    dur: 0.26,
    data: mix(0.26, [
      at(0, tone({ f: 1800, dur: 0.06, amp: 0.45, attack: 0.0005, tau: 0.012, partials: [[1, 1], [2.4, 0.3, 0.5]] })),
      at(0, noise({ dur: 0.01, amp: 0.3, seed: 3, hp: 3000, tau: 0.002 })),
    ]),
  }),
  'SoundDealCard.mp3': () => ({
    dur: 0.15,
    data: mix(0.15, [at(0, swish(11, 0.13, 2500, 6500, 0.7)), at(0.105, slap(12, 0.45))]),
  }),
  'SoundBoard.mp3': () => ({
    dur: 0.19,
    data: mix(0.19, [at(0, swish(21, 0.17, 1800, 4800, 0.6)), at(0.06, slap(22, 0.3)), at(0.135, slap(23, 0.4))]),
  }),
  'SoundCheck.mp3': () => ({
    dur: 0.37,
    data: mix(0.37, [at(0.005, knock(31, 0.85)), at(0.15, knock(32, 0.7))]),
  }),
  'SoundBet.mp3': () => ({
    dur: 0.22,
    data: mix(0.22, [...chipRun(41, 3, 0, 0.12), at(0, swish(42, 0.12, 3000, 6000, 0.12))]),
  }),
  'SoundCall.mp3': () => ({
    dur: 0.35,
    data: mix(0.35, [...chipRun(51, 4, 0, 0.2), at(0.01, swish(52, 0.2, 2500, 6000, 0.15))]),
  }),
  'SoundRaise.mp3': () => ({
    dur: 0.39,
    data: mix(0.39, [...chipRun(61, 6, 0, 0.24, 0.55), at(0.25, chip(63, 0.8)), at(0.02, swish(62, 0.24, 2500, 7000, 0.18))]),
  }),
  'SoundFold.mp3': () => ({
    dur: 0.38,
    data: mix(0.38, [at(0, swish(71, 0.34, 3200, 1200, 0.6, 0.05)), at(0.29, slap(72, 0.3))]),
  }),
  'SoundGatherChips.mp3': () => ({
    dur: 0.96,
    data: mix(0.96, [...chipRun(81, 12, 0.02, 0.65, 0.55), at(0, swish(82, 0.72, 2500, 5000, 0.3, 0.1))]),
  }),
  'SoundShowCard.mp3': () => ({
    dur: 0.27,
    data: mix(0.27, [
      at(0, noise({ dur: 0.02, amp: 0.5, seed: 91, hp: 1500, attack: 0.0003, tau: 0.004 })),
      at(0.02, swish(92, 0.16, 4200, 2000, 0.45, 0.02)),
      at(0.17, slap(93, 0.4)),
    ]),
  }),
  'SoundRabbitCard.mp3': () => ({
    dur: 0.31,
    data: mix(0.31, [
      at(0, swish(101, 0.2, 2000, 5000, 0.4)),
      at(0.1, tone({ f: 1568, dur: 0.2, amp: 0.16, attack: 0.004, tau: 0.08, partials: [[1, 1], [2, 0.3], [3, 0.1]] })),
      at(0.16, tone({ f: 2093, dur: 0.15, amp: 0.12, attack: 0.004, tau: 0.06, partials: [[1, 1], [2, 0.3]] })),
    ]),
  }),
  'SoundSqueezeOpen.mp3': () => ({
    dur: 0.645,
    data: mix(0.645, [at(0, swish(111, 0.56, 800, 3600, 0.35, 0.4)), at(0.55, noise({ dur: 0.04, amp: 0.5, seed: 112, hp: 1200, tau: 0.006 }))]),
  }),
  'SoundShuffleUp.mp3': () => ({ dur: 0.26, data: mix(0.26, [at(0.01, riffle(121, 14, 0.22))]) }),
  'SoundShuffleCombine.mp3': () => ({
    dur: 0.31,
    data: mix(0.31, [at(0.005, slap(131, 0.6)), at(0.03, swish(133, 0.1, 1500, 3500, 0.2)), at(0.14, slap(132, 0.5))]),
  }),
  'SoundShuffleOther.mp3': () => ({
    dur: 2.69,
    data: mix(2.69, [
      at(0.1, riffle(141, 30, 0.45)),
      at(0.7, swish(142, 0.4, 1500, 5000, 0.4, 0.1)),
      at(1.3, riffle(143, 30, 0.45)),
      at(1.95, slap(144, 0.55)),
      at(2.12, slap(145, 0.45)),
    ]),
  }),
  'SoundAllIn.mp3': () => {
    const r = rng(151);
    const avalanche = Array.from({ length: 20 }, (_, k) => at(0.75 * (k / 20) ** 1.4 + r() * 0.02, chip(1500 + k, 0.55 + r() * 0.3)));
    const pad = [45, 52, 57, 60, 64].map((n, k) => at(0.25 + k * 0.05, tone({
      f: midi(n), dur: 6.9, amp: 0.12, attack: 1.2, release: 3.2, vib: 0.003, vibRate: 4 + k * 0.4,
      partials: [[1, 1], [2, 0.35], [3, 0.12]],
    })));
    const sparkle = [81, 84, 88, 86, 93, 91, 88].map((n, k) => at(0.6 + k * 0.45, tone({
      f: midi(n), dur: 1.2, amp: 0.12 * 0.85 ** k, attack: 0.003, tau: 0.35, partials: [[1, 1], [2.01, 0.3], [3.02, 0.1]],
    })));
    return {
      dur: 7.6,
      data: mix(7.6, [
        ...avalanche,
        at(0, swish(152, 0.85, 2000, 7000, 0.35, 0.05)),
        at(0.02, tone({ f: 58, f1: 40, dur: 1.4, amp: 0.8, attack: 0.002, tau: 0.45 })),
        at(0.02, noise({ dur: 0.8, amp: 0.6, seed: 153, color: 'brown', lp: 260, attack: 0.002, tau: 0.25 })),
        ...pad,
        ...sparkle,
      ]),
      post: 'aecho=0.8:0.6:70|113|167:0.3|0.22|0.15',
    };
  },
};
