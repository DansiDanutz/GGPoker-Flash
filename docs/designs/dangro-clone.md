# DanGG.ro — Local GGPoker Desktop Clone

*   **Author:** Dan Semenescu
*   **Status:** Proposed — post-implementation design record
*   **Date:** 2026-11-11

## Context for a fresh reader

*   **What exists today:** a signed Electron app at `~/Applications/DanGG.ro.app`,
    a Node/SQLite/WebSocket server, a React renderer, local GGPoker-derived
    assets, and the reverse-engineering record in
    [research/REVERSE_ENGINEERING.md](../../research/REVERSE_ENGINEERING.md).
*   **What this document decides:** the system boundaries, authoritative state,
    ledger and game invariants, trust boundaries, and the rules a future change
    must follow. It is not a file-by-file changelog.
*   **What is requested of the reader:** challenge the invariants and the scope
    split. The implementation already exists; this contract is how we judge
    whether it may change.
*   **Product record:** [README.md](../../README.md) explains how to run and use
    the app.

--------------------------------------------------------------------------------

## Overview

DanGG.ro is a locally hosted, play-money recreation of the GGPoker macOS desktop
client. It is an Electron shell around a React renderer and a Node.js game
server. The server owns all money and game outcomes; live table state (stacks,
pots, timers) is held in the server process, while balances, hands and audit
trails are persisted in SQLite. The renderer never decides an outcome. A single app bundle (`DanGG.ro.app`) starts
the server on `127.0.0.1:5198` and opens a frameless 1200×961 window at that
address.

The project also reverse-engineers the installed Adobe AIR client to recover
artwork, audio, fonts, localization strings and behavioral evidence. Those
assets stay local; the public repository contains code, tools and documentation
only.

## The Problem

There are two related but distinct problems, and they are deliberately kept
separate:

1.  **Study**: the installed client is a downloaded Adobe AIR payload with no
    buildable source. Its decompiled ActionScript, assets and string table are
    readable locally but cannot be rebuilt or run. The reverse-engineering
    record is the artifact for this problem.
2.  **Operate**: a reviewer needs to open a local app, play a hand, and change
    every mutable object (users, tables, tournaments, promotions, balances)
    through an admin surface, with no external service.

The clone contract covers **lobby, NLHE cash play, tournaments, rewards claims,
cashier/ledger and admin mutation**. The wider parity surface (casino games,
reward programmes, KYC review, friends, localized chrome) is valuable because
the recovered assets make it cheap, but it is Tier 2 and does not by itself
justify new architecture.

## Goals

**Tier 1 — required by the stated problem:**

*   A signed, double-clickable macOS app that starts its own server and shows the
    lobby without external services.
*   Server-authoritative NLHE cash play with buy-in, betting, side pots, rake,
    showdown and a persisted hand history.
*   A cashier/ledger where every balance change is attributable in
    `transactions`, and period-based claims are single-claim per user per period.
    Cashier movements are replay-protected by the client `Idempotency-Key` (see Money invariants).
*   An admin console that can create and edit users, tables, tournaments,
    promotions, missions and settings, and can review the audit log.
*   A documented reverse-engineering record and a local asset pipeline.

**Tier 2 — parity surface, kept because it reuses the recovered assets:**

*   PLO, PLO5, PLO6, Short Deck, All-in or Fold, Rush & Cash, Spin & Gold and Mystery
    Battle Royale.
*   Slots, roulette, blackjack, baccarat, dragon tiger and sic bo.
*   Rewards, missions, GG Pass, Fish Buffet, Ocean Rewards, GG Care, Honeymoon,
    friends, notes, chat, verification UI and session management.
*   30 selectable locales (of the 32 codes in the source string table), with 471
    shared strings auto-translated and English fallback for the remainder.

Tier 2 features must not add a new persistence model or a new trust boundary
without a separate decision.

## Non-Goals

*   Real-money gambling, payment processing, real KYC checks against an
    authority, or regulatory compliance. The verification screen is a **mock
    review flow**; it does not establish legal identity.
*   Live-dealer video streaming.
*   A GPU Stage3D recreation of the original table room. The accepted
    approximation is CSS over the decoded room texture.
*   Multiplayer across machines; the server binds loopback only.
*   Reimplementing the entire GGPoker slot and tournament content catalogue.
    The six casino games and the seeded tournament series are representative.

## Decisions and Risks

**Decided:**

*   **Testing seam**: `node:test` over the pure engine. Committed at
    `app/server/engine.test.js`, `ledger.test.js`, `ledger-session.test.js`, `refund-fault.test.js`, `claims.test.js` and `http.test.js` (39 tests: deck,
    hand ranking, Hold'em/Omaha selection, rake, side pots, uncontested pot,
    tournament payout, ledger atomicity/continuity/rollback, crash refunds,
    claims and the ephemeral-port server). Run with
    `pnpm test`; the invariant → test mapping is in the Verification Plan.
*   **Table rendering**: CSS over the decoded room texture. Reopen only if a
    concrete perceptual gap is demonstrated.
*   **Localization**: shared UI vocabulary comes from the original string table;
    unmatched clone-specific labels fall back to English. New UI uses `t()`;
    the DOM observer is a frozen compatibility shim.
*   **Asset licensing**: GGPoker-derived assets and the personal brand remain
    local and are regenerated from the installed client; they are not
    redistributed in the public repository.
*   **Signing**: the packaged app is Developer ID signed on this machine. The
    README's quarantine command is a fallback for machines without the
    certificate, not the primary path.
*   **Single instance**: `app.requestSingleInstanceLock()` focuses the existing
    window instead of starting a second server against the same database.
*   **Ledger atomicity**: `addTransactionEx` inserts the ledger row first when a
    reference is present, predicts `balance_after`, applies the balance only
    when the insert changed a row, and supports `onDuplicate: 'skip'`; all
    writes stay in `BEGIN IMMEDIATE` / `COMMIT`.
*   **Crash refunds**: a cash seat has a `session_id`; buy-in, rebuy, cash-out
    and session close carry it. Startup refunds sessions with no `out:`/`refund:`
    reference, for the sum of buy-in plus rebuys, exactly once.
*   **Per-user claims**: `player_claims` backs daily, GG Care, Honeymoon and
    missions; mission progress and claimed state are scoped to the user.

**Risks:**

*   The client-side hand evaluator (`app/src/game/eval.ts`) duplicates server
    `poker.js`. It is display-only today; a divergent tie-break would be a
    correctness bug. The server snapshot remains canonical.
*   Lobby `players`, `avgPot`, `vpip`, `handsPerHour` and `online` are synthetic
    projections (table-id hash + sine wave), while `running` is real. The API
    marks table rows `synthetic: true`; the UI marks the estimated columns. Any
    decision must use `LIVE_TABLES`.
*   Blackjack is server-authoritative: the server holds the shoe, player and
    dealer, and computes hit/stand payouts. The client never sends an amount.
*   Rake's cap is the table's `rakeCap` (default 300); the old `3 × bb` fallback
    was removed. Production injects the global `rake_cap` setting.
*   The CDP port 9333 is a development affordance. It is now gated behind
    `GGPOKER_DEV=1` or `GGPOKER_CDP=1`; the packaged app does not open it by
    default.
*   Uploads are stored as data URLs in SQLite. `readBody` rejects bodies above
    8 MB; verification accepts 5 MB decoded and branding 3 MB. This is an accepted
    single-user local trade-off.
*   `app/server/index.js` contains casino and reward domain logic that belongs
    beside the engine. New money/outcome logic must not be added inline.
*   A server crash refunds `chips_in` (buy-in + rebuys) exactly once. Losses are
    forgiven; winnings above `chips_in` are lost. Bound: one stack per crash.
    There is no silent auto-restart.
*   HTTP and WebSocket requests are limited to `127.0.0.1`/`localhost` on the
    bound port; a present `Origin` must match. `GGPOKER_DEV=1` adds port 5199.
*   Tables expose `tableEpoch`/`tableVersion`; a client that sees an epoch change
    or a sequence gap reconnects for a full snapshot. Events are not replayed.
*   Admin "delete" is a soft delete: sessions revoked, live seats cashed out,
    the user's WebSockets closed, the account anonymised and banned, ledger/claim
    rows retained. Every WS message revalidates the account.
*   **Open**: `app/server/index.js` is a 1,384-line router plus domain logic; the
    placement rule is the intended boundary, not the current shape.

## Critical User Journeys (CUJs)

### CUJ 1: First launch and login

*   **Given** a signed `DanGG.ro.app` and no running server.
*   **When** the user opens the app.
*   **Then** the Electron main process starts the bundled server on port 5198,
    waits for `/api/lobby` to answer, and loads the frameless window. The
    renderer then shows its own short splash while it fetches the lobby; the
    login screen accepts
    `DansiDanutz / ggpoker`, `admin / admin123`, or a new registration. These are
seed records created on first run; the admin password is intentionally weak
local filler.

### CUJ 2: Play a cash hand

*   **Given** a logged-in user with a positive balance.
*   **When** the user joins a table, chooses a buy-in and acts.
*   **Then** the server debits the buy-in, seats the player, deals from a
    server-shuffled deck, validates every action, resolves side pots, applies
    rake, credits the winner, persists the hand and broadcasts a state snapshot.
    The client shows cards, bets, pot, timer, action buttons, chat and
    animations from that snapshot.

### CUJ 3: Register and finish a tournament

*   **Given** a tournament in `registering` state and enough balance.
*   **When** the user registers and later starts it.
*   **Then** the buy-in and fee are debited once, the user is seated with the
    starting stack, blind levels increase, busted players receive places and
    payouts, and the last player receives the winner payout exactly once.

### CUJ 4: Cashier and rewards

*   **Given** a logged-in user.
*   **When** the user deposits, withdraws, claims a daily reward, redeems gems or
    claims a mission.
*   **Then** every ledger change is written to `transactions` with a
    `balance_after`, the user row is updated, and the UI refreshes from the API.
    The same reward cannot be claimed twice for the same period.

### CUJ 5: Admin moderation

*   **Given** an administrator session (`is_admin = 1`).
*   **When** the admin credits a user, edits a table or tournament, uploads
    branding, reviews an identity document or exports CSV.
*   **Then** the change is applied server-side, written to `audit_log`, and
    visible to players on their next request. Non-admins receive 403.

### CUJ 6: Localized session

*   **Given** the user selects a language from the title-bar chip.
*   **When** the language changes.
*   **Then** the shared UI vocabulary is translated from the original string
    table, Arabic switches the document to RTL, and the choice persists in
    `localStorage`.

## Glossary and dependencies

**Terms:** NLHE = no-limit Hold'em; PLO = pot-limit Omaha; PLO5 = five-card PLO; PLO6 = six-card PLO;
Short Deck = 36-card Hold'em; AoF = All-in or Fold; Rush & Cash = fast-fold cash;
Spin & Gold = three-handed jackpot SNG; Mystery Battle Royale = bounty format;
bb = big blind; WAL = SQLite write-ahead log; CDP = Chrome DevTools Protocol;
ATF = Adobe Texture Format.

**Prerequisites for a rebuild:** macOS with Developer ID certificate; a licensed
GGPoker macOS client installed at the standard application-support path; Node
≥22 and pnpm; ~1.4 GB free for the source assets. `tools/setup_assets.sh` and
`package_app.sh` consume these.

## Technical Plan (Architecture)

```text
┌──────────────────────────── DanGG.ro.app ────────────────────────────┐
│ Electron main (electron/main.cjs)                                    │
│   • frameless BrowserWindow 1200×961, CDP on 9333                    │
│   • spawns server with process.execPath + ELECTRON_RUN_AS_NODE=1     │
│   • waits for http://127.0.0.1:5198/api/lobby                        │
│                                                                      │
│   ┌──────────── BrowserWindow ────────────┐   ┌──── Node server ───┐ │
│   │ React 19 + TypeScript + Vite          │   │ node:http + ws     │ │
│   │  • lobby/table/cashier/rewards/admin  │◄──┤ REST /api/*        │ │
│   │  • WebSocket client per table          │   │ WS   /ws           │ │
│   │  • original assets + i18n layer        │   │ SQLite (WAL)       │ │
│   └───────────────────────────────────────┘   └────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Process and lifecycle

*   `app/electron/main.cjs` creates the window, sets `userData` to
    `~/Library/Application Support/GGPoker Clone`, starts the server as a child
    with `ELECTRON_RUN_AS_NODE=1`, and polls `/api/lobby` before `loadURL`.
*   The server is a single Node process. It serves `dist/` and `public/assets`
    with a small static handler and exposes REST plus one WebSocket server at
    `/ws`.
*   The Vite dev server uses port 5199; the packaged app always loads 5198.

### Persistence and ownership

One SQLite database in WAL mode at
`~/Library/Application Support/GGPoker Clone/data/ggpoker.db`. The authoritative
schema and its guarded additive migrations are in `app/server/db.js`; that file
is the single source of truth for columns, and this design does not duplicate
it.

Ownership rules:

*   `users.balance`, `play_chips`, `tickets` and `gems` change only through
    `addTransaction`, which updates the affected column and writes the ledger row
    in one sequence. `transactions.balance_after` is the balance of the
    *affected currency*, not always the USD balance.
*   `transactions` is append-only; there is no update or delete path.
*   `hands` is written by the table engine at hand end; it is a record, not a
    source of live state. The read path is `/api/hands` and the Hand History
    screen.
*   Admin `set` on a currency field is a delta through `addTransaction`, not a
    direct `UPDATE`, so the ledger chain remains continuous.
*   Live table state (stacks, pots, timers) lives in the server process. It is
    **not** reconstructed on restart: if the process dies mid-session, the seats
    are dropped and the buy-in remains in the ledger until a cash-out. This is a
    known gap; a startup reconciliation that refunds open buy-ins is a Phase 2
    item, not current behavior.
*   Admin mutations write `audit_log` in the same request.

### HTTP surface

The canonical route list is the router in `app/server/index.js`; this section is
a category map for readers, not a duplicate contract. Every user-facing route
is under `/api`, returns JSON, and uses `Authorization: Bearer <token>` unless
it is a public lobby or auth endpoint.

All JSON except CSV and binary assets. Auth is `Authorization: Bearer <token>`;
admin routes additionally require `is_admin`.

*   Auth: `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`,
    `/api/auth/me`.
*   Lobby: `/api/lobby`, `/api/tables/:id`, `/api/meta`.
*   Cashier: `/api/cashier`, deposit, withdraw, transactions.
*   Rewards: daily, spin, missions, leaderboard, ocean store, GG Care,
    Honeymoon.
*   Tournaments: list, detail, register, unregister, play.
*   Games: `/api/games/slot`, roulette, blackjack, baccarat, dragon-tiger,
    sic-bo.
*   Social: notes, friends, chat, verification, sessions, password.
*   Admin: stats, users, tables, tournaments, banners, missions, settings,
    transactions, audit, live tables, branding, verifications, CSV exports.

### WebSocket protocol

One connection per open table. The client sends
`{type: "join_table", tableId, buyin, observe?, seat?}` and receives state
snapshots (`type: "state"`) plus events (`action`, `street`, `win`, `chat`,
`emote`, `timebank`, `waitlist_ready`, `rabbit`, `tourney_*`, `spin_win`).
Actions are `{type: "action", action, amount}`. The server validates actor, turn,
call amount, minimum raise, stack and street; it never trusts a client amount.
The join `buyin` must be within the table's `min_buyin`/`max_buyin`, and `seat`
is advisory: an occupied seat is reallocated. The turn clock is 15 seconds, plus
one 10-second time bank per player per hand.

### Game invariants

*   Every chip in a pot is committed from a seat stack; the displayed `pot` is
    gross (sum of `totalBet`), and the winner receives `pot − rake`, with rake
    reported separately.
*   Side pots are built from distinct all-in contribution levels; a player can
    win only the layers they funded.
*   Rake follows the single definition in Money and ledger invariants; it is
    deducted before payout.
*   A hand ends when one player remains or the river is resolved. The button
    advances only after a completed hand; folded/all-in seats are skipped when
    choosing the next actor.
*   Tournament payouts are computed once per elimination batch; the last player
    gets the winner share exactly once. Tournament chips are not cashable.
*   Waitlists are FIFO per table; a waiting player is notified when a seat frees
    and is removed on seating or leave.
*   Time bank adds 10 seconds once per player per hand and is exposed as
    `timeBankUsed` in snapshots.

### Money and ledger invariants

*   `balance` and `play_chips` are integer cents; `tickets` and `gems` are unit
    counts. Poker stakes and buy-ins draw on `balance`. UI formatting goes through
    `money()` / `chips()` in `app/src/lib/api.ts`; pages must not hand-roll
    division by 100.
*   Every USD/PLAY/TICKET/GEM debit or credit goes through `addTransaction`,
    which writes the affected balance and the ledger row. `balance_after` is the
    affected currency's balance.
*   Buy-in debits before seating; a failed seat refunds via a `refund`
    transaction.
*   Cash-outs return the remaining stack for cash tables and Spin & Gold. Spin
    prizes are minted into the stack and become cashable through the normal
    cash-out; tournament chips are not cashable and tournament prizes are
    credited separately.
*   Deposits, withdrawals and admin credits are attributable but are **not**
    replay-protected by an idempotency key; a retried request is a second
    movement. Period-based claims (daily, GG Care, Honeymoon, missions) are
    protected by `player_claims`, keyed `(user_id, kind, period_key)`, and awarded
    with a unique `claim:<kind>:<period_key>` reference. Mission periods roll over
    daily (`daily-*`) or weekly (`weekly-*`). Cashier movements accept
    an `Idempotency-Key` and store `cashier:<kind>:<key>` on the ledger; a retry
    returns the original balance.
*   Rake is `floor(pot × rakePercent / 100)`, capped at the table's `rakeCap`
    (default 300), and is deducted from any pot that ends a hand, including an
    uncontested pot. Production injects the global `rake_percent` (default 5) and
    `rake_cap` (default 300) settings. Tournament and Spin hands have zero rake.

### Assets and localization

*   **Prerequisite**: a licensed GGPoker macOS client must already be installed
    at the standard application-support path. `tools/setup_assets.sh` copies its
    `Game/assets` into `app/public/assets`, converting Adobe Texture Format
    (ATF, a compressed GPU texture container) to PNG via `tools/atf_decode.py`.
*   `tools/build_i18n.py` scans the React source, matches 471 shared strings
    against the original `string_table.json` (30 locale codes) and writes
    `src/lib/i18n-dict.json`. `i18n.tsx` exposes `t()` for new code.
*   `tools/build_i18n.py` is re-run when UI strings change; a string added with
    `t()` but missing from the table falls back to English and is visible in the
    generated JSON diff. The dictionary is not auto-updated at runtime.
*   **Compatibility shim**: the DOM observer in `i18n.tsx` is currently the
    mechanism that translates all UI strings; `t()` exists but has no callers
    yet. New UI should call `t()`. The observer does not translate player names,
    chat bodies, or numeric values.
*   Branding is served from `/api/brand/*` when the admin uploads a logo or
    banner; otherwise static files under `assets/chrome` are used.

### Security and trust boundaries

*   Passwords use `scryptSync(password, salt, 32)` with a random 16-byte salt.
*   Sessions are random UUID bearer tokens with a 30-day expiry; `device` is the
    user agent. Password changes revoke all other sessions. Device/session
    management is Tier 2 parity chrome on a loopback-only app; it is not a
    network security boundary. The renderer stores the bearer token in
    `localStorage`.
*   Admin authorization is checked server-side on every admin route; the client
    is not trusted.
*   **CDP port 9333 is a development affordance.** It is gated behind
    `GGPOKER_DEV=1` or `GGPOKER_CDP=1`; the packaged app does not open it by
    default.
*   Verification documents and branding uploads are data URLs in SQLite. The
    HTTP layer must enforce a byte cap before insert (verification 5 MB,
    branding 3 MB); `readBody` rejects bodies above 8 MB.
*   The server binds loopback; there is no TLS because there is no network
    exposure.
*   The renderer has `contextIsolation` and a narrow preload bridge for window
    controls.

### Placement rule

HTTP handlers validate input and delegate. Anything that computes money, pots,
rake, payouts or random outcomes belongs beside `table.js` / `poker.js` and must
be callable without a socket. New code must reuse `addTransaction`,
`requireAdmin`, `publicUser` and the server hand evaluator rather than
reimplementing them. The client evaluator in `app/src/game/eval.ts` is
display-only; the server snapshot is canonical.

## Alternatives Considered

### Alternative A: static front-end only

*   **Pros**: no server process, simpler packaging.
*   **Cons**: no authoritative card deck, no persistent ledger, no multiplayer,
    trivially cheatable.
*   **Reason for Rejection**: the request requires a working poker engine and
    admin mutations, not a UI mock.

### Alternative B: embed the original AIR runtime

*   **Pros**: exact original rendering and behavior.
*   **Cons**: the AIR payload is remote/licensed, the runtime is deprecated on
    macOS, and no admin surface exists.
*   **Reason for Rejection**: cannot be shipped or administered as a local clone.

### Alternative C: native Swift app

*   **Pros**: best macOS integration.
*   **Cons**: rebuilding the entire table/lobby UI and game engine in Swift would
    discard the recovered web-compatible asset pipeline and slow iteration.
*   **Reason for Rejection**: Electron + React reuses the recovered assets and
    keeps the server portable.

### Alternative D: adopt an existing poker engine and ledger library

*   **Pros**: less money code to own; community-tested hand evaluation.
*   **Cons**: most libraries do not cover PLO5, Short Deck, Rush & Cash, Spin &
    Gold and the exact tournament payout shape; integrating three variants and a
    ledger would add a dependency and a second data model, while the recovered
    UI still needs a local server.
*   **Reason for Rejection**: evaluated retrospectively. A library may be the
    right choice for a future rewrite, but it would not remove the assets/server
    work that dominates this project. The hand evaluator is small and now has
    direct tests.

### Baseline: browser-only client against the existing server

*   **Pros**: no Electron packaging; fastest inner loop.
*   **Cons**: no double-clickable app, no local file/server supervision, and the
    user still needs a terminal to start Node.
*   **Reason for Rejection**: violates the Tier-1 "open it and play" goal.

## Non-Functional Requirements

*   **Startup**: packaged app target is `/api/lobby` within 10 seconds; measured
    on the development Mac at roughly 2–3 seconds. The splash waits on the
    response.
*   **Data integrity**: one SQLite file; WAL; no partial balance updates.
*   **Offline**: no external network calls are required at runtime.
*   **Security**: loopback-only, scrypt passwords, server-side admin checks,
    request body cap (8 MB), per-ingestion upload caps, CDP gated to dev.
*   **Localization**: RTL support for Arabic; English fallback for unmatched
    strings.
*   **Packaging**: Developer ID signature and a repeatable `package_app.sh`. The
    source asset directory is roughly 1.4 GB; the packaged bundle size has not
    been measured separately.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

The implementation is already built. The phases below describe the order in
which a new contributor should verify or change it; they are not a claim that
the code has not been written.

### Phase 1 — Invariants and tests (implemented)

*   **Entry**: design approved.
*   **Work**: `app/server/engine.test.js` covers deck integrity, hand ranking,
    Hold'em/Omaha selection, rake floor/cap, side pots, uncontested pot and
    tournament payout; `app/server/ledger.test.js` covers ledger atomicity,
    continuity and rollback. Run with `pnpm test`.
*   **Exit**: tests pass (39/39). Crash refunds, claims, cashier replay, places
    2/3, live join/leave session markers and the ephemeral-port server are covered.
    2/3 and the ephemeral-port server are covered.

### Phase 2 — Trust-boundary hardening (implemented)

*   **Entry**: Phase 1 tests green.
*   **Work**: CDP is gated (`GGPOKER_DEV=1` / `GGPOKER_CDP=1`); `readBody` caps at
    8 MB and returns 413; verification caps at 5 MB decoded and branding at 3 MB.
    Admin checks are per route. Single-instance lock is in place.
*   **Exit**: packaged app opens no debug port; oversized uploads are rejected;
    non-admin mutation returns 403.
*   **Risk**: CDP-driven verification scripts must launch with `GGPOKER_CDP=1`.

### Phase 3 — Engine boundary (follow-up)

*   **Entry**: Phase 1 tests green.
*   **Work**: create `app/server/casino.js` (slot, roulette, blackjack, baccarat,
    dragon tiger, sic bo; exported `play(kind, bet, rng)`) and
    `app/server/rewards.js` (missions, daily, spin, ocean, GG Care, Honeymoon;
    exported `claim(kind, userId)`), moving the handlers currently inline in
    `app/server/index.js`; keep the server hand evaluator canonical and mark
    `app/src/game/eval.ts` display-only or remove it.
*   **Exit**: router handlers only validate and delegate; `node:test` can call the
    casino/reward functions without a socket; public payloads are compared
    against captured fixtures.
*   **Risk**: moving code can change response shapes; capture one response per
    endpoint before the move and diff after.

### Phase 4 — Packaging and docs

*   **Entry**: Phase 1 green; Phase 3 is a follow-up refactor and does not block
    packaging.
*   **Work**: rebuild with `./package_app.sh`, verify signature, relaunch, run the
    route/API checks; regenerate the i18n dictionary if UI strings changed.
*   **Exit**: `codesign --verify --deep --strict` passes; `/api/lobby` returns 200;
    all routes render without console errors.
*   **Risk**: local assets are outside git; a clean checkout must run
    `tools/setup_assets.sh` before packaging.

## Verification Plan

Run from the repository root unless stated. Preconditions: Node ≥ 22 (for
`node:sqlite`), `cd app && pnpm install` already run, port 5198 free.

| Invariant | Check | Command / evidence |
|---|---|---|
| Deck integrity | 52 unique cards; 36 in Short Deck | `cd app && pnpm test` (`deck has 52 unique cards, short deck has 36`) |
| Hand ranking | Royal > quads > full house > flush > straight > wheel | `pnpm test` (`hand ranking is ordered correctly`) |
| Hold'em/Omaha selection | Best five; Omaha exactly 2 hole + 3 board | `pnpm test` (`bestHoldem...`, `bestOmaha...`) |
| Rake floor/cap | 5% floor (1010 → 50); default cap 300; custom cap 120 | `cd app && pnpm test` (`rake is floored...`) |
| Side-pot layering + chip conservation | 300/1000/300 contributions; awards 820/700/0 + rake 80 | `pnpm test` (`showdown builds side pots...`) |
| Uncontested pot | 400 pot, rake 20, winner 380 | `pnpm test` (`uncontested pot...`) |
| Tournament winner | Half the pool, credited once, hook once | `pnpm test` (`tournament winner...`); places 2/3 are **not yet tested** |
| Ledger atomicity | Balance + ledger in one transaction; continuity; rollback | `cd app && pnpm test` (`addTransaction writes...`, `ledger balance_after is continuous...`, `a failed ledger write...`) |
| Admin authorization | Non-admin mutation returns 403 | `curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:5198/api/admin/users/1 -H "authorization: Bearer <demo-token>" -H 'content-type: application/json' -d '{"action":"credit","amount":100}'` → `403` |
| Upload limits | Body > 8 MB → 413; verification > 5 MB decoded → 400 | `curl` oversized body; expected codes as stated |
| Startup | `/api/lobby` answers from the packaged server | `lsof -nP -iTCP:5198 -sTCP:LISTEN` empty; relaunch; `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5198/api/lobby` → `200` |
| Renderer screens | 21 page routes render without console errors | `GGPOKER_CDP=1 env -u ELECTRON_RUN_AS_NODE open -n "$HOME/Applications/DanGG.ro.app"`, then `node tools/cdp_login.mjs` / screen tour |
| Packaging | Developer ID authority, not ad-hoc | `codesign -dv --verbose=4 "$HOME/Applications/DanGG.ro.app"` → `Authority=Developer ID Application: Dan Semenescu (3RUJZ24Y76)`; then `codesign --verify --deep --strict` |

Additional checks:

*   **Build**: `cd app && pnpm build`; `cd app && ./node_modules/.bin/tsc --noEmit`.
*   **Syntax**: `node --check app/server/index.js`; `node --check app/server/table.js`; `node --check app/server/db.js`; `node --check app/electron/main.cjs`.
*   **API smoke**: login, lobby, cashier deposit, slot spin, tournament
    register/unregister, CSV export.
*   **UI flows**: table join/action, waitlist, time bank, admin branding upload,
    verification approval, session revoke.

**Known gaps**: full disk/process-kill fault injection and a hard-purge path
for deleted users remain open; the product uses soft delete by design. The
renderer is sandboxed and CSP-protected; the local database remains readable by
a local process. Current runtime evidence comes from the committed tests, API
checks and live join/leave runs. See [remediation.md](remediation.md) for the
bounded remediation record.

---

*Drafted with EGM*
