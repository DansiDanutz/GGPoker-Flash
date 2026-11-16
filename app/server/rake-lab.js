// SPDX-License-Identifier: AGPL-3.0-only
import { validateCashRake } from './cash-rake.js';

export function previewRake(params) {
  const keys = ['pot', 'percent', 'cap', 'flop'];
  if ([...params.keys()].some(key => !keys.includes(key)) || keys.some(key => params.getAll(key).length !== 1 || !/^\d{1,10}$/.test(params.get(key)))) {
    throw Object.assign(new Error('Provide one whole-number pot, percent, cap and flop (0 or 1).'), { status: 400 });
  }
  const pot = Number(params.get('pot')), flop = Number(params.get('flop'));
  const { rakePercent, rakeCap } = validateCashRake({ rakePercent: Number(params.get('percent')), rakeCap: Number(params.get('cap')) });
  if (pot > 9_000_000_000 || ![0, 1].includes(flop)) {
    throw Object.assign(new Error('Pot must be 0–9,000,000,000 whole chips; flop must be 0 or 1.'), { status: 400 });
  }
  // Educational single-pot preview; actual hand settlement remains in the table engine.
  const raw = flop ? Math.floor(pot * rakePercent / 100) : 0;
  const rake = Math.min(raw, rakeCap);
  return { pot, rakePercent, rakeCap, flopSeen: !!flop, rake, remaining: pot - rake, capReached: raw >= rakeCap };
}
