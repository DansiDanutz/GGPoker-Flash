/**
 * Whether a cash table or Spin with no open sockets may be closed (which cashes every seat out).
 * It waits while a dropped human still holds a live hand, and never closes a running Spin with a
 * human seated until it has a winner: a dropped connection must not forfeit either (spec rule 9.1).
 */
export function canCloseIdleTable(table) {
  const humans = table.humans();
  if (table.spinStarted() && !table.spinWinner && humans.length) return false;
  if (!table.handInProgress()) return true;
  return !humans.some((p) => p.inHand && !p.folded);
}
