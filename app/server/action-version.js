/**
 * Action versioning (REA F08, spec 9.2). A client stamps each hand-scoped message with the
 * `handNo` of the state it was looking at, and each turn action with its `turnNo`; the server
 * refuses it when the table has moved on, so a late click cannot land on the next hand or turn.
 * A message with no stamp is refused too: a cached old bundle must reload rather than act blind.
 */

export const STALE_ACTION_ERROR = 'That hand is over: your action was not applied.';
export const UNSTAMPED_ACTION_ERROR = 'Your app is out of date: reload the page to keep playing.';

/** The error for a message aimed at another hand (or with no hand number), or null when it may be applied. */
export function staleHandError(table, msg) {
  if (msg?.handNo == null) return UNSTAMPED_ACTION_ERROR;
  return Number(msg.handNo) === table.handNo ? null : STALE_ACTION_ERROR;
}

export const STALE_TURN_ERROR = 'That turn is over: your action was not applied.';

/**
 * The error for an action aimed at an earlier turn of this hand (a double tap, a late packet),
 * or null when it may be applied. Each turn has its own number (`table.turnNo`); Fast Fold is
 * valid before the player's turn and is exempt.
 */
export function staleTurnError(table, msg) {
  if (msg?.action === 'quickfold') return null;
  if (msg?.turnNo == null) return UNSTAMPED_ACTION_ERROR;
  return Number(msg.turnNo) === table.turnNo ? null : STALE_TURN_ERROR;
}
