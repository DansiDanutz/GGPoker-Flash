# Casino sections — reference 04 structure

Reference: `docs/screenshots/desk-pass/reference-casino.jpg`.
Comparison: `docs/screenshots/desk-pass/compare-casino.png`.

## What changed

The Casino hub is no longer one flat grid. With **All** selected it now renders the
reference's sectioned structure:

- **Table games** (Blackjack, Roulette, Baccarat, Dragon Tiger, Sic Bo) in a filmstrip.
- **Slots**, **Arcade** (Crash) and **Poker** (Casino Hold'em) sections beneath.
- Each section has its own heading, count and horizontal row; rows scroll on narrow
  screens with a thin scrollbar.
- The category chips still filter to a single grid when a specific category is chosen,
  and every card keeps its keyboard activation and route.

## Remaining vs reference 04

The reference is a live-dealer catalogue: 10 category tabs (Casino, GG99, LIVE, ARCADE,
BLACKJACK, BACCARAT, ROULETTE, POKER, FREEROLLS, PROMOTIONS, ALL) and dozens of portrait
dealer cards. DanGG has eight original playable games and no live-dealer feed, so the
sections are real games rather than dealer tables. A live-dealer catalogue is out of
scope for a play-money build (no dealer video source).

## Verification

- Captures at 390/768/1200 (`docs/screenshots/casino-final`), 0 px overflow; five table
  cards fit at 1200 without scrolling.
- 864 node tests, `tsc --noEmit`, Vite build: clean.
