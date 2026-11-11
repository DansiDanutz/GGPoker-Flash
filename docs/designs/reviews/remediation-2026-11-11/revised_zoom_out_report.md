# Revised Zoom-Out Review

**Target:** `docs/designs/remediation.md` (revised, bounded ratchets)
**Reviewer:** fresh-context EGM Goldfish (`egm-zoom-out`)

## Verdict

The scope cut is correct and most prior blockers are resolved (no nonce, no `stateVersion`, no idempotency cache, no module split, one new table). Two new blockers remain in the surviving money machinery.

## Blockers

1. **The sweep cannot tell a stranded session from an ordinary loss.** Sessions were closed only by a positive cash-out; a player who busts or quits at 0 has no closing row, so `SUM(in) > SUM(out)` treats every loss as open and refunds it on the next start. Use a terminal `session_close` marker even at 0, and select sessions with **no** `out:`/`refund:` reference; refund `SUM(buyin + rebuy)` only.
2. **The unique reference guard throws, it does not skip.** `addTransaction` rethrows on `SQLITE_CONSTRAINT`, so a second sweep or overlapping cash-out aborts startup/teardown. Specify an `onDuplicate: 'skip'` contract that inserts before the balance change; a skipped insert must not credit. Make the sweep non-fatal and logged.

## Majors

3. **G2 moves reads but names no per-user writer.** Mission progress is updated by global `UPDATE missions` statements; the plan must name the writer (`onHandComplete` per human seat) and the reader (missions list joins `player_claims`).
4. **`claim()` is non-atomic under D9.** Flag-then-award can lose or double-pay. Use `reference = claim:<kind>:<periodKey>` + `onDuplicate:skip`, then mark claimed; retry repairs.
5. **`session_id` has no home.** Put it on `seat.player.sessionId`, key by `(tableId,userId)`, clear on `stand`; memory-only, ledger is persistence.
6. **G3 drops the DEV path.** `GGPOKER_DEV=1` would wait 15 s and show a fatal dialog. Skip the handshake in DEV.

## Nits

- `synthetic: true` has no consumer; add the Lobby label.
- `payoutForPlace()` extraction exists only to test a two-branch inline; test through the tournament hook instead.
