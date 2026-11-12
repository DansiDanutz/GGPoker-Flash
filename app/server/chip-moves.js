// Add Chips during a hand (REA F14) and Remove Chips (REA F15) for cash seats.
//
// Add Chips in a live hand is paid now and held as one pending top-up per seat; a new request
// replaces it and only the difference moves. It lands on the stack at the next deal (capped at
// the table maximum) and is refunded if the player leaves first. Remove Chips takes the surplus
// above the table minimum buy-in back to the wallet between hands.
//
// The caller passes `ledger({ kind, amount, memo, reference }) -> { applied }`, which must skip a
// duplicate reference (addTransactionEx with onDuplicate: 'skip'). Every reference starts with
// the seat's session id, so a replayed move never changes the wallet twice.
// The limit formulas mirror src/game/chipMoves.ts (kept in step by a parity test).

export const AUTO_REDUCE_STEP_BB = 10;
export const AUTO_REDUCE_CAP_BB = 200;
const MOVE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

const whole = (n) => Math.max(0, Math.floor(Number(n) || 0));
const fail = (error) => ({ ok: false, error });

/** max = min(table max − stack − pending, wallet); min = max(table min − stack − pending, 0) clamped to max. */
export function addChipsLimits({ stack, pending = 0, minBuyin, maxBuyin, balance }) {
  const max = whole(Math.min(maxBuyin - stack - pending, balance));
  const min = Math.min(whole(minBuyin - stack - pending), max);
  return { min, max };
}

/** F15: only the surplus above the table minimum buy-in can leave the table. */
export function removeChipsLimits({ stack, minBuyin }) {
  return { min: 0, max: whole(stack - minBuyin) };
}

/** F15 "Always reduce my stack to": from the table minimum in 10 BB steps up to min(max, 200 BB). */
export function autoReduceOptions({ minBuyin, maxBuyin, bb }) {
  if (!(bb > 0)) return [];
  const first = Math.max(AUTO_REDUCE_STEP_BB, Math.ceil(minBuyin / bb / AUTO_REDUCE_STEP_BB) * AUTO_REDUCE_STEP_BB);
  const last = Math.min(Math.floor(maxBuyin / bb / AUTO_REDUCE_STEP_BB) * AUTO_REDUCE_STEP_BB, AUTO_REDUCE_CAP_BB);
  const out = [];
  for (let n = first; n <= last; n += AUTO_REDUCE_STEP_BB) out.push(n);
  return out;
}

export const STALE_TOP_UP = 'Your pending chips changed; check the amount and try again';

/**
 * The seat's top-up version: it only moves forward, once for every top-up that is applied,
 * changed, cancelled or settled at the deal. Pending chips return to 0 after a deal, so the
 * pending amount alone cannot tell a replayed request from a new one; the version can.
 */
export function noteTopUpApplied(player) {
  player.topUpVersion = (player.topUpVersion || 0) + 1;
}

/**
 * Optimistic check for an Add Chips request: the client echoes the pending amount and the top-up
 * version it saw. A mismatch on either means the request is stale or a replay. Returns an error or null.
 */
export function topUpRequestError(player, { basePending, topUpVersion }) {
  const pending = player.pendingTopUp || 0;
  const version = player.topUpVersion || 0;
  const sentPending = Number(basePending ?? 0);
  const sentVersion = Number(topUpVersion ?? 0);
  return sentPending === pending && sentVersion === version ? null : STALE_TOP_UP;
}

/** Chips in front of a player still in the hand cannot change until the hand is over. */
export function inLiveHand(table, player) {
  return table.handInProgress() && !!player.inHand && !player.folded;
}

/**
 * Sets the seat's pending top-up to `total` chips. `balance` is the wallet before this move.
 * The wallet pays (or gets back) only the difference from the current pending amount.
 * `chargeReference` (from the client's idempotency key) names a charge so a retried request,
 * even one that first landed as a between-hands rebuy, is recognised and not paid twice.
 */
export function setPendingTopUp({ player, total, minBuyin, maxBuyin, balance, ledger, chargeReference = null }) {
  if (!Number.isSafeInteger(total) || total < 0) return fail('Choose whole chips');
  const pending = player.pendingTopUp || 0;
  if (total === pending) return { ok: true, pending, moved: 0 };
  if (total > 0) {
    const { min, max } = addChipsLimits({ stack: player.stack, pending: 0, minBuyin, maxBuyin, balance: balance + pending });
    if (total > max) return fail(total + player.stack > maxBuyin ? 'That would take your stack over the table maximum' : 'not enough balance');
    if (total < min) return fail('Top-up must bring your stack to the table minimum');
  }
  const diff = total - pending;
  const seq = (player.topUpSeq || 0) + 1;
  const res = ledger({
    kind: diff > 0 ? 'rebuy' : 'chips_refund',
    amount: -diff,
    memo: diff > 0 ? 'Add chips (next hand)' : 'Pending chips refund',
    reference: diff > 0 && chargeReference ? chargeReference : `topup:${player.sessionId}:${seq}`,
  });
  if (!res.applied) return { ...fail('Add chips already applied'), duplicate: true };
  player.topUpSeq = seq;
  player.pendingTopUp = total;
  noteTopUpApplied(player);
  return { ok: true, pending: total, moved: -diff };
}

/** Cancels the pending top-up and refunds it. */
export function cancelPendingTopUp({ player, ledger }) {
  return setPendingTopUp({ player, total: 0, minBuyin: 0, maxBuyin: 0, balance: 0, ledger });
}

/**
 * At the deal: the pending chips join the stack, never past the table maximum; any part over the
 * maximum (the player won a pot meanwhile) goes back to the wallet. Returns the chips added.
 */
export function settlePendingTopUp({ player, maxBuyin, ledger }) {
  const pending = player.pendingTopUp || 0;
  if (pending <= 0) return 0;
  const added = Math.min(pending, whole(maxBuyin - player.stack));
  const excess = pending - added;
  if (excess > 0) {
    ledger({
      kind: 'chips_refund', amount: excess, memo: 'Pending chips over the table maximum',
      reference: `topup:${player.sessionId}:${player.topUpSeq || 0}:cap`,
    });
  }
  player.stack += added;
  player.pendingTopUp = 0;
  noteTopUpApplied(player);
  return added;
}

/** Leaving before the next deal: the whole pending top-up goes back. Returns the chips refunded. */
export function refundPendingTopUp({ player, ledger }) {
  const pending = player.pendingTopUp || 0;
  if (pending <= 0) return 0;
  ledger({
    kind: 'chips_refund', amount: pending, memo: 'Pending chips refund (left the table)',
    reference: `topup:${player.sessionId}:${player.topUpSeq || 0}:leave`,
  });
  player.pendingTopUp = 0;
  noteTopUpApplied(player);
  return pending;
}

/**
 * Remove Chips: between hands (or once folded), down to the table minimum buy-in. A client `key`
 * names the request so a retried message is recognised; otherwise a per-seat counter does.
 */
export function removeChips({ table, player, amount, key = null, ledger }) {
  if (inLiveHand(table, player)) return fail('Remove chips after this hand');
  if ((player.pendingTopUp || 0) > 0) return fail('Cancel your pending chips first');
  if (!Number.isSafeInteger(amount) || amount <= 0) return fail('Choose whole chips to remove');
  const { max } = removeChipsLimits({ stack: player.stack, minBuyin: Number(table.cfg.min_buyin) || 0 });
  if (amount > max) return fail(max > 0 ? `You can remove up to ${max} chips` : 'Your stack is at the table minimum');
  const seq = (player.removeSeq || 0) + 1;
  const name = typeof key === 'string' && MOVE_KEY.test(key) ? key : String(seq);
  const res = ledger({ kind: 'remove_chips', amount, memo: 'Remove chips', reference: `remove:${player.sessionId}:${name}` });
  if (!res.applied) return fail('Remove chips already applied');
  player.removeSeq = seq;
  player.stack -= amount;
  return { ok: true, removed: amount, stack: player.stack };
}

/** Turns "Always reduce my stack to N BB" off (null/0) or on at one of the listed targets. */
export function setAutoReduce({ player, value, minBuyin, maxBuyin, bb }) {
  if (value == null || value === 0 || value === false) {
    player.autoReduceBB = 0;
    return { ok: true, value: 0 };
  }
  if (!autoReduceOptions({ minBuyin, maxBuyin, bb }).includes(value)) return fail('Choose a listed stack size');
  player.autoReduceBB = value;
  return { ok: true, value };
}

/** Before a deal: trims the stack to the chosen BB target, once per hand number. Returns chips removed. */
export function applyAutoReduce({ player, bb, minBuyin, handNo, ledger }) {
  if (!player.autoReduceBB || !(bb > 0)) return 0;
  const target = Math.max(player.autoReduceBB * bb, minBuyin);
  const surplus = whole(player.stack - target);
  if (surplus <= 0) return 0;
  const res = ledger({ kind: 'remove_chips', amount: surplus, memo: 'Auto reduce stack', reference: `remove:${player.sessionId}:auto:${handNo}` });
  if (!res.applied) return 0;
  player.stack -= surplus;
  return surplus;
}

/**
 * Everything that changes a cash stack before a deal: auto-reduce first, then the pending top-up.
 * A seat reserved to leave after the hand is skipped, so its pending chips go back as a refund
 * when the server cashes it out instead of joining a stack it will never play.
 */
export function settleBeforeDeal({ player, bb, minBuyin, maxBuyin, handNo, ledger }) {
  if (player.leaveAfterHand) return;
  applyAutoReduce({ player, bb, minBuyin, handNo, ledger });
  settlePendingTopUp({ player, maxBuyin, ledger });
}
