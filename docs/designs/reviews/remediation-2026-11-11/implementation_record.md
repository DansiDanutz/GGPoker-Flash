# Remediation Implementation Record

*   **Date:** 2026-11-11
*   **Design:** `docs/designs/remediation.md`
*   **Status:** Phases 1–3 implemented; Phase 4 open.

## Implemented

### Phase 1 — ledger sessions and crash refund

*   `transactions` gained `session_id` and `reference`, with a unique
    `(user_id, reference)` index.
*   `addTransactionEx` inserts the ledger row first when a reference is present,
    predicts `balance_after`, applies the balance only when the insert changed a
    row, and supports `onDuplicate: 'skip'`.
*   `seatHuman` generates `tableId:uuid`, writes the buy-in with `in:<session>:1`,
    and refunds a failed seat with `refund:<session>`.
*   Rebuy writes `in:<session>:r<n>` and increments the seat's counter.
*   Every cash-out path (leave, socket close, admin close, idle teardown) writes
    `out:<session>`; a zero stack writes a zero-amount `session_close`.
*   `refundOpenSessions()` selects sessions with no `out:`/`refund:` reference,
    refunds `buyin + rebuy` with `refund:<session>`, and logs per-session errors
    without aborting startup.

### Phase 2 — per-user claims

*   `player_claims` is the single claim table (`user_id, kind, period_key`).
*   Existing `daily_claims` rows are copied once at startup.
*   `claimReward` upserts, awards with `claim:<kind>:<periodKey>`, then marks
    claimed; retries are idempotent via the unique reference.
*   Missions read progress/claimed from `player_claims`; `onHandComplete` and
    tournament registration write per-user progress.

### Phase 3 — port ownership and testability

*   Server supports `PORT=0`, logs `LISTENING <port>`, and refunds sessions
    before listening.
*   Electron main waits for the `LISTENING` line, shows a blocking error and
    quits on failure, and skips the handshake when `GGPOKER_DEV=1`.
*   Tests: `ledger-session.test.js` (4), `claims.test.js` (2), `http.test.js` (1),
    plus the existing 11 = **18 passing**.

## Verification

*   `cd app && pnpm test` → 18 passed.
*   `pnpm build` → success.
*   Packaged and relaunched `DanGG.ro.app`; `/api/lobby` → 200.
*   Production DB migrated: `transactions.session_id`, `transactions.reference`,
    `player_claims` present.
*   Live join/leave:
    *   `buyin -50000`, `session_id nlh-diamond-01:<uuid>`, ref `in:...:1`
    *   `cashout 49000`, same session, ref `out:...`
*   Mission progress row appeared for the played hand.

## Remaining

*   Phase 4: lobby `synthetic` label, rake fallback removal, `resetpw` audit,
    display-only `money()` cleanup, blackjack fresh balance, design-of-record
    update.
*   Full re-review of the implemented diff has not been run; the targeted
    verification covered the six prior blockers.
