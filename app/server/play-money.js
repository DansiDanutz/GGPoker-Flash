/**
 * Play-money ledger rules: deposit caps and the Add Chips idempotency reference.
 *
 * Deposits are free play money, so they are capped per request (`deposit_max`) and per
 * UTC day (`deposit_daily_max`) to stop unlimited minting. Amounts are in cents.
 */

export const DEFAULT_DEPOSIT_MAX = 100000;
export const DEFAULT_DEPOSIT_DAILY_MAX = 500000;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Start of the UTC day holding `now`, in SQLite datetime() text form. */
export function utcDayStart(now = new Date()) {
  return `${now.toISOString().slice(0, 10)} 00:00:00`;
}

/** @returns {{ max: number, dailyMax: number }} */
export function depositLimits(getSetting) {
  const positive = (v, fallback) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
  return {
    max: positive(getSetting('deposit_max', DEFAULT_DEPOSIT_MAX), DEFAULT_DEPOSIT_MAX),
    dailyMax: positive(getSetting('deposit_daily_max', DEFAULT_DEPOSIT_DAILY_MAX), DEFAULT_DEPOSIT_DAILY_MAX),
  };
}

/** Sum of today's (UTC) deposits for one user. */
export function depositedToday(db, userId, now = new Date()) {
  const row = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
    WHERE user_id = ? AND kind = 'deposit' AND created_at >= ?`).get(userId, utcDayStart(now));
  return Number(row?.total || 0);
}

/**
 * @param {{ amount: number, max: number, dailyMax: number, today: number }} input
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function checkDeposit({ amount, max, dailyMax, today }) {
  if (amount > max) {
    return { ok: false, status: 400, error: `Deposits are limited to ${max / 100} play-money dollars per request` };
  }
  if (today + amount > dailyMax) {
    const left = Math.max(0, dailyMax - today);
    return {
      ok: false,
      status: 429,
      error: `Daily play-money deposit limit reached (${dailyMax / 100} per UTC day, ${left / 100} left today)`,
    };
  }
  return { ok: true };
}

/** A client idempotency key, or null when absent or malformed. */
export function cleanIdempotencyKey(value) {
  const key = String(value ?? '').trim();
  return IDEMPOTENCY_KEY.test(key) ? key : null;
}

/**
 * Ledger reference for an Add Chips request. A client key makes a retried submission land
 * on the same reference (so it cannot debit twice); without one the per-seat counter is used.
 */
export function rebuyReference(sessionId, rebuyNo, clientKey) {
  const key = cleanIdempotencyKey(clientKey);
  return key ? `in:${sessionId}:k:${key}` : `in:${sessionId}:r${rebuyNo}`;
}
