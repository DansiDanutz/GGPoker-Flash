import { prizeAmounts } from './spin.js';

const fields = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
const bad = () => { throw Object.assign(new Error('Provide complete explicit local-practice six-seat Spin rules'), { status: 400 }); };

export function spinSixConfiguration(value) {
  if (!fields(value, ['mode', 'seats', 'buyIn', 'smallBlinds', 'clock', 'outcomes']) || value.mode !== 'local-practice' || value.seats !== 6 || !Number.isSafeInteger(value.buyIn) || value.buyIn < 1 || value.buyIn > 1000000000) bad();
  if (!fields(value.clock, ['actionSeconds', 'freeTimeChipSecondsPerUnit', 'maxTimeChipsPerAction'])
    || !Number.isSafeInteger(value.clock.actionSeconds) || value.clock.actionSeconds < 1 || value.clock.actionSeconds > 120
    || !Number.isSafeInteger(value.clock.freeTimeChipSecondsPerUnit) || value.clock.freeTimeChipSecondsPerUnit < 1 || value.clock.freeTimeChipSecondsPerUnit > 60
    || !Number.isSafeInteger(value.clock.maxTimeChipsPerAction) || value.clock.maxTimeChipsPerAction < 1 || value.clock.maxTimeChipsPerAction > 4) bad();
  const blinds = value.smallBlinds;
  if (!Array.isArray(blinds) || !blinds.length || blinds.length > 64 || Object.keys(blinds).length !== blinds.length || !blinds.every((amount, index) => Number.isSafeInteger(amount) && amount >= 1 && amount <= Math.floor(Number.MAX_SAFE_INTEGER / 2) && (!index || amount > blinds[index - 1]))) bad();
  if (!Array.isArray(value.outcomes) || !value.outcomes.length || value.outcomes.length > 32) bad();
  const outcomes = [];
  const multipliers = new Set();
  let frequency = 0;
  for (const row of value.outcomes) {
    if (!fields(row, ['multiplier', 'frequency', 'prizeShares', 'startingChips', 'timeBankCards', 'noDealing', 'unit', 'interval']) || !Number.isSafeInteger(row.multiplier) || row.multiplier < 1 || !Number.isSafeInteger(value.buyIn * row.multiplier) || multipliers.has(row.multiplier) || !Number.isSafeInteger(row.frequency) || row.frequency < 1 || row.frequency > 100000000 || !Number.isInteger(row.startingChips) || row.startingChips < 300 || row.startingChips > 1000 || !Number.isInteger(row.timeBankCards) || row.timeBankCards < 1 || row.timeBankCards > 4 || row.noDealing !== false || !['minutes', 'hands'].includes(row.unit) || !Number.isSafeInteger(row.interval) || row.interval < 1 || row.interval > 60) bad();
    const shares = row.prizeShares;
    if (!Array.isArray(shares) || !shares.length || shares.length > 6 || Object.keys(shares).length !== shares.length || !shares.every((share) => Number.isInteger(share) && share > 0 && share <= 100) || shares.reduce((sum, share) => sum + share, 0) !== 100) bad();
    multipliers.add(row.multiplier);
    frequency += row.frequency;
    outcomes.push({ ...row, prizeShares: [...shares] });
  }
  if (frequency !== 100000000) bad();
  return { mode: 'local-practice', seats: 6, buyIn: value.buyIn, smallBlinds: [...blinds], clock: { ...value.clock }, outcomes };
}

export function spinSixOutcome(configuration, ticket) {
  const config = spinSixConfiguration(configuration);
  if (!Number.isSafeInteger(ticket) || ticket < 0 || ticket >= 100000000) throw new RangeError('Spin ticket must be an integer from 0 to 99999999');
  for (const row of config.outcomes) {
    if (ticket < row.frequency) {
      const prizePool = config.buyIn * row.multiplier;
      const amounts = prizeAmounts(prizePool, row.prizeShares);
      return { mode: config.mode, seats: 6, buyIn: config.buyIn, multiplier: row.multiplier, frequency: row.frequency, startingChips: row.startingChips, timeBankCards: row.timeBankCards, noDealing: false, unit: row.unit, interval: row.interval, prizePool, prizes: Array.from({ length: 6 }, (_, index) => amounts[index] || 0) };
    }
    ticket -= row.frequency;
  }
  throw new Error('Invalid six-seat Spin probability total');
}

export function spinSixBlindLevel(configuration, multiplier, { startedAt, now, completedHands }) {
  const config = spinSixConfiguration(configuration);
  const row = config.outcomes.find((entry) => entry.multiplier === multiplier);
  if (!row) throw new RangeError('Unconfigured six-seat Spin multiplier');
  if (![startedAt, now, completedHands].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new RangeError('Spin clock and hand count must be nonnegative safe integers');
  const index = Math.min(config.smallBlinds.length - 1, row.unit === 'hands' ? Math.floor(completedHands / row.interval) : Math.floor(Math.max(0, now - startedAt) / (row.interval * 60000)));
  return { level: index + 1, smallBlind: config.smallBlinds[index], bigBlind: config.smallBlinds[index] * 2, unit: row.unit, interval: row.interval };
}

export function spinModeSeats(mode) { return mode === '6max' ? 6 : 3; }
export function spinInsuranceMultiplier(mode) { return mode === '6max' ? 4 : 2; }
export function spinSixDraft(stake) {
  return { mode: 'local-practice', seats: 6, buyIn: stake, smallBlinds: [10, 20, 40], clock: { actionSeconds: 15, freeTimeChipSecondsPerUnit: 10, maxTimeChipsPerAction: 3 }, outcomes: [{ multiplier: 4, frequency: 100000000, prizeShares: [100], startingChips: 500, timeBankCards: 3, noDealing: false, unit: 'minutes', interval: 1 }] };
}
export function spinPrizeScope(mode, stake) { return `${mode === '6max' ? 'spin6' : 'spin3'}:${stake}`; }
export function spinInsuranceScope(mode, stake) { return `${mode === '6max' ? 'spin6' : 'spin3'}-insurance:${stake}`; }
