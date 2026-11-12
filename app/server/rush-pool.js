// Rush & Cash pool rules (P0 slice R4): the Cash Drop.
//
// DanGG rule, not native evidence: neither the native client capture nor the Codex replica
// shows Cash Drop mechanics (see docs/designs/p0-design-plan.md § 4). Until slice R0
// provides evidence, the rule is an admin setting:
//   rush_cashdrop_rate       chance per saved Rush hand that a drop fires (0..1)
//   rush_cashdrop_amount_bb  flat drop size as a multiple of the table's big blind
// The drop never depends on the pot. Selection uses a crypto RNG by default and the
// ledger write is keyed by hand id, so a retried hand save cannot pay twice.
import { randomInt } from 'node:crypto';

export const CASHDROP_RULE_LABEL = 'DanGG rule';
export const CASHDROP_KIND = 'cashdrop';
export const CASHDROP_MEMO = 'Rush & Cash drop';

export const CASHDROP_SETTING_KEYS = Object.freeze({
  rate: 'rush_cashdrop_rate',
  amountBb: 'rush_cashdrop_amount_bb',
});

// The previous hardcoded rule fired 12% of hands and capped the drop at 5,000 on the
// 500/1,000 Rush tables, i.e. 5 big blinds.
export const CASHDROP_DEFAULTS = Object.freeze({ rate: 0.12, amountBb: 5 });

export const CASHDROP_LIMITS = Object.freeze({
  rate: Object.freeze({ min: 0, max: 1 }),
  amountBb: Object.freeze({ min: 0, max: 1000 }),
});

const RNG_RESOLUTION = 2 ** 47; // randomInt requires max - min < 2^48

/** Uniform float in [0, 1) from the OS CSPRNG. */
export function cryptoRng() {
  return randomInt(0, RNG_RESOLUTION) / RNG_RESOLUTION;
}

function checkNumber(value, { min, max }, label, { integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return `${label} must be a number`;
  if (value < min || value > max) return `${label} must be between ${min} and ${max}`;
  if (integer && !Number.isInteger(value)) return `${label} must be a whole number`;
  return null;
}

/**
 * Validate the Cash Drop keys of an admin settings payload. Keys that are absent are
 * ignored; present keys must be in range. Returns the list of error messages.
 */
export function validateCashDropSettings(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return errors;
  if (CASHDROP_SETTING_KEYS.rate in payload) {
    const err = checkNumber(payload[CASHDROP_SETTING_KEYS.rate], CASHDROP_LIMITS.rate, CASHDROP_SETTING_KEYS.rate);
    if (err) errors.push(err);
  }
  if (CASHDROP_SETTING_KEYS.amountBb in payload) {
    const err = checkNumber(payload[CASHDROP_SETTING_KEYS.amountBb], CASHDROP_LIMITS.amountBb,
      CASHDROP_SETTING_KEYS.amountBb, { integer: true });
    if (err) errors.push(err);
  }
  return errors;
}

/** Read the configured rule; a stored value that is out of range falls back to the default. */
export function readCashDropConfig(getSetting) {
  const rate = getSetting(CASHDROP_SETTING_KEYS.rate, CASHDROP_DEFAULTS.rate);
  const amountBb = getSetting(CASHDROP_SETTING_KEYS.amountBb, CASHDROP_DEFAULTS.amountBb);
  return Object.freeze({
    rate: checkNumber(rate, CASHDROP_LIMITS.rate, 'rate') ? CASHDROP_DEFAULTS.rate : rate,
    amountBb: checkNumber(amountBb, CASHDROP_LIMITS.amountBb, 'amountBb', { integer: true })
      ? CASHDROP_DEFAULTS.amountBb : amountBb,
    rule: CASHDROP_RULE_LABEL,
  });
}

/** Drop size for a stake: big blind × configured multiple (never a fraction of the pot). */
export function cashDropAmount(bb, config) {
  const blind = Number(bb);
  if (!Number.isFinite(blind) || blind <= 0) return 0;
  return Math.round(blind * config.amountBb);
}

export function cashDropReference(handId) {
  return `cashdrop:${handId}`;
}

/**
 * Decide whether a drop fires for one hand and who receives it. Pure: the caller
 * supplies the eligible players and the RNG. Returns null when no drop fires.
 */
export function rollCashDrop({ bb, candidates, config, rng = cryptoRng }) {
  if (!candidates?.length || config.rate <= 0) return null;
  if (rng() >= config.rate) return null;
  const amount = cashDropAmount(bb, config);
  if (amount <= 0) return null;
  const pick = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  const lucky = candidates[pick];
  return Object.freeze({ userId: lucky.id, nick: lucky.nick, amount });
}

/**
 * Settle the Cash Drop for a saved Rush hand.
 * ledger.hasDrop(reference) → boolean and ledger.credit(userId, amount, memo, reference)
 * → boolean (true when a new row was written). A hand without an id never drops, so
 * every paid drop is idempotent on hand-save retry.
 */
export function settleCashDrop({ handId, bb, candidates, config, ledger, rng = cryptoRng }) {
  if (!handId) return null;
  const reference = cashDropReference(handId);
  if (ledger.hasDrop(reference)) return null;
  const drop = rollCashDrop({ bb, candidates, config, rng });
  if (!drop) return null;
  const written = ledger.credit(drop.userId, drop.amount, CASHDROP_MEMO, reference);
  return written ? Object.freeze({ ...drop, reference, rule: CASHDROP_RULE_LABEL }) : null;
}

/**
 * The SQLite-backed ledger used by settleCashDrop: one `cashdrop` transaction per hand,
 * keyed by `cashdrop:<handId>` (unique per user, and checked across users before rolling).
 */
export function createCashDropLedger(db, addTransactionEx) {
  const findDrop = db.prepare('SELECT 1 FROM transactions WHERE kind = ? AND reference = ?');
  return Object.freeze({
    hasDrop: (reference) => !!findDrop.get(CASHDROP_KIND, reference),
    credit: (userId, amount, memo, reference) =>
      addTransactionEx(userId, CASHDROP_KIND, amount, memo, 'USD', { reference, onDuplicate: 'skip' }).applied,
  });
}
