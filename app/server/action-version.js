/**
 * Action versioning (REA F08). A client stamps each hand-scoped message with the `handNo` of
 * the state it was looking at; the server refuses it when the table has moved on, so a late
 * click cannot land on the next hand. A message without a hand number is accepted, which
 * keeps older clients working.
 */

export const STALE_ACTION_ERROR = 'That hand is over: your action was not applied.';

/** The error for a message aimed at another hand, or null when it may be applied. */
export function staleHandError(table, msg) {
  if (msg?.handNo == null) return null;
  return Number(msg.handNo) === table.handNo ? null : STALE_ACTION_ERROR;
}

export const STALE_TURN_ERROR = 'That turn is over: your action was not applied.';

/**
 * The error for an action aimed at an earlier turn of this hand (a double tap, a late packet),
 * or null when it may be applied. Each turn has its own number (`table.turnNo`); Fast Fold is
 * valid before the player's turn and is exempt. No number keeps older clients working.
 */
export function staleTurnError(table, msg) {
  if (msg?.turnNo == null || msg.action === 'quickfold') return null;
  return Number(msg.turnNo) === table.turnNo ? null : STALE_TURN_ERROR;
}
