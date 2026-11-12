// Spin & Gold verified play-money table (P0 § 5, slice S1a: the table only).
//
// Port of the Codex replica `engine/spin.mjs` (+ `prizeAmounts` from `engine/prizes.mjs`),
// itself built from the native 3-Max play-money dialogs captured in
// `observed-spin-playmoney-*.png` (`home-art/rea/spin-rule-evidence.json`). Expectations
// mirror Codex `spin-test.mjs` 1:1.
//
// Wired into `table.js` by slice S1b: a Spin table draws its outcome with a crypto ticket
// when the first hand is dealt and pays places 1-3 from `prizes`. Do not change the rows
// below without new native evidence.
//
// Outcome rows: [multiplier, frequency per 100,000,000 tickets, prize shares %, blind unit,
// blind interval]. Starting chips and time-bank cards are unobserved and stay null.

export const SPIN_TICKET_TOTAL = 100_000_000;
export const SPIN_SEATS = 3;
export const SPIN_STAKES = Object.freeze([5000, 10000]);
const PRIZE_PLACES = 3;
const MS_PER_MINUTE = 60_000;

const OUTCOMES = Object.freeze([
  Object.freeze([20000, 5, Object.freeze([50, 30, 20]), 'hands', 20]),
  Object.freeze([100, 4000, Object.freeze([60, 30, 10]), 'hands', 15]),
  Object.freeze([50, 8000, Object.freeze([60, 30, 10]), 'hands', 15]),
  Object.freeze([10, 2450000, Object.freeze([80, 20]), 'hands', 10]),
  Object.freeze([5, 2800000, Object.freeze([100]), 'minutes', 3]),
  Object.freeze([4, 3000000, Object.freeze([100]), 'minutes', 2]),
  Object.freeze([3, 44124010, Object.freeze([100]), 'minutes', 2]),
  Object.freeze([2, 47613985, Object.freeze([100]), 'minutes', 1]),
]);

export const SPIN_MULTIPLIERS = Object.freeze(OUTCOMES.map(([multiplier]) => multiplier));

export const spinSmallBlinds = Object.freeze([
  10, 15, 20, 30, 40, 50, 60, 75, 90, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 500,
  600, 750, 900, 1000, 1250, 1500,
]);

// Split `pool` by integer percentage `shares` into whole chips that sum to the pool; the
// remainder goes to the largest fractional parts, ties to the earlier place.
export function prizeAmounts(pool, shares) {
  const validShares = Array.isArray(shares) && shares.length >= 1 && shares.length <= 9
    && shares.every((n) => Number.isInteger(n) && n > 0 && n <= 100)
    && shares.reduce((a, b) => a + b, 0) === 100;
  if (!Number.isSafeInteger(pool) || pool < 0 || !validShares) throw new RangeError('Invalid prize shares');
  const units = shares.map((n) => BigInt(pool) * BigInt(n));
  const base = units.map((n) => Number(n / 100n));
  const order = shares.map((_, i) => i)
    .sort((a, b) => Number((units[b] % 100n) - (units[a] % 100n)) || a - b);
  const remainder = pool - base.reduce((a, b) => a + b, 0);
  const bonus = new Set(order.slice(0, remainder));
  return base.map((amount, i) => (bonus.has(i) ? amount + 1 : amount));
}

/** True for a fixed buy-in at one of the observed play-money stakes. */
export function isSpinStake(minBuyin, maxBuyin = minBuyin) {
  return minBuyin === maxBuyin && SPIN_STAKES.includes(minBuyin);
}

function assertStake(buyIn) {
  if (!SPIN_STAKES.includes(buyIn)) {
    throw new RangeError('Only observed 5000/10000 play-money stakes are configured');
  }
}

export function spinPayouts(buyIn) {
  assertStake(buyIn);
  return OUTCOMES.map(([multiplier, frequency, shares, unit, interval]) => {
    const prizePool = buyIn * multiplier;
    const amounts = prizeAmounts(prizePool, shares);
    const prizes = Array.from({ length: PRIZE_PLACES }, (_, i) => amounts[i] || 0);
    return { multiplier, frequency, prizePool, prizes, unit, interval };
  });
}

// Map a uniform ticket in [0, SPIN_TICKET_TOTAL) to its outcome row.
export function spinOutcome(buyIn, ticket) {
  if (!Number.isSafeInteger(ticket) || ticket < 0 || ticket >= SPIN_TICKET_TOTAL) {
    throw new RangeError('Spin ticket must be an integer from 0 to 99999999');
  }
  let start = 0;
  for (const row of spinPayouts(buyIn)) {
    if (ticket < start + row.frequency) {
      return { ...row, buyIn, seats: SPIN_SEATS, startingChips: null, timeBankCards: null };
    }
    start += row.frequency;
  }
  throw new Error('Invalid probability total');
}

export function spinBlindLevel(multiplier, { startedAt, now, completedHands } = {}) {
  const row = OUTCOMES.find(([m]) => m === multiplier);
  if (!row) throw new RangeError('Unobserved spin multiplier');
  if (![startedAt, now, completedHands].every((n) => Number.isSafeInteger(n) && n >= 0)) {
    throw new RangeError('Spin clock and hand count must be nonnegative safe integers');
  }
  const [, , , unit, interval] = row;
  const step = unit === 'hands'
    ? Math.floor(completedHands / interval)
    : Math.floor(Math.max(0, now - startedAt) / (interval * MS_PER_MINUTE));
  const index = Math.min(spinSmallBlinds.length - 1, step);
  const smallBlind = spinSmallBlinds[index];
  return { level: index + 1, smallBlind, bigBlind: smallBlind * 2, unit, interval };
}
