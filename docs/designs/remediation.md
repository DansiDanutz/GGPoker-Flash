# DanGG.ro Remediation — Post-Review Fixes

*   **Author:** Dan Semenescu
*   **Status:** Proposed
*   **Date:** 2026-11-11
*   **Predecessor context:** `docs/designs/dangro-clone.md`, `docs/designs/reviews/full-2026-11-11/` and the earlier EGM review reports.

--------------------------------------------------------------------------------

## Overview

The local GGPoker clone is built, packaged and running. The EGM review found that
its design-of-record claims more than the code enforces: one admin path bypassed
the ledger, blackjack settled from a client-supplied amount, a crash strands
buy-ins, the WebSocket protocol has no state version, and several rules are
stated as invariants without a mechanism.

Two of the money defects are already fixed in the working tree:

*   `POST /api/admin/users/:id` with `action: "set"` now writes a signed delta
    through `addTransaction`.
*   Blackjack is server-authoritative: the server holds the shoe and hand,
    `hit`/`stand` settle on the server, and the old `settle` action is rejected.

This draft covers the remaining fixes. It is a remediation design, not a new
feature. The goal is to make the design-of-record true, keep the app running,
and leave a small set of changes that a reviewer can verify.

## The Problem

The review produced eight concrete defects and three structural gaps:

1.  A server crash drops live seats while the buy-in stays in the ledger.
2.  Cashier movements are not replay-protected; a retried request is a second
    movement.
3.  A foreign process on port 5198 can answer `/api/lobby` and receive the
    renderer's bearer token.
4.  WebSocket snapshots have no version, no resync and no disconnect policy.
5.  The local threat model is unstated; loopback is treated as a boundary.
6.  Bots and Spin/battleroyale prizes mint chips without a recorded rule; bots
    use `Math.random` and cannot be seeded for tests.
7.  Casino, prop bets, GG Care and leaderboard payouts move balances without
    per-subsystem invariant rows.
8.  The router still contains casino/reward domain logic, and several small
    maintenance defects remain (synthetic lobby counts, `money()` violations,
    missing `resetpw` audit, dead rake fallback, stale blackjack balance).

The code stops short of a production-grade money system. The design should
either fix these or state the accepted risk and bound.

## Goals

**Must fix before the app is called production-ready:**

*   **G1 — Crash-safe cash seats.** A server restart must refund or restore
    every open buy-in, with a ledger row and a test.
*   **G2 — Replay-safe cashier.** Deposits, withdrawals and admin credits accept
    an idempotency key and apply at most once.
*   **G3 — Port ownership.** The app rejects a foreign listener on 5198 and
    proves it is talking to its own child server.
*   **G4 — Recoverable table protocol.** Snapshots carry a monotonic version;
    reconnect resumes or resyncs; disconnect/timeout rules are explicit.
*   **G5 — Local threat model.** Origin/Host checks, a token path that is not a
    query string, login throttling, and a deliberate `sandbox` decision.
*   **G6 — Testable randomness.** Bots and Spin use an injectable RNG; seeded
    tests cover conservation with synthetic actors.

**Fix when touching the area, not release-blocking:**

*   **G7 — Balance-mover coverage.** One invariant and one test row per
    balance-moving subsystem.
*   **G8 — Maintainability.** Project lobby occupancy from live tables; add
    `claimPeriod`; split casino/reward math out of the router; remove dead rake
    fallback; fix audit and formatting gaps.

## Non-Goals

*   Real-money compliance, KYC against a real authority, or payment processing.
*   Live-dealer video.
*   A full Stage3D renderer.
*   Replacing SQLite or the single-process server.
*   A complete UI rewrite; the existing React surfaces stay.

--------------------------------------------------------------------------------

## Technical Plan

### A. Ledger and cashier integrity

**Current state.** `addTransaction` is atomic (`BEGIN IMMEDIATE`/`COMMIT`). Admin
`set` is fixed. `transactions` has no idempotency key and no table-session
identifier.

**Design.**

1.  Add `transactions.reference TEXT` with a unique index on
    `(user_id, reference)` where `reference IS NOT NULL`.
2.  Add `idempotency_keys(key TEXT PRIMARY KEY, user_id, kind, amount, currency,
    created_at, response TEXT)`. Cashier and admin-credit handlers require
    `Idempotency-Key`; the same key returns the stored response instead of
    applying a second movement.
3.  Add `table_sessions(id TEXT PRIMARY KEY, user_id, table_id, buyin, currency,
    opened_at, closed_at, state)`. `buyin` opens a session; `cashout` closes it.
    On server start, every `state = 'open'` session is refunded through
    `addTransaction(..., 'buyin_refund', ...)` and marked `refunded`. Only one
    open session per user is allowed.
4.  Admin `set` already writes a delta; add a test that the `balance_after`
    chain remains continuous after an admin set.

### B. Server lifecycle and port ownership

**Current state.** `requestSingleInstanceLock()` exists. `main.cjs` polls
`/api/lobby` and accepts any response; `index.js` has no `EADDRINUSE` handler.

**Design.**

1.  Before spawn, probe 5198 with `net.connect`. If occupied, show a blocking
    dialog and quit instead of starting.
2.  Generate a per-launch `serverNonce`; pass it to the child as an env var and
    expose `GET /api/health` returning `{ nonce, pid, dbPath }`. The main process
    requires a matching nonce before `loadURL`.
3.  If the child exits, show a blocking error with the data directory and log
    path; do not load the renderer. No silent auto-restart.
4.  Keep the single-instance lock; focus the existing window on a second launch.

### C. Table protocol

**Current state.** `broadcastState` sends a snapshot with `handNo`, `street` and
`now`; no version, no resume, no disconnect policy.

**Design.**

1.  Add `stateVersion` (monotonic per table) to every snapshot and event.
2.  Add `{type: "resync", tableId, sinceVersion}`. The server replies with a full
    snapshot; the client replaces local state and ignores versions it has
    already applied.
3.  Disconnect policy: a disconnected seat gets a 30-second grace window, then
    auto-folds/checks; after the hand, the seat is sat out and the stack stays
    until cash-out. State this in the design and test it.
4.  Reject actions that arrive after `actionEndsAt` and log the rejection.

### D. Local threat model

**Current state.** Loopback-only, bearer tokens in `localStorage`, WS token in
the query string, no Origin/Host check, `sandbox: false`.

**Design.**

1.  Validate `Origin` and `Host` on HTTP and the WS upgrade against
    `http://127.0.0.1:5198` (and the dev origin when `GGPOKER_DEV=1`).
2.  Pass the WS token through the `Sec-WebSocket-Protocol` value instead of the
    query string; keep query support only for the dev harness.
3.  Throttle login attempts per IP+login (e.g. 10 failures per 5 minutes).
4.  Enable `sandbox: true` if the preload bridge still works; otherwise record
    the exact Electron limitation and accept it in writing.
5.  State that loopback is not a security boundary; the token is the boundary.

### E. Testable randomness and bots

**Current state.** `PokerTable` has no `cfg.rng`; `startHand` uses the crypto
default; Spin and bot timing/decisions use `Math.random`.

**Design.**

1.  Add `cfg.rng` to `PokerTable`; pass it to `shuffle`, Spin multiplier and bot
    decisions. Default remains `cryptoRng`.
2.  Seeded tests create a table with a deterministic RNG, run N scripted hands,
    and assert chip conservation and no negative stacks.
3.  Document bots as synthetic liquidity: their stacks are minted, never enter
    the ledger, and are accepted inflation. If that is not acceptable, the
    alternative is to remove bots, which makes tables empty; the design chooses
    to keep them and states the trade-off.

### F. Balance-mover coverage

Add one invariant and one test row for each of:

*   Casino games (slot, roulette, blackjack, baccarat, dragon tiger, sic bo):
    house edge is not required, but payouts must be server-computed and capped.
*   Prop bets: settlement once per market, server-decided.
*   GG Care, Honeymoon, daily and missions: one claim per period key, DB
    `UNIQUE` constraint.
*   Leaderboard/GG Pass: one payout per season/user.
*   Welcome/deposit bonuses: one per account.

### G. Maintainability fixes

1.  Lobby `players`/`avgPot`/`vpip`/`handsPerHour` project from `LIVE_TABLES` and
    `WAITLISTS`; synthetic columns are explicitly labelled cosmetic.
2.  Add `claimPeriod(userId, kind, amount, periodKey)` beside `addTransaction`;
    replace the six claim blocks.
3.  Split casino outcome math into `app/server/casino.js` and reward claims into
    `app/server/rewards.js` only after `claimPeriod` lands.
4.  Replace hand-rolled `/ 100` in `Lobby.tsx` and `Rewards.tsx` with
    `money()`/`chips()`.
5.  Add `audit_log` for `resetpw`; remove the dead `3 × bb` rake fallback after
    making `rake_cap` required.
6.  Blackjack responses return the fresh balance from `addTransaction`, not the
    pre-request snapshot.

### H. Documentation

1.  Add a decisions table with IDs; later sections reference rows instead of
    restating rules.
2.  Add `INV-*`/`SEC-*` IDs to invariants and map them to test names.
3.  Update the design-of-record for the fixes above; keep the review reports as
    the audit trail.

--------------------------------------------------------------------------------

## Alternatives Considered

### Alternative A: leave the clone as a finished local demo

*   **Pros:** no risk to a working app; the review's findings are documented.
*   **Cons:** the design-of-record remains false on crash recovery, cashier
    replay and the local threat model; a future change cannot trust it.
*   **Rejected by author:** the app is used as a local product and the money
    invariants should be true, not aspirational.

### Alternative B: full rewrite around an event-sourced ledger

*   **Pros:** clean audit, replay, crash recovery by construction.
*   **Cons:** large migration, new persistence model, high risk for a single-user
    local app; the current append-only `transactions` table already provides most
    of the audit value.
*   **Rejected by author:** over-scoped for the remaining defects.

### Alternative C: keep the single process, add bounded fixes

*   **Pros:** preserves the running app; each fix is testable; the ledger and
    table engine stay.
*   **Cons:** the router remains large; the local threat model is bounded, not
    eliminated.
*   **Selected.**

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Phase 1 — Money and crash safety

**Files:** `app/server/db.js`, `app/server/index.js`, `app/server/table.js`,
`app/server/ledger.test.js`, `app/server/engine.test.js`.

1.  `db.js`: add `transactions.reference` (guarded `ALTER TABLE`), unique index,
    `idempotency_keys`, `table_sessions`; export `openTableSession`,
    `closeTableSession`, `refundOpenSessions`.
2.  `index.js`: open a session on `seatHuman`; close it on cash-out; call
    `refundOpenSessions()` at startup; require `Idempotency-Key` on cashier and
    admin credit; return the stored response on replay.
3.  `ledger.test.js`: continuity after admin set; duplicate key applies once;
    open session refunded on startup.
4.  `engine.test.js`: places 2/3 payouts with production hooks and a temp DB.

### Phase 2 — Lifecycle and protocol

**Files:** `app/electron/main.cjs`, `app/server/index.js`, `app/server/table.js`,
`app/src/pages/TablePage.tsx`, `app/src/lib/api.ts`.

1.  `main.cjs`: port probe, nonce/health check, blocking child-failure error.
2.  `index.js`: `/api/health` with nonce/pid/dbPath; `stateVersion`; `resync`;
    reject late actions.
3.  `TablePage.tsx`: send `sinceVersion` on reconnect; drop stale versions.
4.  Tests: reconnect/resync, late action rejected, disconnect auto-fold.

### Phase 3 — Threat model and randomness

**Files:** `app/server/index.js`, `app/server/poker.js`, `app/server/table.js`,
`app/electron/main.cjs`.

1.  Origin/Host checks; WS token via subprotocol; login throttle.
2.  `sandbox` decision and preload verification.
3.  `cfg.rng` plumbing through shuffle, Spin multiplier and bots; seeded test.

### Phase 4 — Balance movers and maintainability

**Files:** `app/server/index.js`, `app/server/db.js`, `app/src/pages/Lobby.tsx`,
`app/src/pages/Rewards.tsx`, `app/server/casino.js` (new),
`app/server/rewards.js` (new).

1.  `claimPeriod` helper; collapse claim blocks.
2.  Casino module with socket-free outcome functions; ledger call stays in the
    router.
3.  Lobby projection; money() cleanup; resetpw audit; rake fallback removal;
    blackjack fresh balance.

### Phase 5 — Documentation and verification

**Files:** `docs/designs/dangro-clone.md`, `docs/designs/reviews/`,
`README.md`.

1.  Decisions table, requirement IDs, cross-references.
2.  Update the verification plan commands and test names.
3.  Re-run `pnpm test`, build, package and the API/UI checks.

## Verification Plan

| Fix | Test |
|---|---|
| Open buy-in refunded on restart | temp DB + open session + `refundOpenSessions()` → one `buyin_refund` row |
| Cashier replay | same idempotency key twice → one transaction, same response |
| Admin set continuity | ledger test: `balance_after` chain intact |
| Port ownership | launch with a foreign listener on 5198 → blocking dialog, no window |
| WS resync | reconnect with `sinceVersion` → full snapshot, stale versions dropped |
| Origin/Host | request with a foreign Origin → 403 |
| Seeded bots | deterministic RNG → conservation across N hands |
| Places 2/3 | production hooks + temp DB → 30%/20%/50% rows |
| Late action | action after deadline → rejected and logged |

**Commands:** `cd app && pnpm test`; `cd app && pnpm exec tsc --noEmit`;
`cd app && pnpm build`; `./package_app.sh`; `curl -fsS
http://127.0.0.1:5198/api/lobby`.

## Risks and Open Questions

*   **Session identity:** table sessions add a new table and a startup sweep; a
    crash during the sweep must be idempotent. Use a transaction and a
    `state = 'refunded'` guard.
*   **Idempotency storage:** keys grow without bound. Add a 30-day cleanup or a
    retention row.
*   **Sandbox:** `sandbox: true` may break the preload bridge; verify on the
    packaged app before committing.
*   **Bots:** the chosen synthetic-liquidity model is an accepted inflation.
    Removing bots is the alternative; it makes tables empty.
*   **Scope:** Phase 4 is not release-blocking. Phases 1–3 are.

--------------------------------------------------------------------------------

*Drafted with EGM*
