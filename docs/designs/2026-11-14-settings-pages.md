# Granular settings pages (reference settings section)

Reference: the twelve settings screens (`50`–`61` in the reference set).
Evidence: `docs/screenshots/settings-pages/1200-settings.png`,
`1200-squeeze.png`, `390-settings.png`.

## What changed

The Settings window’s left menu now lists the **twelve reference pages** instead of six
broad groups:

1. Betting options · 2. Buy-in settings · 3. Card Squeeze · 4. Chip Shuffle ·
5. Device access · 6. Hotkey · 7. Language · 8. Smart Focus · 9. Sound ·
10. Switch Chip Display · 11. Table Theme · 12. Time Bank Card

- Selecting a page switches to its parent group and **scrolls its section to the top of
  the pane**, with a short gold flash so the target is obvious (reduced-motion respected
  by the browser’s scroll behaviour).
- The page title reflects the granular page, not the parent group.
- **Smart Focus** is new: a persisted switch (`ggpoker.smartFocus`).
- **Switch Chip Display** anchors the existing stack-display select
  (Chips / Big blinds / Both).
- **Device access** anchors the Sessions card with “Sign out other devices”.
- **Table Theme** and **Time Bank Card** anchor their existing controls.
- Phone: the swatch grids are paint-contained, previews are hidden and each choice is a
  44 px row, so the pane stays clean and scrollable at 390 px.

## Remaining

Each page still renders inside its parent group with the other sections visible above
and below; the reference gives every page its own isolated pane. Splitting the form into
twelve components is the next step (tracked in the acceptance matrix).

## Verification

- 12 menu items, correct title and flash on desktop and 390 px; 0 px horizontal overflow.
- 865 node tests, `tsc --noEmit`, Vite build: clean.
