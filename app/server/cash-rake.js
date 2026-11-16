// SPDX-License-Identifier: AGPL-3.0-only
export function validateCashRake({ rakePercent, rakeCap }) {
  if (![2, 3, 4, 5].includes(rakePercent) || !Number.isSafeInteger(rakeCap) || rakeCap < 1 || rakeCap > 9_000_000_000) {
    throw Object.assign(new Error('Choose 2%, 3%, 4% or 5% rake and a cap of 1–9,000,000,000 whole Cash Chips.'), { status: 400 });
  }
  return { rakePercent, rakeCap };
}

export function cashRakeConfig(row, getSetting) {
  const scoped = row.private && (row.chip_economy || row.play_money) && row.owner_id && row.game !== 'spingold' && !row.tournamentId;
  const cap = scoped && row.rake_cap != null ? row.rake_cap : getSetting('rake_cap', 300);
  return {
    rakePercent: scoped && row.rake_percent != null ? row.rake_percent : getSetting('rake_percent', 5),
    rakeCap: Number(cap) > 0 ? Number(cap) : 300,
  };
}
