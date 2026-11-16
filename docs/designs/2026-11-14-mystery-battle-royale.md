# Mystery Battle Royale lobby (reference 11)

Reference: `docs/screenshots/desk-pass/reference-battle.jpg`.
Comparison: `docs/screenshots/desk-pass/compare-battle.png`.

## What changed

The Battle Royale tab no longer reuses the cash table list. It renders a dedicated
Mystery Battle Royale lobby:

- **Hero** on the Mystery Battle Royale art with the three reference stage notes:
  “9 of 18 survive”, “All-in shootout after 10 minutes”, “Final Table Stage”.
- **Buy-in tiles** (3×2): buy-in, **up to** prize (the event's guarantee), entrants.
  Clicking a tile opens that tournament's detail.
- **Join Now** opens the biggest live MBR event; “Mystery Battle Royale details” links
  to the tournament list.
- **Right rail “Mystery prize pools”**: the live MBR schedule sorted by guarantee, with
  buy-in and start time.
- The generic filters/list, the cash carousel and the cash side panel are skipped on
  this tab.

## Data

Only one mystery tournament existed, so this adds five idempotent MBR tiers to the DB
migration (ids `mbr-1..5`, buy-ins $0.25/$1/$3/$10/$25, guarantees $5K→$250K, mode
`MYSTERY`, bounty = half the buy-in, 3-minute blinds). Existing databases pick them up
on boot; rows are never duplicated.

## Remaining vs reference 11

The reference right rail is a live “Epic Mystery Jackpot Bounties” feed with player
names and payout tiers ($100 → $25,000) plus a total jackpot. DanGG shows the prize-pool
schedule instead; a live bounty-reveal feed needs server-side bounty events, which this
pass does not add. The reference’s jungle-map hero art is replaced by the existing
Mystery Battle Royale discover art.

## Verification

- Captures at 768/1200/1440 (`docs/screenshots/battle`), 0 px overflow; six tiles and
  six pools at every width.
- Server migration verified: `/api/tournaments` returns `mbr-1..5` with mode `MYSTERY`.
- 864 node tests, `tsc --noEmit`, Vite build: clean.
