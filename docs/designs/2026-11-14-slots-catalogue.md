# Slots catalogue — reference 03 layout

Reference: `docs/screenshots/desk-pass/reference-slots.jpg`.
Comparison: `docs/screenshots/desk-pass/compare-slots.png`.

## What changed

- The catalogue is now an **even 4-up grid of landscape tiles** like the reference,
  instead of one oversized featured tile plus a 2-column remainder.
- Section heading “DanGG Originals” with the live game count; badges (Classic, New,
  Hot, Jackpot, High, Featured) stay on the tiles.
- Responsive: 4 columns ≥1100, 3 columns 761–1100, 2 columns ≤760, 16:10 art per tile.
- Category chips, the winners ticker, top-win / best-today / daily-freebie cards and the
  18+ notice are unchanged.

## Remaining vs reference 03

The reference is a 30+ game catalogue with a promo hero row (99% RTP, Deuces Wild,
Premium Blackjack) and category tabs for Buy Bonus, Promotions and Freerolls. DanGG has
six originals, so the same structure holds but the shelf is shorter; Buy Bonus and
Freerolls are not implemented (no bonus-buy mechanic / free-roll slot events).

## Verification

- Captures at 390/768/1200 (`docs/screenshots/slots-final`), 0 px overflow.
- 864 node tests, `tsc --noEmit`, Vite build: clean.
