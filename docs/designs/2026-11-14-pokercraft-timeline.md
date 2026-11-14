# PokerCraft Timeline — reference port

Reference: `docs/screenshots/desk-pass/reference-pokercraft.jpg`.
Comparison: `docs/screenshots/desk-pass/compare-pokercraft.png`.

## What changed

`/hand-history` is now a PokerCraft timeline instead of a table of hands:

- **Left rail**: PokerCraft brand, the player avatar + name, Timeline (active),
  Player Notes & Labels, Staking Profile, the game filters (Spin & Gold, All-in or
  Fold, Rush & Cash, Mystery Battle Royale, Hold'em, PLO, Short Deck), My Tournaments
  and My Staking. The secondary entries deep-link to the existing pages.
- **Toolbar**: Last 1 Year / All time range pills, a hand search and refresh.
- **Summary**: hand count and net result for the filtered range.
- **Timeline**: hands grouped by day with a date gutter; each hand is an expandable
  card showing game · table · hand number and a Won/Lost/Folded result. Expanding
  shows the board, pot, your result, winner and time.
- **Footer**: local-time note + PokerCraft copyright.

The reference's timeline is a notice feed (`[Notice] Massive Events…`); DanGG's is
populated with the player's real hands, which is stronger data for the same surface.

Result math is computed from the hand record: winners with `id`/`nick` matching the
player are winnings; otherwise the player's `totalBet` is the loss; folded hands with
no wager read “Folded” instead of a fake $0 win.

## Verification

- Captures at 320/390/1200 (`docs/screenshots/pokercraft`), 0 px overflow.
- 864 node tests, `tsc --noEmit`, Vite build: clean.
