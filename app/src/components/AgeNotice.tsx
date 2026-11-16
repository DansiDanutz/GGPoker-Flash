/** Adults-only notice distinguishing free demo and organizer balances. */
export function AgeNotice() {
  return (
    <p className="age-notice" role="note">
      <span className="age-notice-badge" aria-hidden="true">18+</span>
      For adults only. Free demo chips have no cash value. Organizer Cash Chips have separate balances and organizer terms.
    </p>
  );
}
