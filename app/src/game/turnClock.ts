// Turn-indicator urgency (native PlayerTurnEffect3D: final five seconds tint red;
// the seated player's own indicator pulses at a 0.2 s half-period).

export const URGENT_SECONDS = 5;

/** Seat class suffix for the acting seat's remaining whole seconds. */
export function turnUrgencyClass(secondsLeft: number | null | undefined, isMe: boolean): string {
  if (secondsLeft == null || secondsLeft > URGENT_SECONDS) return '';
  return isMe ? ' urgent urgent-me' : ' urgent';
}
