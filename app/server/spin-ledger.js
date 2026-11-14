// Jackpot SNG ledger settlement (P0 slice S1b). A Spin seat's chips are not cash: the buy-in
// opens a session, and the session is closed exactly once by the place payout from the
// verified table (server/spin.js). `out:<session>` is unique per user in `transactions`, so a
// later cash-out, bust close or repeated hook call for the same session is skipped.
import { addTransactionEx } from './db.js';
import { ordinal } from './tournament.js';

const outReference = (sessionId) => `out:${sessionId}`;

/** Credit a finished place (onSpinPayout hook). Bots and session-less seats are not paid. */
export function settleSpinPayout(table, finish) {
  if (finish.isBot) return { applied: false, reason: 'bot' };
  if (!finish.sessionId) return { applied: false, reason: 'no session' };
  const memo = `${table.cfg.name} — Spin ${table.spinMultiplier}x, finished ${ordinal(finish.place)}`;
  const res = addTransactionEx(finish.id, finish.payout > 0 ? 'spin_payout' : 'session_close', finish.payout, memo, 'USD', {
    sessionId: finish.sessionId, reference: outReference(finish.sessionId), onDuplicate: 'skip',
  });
  return { applied: res.applied, balance: res.balance };
}

/** Close a seat leaving a running Spin; a no-op when its place payout already closed it. */
export function closeSpinSession(userId, sessionId, reason) {
  if (!sessionId) return { applied: false };
  return addTransactionEx(userId, 'session_close', 0, reason, 'USD', {
    sessionId, reference: outReference(sessionId), onDuplicate: 'skip',
  });
}
