/** One spark of the ALL IN flash: angle (deg), start distance from the plaque centre (px), delay (s). */
export type AllinSpark = Readonly<{ a: number; r: number; d: number }>;

const SPARK_COUNT = 18;
const NEAR_PX = 120;
const FAR_PX = 175;
const DELAY_STEP_S = 0.025;

/** Sparks spread evenly around the plaque, alternating near and far so they arrive in waves. */
export const ALLIN_SPARKS: readonly AllinSpark[] = Array.from({ length: SPARK_COUNT }, (_, i) => ({
  a: Math.round((360 / SPARK_COUNT) * i + (i % 2 ? 7 : 0)),
  r: i % 2 ? FAR_PX : NEAR_PX,
  d: Number(((i % 4) * DELAY_STEP_S).toFixed(3)),
}));
