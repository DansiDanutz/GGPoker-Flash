import { RESERVATION_KINDS } from './reservations.js';

/** Option flags a seated player may send; each must be a real boolean (spec rule 11.2). */
export const OPTION_FLAGS = Object.freeze([
  'straddle', 'autoMuck', 'autoStraddle', 'waitForBlinds', 'insurance', 'runItAsk', ...RESERVATION_KINDS,
]);

/** The first flag sent with a value other than true or false, or null when all are valid. */
export function invalidOptionFlag(msg) {
  return OPTION_FLAGS.find((key) => msg[key] != null && typeof msg[key] !== 'boolean') ?? null;
}
