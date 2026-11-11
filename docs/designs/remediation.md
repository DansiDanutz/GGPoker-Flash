# DanGG.ro Remediation — Bounded Ratchets

*   **Author:** Dan Semenescu
*   **Status:** Phases 1–4 implemented
*   **Date:** 2026-11-11
*   **Supersedes:** the first remediation draft and its review.
*   **Design of record:** [dangro-clone.md](dangro-clone.md)

--------------------------------------------------------------------------------

## Context for a fresh reader

The local GGPoker clone is built, packaged and running. The design-of-record
claims more than the code enforces. Two defects are already fixed:

*   admin balance `set` now writes a delta through `addTransaction`;
*   blackjack is server-authoritative and the old `settle` action is rejected.

This document decides the remaining work. It is a **remediation**, not a new
feature. The rule for including work is: either the code contradicts the
design-of-record (a defect), or we choose to raise a bound the record already
accepts (a ratchet). Everything else is out.

The first draft failed because it added two tables, a nonce handshake, a
WebSocket version protocol, a disconnect state machine, a security programme
and two modules to fix a local single-user play-money app. This version keeps
four ratchets and one defect, adds one table, and records the bounds we accept
instead of building around them.

## Implementation status

*   **Phase 1 — ledger sessions and crash refund:** implemented. `transactions`
    has `session_id` and `reference`; buy-in, rebuy, cash-out and session close
    write the session id; startup refunds open sessions exactly once.
*   **Phase 2 — per-user claims:** implemented. `player_claims` backs daily,
    GG Care, Honeymoon and missions; mission progress is per user.
*   **Phase 3 — port ownership and testability:** implemented. The server prints
    `LISTENING <port>`, supports `PORT=0`, and the Electron parent waits for the
    line; `ledger-session`, `claims` and `http` tests were added.
*   **Phase 4 — maintenance:** implemented. Cashier/admin movements carry
    `Idempotency-Key`; the renderer is sandboxed with a CSP; lobby rows carry `synthetic: true`
    and the estimated columns are marked; the rake `3 × bb` fallback is removed
    with a 300 default; `resetpw` writes an audit row; display-only money
    formatting is cleaned up; blackjack returns the settlement balance; the
    design-of-record is updated.
*   **Verification:** `cd app && pnpm test` → 30 passed. The packaged app was
    relaunched, `/api/lobby` returned 200, and a live join/leave produced one
    `buyin` and one `cashout` with the same session id and `in:`/`out:` refs.

## The Problem

The review found eight items. Classified honestly:

**Defects (code contradicts the record):**

*   **D1 — Missions are global.** `missions.progress` and `missions.claimed` are
    shared rows. One account claims a mission and every other account is locked
    out.
*   **D2 — Admin `set` bypassed the ledger.** Fixed.
*   **D3 — Blackjack trusted the client.** Fixed.
*   **D4 — Current-state text is false.** The record says "no disconnect policy",
    but a socket close stands and cashes out; events already carry `seq`; bot
    winnings do reach the ledger at cash-out.

**Ratchets (the record accepted the bound; we choose to raise it):**

*   **R1 — A crash strands a cash buy-in.** The record accepts "one buy-in per
    seated player per crash".
*   **R2 — Cashier movements were not replay-protected.** A retry could
    duplicate a movement; the ratchet adds a client key and a unique ledger
    reference.
*   **R3 — A foreign process can occupy port 5198.** The record relies on the
    single-instance lock only.
*   **R4 — Bots and Spin mint chips.** The record accepts play-money inflation.

## Goals

**Release-blocking:**

*   **G1 — Crash refunds the total chips put into a seat.** A restart refunds
    `chips_in` (buy-in plus rebuys) for every open seat, exactly once, through
    the ledger.
*   **G2 — Missions are per-user.** Progress and claims are scoped to
    `(user_id, mission)`; one account cannot lock out another.
*   **G3 — Port ownership.** The parent loads the window only after its own child
    reports the listening port; a foreign listener or a failed child produces a
    blocking error.
*   **G4 — The fixes are testable.** The server can bind an ephemeral port and
    report it, so ledger, claim and port tests can run against a temp database.

**Follow-up, not release-blocking:**

*   **G5 — Maintenance.** Lobby labels synthetic values, rake fallback removal,
    `resetpw` audit, display-only `money()` cleanup, fresh blackjack balance,
    and the design-of-record update.

## Non-Goals

*   Cashier replay protection is implemented: the client sends an
    `Idempotency-Key`, the server stores `cashier:<kind>:<key>` on the ledger,
    and a retry returns the original balance.
*   A new Origin/Host/throttling programme. The renderer is sandboxed and carries
    a CSP; a local process can still read the database, which is accepted.
*   A resumable event log. Tables expose `tableEpoch`/`tableVersion`; a client
    that sees an epoch change or a sequence gap reconnects and takes a full
    snapshot instead of replaying missed events.
*   A disconnect grace window. The current stand-and-cash-out on socket close
    stays; no chips are left outside the ledger.
*   A new session table, nonce, idempotency table, or `casino.js`/`rewards.js`
    split.
*   Real-money compliance, live dealer, Stage3D, or multi-machine play.

## Decisions

| ID | Decision | Reason |
|---|---|---|
| D1 | Session identity lives in `transactions`, not a new table. | The ledger is already the source of truth for money; a second lifecycle table would drift. |
| D2 | Crash refunds `chips_in` (buy-in + rebuys). Losses are forgiven; winnings above `chips_in` are not paid. | It makes the player whole on money they put in, without needing stack snapshots. Bound: one stack of winnings can be lost on a crash. |
| D3 | Cashier replay is fixed with a client key and a unique ledger reference. | A double-click or retry returns the first movement; no new table is needed. |
| D4 | One new table: `player_claims`. Daily, GG Care, Honeymoon and missions move to it; `daily_claims` is migrated and retired. | One table covers every claim and fixes the global-mission defect. |
| D5 | The lobby keeps synthetic estimates, flagged in the API as `synthetic: true`; `running` and live seats are real. | Projecting from `LIVE_TABLES` would show 0 for 100 seeded tables. |
| D6 | Bots and Spin mint play money. Bound: bots mint at most `bots × max_buyin` per table; Spin prizes are capped by the table multiplier. Totals are counted in `mint_bot_total`/`mint_spin_total` and shown in Admin stats. | Removing bots empties the tables; the inflation is part of the demo. |
| D7 | No disconnect grace window; tables expose an epoch and monotonic version. | The close path cashes out; a new table has a new epoch, so a stale client cannot confuse it with the previous instance. |
| D8 | Port ownership uses the child's stdout and exit code, not a nonce or `/api/health`. | The parent already owns the pipe and the PID; a nonce over HTTP is readable by the same local process. |
| D9 | `addTransaction` remains the only transaction owner. | Nested `BEGIN` throws; the sweep calls it per row and relies on a unique reference. |
| D10 | Admin "delete" is a soft delete. Sessions are revoked, live seats are cashed out, the user is anonymised and banned, and ledger/claim rows are kept. | Hard-deleting the user orphans money and audit history. |

## Technical Plan

### A. Ledger session identity (G1)

Add two columns to `transactions`:

*   `session_id TEXT` — a per-seat session, formatted `<tableId>:<uuid>`.
*   `reference TEXT` — a per-movement idempotency key, unique per user:
    `UNIQUE(user_id, reference)`.

`addTransaction` gains optional `sessionId` and `reference`. It stays the only
owner of `BEGIN IMMEDIATE` / `COMMIT`.

Session lifecycle:

| Trigger | Ledger row | Reference |
|---|---|---|
| Seat buy-in | `buyin` (negative), `sessionId` | `in:<session>:1` |
| Rebuy | `rebuy` (negative), `sessionId` | `in:<session>:<n>` |
| Cash-out | `cashout` (positive), `sessionId` | `out:<session>` |
| Failed seat | `refund` (positive), `sessionId` | `refund:<session>` |
| Seat empties / quit at 0 | `session_close` (0), `sessionId` | `out:<session>` |
| Startup sweep | `buyin_refund` (positive), `sessionId` | `refund:<session>` |

`seatHuman` generates the session id before the debit, writes the buy-in with
it, and refunds with the same id if seating fails. The id is stored on the
**seat player object** (`seat.player.sessionId`) and captured **before** `stand()` (which nulls
`seat.player`, as `stack` already is); it is memory-only by design, with the
ledger as persistence. The key is `(tableId, userId)` because one user can be
seated at two cash tables. Rebuy uses the seat's session id. The three cash-out
sites (`leave_table`, socket close, admin close) and the idle teardown — which
must call the same close path before deleting the table — write the same
`out:<session>` reference, including when the stack is 0.

`openSessions()` on startup selects sessions with **no** `out:<session>` or
`refund:<session>` reference (a marker, not an amount comparison), refunds the
sum of `buyin` + `rebuy`, and writes `refund:<session>`. A session that ended
down still gets the zero-amount `session_close` marker, so a loss is never
refunded on the next launch.

Duplicate handling: `addTransaction` takes `{ onDuplicate: 'skip' }` for
`reference` conflicts. It predicts `balance_after = current + amount`, inserts
the ledger row with `ON CONFLICT DO NOTHING`, and only applies the balance
update when the insert changed a row. It returns `{ applied, balance }` so
`claim()` and the cashier can answer "already applied" instead of a silent
`ok`. A duplicate cash-out or refund is a no-op, not an exception. The sweep
catches per-session errors, logs them, leaves the session open, and keeps the
server running; it never aborts startup.

Accepted bound: a player who was ahead at the crash loses winnings above
`chips_in`; a player who was behind is refunded in full.

### B. Per-user claims (G2)

New table:

```sql
CREATE TABLE player_claims (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,              -- daily | ggcare | honeymoon | mission
  period_key TEXT NOT NULL,        -- date, care-date, honey-welcome, mission id
  progress INTEGER NOT NULL DEFAULT 0,
  claimed INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, kind, period_key)
);
```

`claim(userId, kind, periodKey, amount, currency)` upserts the
`player_claims` row, awards with `reference = claim:<kind>:<periodKey>` and
`onDuplicate: 'skip'`, then marks the row `claimed = 1`; a crash between the
award and the flag is repaired by the unique reference on retry, and a second
claim is a no-op. Daily, GG Care,
Honeymoon and missions call it. Mission progress is written by the existing
`onHandComplete` hook: the per-seat loop writes `player_claims.progress` for the
human seat. A second writer is tournament registration, which records the
`daily-tourney` progress on the same per-user row. The missions list and the
completion gate join `player_claims` for the requesting user and default to 0;
no mission read touches the global `missions.progress`/`missions.claimed` flag.
`daily_claims` is copied into `player_claims` once and retired.

### C. Origin policy and WebSocket versioning

HTTP and WebSocket requests must carry `Host: 127.0.0.1:<port>` or
`localhost:<port>`. An `Origin` header, when present, must match the same
origin; `GGPOKER_DEV=1` additionally allows `localhost:5199`. Absent `Origin`
(curl, tests) is allowed. A bad request gets `403`; a bad upgrade is rejected
before the socket opens.

Every `PokerTable` has a `tableEpoch` and a monotonic `tableVersion`. Snapshots
and events carry both. The client keeps the last epoch/version; an epoch change
or a sequence gap closes the socket and reconnects, where `join_table` returns a
full snapshot. There is no event replay and no cross-epoch cursor.

### C2. Port ownership (G3)

1.  `index.js` listens on `PORT` (default 5198); after `listen` it prints
    `LISTENING <port>` to stdout.
2.  `main.cjs` starts the child, waits for the `LISTENING` line, and then loads
    the window. It never polls HTTP to decide. When `GGPOKER_DEV=1`, the child
    is the Vite dev server, so the handshake is skipped and the existing dev
    URL is loaded directly.
3.  If the child exits before the line, or the line never arrives within 15 s,
    the parent shows a blocking dialog with the data directory and log, then
    quits. No window is loaded.
4.  Keep `requestSingleInstanceLock()`.

### D. Testability (G4)

*   `PORT=0` is supported; the server prints the actual port.
*   `node:test` spawns the server with `GGPOKER_DATA` set to a temp directory and
    `PORT=0`, reads the port from stdout, and uses `fetch`/`ws`.
*   New files: `app/server/ledger-session.test.js`,
    `app/server/claims.test.js`, `app/server/http.test.js`.
*   Tournament places 2/3 are tested through the existing `onTournamentPayout` hook
    with a temp DB; manual/CDP rows are labelled manual.

### E. Maintenance (G5)

*   Lobby response includes `synthetic: true` on the estimated columns; the
    Lobby renders a small "estimated" label on those cells. `running` and live
    seats remain authoritative.
*   Remove the `3 × bb` fallback; `getSetting('rake_cap', 300)` is the enforced
    default, and the test uses `rakeCap: 300`.
*   Audit `resetpw`.
*   Replace display-only `/ 100` with `money()`/`chips()` in `Lobby.tsx` and
    `Rewards.tsx`; leave percentage and arithmetic lines alone.
*   Blackjack returns the balance from the settlement call.
*   Update the design-of-record for the items above.

## Alternatives Considered

| Option | Why not |
|---|---|
| **Leave the app as-is and document every bound.** | The mission lockout is a real defect and the crash refund is cheap to fix through the ledger. Two ratchets are worth the cost. |
| **Event-sourced ledger rewrite.** | It would solve crash recovery and replay by construction, but replaces the persistence model, every money endpoint and the migration path for a single-user local app. Rejected on cost. |
| **A separate `table_sessions` table.** | The ledger already stores every movement. A second lifecycle table duplicates it, misses rebuys and admin close, and needs reconciliation. Session id in `transactions` is less code. |
| **Idempotency keys plus a response cache.** | No retry path exists; a second table and a retention policy would be added to guard a double-click. Accepted bound instead. |
| **Project lobby counts from `LIVE_TABLES`.** | Only human-opened tables are live; 100 seeded tables would show 0. Labelled synthetic estimates are honest for a demo. |
| **Nonce + `/api/health` for port ownership.** | The nonce is readable by the same local process and the endpoint leaks `pid`/`dbPath`. Child stdout and exit code are sufficient. |

## Detailed Implementation Plan

### Phase 1 — Ledger sessions and crash refund (G1)

**Files:** `app/server/db.js`, `app/server/index.js`, `app/server/ledger-session.test.js`.

1.  `db.js`: guarded `ALTER TABLE transactions ADD COLUMN session_id TEXT`;
    `ADD COLUMN reference TEXT`; unique index `(user_id, reference)`;
    `addTransaction(..., { sessionId, reference })`; `openSessions()` query and
    `refundOpenSessions()` that writes one `buyin_refund` per open session with
    `reference = refund:<session>`.
2.  `index.js`: `seatHuman` generates `sessionId`, writes the buy-in with it,
    refunds a failed seat with the same id; rebuy uses the seat's session id;
    every cash-out path writes `out:<session>`; call `refundOpenSessions()`
    before listening.
3.  `ledger-session.test.js`: buy-in + rebuy + crash → one refund of the sum;
    second sweep is a no-op; failed seat refund; cash-out closes the session.

### Phase 2 — Claims and mission scoping (G2)

**Files:** `app/server/db.js`, `app/server/index.js`, `app/server/claims.test.js`.

1.  Create `player_claims`; copy `daily_claims`; add `claim()`.
2.  Switch daily, GG Care, Honeymoon and missions to `claim()`; read mission
    progress per user; remove reliance on `missions.claimed`.
3.  `claims.test.js`: two users claim the same mission independently; second
    claim by the same user is a no-op.

### Phase 3 — Port ownership and testability (G3/G4)

**Files:** `app/electron/main.cjs`, `app/server/index.js`, `app/server/http.test.js`, `app/server/ledger.test.js`.

1.  `index.js`: support `PORT=0`, print `LISTENING <port>`, call
    `refundOpenSessions()` before listen.
2.  `main.cjs`: wait for the line, exit-code handling, blocking dialog, no
    nonce.
3.  `http.test.js`: spawn with temp DB and port 0; assert `/api/lobby` 200,
    cashier deposit/withdraw, admin set writes a ledger row.
4.  `ledger.test.js`: add per-currency reconciliation
    (`balance == SUM(transactions.amount)`) for a test user.

### Phase 4 — Maintenance and documentation (G5)

**Files:** `app/server/index.js`, `app/server/table.js`,
`app/server/engine.test.js`, `app/src/pages/Lobby.tsx`,
`app/src/pages/Rewards.tsx`, `app/server/db.js`,
`docs/designs/dangro-clone.md`, `README.md`.

1.  Lobby `synthetic: true`; rake fallback removal; `resetpw` audit; display-only
    money cleanup; blackjack balance.
2.  Update the design-of-record and README; keep this document as the audit
    trail.
3.  Re-run `pnpm test`, build, package and the route/API checks.

## Verification Plan

| Goal | Check | Command / evidence |
|---|---|---|
| G1 | Buy-in + rebuy + crash → one refund of `chips_in` | `cd app && pnpm test` (`ledger-session.test.js`) |
| G1 | Bust the stack, quit, restart → no refund | same |
| G1 | Second sweep is a no-op, not a crash | same |
| G2 | Two users claim the same mission independently | `pnpm test` (`claims.test.js`) |
| G2 | Same user's second claim is a no-op; award survives retry | same |
| G2 | Mission progress is per user | same |
| G3 | Child reports port; foreign listener produces a dialog | manual: occupy 5198, launch, expect blocking dialog |
| G4 | Server binds port 0 and serves `/api/lobby` | `pnpm test` (`http.test.js`) |
| G4 | Per-currency ledger reconciliation | `pnpm test` (`ledger.test.js`) |
| G5 | Rake floor/cap, places 2/3, admin set continuity | `pnpm test` (`engine.test.js`, `ledger.test.js`) |
| G5 | Cashier replay returns the first movement | `pnpm test` (`http.test.js`) |
| G5 | Sandboxed renderer keeps the preload bridge | manual: `window.ggDesktop` present under `sandbox:true` |
| G5 | 21 page routes render without console errors | manual/CDP with `GGPOKER_CDP=1` |
| Build | `pnpm build`, `tsc --noEmit` | `cd app && pnpm build && pnpm exec tsc --noEmit` |
| Package | Signature and relaunch | `./package_app.sh`; `codesign -dv --verbose=4` |

## Risks and Limits

*   **Refund fairness:** losses are forgiven and winnings above `chips_in` are
    lost. Bound: one stack per crash. This is a product choice, not a bug.
*   **Cashier replay:** protected by `Idempotency-Key` + `(user_id, reference)`;
    the client reuses the key on retry, blocks double submits, and returns 409
    when the key is reused with a different amount.
*   **Bot/Spin inflation:** bounded per table by bot stacks and multiplier;
    cumulative totals appear in Admin stats (`bot mint`, `spin mint`).
*   **Local threat model:** the renderer is sandboxed (`sandbox: true`) and a CSP
    header is enforced in the packaged build;
    loopback is still not a boundary and the SQLite file is readable by a local
    process. Accepted.
*   **Claims migration:** `player_claims` is one new table; a failed copy must
    leave `daily_claims` intact and be retryable.
*   **Protocol versioning:** every table has an epoch and version; a client that
    sees a new epoch or a gap reconnects for a full snapshot. Events are not
    replayed.
*   **No disconnect grace:** a socket close stands and cashes out immediately;
    the design does not hold chips outside the ledger.

## Traceability

| ID | Defect/ratchet | Goal | Phase | Verification |
|---|---|---|---|---|
| D1 | Missions global | G2 | 2 | claims.test.js |
| D2 | Admin set bypassed ledger | — | landed | ledger.test.js |
| D3 | Blackjack trusted client | — | landed | manual/API |
| D4 | False current-state text | — | 1 doc | review |
| R1 | Crash strands buy-in | G1 | 1 | ledger-session.test.js |
| R2 | Cashier replay | G5 | 4 | http.test.js |
| R3 | Port 5198 takeover | G3 | 3 | manual |
| R4 | Bot/Spin minting | G5 | 4 | Admin stats (`mint_bot`, `mint_spin`) |

## Accepted Bounds (summary)

*   Cashier: no replay protection; one duplicate movement per double-click.
*   Crash: refund `chips_in`; losses forgiven; winnings above `chips_in` lost.
*   Bots/Spin: play-money minting, bounded per table and counted in Admin stats.
*   Lobby: synthetic estimates flagged; only `running`/live seats are real.
*   Threat model: loopback is not a boundary; local processes can read the token
    and database.
*   Disconnect: immediate stand and cash-out; no grace window.
*   Protocol: epoch/version on every snapshot and event; gap triggers a full
    snapshot on reconnect.

---

*Drafted with EGM. Replaces the first remediation draft after review.*
