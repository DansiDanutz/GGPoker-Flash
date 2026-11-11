# Stage 5 — Zoom-Out Review: Remediation Design

**Target:** `docs/designs/remediation.md` (330 lines)
**Standard:** `zoom-out-standard.md`
**Reviewer:** fresh-context EGM Goldfish (`egm-zoom-out`)

## Verdict

Context sufficiency passes narrowly. Root-problem focus partly fails (G2 reverses a recorded decision). Simplicity/YAGNI fails: the plan is 3–5× larger than the defects justify for a single-user loopback play-money app. Reuse is missed: much of the "new" machinery duplicates `db.js`, `poker.js` and `table.js`. Altitude fails through five parallel enumerations.

## Blockers

**F-1 — Not the "small set of changes" promised.** The plan adds 3 tables, a health/nonce handshake, a WS version+resync+disconnect state machine, a security program, invariants for ~10 subsystems, 2 modules and an ID layer across 12 files/5 phases. Add a triage with a kill list; must-fix is 4 items where an invariant is false in a way that loses/mints chips, not 6+.

**F-2 — G2 reverses a recorded decision.** `dangro-clone.md` decides cashier movements are *not* replay-protected; the prior review said add idempotency only *if* it becomes a requirement. `request()` has no retry/queue/offline path; the only trigger is a double-click. Keep the recorded bound or state the new threat.

**F-3 — Two overlapping replay mechanisms.** `transactions.reference` unique index already gives at-most-once; `idempotency_keys(response TEXT)` reimplements it and adds a payload-drift dead end. Keep one; drop the response cache.

**F-4 — Phase 1 breaks the running app.** Requiring `Idempotency-Key` without adding `api.ts`/Cashier calls makes every deposit/withdraw 400. Add client files and make the header optional-but-honoured for one release.

**F-5 — Verification assumes a missing test seam.** `index.js` binds port 5198 at import and exports nothing; four rows would become manual. Export a `createApp(dbPath)` seam and name it in Phase 2, or mark the rows manual.

## Major

**F-6 — Missions are global, not per-user.** `missions` has no `user_id`; one user claims and all are locked out. `claimPeriod(userId,...)` cannot fix scoping. Choose a per-user row or accept the global bound.

**F-7 — "Welcome/deposit one per account" guards nothing.** The real exposure is unbounded unauthenticated registration, which mints 600,000 cents per call. State the accepted bound or constrain registration.

**F-8 — Disconnect policy regresses safer behavior.** Today close stands and cashes out; the plan adds a 30 s grace, auto-fold and held stack, widening chips outside the ledger. Keep stand-and-cashout.

**F-9 — `stateVersion`/`sinceVersion` is a cursor never used.** Resync sends a full snapshot; `handNo` already exists and the socket is ordered. Drop both; `join_table` already returns a snapshot.

**F-10 — Four mechanisms for "prove the server is mine".** `serverProc.pid` and the health `pid` already exist; `net.connect` is TOCTOU. Use child exit code + `health.pid === serverProc.pid`, or bind port 0 and pass it back.

**F-11 — `table_sessions` is a second source of truth.** Put session identity in the ledger choke point keyed by `buyin`/`rebuy`/`cashout`; drop the state enum and the one-open-session rule (it forbids multi-tabling).

**F-12 — Startup sweep nests transactions.** `addTransaction` owns `BEGIN IMMEDIATE`; the sweep cannot wrap it in another transaction. Ledger helper is the only transaction owner; use the `state` guard per row.

**F-13 — G1 refunds the buy-in, not the stack.** A player up three buy-ins gets one back. State the residual bound or snapshot stacks at hand boundaries.

**F-14 — Security program aimed at an impossible attacker.** Bearer headers, no CORS, no cookies; Origin/Host stops nothing in the stated model, and G3 fixes the foreign listener. Keep token transport and the accepted-risk sentence; mark Origin/throttling rejected with reasoning.

**F-15 — E.1 reinvents an existing seam.** `shuffle` already takes `rng`, `seededRandom` exists privately, one call site. Pass `cfg.rng` and export `seededRandom`; do not route casino/bots through it without a test.

**F-16 — Half of F targets non-features.** Prop bets settle in one request; no leaderboard/GG Pass payout code exists; stakes are already capped. Reduce F to endpoints that move balance and can double-credit.

**F-17 — Module split is lowest value and contradicts prior guidance.** `REVIEW_STATUS.md` recommends `claimPeriod`, not `rewards.js`; delete G.3.

**F-18 — Lobby projection empties the lobby.** `LIVE_TABLES` only has human-opened tables; 100 seeded tables would show 0. Use live seats when running, otherwise a labelled estimate; derive avg pot from `hands`; delete `vpip`.

**F-19 — Five parallel enumerations; H adds a sixth.** One G1–G8 list with invariant, mechanism, components, phase, test; delete decisions/ID layer.

## Nits

- F-20: "eight defects and three gaps" — third gap unnamed.
- F-21: magic numbers belong in `settings`.
- F-22: `/100` cleanup must be display-only; arithmetic in Lobby/TablePage must not be converted.
- F-23: two refund kinds (`buyin_refund` vs `refund`).
- F-24: reuse `ledger.test.js` and `engine.test.js` harnesses.
- F-25: Non-Goals omit what this document needs (no new persistence, no delta protocol, no retry queue, no new modules).

## Highest-value edit

Collapse to four must-fix items — crash refund through the ledger choke point, missions/claim truth, one retry mechanism or the documented bound, and port ownership via child exit + pid — then delete the nonce, version/resync, idempotency response cache, disconnect state machine, module split and ID layer. Spend the freed budget on one honest "accepted bounds" section.
