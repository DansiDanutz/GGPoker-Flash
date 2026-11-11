# Revised Verification Report

**Target:** `docs/designs/remediation.md` (bounded ratchets)
**Reviewer:** fresh-context EGM Goldfish (`egm-design`)

## Verdict

5 of 6 findings resolved. The sixth (mission progress) was partially open; the design has now been patched to name both writers and both readers.

| # | Finding | Status |
|---|---|---|
| 1 | `session_close` marker / no-loss refund | **Resolved**: zero-amount close row; `openSessions()` selects by reference absence, refunds `buyin + rebuy`. |
| 2 | `onDuplicate: 'skip'` / non-fatal sweep | **Resolved**: predicts `balance_after`, inserts with conflict-skip, updates only when applied, returns `{applied,balance}`; sweep logs and continues. |
| 3 | Mission progress writer/reader | **Resolved after patch**: `onHandComplete` and tournament registration write `player_claims`; list and completion gate read the requesting user's row. |
| 4 | Claim idempotency | **Resolved**: upsert row, award with `claim:<kind>:<periodKey>` + skip, then flag. |
| 5 | `session_id` ownership | **Resolved**: on `seat.player.sessionId`, keyed `(tableId,userId)`, captured before `stand()`, memory-only. |
| 6 | DEV handshake skip | **Resolved**: `GGPOKER_DEV=1` skips the child handshake and loads 5199. |

## Residual notes addressed

*   Idle teardown now must call the close path before deleting the table.
*   Insert-before-credit predicts `balance_after` and returns an applied flag.
*   `stand()` nulls the player; the session id is captured before it.
