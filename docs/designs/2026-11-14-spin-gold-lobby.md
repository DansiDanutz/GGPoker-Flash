# Spin & Gold lobby (reference 10)

Reference: `docs/screenshots/desk-pass/reference-spin.jpg`.
Comparison: `docs/screenshots/desk-pass/compare-spin.png`.

## What changed

The Spin & Gold tab no longer reuses the generic cash table list. It now renders a
dedicated **stone-tile stake lobby**:

- Header: kicker, “Three-handed jackpot SNGs.”, short rules line and the number of open
  tables.
- **Octagonal stone tiles**, one per live buy-in tier: seats (3-Max), buy-in, **WIN UP
  TO** prize (top multiplier × buy-in), open-table player count, and the top multiplier
  (×20,000) in the corner. The selected tile gets a gold rim.
- **Prize wheel ladder** under the tiles, from the real `/api/spin/info` payouts:
  ×2 → ×20,000 with prize pool and 1-in odds, gold highlights for ×10+.
- Bottom bar: number of games, selected stake/players and **Play Now** (joins the first
  table of the selected tier).
- The generic filters/table list are skipped on this tab; the right panel keeps the
  Info / Blind Structure / Payout tabs and Join/Watch for the selected table.

## Remaining vs reference 10

The reference shows twelve stake tiers (P$0.25 → P$20) mixing 3-max and 6-max, and a
right-hand “Top Prize” feed of recent winners. DanGG currently seeds two tiers
(P$50, P$100), both 3-max, so the grid has two large tiles and the prize feed is the
payout ladder rather than a live winners list.

## Verification

- Captures at 768/1200/1440 (`docs/screenshots/spin`), 0 px overflow; two tiles and the
  ladder render at every width.
- 864 node tests, `tsc --noEmit`, Vite build: clean.
