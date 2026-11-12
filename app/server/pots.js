// Pot settlement following the native rules (Codex engine/pots.mjs, REA per-pot-results):
// contribution layers become pots; adjacent layers with the same eligible seats merge, so
// one pot never pays two odd chips; a layer only one player paid into goes back to them.

/**
 * @param {{ key: unknown, amount: number, folded: boolean }[]} contributions
 * @returns {{ pots: { amount: number, eligible: unknown[] }[], returns: { key: unknown, amount: number }[] }}
 */
export function buildPots(contributions) {
  const pots = [];
  const returns = [];
  let previous = 0;
  const levels = [...new Set(contributions.map((x) => x.amount))].filter((n) => n > 0).sort((a, b) => a - b);
  for (const level of levels) {
    const payers = contributions.filter((x) => x.amount >= level);
    const amount = (level - previous) * payers.length;
    previous = level;
    if (payers.length === 1) {
      returns.push({ key: payers[0].key, amount });
      continue;
    }
    const eligible = payers.filter((x) => !x.folded).map((x) => x.key);
    const last = pots.at(-1);
    if (!eligible.length) {
      // Native never reaches this (it would throw); keep the chips with the pot below.
      if (last) last.amount += amount;
      else pots.push({ amount, eligible: contributions.filter((x) => !x.folded).map((x) => x.key) });
      continue;
    }
    if (last && last.eligible.length === eligible.length && eligible.every((k, i) => last.eligible[i] === k)) last.amount += amount;
    else pots.push({ amount, eligible });
  }
  return { pots, returns };
}

/** Winning seats ordered clockwise from the button: who receives odd chips first. */
export function oddChipOrder(seats, button, seatCount) {
  const distance = (seat) => (seat - button - 1 + seatCount) % seatCount;
  return [...seats].sort((a, b) => distance(a) - distance(b));
}
