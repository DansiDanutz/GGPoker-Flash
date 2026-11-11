# Stage 7 — Design Critique

**Target:** `docs/designs/dangro-clone.md` L1–L402
**Standard:** `feature-spec-standard.md`
**Reviewer:** fresh-context EGM Goldfish (`egm-design`)

## Verdict

Four of five required areas exist, but Goals, Alternatives and Risks fail on substance. The money-atomicity claim has no valid proof, a documented money-losing failure mode has a phantom mitigation, and the bot subsystem that produces most table outcomes is absent.

## Findings

### F1 — Blocker · Money atomicity is asserted, not designed

`addTransaction` does `UPDATE users` then a separate `SELECT` then a separate `INSERT INTO transactions` with no `BEGIN`/`COMMIT`. A fault between statements leaves a balance changed with no ledger row — the exact failure the NFR forbids. The verification row "every transaction has a matching balance_after" is tautological because `balance_after` is `NOT NULL` on the insert.
**Recommendation:** Put balance update and ledger insert in one SQLite write transaction; add a fault-injection test and a per-currency conservation check (`Σ transactions.amount == users.<currency>`).

### F2 — Blocker · Restart loses buy-ins with a phantom mitigation

A crash drops seats while the debited buy-in stays with the house; "startup reconciliation is a Phase 2 item" but Phase 2 contains no reconciliation. Chip conservation diverges permanently. The child process is spawned without an `exit` handler, so the window shows a dead origin.
**Recommendation:** Either accept with a stated bound (one buy-in per seated player per crash, single-user local) and remove the phantom phase, or add `session_id` to buy-in/cash-out rows, sweep unclosed sessions at startup, and define the supervision policy (no silent auto-restart, blocking error, reconcile before new buy-ins).

### F3 — Blocker · No single-instance or port-ownership rule

No `requestSingleInstanceLock`; the port is env-overridable; bind failure is unobserved; the window loads 5198 regardless. Two servers against one DB produce two authoritative worlds; whatever listens on 5198 inherits the token from `localStorage`.
**Recommendation:** Enforce single instance, focus the existing window, fail loudly if the port is taken, pass a resolved port/nonce to the renderer, and add a verification check.

### F4 — Blocker · Bot subsystem absent

Bots fill seats, act in the same event loop, and drive most outcomes. The spec does not say who seeds them, whether they use the validated action path, their CPU budget, or how seeded conservation tests work with stochastic actors.
**Recommendation:** Add a Bot opponents subsection: seat-filling policy, same validated action path, deterministic seeded RNG mode, CPU bound, admin bot-speed control.

### F5 — Blocker · Idempotency contradiction

The Tier-1 goal says every balance change is idempotent; the invariant says cashier movements are not replay-protected. Period keys are described as values, not enforcement. Only `daily_claims` has a natural key.
**Recommendation:** Downgrade the goal to attributable + period-bounded, or add an idempotency key with a unique index and retry semantics; enforce claims with DB `UNIQUE` constraints and a concurrent-claim test.

### F6 — Major · "Loopback means no exposure" is false

Any local process, browser page, or DNS rebinding can reach 127.0.0.1. The real boundary is a bearer token stored in `localStorage`, sent in the WS query string, with no login throttling and a seeded weak admin password. The window runs `sandbox: false` despite the `contextIsolation` claim.
**Recommendation:** State the threat model; validate Origin/Host on HTTP and WS upgrade; move the token out of the query string; add login throttling; decide on `sandbox`.

### F7 — Major · WS contract lacks versioning, reconnect and disconnect rules

No snapshot version, no resync path, no disconnect policy (auto-fold/sit-out/seat release), no authority rule for late actions.
**Recommendation:** Monotonic `stateVersion`, `resync` on reconnect, explicit disconnect/timer rules, late-action rejection, and a verification row.

### F8 — Major · Rake defined twice with contradictory scope

One line says rake at showdown; another says uncontested pots too. Raking an uncontested pot is a substantive choice contrary to "no flop, no drop" and is not listed as an approximation. The 5% / `3 × bb` source is uncited.
**Recommendation:** One normative definition; if uncontested rake is intentional, list it as an explicit approximation; cite or label the defaults.

### F9 — Major · RNG/shuffle fairness unspecified

No statement of RNG source, per-hand shuffle, seedability, predictability, or casino payout distribution.
**Recommendation:** One normative paragraph; seed-injectable RNG; no-fairness-guarantee statement for play money.

### F10 — Major · No scalability or growth limits

Only 10 s startup and 1.4 GB install. Missing: concurrent tables/sockets, latency, hand/transaction/audit retention, data-URL blobs in the ledger DB, DB size ceiling.
**Recommendation:** Add a Limits subsection with numbers and rejection/degradation behavior.

### F11 — Major · Alternatives evaluated on one axis

All three alternatives are front-end/runtime choices. No alternative for ledger model (mutable balance + ledger vs append-only/double-entry), persistence, transport, asset provenance, bots, or browser + local server. Alternative A's rejection restates requirements.
**Recommendation:** Add the ledger-model and bot alternatives with trade-offs; state that the evaluation is retrospective.

### F12 — Major · Risks record defects, not mitigations

No risk has a mitigation, enforcement, owner, or acceptance test. The duplicate-evaluator "mitigation" only names which copy wins after divergence.
**Recommendation:** `Risk | Mitigation | Enforcement | Status`; accepted risks get a consequence sentence.

### F13 — Major · Spec withholds the constraints that encode invariants

Delegating schema and routes to source removes keys, indexes, nullability and per-route auth, making contradiction detection impossible (e.g. `transactions` has no uniqueness constraint, no session id).
**Recommendation:** Include a minimal normative data model and a route/auth table; exhaustive DDL may stay in source.

### F14 — Major · Contract, current behavior and aspiration are interleaved

"Proposed — post-implementation" plus present-tense aspirational rules plus unimplemented requirements. The Verification Plan says tests are not committed, so Tier-1 money claims are unverified.
**Recommendation:** Per-statement status legend; mark invariants UNVERIFIED until tests land.

### F15 — Major · Balance-moving subsystems outside the contract

Casino payouts, prop bets, bad-beat/GG Care, leaderboard/GG Pass bonuses and welcome/daily amounts all move `balance` but have no invariant or verification row.
**Recommendation:** One invariant line each or explicitly declare them out of contract.

### F16–F19 — Nits

Locale counts stated three ways (30/32/20; 471 of 11,632); CUJ 1 omits `guest/guest`; process supervision default is destructive; "18 screens" unenumerated and HTTP auth sentence duplicated.

## Blocking questions

1. Is the cashier idempotent or not?
2. Where is the transaction boundary around `addTransaction`?
3. What happens to a seated buy-in when the server dies, and in which phase is it fixed?
4. What happens on a second launch or a taken port?
5. Who fills empty seats, with what determinism and CPU budget?
6. What is the local threat model?
7. Is rake taken on an uncontested pot?
8. Which RNG produces the deck and casino payouts?
9. Which invariants are verified by committed tests?
