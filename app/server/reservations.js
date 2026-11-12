// Seat reservations a player can arm ahead of time: leave the table once the current hand is
// over, sit out when the big blind would reach the seat, and sit out at every table at once.
// The flags live on the seat's player object, so the server applies them, not the client.

/** Reservation flags a seated cash player may set through the `option` message. */
export const RESERVATION_KINDS = Object.freeze(['leaveAfterHand', 'sitOutNextBigBlind']);

const seatsFrom = (table, start) => {
  const n = table.seats.length;
  return Array.from({ length: n }, (_, i) => table.seats[(((start + i) % n) + n) % n]);
};

/**
 * The seat that would post the big blind if the next hand were dealt now. Mirrors
 * startHand() and promoteWaitingBigBlind(): the button moves to the next dealt-in seat, a
 * waiter who has sat through a full orbit is dealt back in, a waiter for the big blind takes
 * it when it reaches them, heads-up the non-button seat posts it.
 */
export function nextBigBlindSeat(table) {
  const dealt = (s) => !!s.player && table.isDealtIn(s.player);
  const waiting = (s) => !!s.player && table.waitsForBigBlind(s.player);
  const expiring = (s) => waiting(s) && (s.player.waitedHands || 0) + 1 > table.seats.length;
  const stillWaiting = (s) => waiting(s) && !expiring(s);
  const button = seatsFrom(table, table.button + 1).find(dealt);
  if (!button) return null;
  const ring = seatsFrom(table, button.index + 1).filter((s) => dealt(s) || waiting(s));
  const promoted = ring.length >= 3 && !stillWaiting(ring[0]) && stillWaiting(ring[1]) ? ring[1] : null;
  const postOrder = ring.filter((s) => dealt(s) || expiring(s) || s === promoted);
  if (postOrder.length < 2) return null;
  if (postOrder.length === 2) return postOrder.find((s) => s !== button) || null;
  return postOrder[1];
}

/** Before a deal: seats that reserved "sit out next big blind" and are due it sit out now. */
export function applyBigBlindSitOuts(table) {
  const satOut = [];
  for (let i = 0; i < table.seats.length; i++) {
    const p = nextBigBlindSeat(table)?.player;
    if (!p?.sitOutNextBigBlind) break;
    p.sitOutNextBigBlind = false;
    p.sittingOut = true;
    satOut.push(p.id);
  }
  return satOut;
}

/** Players who reserved "leave after this hand" and are no longer in a live hand. */
export function pendingLeaves(table) {
  const live = table.handInProgress();
  return table.occupiedSeats()
    .map((s) => s.player)
    .filter((p) => p.leaveAfterHand && !(live && p.inHand))
    .map((p) => p.id);
}

/**
 * "Sit out at all tables": sit-out-next-hand at every table the user is seated at, or sit
 * back in everywhere when value is false. Returns how many tables changed and any refusals.
 */
export function sitOutEverywhere(tables, userId, value) {
  const errors = [];
  let count = 0;
  for (const table of tables) {
    const p = table.seatOf(userId)?.player;
    if (!p) continue;
    const res = table.requestSitOut(userId, value);
    if (!res.ok) { errors.push(res.error); continue; }
    p.sitOutAll = !!value;
    count++;
  }
  return { tables: count, errors };
}
