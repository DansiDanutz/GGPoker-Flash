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
