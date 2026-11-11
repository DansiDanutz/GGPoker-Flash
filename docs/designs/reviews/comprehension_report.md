# Stage 6 — Comprehension Test

**Mode:** REVIEW · **Scope:** full file (lines 1–448) · **Basis:** document text only
**Reviewer:** fresh-context EGM Goldfish (`egm-comprehension`)

## What this proposes

The document proposes a locally hosted, play-money desktop clone of the GGPoker macOS client, shipped as one signed, double-clickable `DanGG.ro.app` that starts its own Node server on `127.0.0.1:5198` and shows a frameless 1200×961 React window served from that address. Work is split into two tiers: Tier 1 (signed self-starting app with lobby, server-authoritative NLHE cash play with persisted hand history, an attributable and idempotent cashier/ledger, an admin console with audit log, and a reverse-engineering record plus local asset pipeline) and Tier 2 (parity surface — other poker variants, six casino games, rewards programmes, 30 locales), with a standing rule that Tier 2 may not add a persistence model or trust boundary without "a separate decision". The document is explicitly a contract written *after* the code exists: it fixes system boundaries, which component owns authoritative state, the ledger and game invariants, the trust boundaries, and a placement rule for where new logic may live, so that reviewers can judge whether a future change is allowed. It closes with rejected alternatives, non-functional requirements, a four-phase change-and-verify order, and a verification matrix mapping each invariant to a test or command.

## How the existing system works, per this document

An Electron main process (`app/electron/main.cjs`) owns the window, spawns the game server as a child Node process via `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, and polls `/api/lobby` before loading the page. That single server process serves the built renderer and assets, exposes a REST `/api/*` surface plus exactly one WebSocket endpoint at `/ws` (one connection per open table), and owns one SQLite database in WAL mode; the renderer sends intents and renders whatever the server's state snapshots say, and a client-side hand evaluator exists but is display-only. All user balances must change through `addTransaction`, which writes an append-only `transactions` ledger row and the resulting balance in the same sequence; admin mutations additionally write `audit_log`; `hands` is written at hand end as a record; live table state lives in the server process. Assets and localization are recovered from the installed Adobe AIR client: `tools/setup_assets.sh` copies and converts textures, and `tools/build_i18n.py` matches React string literals against the original 30-locale string table to generate a dictionary consumed by `t()`, with a frozen DOM-observer shim translating literals not yet wrapped.

## Findings

### 1. Blocker — authoritative state after restart

The Overview says the server owns money, cards, timers and state **in SQLite**, while Persistence says live table state is in the server process and is rebuilt from the buy-in/cash-out ledger; `hands` is not a source of live state. A stack is not a function of a buy-in and a cash-out row because it changes every hand. A fresh reader cannot answer what is authoritative after a crash mid-session: is a seated player restored at buy-in, at last stack, or not at all, and is a compensating ledger row written? The chip-conservation check has no post-restart baseline. State the surviving rows, how a live stack is reconstructed or refunded, and reconcile the Overview.

### 2. Major — money units and which balance backs poker

Four columns are money-like (`balance`, `play_chips`, `tickets`, `gems`) and all change through `addTransaction`, which writes one `balance_after`. Which currency does that snapshot? "Balances are integer cents; UI divides by 100" cannot apply to tickets and gems. CUJ 2 gives a player a "positive balance" and debits a buy-in without saying whether cash buy-ins draw on `balance` or `play_chips`.

### 3. Major — idempotency undefined and overclaimed

Tier 1 promises every balance change is "attributable and idempotent", but the invariant limits that to four actions "idempotent for their period key", and "period key" is never defined (clock, boundary, timezone, stored repeat detector). Admin credits and cashier deposits/withdrawals have no idempotency mechanism at all; a retried HTTP request appears to be a second credit. The Verification Plan has no daily-claim or deposit-replay check.

### 4. Major — rake boundary and uncontested pots

"5% of the final pot, capped at `3 × bb` unless a table configures a cap" reads as if a configured cap waives the default rather than overrides it. Missing: rounding when 5% is fractional, whether rake can exceed a micro pot, and rake treatment on an uncontested pot (the invariant only defines showdown). `bb` is never expanded.

### 5. Major — security boundary is labelled but not characterized

Sessions are bearer tokens with expiry, then "This is Tier 2 parity chrome; it is not a network security boundary" — the referent is undecidable and conflicts with the per-route admin enforcement. Where is the token stored in the renderer? How does that interact with the unconditionally open CDP port, which can read renderer storage and drive the API? Signing is recorded as delivered while the CDP gate is still required before "production".

### 6. Major — build prerequisite is unstated

The asset pipeline copies the installed client's `Game/assets`, but the document never states as an entry condition that the machine must already have a licensed GGPoker macOS client. A clean checkout cannot produce a working build from this document. `ATF` is not expanded, and the 1.4 GB size is unexplained.

### 7. Major — HTTP/WS contract is a noun list, not a contract

"Cashier: `/api/cashier`, deposit, withdraw, transactions" gives one path prefix and three bare verbs; no methods, paths, payloads or status codes. Chat exists both as a WS event and under REST social with no write-path statement. Snapshots carry no sequence/version, so out-of-order states cannot be detected.

### 8. Major — join amounts and timer are under-specified

The client declares its own `buyin` in `join_table`, while the doc says the server never trusts a client amount. What are min/max bounds, what happens when the client sends more than its stack, and is `seat` trusted? The turn timer length is never stated, and snapshots imply either periodic rebroadcast or an absolute deadline.

### 9. Major — verification is not executable and loses its UI evidence

The matrix says tests are not yet committed, so no invariant is enforced by anything runnable. Its UI row cites a CDP tour while Phase 2 removes the debug port. State what replaces the CDP tour after hardening.

### 10. Nit — undefined domain terms

`NLHE`, `PLO`, `PLO5`, `Short Deck`, `All-in or Fold`, `Rush & Cash`, `Spin & Gold`, `Mystery Battle Royale`, `bb`, `ATF`, `Stage3D`, and "seeded tournament series" are not expanded or linked.

### 11. Nit — helper names undefined

`requireAdmin` and `publicUser` appear only in the placement rule; a reader cannot tell that the first is route middleware and the second a user serializer, or whether `publicUser` redacts fields.

### 12. Nit — "18 routes" ambiguity

"All 18 routes render" uses "routes" for renderer screens while the rest of the document uses "routes" for HTTP endpoints. The 18 screens are not listed.

### 13. Nit — splash sequence inconsistency

Main polls `/api/lobby` before `loadURL`, so the renderer splash cannot be on screen during that wait; either the window loads earlier or the splash is not what ends.

### 14. Nit — hand history read path unnamed

A persisted hand history is Tier 1 and `hands` is named, but no endpoint, CUJ or screen reads it.

### 15. Nit — "elimination batch" undefined

The tournament payout invariant depends on a batch of players busting in the same hand; ordering for places is unstated.

### 16. Nit — seeded credentials unlabelled

`DansiDanutz/ggpoker` and `admin/admin123` are presented without saying they are seed records and the admin password is intentionally weak local filler.

### 17. Nit — i18n drift has no check

The dictionary is regenerated manually; adding `t()` without a table match has no automated check. "Separate decision" for Tier 2 has no artifact/procedure.

**Summary:** 1 Blocker, 8 Major, 8 Nit. The blocker is the authoritative-state/restart story; the ledger and rake findings are only as testable as the restart model they assume. Security, build prerequisites and verification executability are contract-completeness gaps.
