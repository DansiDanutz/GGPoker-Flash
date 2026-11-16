# Cash lobby promo carousel (reference 07 hero)

Reference: `docs/screenshots/desk-pass/reference-holdem.jpg`.
Comparison: `docs/screenshots/desk-pass/compare-holdem.png`.

## What changed

Every cash game tab (Hold'em, PLO, Short Deck, All-in or Fold, Spin & Gold, Mystery
Battle Royale) now opens with the same kind of **campaign hero** the reference uses
above its table list:

- 186 px rounded carousel with three campaign creatives (November Giveaway, GGMasters,
  WSOP Express), crossfading on a 6 s timer with a slow scale settle.
- Dots at the bottom double as pagination; the active dot expands into a gold bar.
- Hover pauses the carousel; each slide navigates to its campaign.
- Reduced motion: no auto-advance and no transition, dots still switch slides manually.
- The Rush & Cash tab keeps its dedicated Rush hero, and Home keeps the Home feed.

## Remaining differences vs reference 07

The reference removes the left poker rail and replaces the right table diagram with a
live player list, and its rows carry a Promotion column with daily prize badges. DanGG
keeps its rail (it navigates Daily Challenge/Leaderboard/ELO/LIVE), its mini-table
preview and its measured columns (wait, avg pot, VPIP, hands/hour). Those are documented
as the next cash-lobby pass rather than removed here.

## Verification

- Captures: 1200/768/1440 of the Hold'em tab (`docs/screenshots/cash-lobby`), 0 px
  overflow; hero present on every cash tab.
- 864 node tests, `tsc --noEmit`, Vite build: clean.
