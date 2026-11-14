# Tournament table HUD (reference table chrome)

Reference: `docs/screenshots/desk-pass/compare-tourn-hud.png` (left), port (right).

## What changed

Tournament tables had a top bar but no event information on the felt. They now render a
**TournamentHud** card at the top-left (the slot the cash Daily Leaderboard ribbon uses,
which is already hidden for tournaments):

- **Mode badge** (BOUNTY / MYSTERY / SATELLITE / FLIP / NLH) and event name.
- **Level**, **Blinds** (with ante when present), **Next level** countdown (mm:ss, ticking
  every second from `state.tournament.nextBlindAt`), **Players left**, **Prize pool**, and
  **Bounty** when the mode has one.
- Values come from the real table state (`state.tournament`), not demo numbers.
- Hidden under 600 px so the felt stays clear on phones; narrower at 900 px.

## Verification

- Started `Bounty Hunters $30K` through the real register/play endpoints and captured the
  live table: HUD shows Level 1, $1/$2, next level 7:55, 1 player left, $30,000 prize
  pool, $5 bounty (`docs/screenshots/tourn-table/1200-tourn-table.png`, 1440 too).
- **0 px overflow** at 1200/1440; HUD present at both widths.
- 865 node tests, `tsc --noEmit`, Vite build: clean.

## Remaining

The reference also shows **Late Reg** remaining and **1st prize** in the ribbon; the table
state has no late-registration deadline or payout row until the event is running with
payouts, so those two fields are omitted rather than faked.
