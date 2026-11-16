// SPDX-License-Identifier: AGPL-3.0-only
import { isSpinStake } from './spin.js';

const RAKE_PERCENTS = new Set([2, 3, 4, 5]);
function invalid(message) { throw Object.assign(new RangeError(message), { status: 400 }); }

export function organizerSpinOutcome(stake, rakePercent = 5) {
  if (!isSpinStake(stake)) invalid('Unsupported Spin stake.');
  if (!RAKE_PERCENTS.has(rakePercent)) invalid('Spin rake percent must be 2, 3, 4, or 5.');
  const entryTotal = stake * 3;
  const rakeAmount = Math.floor(entryTotal * rakePercent / 100);
  const prizePool = entryTotal - rakeAmount;
  return { payoutModel: 'pooled', multiplier: null, rakePercent, rakeAmount, entryTotal, prizePool, prizes: [prizePool, 0, 0] };
}
