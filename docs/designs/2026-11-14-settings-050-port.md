# Game Settings 050 — reference port

Reference: `docs/screenshots/desk-pass/reference-050.jpg` (Paper screen 050).
Comparison: `docs/screenshots/desk-pass/compare-settings.png`.

## What changed

Settings is now the reference **account window** instead of a full-page form with a
horizontal sub-nav:

- **Window tabs**: My Page / Prop Bet / Ocean Rewards / My Promo / **Game Settings
  (active red)** / close, matching the reference.
- **Left menu** with the six settings groups (General, Sound, Table & cards, Betting,
  Account, Responsible gaming), active item in red.
- **Pane**: section title + hint, the existing grouped controls re-laid into the
  reference card grid, and a sticky bottom action bar (Cancel / Apply / OK + dirty
  state).
- All existing behaviour is preserved: every control stages into a draft, Apply/OK
  writes locally + to the account, Cancel/Escape discards, sound previews stop on
  leave, hotkey capture still intercepts in the capture phase.

The reference splits settings into twelve granular pages (Betting options, Buy-in,
Card Squeeze, Chip Shuffle, Device access, Hotkey, Language, Smart Focus, Sound,
Switch Chip Display, Table Theme, Time Bank Card). DanGG keeps the same controls but
groups them into six pages; the granular split is documented here as the remaining
difference.

## Verification

- Captures at 320/390/768/1200 (`docs/screenshots/settings-final`), 0 px overflow;
  General and Sound panes captured.
- Interaction: left-menu navigation switches panes (6 items), toggling a checkbox
  flips the action bar to “Unsaved changes” and enables Apply.
- 864 node tests (one flaky quick-fold WS test failed once, passed on rerun), `tsc`,
  Vite build clean.
