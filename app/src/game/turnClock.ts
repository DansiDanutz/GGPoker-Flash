// Turn-indicator urgency (native PlayerTurnEffect3D, REA six-seat-turn-indicator and
// aof-turn-urgency): every actor's glow blinks at a 500 ms half-period; only the viewer's
// own seat turns urgent (tint #ff7f7f, 200 ms half-period) in its final five seconds.

export const URGENT_SECONDS = 5;

/** Seat class suffix for the acting seat; urgency is shown to the acting player only. */
export function turnUrgencyClass(secondsLeft: number | null | undefined, isMe: boolean): string {
  if (!isMe || secondsLeft == null || secondsLeft > URGENT_SECONDS) return '';
  return ' urgent';
}
