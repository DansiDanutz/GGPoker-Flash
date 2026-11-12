// Native seat reservation (REA take-seat-flow / own-reservation-prompt: ReserveSeat succeeds,
// CheckTakeSeatCommand opens the buy-in popup, PlayerTakeSeat3D shows a disabled "R" on the
// seat). How long the native server keeps the seat is unknown; DanGG holds it 30 seconds.

export const RESERVE_MS = 30000;

/**
 * Reserve an empty seat for one player; a player holds at most one reservation.
 * @param {Map<number, { playerId: unknown, until: number }>} reservations
 * @returns {{ ok: true, reservations: Map, until: number } | { ok: false, error: string }}
 */
export function reserve(reservations, { seat, playerId, now, seatEmpty }) {
  if (!seatEmpty) return { ok: false, error: 'seat taken' };
  const holder = reservations.get(seat);
  if (holder && holder.playerId !== playerId && holder.until > now) return { ok: false, error: 'seat reserved' };
  const next = new Map([...reservations].filter(([, r]) => r.playerId !== playerId));
  const until = now + RESERVE_MS;
  next.set(seat, { playerId, until });
  return { ok: true, reservations: next, until };
}

/** Reservations still in force at `now`. */
export function activeReservations(reservations, now) {
  return new Map([...reservations].filter(([, r]) => r.until > now));
}

/** All reservations except the one `playerId` holds. */
export function withoutPlayer(reservations, playerId) {
  return new Map([...reservations].filter(([, r]) => r.playerId !== playerId));
}
