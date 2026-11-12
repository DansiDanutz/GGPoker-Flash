/** Shown on every casino-style game: play money only, adults only. */
export function AgeNotice() {
  return (
    <p className="age-notice" role="note">
      <span className="age-notice-badge" aria-hidden="true">18+</span>
      For adults only. Play money for entertainment; chips have no cash value and cannot be bought or cashed out.
    </p>
  );
}
