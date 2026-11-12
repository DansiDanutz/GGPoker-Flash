// Rush & Cash Drop display + admin-form helpers (P0 slice R4). The rule itself lives in
// server/rush-pool.js; this mirrors its keys, defaults and limits for the client.

export const CASHDROP_RULE_LABEL = 'DanGG rule';
export const CASHDROP_RATE_KEY = 'rush_cashdrop_rate';
export const CASHDROP_AMOUNT_BB_KEY = 'rush_cashdrop_amount_bb';
export const CASHDROP_KEYS: readonly string[] = [CASHDROP_RATE_KEY, CASHDROP_AMOUNT_BB_KEY];
export const CASHDROP_DEFAULT_RATE = 0.12;
export const CASHDROP_DEFAULT_AMOUNT_BB = 5;
const AMOUNT_BB_MAX = 1000;

export interface CashDropConfig {
  rate: number;
  amountBb: number;
  rule: string;
}

export interface CashDropEvent {
  nick: string;
  amount: number;
  rule?: string;
}

/** "12%" for 0.12; keeps one decimal when the rate is not a whole percentage. */
export function cashDropRateLabel(rate: number | null | undefined): string {
  const r = typeof rate === 'number' && Number.isFinite(rate) ? rate : CASHDROP_DEFAULT_RATE;
  const pct = Math.round(r * 1000) / 10;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/** Admin-form validation for the two Cash Drop settings; returns error messages keyed by setting. */
export function cashDropFieldErrors(settings: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  const rate = settings[CASHDROP_RATE_KEY];
  if (rate !== undefined && (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 1)) {
    errors[CASHDROP_RATE_KEY] = 'Drop rate must be a number between 0 and 1 (0.12 = 12%).';
  }
  const bb = settings[CASHDROP_AMOUNT_BB_KEY];
  if (bb !== undefined && (typeof bb !== 'number' || !Number.isInteger(bb) || bb < 0 || bb > AMOUNT_BB_MAX)) {
    errors[CASHDROP_AMOUNT_BB_KEY] = `Drop amount must be a whole number of big blinds from 0 to ${AMOUNT_BB_MAX}.`;
  }
  return errors;
}
