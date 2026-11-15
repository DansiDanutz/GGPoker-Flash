/**
 * A dropped connection never forfeits a live hand: that hand plays on the normal clock and time
 * bank, and the seat sits out from the next hand. A seat not in a live hand sits out at once.
 * The player's own sit-out choices are remembered so a reconnect restores them (spec 8.1, 9.1).
 */
export function awayChanges(player, { live }) {
  const awayChoice = Object.freeze({
    sittingOut: !!player.sittingOut,
    sitOutNextHand: !!player.sitOutNextHand,
    sitOutAll: !!player.sitOutAll,
  });
  const holdsLiveHand = live && player.inHand && !player.folded;
  return holdsLiveHand
    ? { away: true, awayChoice, sitOutNextHand: true }
    : { away: true, awayChoice, sittingOut: true };
}

/** On reconnect: sit back in unless the player had chosen to sit out before dropping. */
export function shouldSitBackIn(awayChoice) {
  if (!awayChoice) return true;
  return !awayChoice.sittingOut && !awayChoice.sitOutNextHand && !awayChoice.sitOutAll;
}
