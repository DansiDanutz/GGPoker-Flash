# Live mystery bounty feed

Reference: `docs/screenshots/desk-pass/compare-battle.png` (right rail).
Closes the gap noted in `2026-11-14-mystery-battle-royale.md`.

## What changed

- **`GET /api/mystery/feed`** returns the latest mystery-bounty payouts (winner nick,
  amount, busted player from the ledger memo, timestamp) plus the all-time total. It reads
  the real `transactions` rows written when a Mystery Battle Royale bounty is paid, so the
  feed is live, not fabricated.
- The Battle Royale right rail is now **“Epic Mystery Jackpot Bounties”** with the total
  pot at the top and the reveal rows beneath, followed by the existing prize-pool
  schedule under a "Mystery prize pools" sub-header.
- Empty state keeps the prize pools visible (no fake names when nothing has been paid).
- New HTTP test covers the endpoint shape on a fresh room (`total: 0`, `items: []`).

## Verification

- Screenshot with five seeded reveals in the dev DB: total **$38.8K**, winners
  DanSiDanutz/Administrator/Guest with “Bounty from …” and timestamps
  (`docs/screenshots/battle/1200-battle.png`, 768/1440 too).
- **865 tests / 865 pass** (new mystery feed test), `tsc --noEmit`, Vite build clean.

## Remaining

The reference also shows the buy-in on each reveal row; the ledger row carries the
bounty amount and the busted player, not the tournament buy-in. Adding `tournament_id`
to the bounty transaction would allow that column later.

## Follow-up: buy-in on each reveal

- The ledger gains a nullable `tournament_id` column (idempotent `ALTER TABLE`).
- `addTransactionEx` accepts `opts.tournamentId`; the bounty payout passes
  `table.cfg.tournamentId`, so every future `mystery_bounty` row is linked to its event.
- `/api/mystery/feed` joins `tournaments` and returns `tournament`, `buyin` and `fee`;
  the rail row now reads **“Buy-in $X · date”** exactly like the reference.
- Existing rows without a tournament id keep working (buy-in segment omitted).
