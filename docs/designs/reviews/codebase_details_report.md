# Stage 9 — Codebase Details Review

**Target:** `docs/designs/dangro-clone.md` L450–L525
**Standard:** `implementation-readiness-standard.md`
**Reviewer:** fresh-context EGM Goldfish (`egm-codebase-details`)

## Verified accurate

- `engine.test.js` exists with exactly 8 tests covering deck, ranking, Hold'em/Omaha, rake, side pots, uncontested pot and tournament winner.
- `readBody` caps and returns 413; verification 5 MB, branding 3 MB checks exist.
- CDP is gated on `GGPOKER_DEV`/`GGPOKER_CDP`; single-instance lock exists; `/api/lobby` is polled before window creation.
- 23 `/api/admin*` route blocks each call `requireAdmin`.
- `package_app.sh` runs `codesign --verify --deep --strict`; asset/i18n tools exist.
- `addTransaction` uses `BEGIN IMMEDIATE`/`COMMIT` with rollback; `transactions.balance_after` is `NOT NULL`.
- Tournament unregister, CSV exports and session DELETE routes exist.

## Findings

### 1. Blocker — Phase 3 leaves every design decision to the implementer

No paths, modules, signatures, payload contract; "display-only or removed" unresolved. Casino/reward logic is inline at many routes; `snapshotFor` has no hand-name field, so making the server evaluator canonical requires inventing the field, timing and viewer scope.
**Fix:** Per-phase file table, exact exports (`casino.js → spinSlots(user,bet) → {...}`), route delegation list, and one decision on the client evaluator; name the snapshot field and test.

### 2. Blocker — Rake invariant contradicts live configuration

`rakeCap` is injected from the global setting (default 300) for every table; `3 × bb` only applies when 0. The test helper omits `rakeCap`, so it proves a branch production does not take.
**Fix:** State `rake_percent`/`rake_cap` settings and fallback; test with production config at two stakes.

### 3. Major — Phase 1 status and Known gaps contradict

**Fix:** Delete the stale "not yet committed" sentence; state ledger/fault-injection open items and target file.

### 4. Major — Tournament payout test overstates coverage

Only the winner path is tested; 30/20 places and real `onTournamentPayout`/`onTournamentEnd` ledger credits are untested.
**Fix:** Test with production hooks and a temp DB: three transactions, one row per player, tournament completed.

### 5. Major — "18 renderer screens" has no script and the router has 21 entries

`drive.mjs` visits lobby → table and only prints errors; `cdp_login.mjs` takes one screenshot. No failing exit criterion.
**Fix:** Enumerate routes, add `tools/screen_tour.mjs` with exit code, require `GGPOKER_CDP=1`.

### 6. Major — Ledger row is unexecutable/vacuous

No ledger test; `balance_after NOT NULL` makes the proposed query vacuous. A DB test must set `GGPOKER_DATA` to a temp dir before importing `db.js`.
**Fix:** `app/server/ledger.test.js`, `GGPOKER_DATA=$(mktemp -d)`, continuity SQL and final-balance assertion; fault-injection case.

### 7. Major — "Seeded hands" unsupported

`startHand` uses default `cryptoRng`; `PokerTable` has no `cfg.rng`; Spin/bot decisions use `Math.random()`.
**Fix:** Say "scripted hands via `tableWith`" or add `cfg.rng` plumbing as explicit Phase 3 work with call sites and a determinism test.

### 8. Major — Commands not executable

`pnpm test` only in `app/`; `tsc` only in `app/`; no root package; codesign has no target; curl has no URL/status.
**Fix:** Fenced commands with cwd, tool and assertion.

### 9. Major — Phase 2 labelled partly implemented but no remaining work

All exit criteria already hold.
**Fix:** Mark implemented or list concrete remainder (per-route caps, rate limit, WS size limit).

### 10. Major — 5 MB verification cap unreachable

Base64 inflates; body cap fires first. State executable limits and status codes.
**Fix:** 8 MB body / 5 MB decoded / 3 MB branding; test 4.4 MB and 4.9 MB boundary cases.

### Nits

- Rake test lacks a fractional case (`1010 → 50`).
- "same" evidence across four rows.
- `curl` cannot prove "before window loads"; use log/CDP ordering.
- i18n regeneration command/output missing.
- Node ≥22 baseline not stated with checks.

## Bottom line

Factual claims about existing machinery are largely correct. It fails readiness on three things: Phase 3 leaves design decisions to the implementer; the verification table asserts a rake invariant the live config contradicts and cites nonexistent scripts/queries; Phase 1 status statements disagree.
