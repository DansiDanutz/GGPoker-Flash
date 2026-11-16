# Tournament selected-event details (reference 020 / selected-in-list)

Reference: `docs/screenshots/desk-pass/reference-tourn-selected.jpg`.
Comparison: `docs/screenshots/desk-pass/compare-tourn-details.png`.

## What changed

Selecting a tournament row now opens a **Details** dock in the right panel instead of
leaving the filter panel unchanged:

- The panel has two tabs — **Filters** and **Details** — with Details activated by a row
  click or the tab itself.
- The details card follows the reference vocabulary: mode/format kicker, event name,
  hashtag chips (#standard, #nlh, #late-reg, #freeroll), start time and phase,
  **Buy-in, Guarantee, Prize pool, Overlay, Players, Starting chips, Blind interval,
  Late reg ends**, then **Register/Play**, **Full lobby** and **Back to filters**.
- Prize pool and overlay are derived from the live record
  (`entrants × buyin`, `max(0, GTD − prize pool)`).
- “Full lobby” still opens the existing overview/structure/prizes modal.

## Remaining vs reference

The reference pins the details card above the filter panel and adds a “Satellites
available” strip plus a current blind level. DanGG shows details on its own tab and does
not model satellites/blind levels in the list payload, so those two rows are omitted.

## Verification

- Captures at 768/1200 (`docs/screenshots/tourn-details`), 0 px overflow.
- Interaction: clicking the second row highlights it and opens Details; Register uses the
  selected event; Back to filters restores the filter panel.
- 864 node tests, `tsc --noEmit`, Vite build: clean.
