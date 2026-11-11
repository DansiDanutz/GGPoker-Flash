# Remediation Implementation Record

*   **Date:** 2026-11-11
*   **Design:** `docs/designs/remediation.md`
*   **Status:** Phases 1–4 implemented.

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
*   Tests: `ledger-session.test.js` (5), `claims.test.js` (3), `http.test.js` (3),
    `engine.test.js` places 2/3 and spin bust, plus the existing = **35 passing**.

## Verification

*   `cd app && pnpm test` → 35 passed.
*   `pnpm build` → success.
*   Packaged and relaunched `DanGG.ro.app`; `/api/lobby` → 200.
*   Production DB migrated: `transactions.session_id`, `transactions.reference`,
    `player_claims` present.
*   Live join/leave:
    *   `buyin -50000`, `session_id nlh-diamond-01:<uuid>`, ref `in:...:1`
    *   `cashout 49000`, same session, ref `out:...`
*   Mission progress row appeared for the played hand.

### Phase 4 — maintenance

*   Lobby table rows include `synthetic: true`; the Players/AvgPot/VPIP/H-Hr
    headers carry an "estimated" dot; stakes use `money()`.
*   Rake cap defaults to 300; the `3 × bb` fallback is removed; the engine test
    asserts the cap at both bb=100 and bb=2000.
*   `resetpw` writes an audit row.
*   Mission ticket rewards display `T$` units instead of dividing by 100.
*   Blackjack deal/stand return the balance from the settlement call.
*   Cashier and admin credit accept `Idempotency-Key`; a retry returns the first
    movement, a different amount returns 409. Cashier blocks double submits and
    reuses the key on retry.
*   Renderer runs with `sandbox: true` and a packaged-build CSP header; the
    preload bridge still exposes `window.ggDesktop`.
*   `resetpw` writes an audit row; blackjack rejects a second deal while a hand
    is live; rebuys are rejected in tournaments; Spin busts write a zero-amount
    `session_close`.
*   Missions roll over daily (`daily-*`) or weekly (`weekly-*`), not once per
    database lifetime.
*   `docs/designs/dangro-clone.md` updated for sessions, claims, port handshake,
    sandbox/CSP, synthetic lobby and the 24-test suite.

## Review

A full fresh code review of the implementation diff was run on 2026-11-11. It
found and was followed by fixes for: registration double-credit, session id set
after seating, Spin bust without a close marker, cashier stale replay balance,
admin double-click, blackjack deal over a live hand, tournament rebuy refunds,
unconditional index rebuild, and missing join/leave/registration tests. The
review report is [implementation-review.md](implementation-review.md).

## Remaining

*   A hard-purge path is not offered; deletion is intentionally soft.
*   Full disk/process-kill fault injection is not committed; the sweep has a
    database-failure injection test.
*   The router remains large; the placement rule is the boundary, not the shape.
