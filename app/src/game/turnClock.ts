// Turn-indicator urgency (native PlayerTurnEffect3D, REA six-seat-turn-indicator and
// aof-turn-urgency): every actor's glow blinks at a 500 ms half-period; only the viewer's
// own seat turns urgent (tint #ff7f7f, 200 ms half-period) in its final five seconds.

export const URGENT_SECONDS = 5;

/** Seat class suffix for the acting seat; urgency is shown to the acting player only. */
export function turnUrgencyClass(secondsLeft: number | null | undefined, isMe: boolean): string {
  if (!isMe || secondsLeft == null || secondsLeft > URGENT_SECONDS) return '';
  return ' urgent';
}

/** Native PlayerTimeBank3D shows the Time bank button only in the final ten seconds. */
export const TIME_BANK_SECONDS = 10;

export function timeBankOffered(t: { myTurn: boolean; secondsLeft: number | null | undefined; used: boolean }): boolean {
  return t.myTurn && !t.used && t.secondsLeft != null && t.secondsLeft <= TIME_BANK_SECONDS;
}
