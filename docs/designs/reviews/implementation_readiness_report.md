# Stage 9 — Implementation Readiness Test

**Target:** `docs/designs/dangro-clone.md` L450–L525
**Standard:** `implementation-readiness-standard.md`
**Reviewer:** fresh-context EGM Goldfish (`egm-implementation-readiness`)

## Verdict

The plan is not ready as an implementation gate. Phase 1 is stated both as done and not started; the one code-moving phase (3) has no file boundary, module signatures or test names; and the verification table cites evidence that does not exist or cannot run as written. The existing code is largely correctly described.

## Findings

### Blocker 1 — Phase 1 status contradictory

Phase 1 is "implemented" with 8/8, the Decisions section says the test file is committed, and the closing "Known gaps" says the Phase 1 tests are "not yet committed". The code agrees with the first two: `app/server/engine.test.js` has 8 tests.
**Fix:** Delete the stale sentence, state only the genuinely open work (ledger conservation, fault injection, restart reconciliation).

### Blocker 2 — Phase 3 has no executable detail

Phase 3 says "move casino RNG and reward economics out of the HTTP router" but names no files, modules, exported signatures, handler inventory or test file. It also leaves "client copy marked display-only or removed" undecided. The work is bounded in code: casino/table/propbet handlers and rewards/ocean/honeymoon/GG Care claims are inline in `index.js`.
**Fix:** Add a per-phase `path | Create/Modify/Delete | purpose` table, name `app/server/casino.js` and `app/server/rewards.js` with exports, and resolve the client evaluator either/or.

### Major 3 — Verification rows cite missing or unreproducible evidence

- Ledger atomicity says "same + SQLite query"; `engine.test.js` never imports `db.js`, and there is no ledger test.
- Chip conservation has no seeded-hand harness; only embedded assertions.
- Tournament payout only tests the winner; places 2/3 are untested and need a clock seam.
- Admin auth/upload rows say "API smoke" with no request/status.
- Renderer screens name "CDP screen tour" but no script; CDP is now gated.
**Fix:** Runnable commands, working directories, preconditions, expected statuses and test names.

### Major 4 — Rake invariant contradicts live configuration

`computeRake` uses `this.rakeCap || 3 × bb`, but every live table receives `rakeCap: getSetting('rake_cap', 300)` and `rakePercent` from settings. At bb=1000 the real cap is 300 chips, not 3000. The test only exercises the branch production cannot take.
**Fix:** State the global `rake_cap` setting (default 300) and the `3×bb` fallback only when 0; test the production config shape.

### Major 5 — 5 MB verification cap is unreachable

`readBody` rejected >6 MiB; the verification check is on decoded bytes. A 5 MB image is ~6.7 MiB base64, so the body cap fired first and the handler's 400 branch was dead.
**Fix:** One contract: body cap (now 8 MB), decoded image cap 5 MB, distinct expected statuses.

### Major 6 — Phase state undeterminable; Phase 4 gated on unstarted refactor

Phase 2 was labelled "partly implemented" though every exit criterion already held; Phase 4 required "Phases 1–3 green" while Phase 3 had not started, yet Phase 4 is the shipped state.
**Fix:** Mark Phase 2 done, relax Phase 4 to Phase 1 + optional Phase 3, remove stale "CDP unconditional" text.

### Major 7 — Open risks orphaned

Crash reconciliation is called a "Phase 2 item" but no phase contains it; ledger/fault-injection gaps have no file/test.
**Fix:** Give each an owning phase, test file and acceptance assertion, or move to a named follow-up.

### Major 8 — Startup verification can pass against the wrong server

The main process resolves on any `/api/lobby` response, and `listen` has no `EADDRINUSE` handler. A stale dev server on 5198 can answer while the packaged child dies, with a different DB.
**Fix:** Preconditions (`lsof` empty, `pkill`), a health/nonce check, and ordering evidence from logs/CDP.

### Major 9 — Packaging check cannot prove Developer ID signing

`codesign --verify` passes for ad-hoc signatures, and `package_app.sh` falls back to ad-hoc.
**Fix:** Assert `codesign -dv --verbose=4` shows the Developer ID authority and that the fallback was not taken.

### Nits

- Commands omit cwd (`pnpm test` only works in `app/`; `tsc` is `app/` only; syntax check paths comma-joined).
- "All 18 renderer screens" is not enumerable; `App.tsx` has 21 page entries and no tour script.
- "(8/8)" and "same" are brittle evidence.
- Rake test lacks a fractional case.
- i18n regeneration lacks the command/output.
- Runtime baseline (Node ≥22) not pinned.

## What checks out

- `engine.test.js` has 8 tests matching the Phase 1 coverage list.
- CDP gating, single-instance lock, 8 MB body cap, per-route admin checks, 5 MB/3 MB ingestion gates all exist.
- `addTransaction` wraps update + insert in `BEGIN IMMEDIATE`/`COMMIT` with rollback.
- `transactions` has no update/delete path; period claims have `PRIMARY KEY (user_id, day)`.
- Failed seating refunds via a `refund` movement.
- `package_app.sh` runs `codesign --verify --deep --strict`.
