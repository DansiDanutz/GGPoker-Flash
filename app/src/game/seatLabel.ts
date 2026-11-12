// Seat nameplate text (native NewPlayerLabel3D, REA seat-labels and stack-status).

/** Longest nickname shown whole; longer names keep NICK_MAX - 1 units plus "..". */
export const NICK_MAX = 15;

export function seatNick(nick: string | null | undefined): string {
  const name = nick ?? '';
  return name.length > NICK_MAX ? `${name.slice(0, NICK_MAX - 1)}..` : name;
}

/** An occupied seat whose balance is zero reads "All-In" in place of the amount. */
export function isAllInStatus(seat: { nick?: string | null; stack?: number | null }): boolean {
  return !!seat.nick && seat.stack === 0;
}
