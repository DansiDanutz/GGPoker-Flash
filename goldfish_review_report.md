# Goldfish Annotated Review Report

**Target:** `docs/designs/remediation.md` (full file, 330 lines)
**Status:** resolved — product decisions applied in `docs/designs/remediation.md` (Phases 1–3 implemented)

This report triages the consolidated EGM review. Each item is marked CONTEST,
ESCALATE, PROPOSE FIX or DECLINE. Items marked ESCALATE need an author decision,
not only approval.

## Escalations first

### E1 — Scope budget and the Tier-2 rule [`Stage 8`, `Stage 5`] — Blocker
*   **Affected Scope:** `docs/designs/remediation.md` §A–H, Phases 1–5; `docs/designs/dangro-clone.md` Tier-2 rule.
*   **Discrepancy Description:** The plan adds two tables and a new trust boundary without the separate decision the design-of-record requires, and has no cost ceiling; it is net-additive.
*   **Rationale:** The record says Tier-2 features must not add a new persistence model or trust boundary without a separate decision. The remediation needs a budget and a kill list, not another phase.
*   **AI Suggestion:** ESCALATE.
*   **Justification:** The author must choose the budget and whether to lift the Tier-2 constraint. A reviewer cannot decide how much scope the project should carry.
*   **Proposed Edit:** Add a decision row: "Tier-2 constraint lifted for this remediation: ≤1 new table (`claims`), ≤1 new module, no new protocol surface, net LoC ≤ +150." Or drop the items that cross it. Author chooses.

### E2 — Cashier replay: implement or accept the bound [`Stage 5`, `Stage 7 Design`] — Blocker
*   **Affected Scope:** G2 (L57–59), A.1–A.2 (L96–101), Phase 1.2.
*   **Discrepancy Description:** G2 promotes cashier idempotency to release-blocking, but the design-of-record records "not replay-protected" and the client has no retry path. The plan then creates a key mechanism that breaks the shipped client.
*   **Rationale:** This is a ratchet, not a defect: the code matches the recorded bound. Raising it needs a cost and an owner; dropping it needs an accepted-risk statement.
*   **AI Suggestion:** ESCALATE.
*   **Justification:** The author must decide whether a local single-user app needs replay protection, and whether to pay for the client changes. Both are defensible.
*   **Proposed Edit:** If implemented: one `transactions.reference` unique key supplied by the client; no separate `idempotency_keys` table or response cache; `api.ts`, `Cashier.tsx` and `Admin.tsx` in Phase 1. If accepted: replace G2 with "cashier movements are attributable but not replay-protected; bound: a double-click can duplicate one movement."

### E3 — Crash refund policy [`Stage 7 Design`, `Stage 9`] — Blocker
*   **Affected Scope:** G1 (L55–56), A.3 (L102–106), C.3 (L137–139).
*   **Discrepancy Description:** "Refund or restore" is undecided; A.3 refunds the buy-in, ignoring rebuys, sat-out stacks and session P&L. A winner is confiscated; a loser is made whole.
*   **Rationale:** The refund basis is a product decision about what a crash should cost the player.
*   **AI Suggestion:** ESCALATE.
*   **Justification:** The author must choose: refund `chips_in` (buy-in + rebuys, losses forgiven) or persist stack snapshots at hand boundaries and restore the stack. Each has a different cost and fairness bound.
*   **Proposed Edit:** State the chosen policy and bound next to G1; replace `buyin` with `chips_in`/`chips_out`; add the rebuy case as a test.

### E4 — Sandbox and local threat model [`Stage 7 Design`, `Stage 7 Style`] — Major
*   **Affected Scope:** G5 (L63–64), D.1–D.5 (L149–156).
*   **Discrepancy Description:** `sandbox` is "enable if it works, otherwise accept in writing"; Origin/Host does not address the named foreign-process threat; a local process can read the token and DB.
*   **Rationale:** The security posture is a product decision: either accept the local attacker and drop the browser-oriented controls, or invest in renderer isolation.
*   **AI Suggestion:** ESCALATE.
*   **Justification:** The author must decide the threat model and whether to accept `sandbox:false` with compensating controls. A reviewer cannot set the risk appetite.
*   **Proposed Edit:** Choose: (a) `sandbox:true` + minimal preload + CSP + deny child windows; or (b) accepted local-attacker risk, delete Origin/Host/throttle, keep token transport and document the bound.

### E5 — Missions: per-user claims or accepted global [`Stage 7 Design`, `Stage 9`] — Major
*   **Affected Scope:** F.3 (L181–182), G.2 (L190–191).
*   **Discrepancy Description:** `missions.claimed/progress` are global rows; one user claims and locks out every other account. `claimPeriod(userId,...)` cannot fix the scoping.
*   **Rationale:** Fixing it needs a new per-user claims table and a mission migration; accepting it is valid for a single-operator app.
*   **AI Suggestion:** ESCALATE.
*   **Justification:** The author must choose whether to pay for the schema change or record the global bound.
*   **Proposed Edit:** Either add `claims(user_id, kind, period_key, amount, UNIQUE(user_id, kind, period_key))` and migrate missions, or state "missions are global in this single-operator build; one claim per mission total."

### E6 — Bot/Spin inflation bound [`Stage 7 Design`, `Stage 8`] — Major
*   **Affected Scope:** E.3 (L168–172), F.
*   **Discrepancy Description:** Bot stacks are minted; human winnings from bots become cashable `cashout` rows. The plan says "never enter the ledger" and gives no bound.
*   **Rationale:** The inflation is accepted, but its size and observability need an author decision.
*   **AI Suggestion:** ESCALATE.
*   **Justification:** The author must decide whether to cap per-table minting, monitor it, or accept unbounded play-money inflation.
*   **Proposed Edit:** State "bot stacks mint up to `bots × max_buyin` per table; human winnings cash out; accepted unbounded for play money" or add a daily mint cap and a report.

## Blockers (PROPOSE FIX)

### B1 — Refund/session model is wrong [`Stage 7 Design`, `Stage 9`] — Blocker
*   **Affected Scope:** A.3 (L102–106), Phase 1.1–1.2.
*   **Discrepancy Description:** `table_sessions.buyin` ignores rebuys, multi-table and session P&L; a crash refunds only the original buy-in.
*   **Rationale:** The seat's claim on the ledger is the total chips put in, not the first buy-in.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** `rebuy` is a separate debit at `index.js`; the session must accumulate it. `UNIQUE(user_id, table_id) WHERE state='open'` avoids a second-table debit failure.
*   **Proposed Edit:** Replace `buyin` with `chips_in`/`chips_out`; increment on every seat debit (`buyin`, `rebuy`); refund `chips_in`; add `UNIQUE(user_id, table_id) WHERE state='open'`; state the crash result policy from E3.

### B2 — Session open/close is not atomic; close paths unenumerated [`Stage 7 Design`, `Stage 9`] — Blocker
*   **Affected Scope:** A.3, Phase 1.2; `index.js` `seatHuman`, three cash-out sites, admin close.
*   **Discrepancy Description:** A crash between the debit and the session insert leaves a debit with no session; admin close and idle teardown can close a seat without closing its session.
*   **Rationale:** The invariant is "no seat without an open session, no open session without a seat."
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** Enumerating every path is required; otherwise the sweep misses money.
*   **Proposed Edit:** Add a lifecycle table `trigger | ledger row | session state`; require session insert + debit and close + cash-out in one transaction; list `leave_table`, WS close, idle teardown, `before-quit`, admin table close.

### B3 — The refund sweep cannot nest transactions [`Stage 7 Design`, `Stage 9`] — Blocker
*   **Affected Scope:** A.3, Risks L317–319.
*   **Discrepancy Description:** `addTransaction` owns `BEGIN IMMEDIATE`; wrapping N refunds in another transaction throws, and a crash between COMMIT and the state guard double-refunds.
*   **Rationale:** Exactly-once must come from a unique key, not a second transaction.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** `transactions.reference` already proposed in A.1 can make the refund idempotent by construction.
*   **Proposed Edit:** Add `reference` unique `(user_id, reference)`; refund uses `session:<id>:refund`; the sweep calls `addTransaction` per row, no outer transaction; a duplicate reference is a no-op.

### B4 — Mandatory idempotency key breaks the client [`Stage 7 Design`, `Stage 9`, `Stage 7 Style`] — Blocker
*   **Affected Scope:** A.2, Phase 1; `api.ts`, `Cashier.tsx`, `Admin.tsx`.
*   **Discrepancy Description:** The key is required server-side but no client sends it; every deposit/withdraw/admin credit would 400.
*   **Rationale:** A remediation that breaks the running app fails its own premise.
*   **AI Suggestion:** PROPOSE FIX (if E2 chooses implement).
*   **Justification:** Add the client files and define the missing-key response (`400 idempotency_key_required`).
*   **Proposed Edit:** Add `api.ts`, `Cashier.tsx`, `Admin.tsx` to Phase 1; client generates a UUID per submit; key optional-but-honoured for one release.

### B5 — Key is global and not payload-bound [`Stage 7 Design`] — Blocker
*   **Affected Scope:** A.2.
*   **Discrepancy Description:** A second user can read the first user's stored response; a reused key with a different amount silently drops the intent; check-then-act races.
*   **Rationale:** The key must be user-scoped and bound to the request.
*   **AI Suggestion:** PROPOSE FIX (if E2 chooses implement).
*   **Justification:** Store `transactions.reference` per user; no arbitrary response body.
*   **Proposed Edit:** `UNIQUE(user_id, reference)`; client reference is `cashier:<uuid>`; same reference with a different payload returns 409; insert + movement in one transaction.

### B6 — `stateVersion` resets and late-action guard breaks auto-fold [`Stage 7 Design`, `Stage 9`] — Blocker
*   **Affected Scope:** C.1–C.4 (L133–140).
*   **Discrepancy Description:** A per-table counter resets on table recreation/restart; a client ahead discards fresh snapshots. A deadline guard inside `act()` blocks the tick's own auto-fold.
*   **Rationale:** Full-snapshot resync on `join_table` is already idempotent; a version cursor is not needed for this app.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** The simplest correct fix is to delete the mechanism, not add an epoch.
*   **Proposed Edit:** Delete C.1–C.2 and the late-action row; keep full snapshot on `join_table`; leave disconnect behavior as immediate stand + cash-out, or handle it under E3.

### B7 — No test harness; six verification rows cannot run [`Stage 9`] — Blocker
*   **Affected Scope:** Phases 1–3, Verification L297–313.
*   **Discrepancy Description:** `index.js` listens on import and exports nothing; HTTP/WS tests cannot import it; production hooks are inline in `getLiveTable()`.
*   **Rationale:** The verification table claims automated coverage that cannot exist.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** Extract a factory and hooks; spawn with `PORT=0` and temp DB.
*   **Proposed Edit:** Add Phase 1 task: `createApp(db)`/`start({port:0})` and `createHooks(db)`; name `http.test.js`, `ws.test.js`, `casino.test.js`; mark manual rows as manual.

### B8 — Migration, backup and dateline missing [`Stage 7 Design`, `Stage 8`] — Blocker
*   **Affected Scope:** A.1–A.3, Risks.
*   **Discrepancy Description:** `init()` alters the money DB at import; no `user_version`, backup or rollback; existing stranded buy-ins are ignored.
*   **Rationale:** The one irreversible failure mode needs insurance.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** A local app can still lose its only balance file.
*   **Proposed Edit:** Add `PRAGMA user_version` ordered migrations, pre-migration backup, non-fatal sweep failure, and a dateline for historic rows.

## Majors (PROPOSE FIX / DECLINE)

### M1 — False current-state claims [`Stage 7 Style`] — Major
*   **Affected Scope:** C (L129), E.3 (L170–172), Problem 6.
*   **Discrepancy Description:** "No disconnect policy" is false (stand + cash-out exists); "no version" ignores event `seq`; "bot stacks never enter the ledger" is false at cash-out.
*   **Rationale:** A remediation must describe the real baseline.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** The reviewer cited the code; the text is wrong.
*   **Proposed Edit:** Rewrite C current state: "A close stands and cashes out immediately; there is no grace window or resume; events carry an in-memory `seq`." Rewrite E.3: "bot stacks are minted; human winnings from bots cash out as `cashout`."

### M2 — Port/nonce design is weak [`Stage 7 Design`] — Major
*   **Affected Scope:** B.1–B.4 (L112–124).
*   **Discrepancy Description:** Probe is TOCTOU; nonce is readable via env/health; health leaks pid/dbPath.
*   **Rationale:** Child exit code + stdout/pid is sufficient and smaller.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** The parent already owns `serverProc` and reads stdout.
*   **Proposed Edit:** Delete nonce and `/api/health`; child prints `listening <port>`; on `EADDRINUSE` exit non-zero; parent shows a blocking dialog. Or bind port 0 and report it.

### M3 — Origin/Host rule under-specified [`Stage 7 Design`, `Stage 9`] — Major
*   **Affected Scope:** D.1–D.2 (L149–152).
*   **Discrepancy Description:** Absent Origin (curl/startup) is undefined; hardcoded 5198 breaks configurable port and Vite dev (5199).
*   **Rationale:** A naive allowlist bricks startup.
*   **AI Suggestion:** PROPOSE FIX (or delete under E4).
*   **Justification:** If kept: absent Origin allowed; present must match `http://127.0.0.1:${PORT}` or dev origin; Host must be local.
*   **Proposed Edit:** Add the exact predicate and derive the origin from `PORT`.

### M4 — Lobby projection empties the lobby [`Stage 7 Design`, `Stage 9`] — Major
*   **Affected Scope:** G.1 (L188–189), F.
*   **Discrepancy Description:** `LIVE_TABLES` has only human-opened tables; projecting 100 seeded tables yields 0; `avgPot`/`vpip`/`handsPerHour` have no live source.
*   **Rationale:** The fix would make the product look dead.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** Keep synthetic values but label them; use real seats when live.
*   **Proposed Edit:** "players = live seats when the table runs, otherwise a synthetic estimate flagged `synthetic:true`; avgPot from `hands` when available, else null; delete vpip."

### M5 — Conservation/RNG domains undefined [`Stage 7 Design`, `Stage 9`] — Major
*   **Affected Scope:** E.1–E.3, G6.
*   **Discrepancy Description:** Global chip conservation is false (bots, casino, bonuses); `Math.random` also drives roulette, sic bo, prop bets, daily and wheel.
*   **Rationale:** The test must name the domain and the RNG seam.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** Per-currency reconciliation is the checkable invariant; `seededRandom` already exists.
*   **Proposed Edit:** "For every user/currency, balance == SUM(transactions.amount); record mint/sink totals; export `seededRandom` and pass one `cfg.rng`."

### M6 — Module split has no interface [`Stage 9`, `Stage 7 Design`] — Major
*   **Affected Scope:** G.3 (L192–193), Phase 4.
*   **Discrepancy Description:** `casino.js`/`rewards.js` have no exports/signatures; the split is the largest unphased refactor.
*   **Rationale:** `claimPeriod` beside `addTransaction` solves the claim reuse; the split buys nothing.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** Delete the split; keep `claimPeriod`.
*   **Proposed Edit:** Replace G.3 with "add `claimPeriod`; do not create new modules."

### M7 — Rake fallback removal breaks the test [`Stage 9`] — Major
*   **Affected Scope:** G.4 (L196–197), Verification.
*   **Discrepancy Description:** `engine.test.js` asserts the `3×bb` fallback; removing it leaves the suite red; `getSetting('rake_cap',300)` masks a missing row.
*   **Rationale:** The default is the real cap.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** Keep the default, delete only the code fallback, update the test.
*   **Proposed Edit:** Update the rake test to use `rakeCap:300`; keep `getSetting` default; remove `bb*3`.

### M8 — Traceability and document structure [`Stage 5`, `Stage 7 Structural`] — Major
*   **Affected Scope:** whole document.
*   **Discrepancy Description:** Five identifier systems, no matrix; Risks after the plan; duplicates; `INV-*` layer adds a sixth.
*   **Rationale:** The document cannot be checked for coverage.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** One matrix and one canonical rule home.
*   **Proposed Edit:** Add `Defect | Goal | Plan | Phase | Test`; move Risks above the plan; delete the `INV-*`/decisions layer; use G IDs.

### M9 — Alternatives attribution and depth [`Stage 7 Style`, `Stage 7 Structural`] — Major
*   **Affected Scope:** Alternatives (L211–235).
*   **Discrepancy Description:** "Rejected by author" has no link; A is rejected by preference; per-goal technical alternatives are absent.
*   **Rationale:** The standard requires technical trade-offs.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** Add a criteria table and per-goal options (ephemeral port, persist stack, client single-flight).
*   **Proposed Edit:** Replace "Rejected by author" with `Rejected: <technical trade-off>`; add the missing alternatives.

### M10 — Status/current-state contradiction [`Stage 7 Structural`] — Major
*   **Affected Scope:** L4, L18–27, Phase 1.
*   **Discrepancy Description:** "Proposed" while two fixes are landed; Phase 1 mixes landed and unlanded work.
*   **Rationale:** A reader cannot tell what remains.
*   **AI Suggestion:** PROPOSE FIX.
*   **Justification:** Add an "Already landed" block and mark goal status.
*   **Proposed Edit:** `Status: Proposed — 2 of 8 fixes landed`; add evidence paths.

## Nits (DECLINE unless batch edit)
*   Vague counts ("several", "large"), jargon ("mint", "balance-mover"), `buyin`/`buy-in` drift: DECLINE, low value.
*   Metadata table, decorative rules, lettering collision: DECLINE.
*   "8 defects + 3 gaps" count: PROPOSE FIX in M8.
*   `package_app.sh` as a gate, `tsc` scope, test count in docs: PROPOSE FIX in M8/status.
