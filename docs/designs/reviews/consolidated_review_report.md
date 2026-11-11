# EGM Consolidated Review — DanGG.ro Clone

*   **Target:** `docs/designs/dangro-clone.md` (525 lines at review close)
*   **Method:** Elephant-Goldfish Model, `dsh-egm` 0.3.1 (upstream `google/elephant-goldfish-model`, pinned by the plugin)
*   **Stages run:** 5 (Initial Zoom Out), 6 (Comprehension), 7 (Design Critic, Structural, Style), 9 (Implementation Readiness, Codebase Details). Stage 8 (Intermediate Zoom Out) was not run; its purpose overlaps Stage 5 and the document changed materially between passes.
*   **Stage reports:** [zoom_out](zoom_out_report.md) · [comprehension](comprehension_report.md) · [design critic](critic_design_report.md) · [structural](critic_structural_report.md) · [style](critic_style_report.md) · [implementation readiness](implementation_readiness_report.md) · [codebase details](codebase_details_report.md)
*   **Review date:** 2026-11-11
*   **Reviewers:** fresh-context, read-only Goldfish subagents; the Elephant (this session) wrote the document, applied fixes and kept the code.

## Executive summary

The Goldfish found the design strong on scope, alternatives and invariants but weak as a contract: the money-atomicity guarantee was not mechanically true, the crash/restart story stranded buy-ins, the cashier idempotency goal contradicted the invariant, and the spec was a mixture of as-built narrative, normative rules and aspirations without identifiers. Several claims (locale counts, bundle size, test status) were calibrated to an intended rather than observed state.

The Elephant fixed the highest-impact items in code and document: ledger writes are now one SQLite transaction, the deck shuffle uses a crypto RNG, the app enforces a single instance, CDP is gated to dev, request bodies are capped, a committed `node:test` suite covers the engine invariants, and the design document now states units, crash behavior, testing status, limits and open items.

Residual blockers are recorded below. They are not hidden by the review.

## Findings and disposition

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| Z-F1 | Blocker | No executable invariant tests ("no runner") | **Fixed**: `app/server/engine.test.js`, 8 tests, `pnpm test` |
| Z-F2 | Blocker | Problem statement did not justify the parity scope | **Fixed in doc**: Tier 1/Tier 2 split and a narrow success contract |
| C-1 | Blocker | Overview said state is "in SQLite" while live state is in memory; restart behavior undefined | **Fixed in doc**: live state in process; crash drops seats; buy-in bound stated as open risk |
| D-F1 / S-M5 | Blocker | `addTransaction` was not atomic; balance could change without a ledger row | **Fixed in code**: `BEGIN IMMEDIATE`/`COMMIT` with rollback |
| D-F5 / Y-B1 | Blocker | Goal promised idempotent cashier while invariant denied replay protection | **Fixed in doc**: goal now "attributable + period-bounded"; cashier replay listed as not protected |
| D-F2 | Blocker | Restart strands buy-ins; "Phase 2" remediation did not exist | **Partially fixed**: stated as an Open risk with bound and no-auto-restart policy; reconciliation not implemented |
| D-F3 | Blocker | No single-instance/port ownership rule | **Partially fixed**: `requestSingleInstanceLock()` added; port ownership/nonce still open |
| D-F4 | Blocker | Bot subsystem absent from the spec | **Open**: documented as an open item; bots still fill seats via the validated action path but have no seeded test mode |
| S-S1 | Blocker | Risks lacked mitigations and limits | **Fixed in doc**: risks now carry status/limits and open items; a dedicated Limits block is still recommended |
| S-S2 | Blocker | Document type/normative status mixed | **Partially fixed**: status and "as observed" framing clarified; requirement IDs not added |
| D-F6 | Major | "Loopback means no exposure" false; token in WS query; `sandbox: false` | **Open**: threat model still needs Origin/Host validation, token transport, login throttling |
| D-F7 | Major | WS protocol lacks versioning/reconnect/disconnect rules | **Open** |
| D-F8 / Y-M9 | Major | Rake defined twice with different scope | **Fixed in doc**: one parameterized definition; game section cross-references it |
| D-F9 | Major | RNG/shuffle fairness unspecified | **Fixed in code/doc**: crypto RNG default in `poker.js`; seed-injectable parameter retained |
| D-F10 | Major | No capacity/growth limits | **Open**: limits section recommended |
| D-F11 / S-S4 | Major | Alternatives omitted adopt-existing-engine and baseline | **Fixed in doc**: Alternative D and browser-only baseline added |
| D-F13 | Major | Spec withheld schema constraints/routes | **Partially fixed**: ownership rules and minimal constraints added; full route/auth table still open |
| D-F14 | Major | Contract vs current vs aspiration mixed | **Partially fixed**: testing/limits/open items clarified; per-statement status legend not added |
| D-F15 | Major | Balance-moving subsystems outside contract | **Open** |
| S-S5 | Major | Duplicated normative content | **Partially fixed**: rake and CDP duplicates reduced |
| S-S6 | Major | No invariant IDs/traceability | **Open** |
| S-S7 | Major | Dangling references | **Fixed**: phase/status references corrected |
| S-S8 | Major | Prerequisite buried | **Fixed in doc**: Glossary and dependencies section |
| S-S9 | Major | Path convention inconsistent | **Fixed**: paths made repo-root relative where touched; not audited exhaustively |
| S-S10 | Major | Open items scattered | **Partially fixed**: Open risks consolidated in Decisions/Risks |
| Y-M10 | Major | Locale counts inconsistent | **Fixed in doc**: 30 selectable of 32 codes, 471 strings of 11,632 keys |
| Y-M11 | Major | Startup/size numbers unmeasured | **Fixed in doc**: startup measured ~2–3 s; 1.4 GB attributed to source assets |
| Y-M12 | Major | Reviewer request vague | **Fixed in doc**: explicit decisions requested |
| R-1 | Blocker | Phase 1 stated both done and not started | **Fixed in doc**: 11 tests committed (engine + ledger); Known gaps now lists only fault-injection/restart |
| R-2 | Blocker | Phase 3 has no file boundary/signatures | **Partially fixed**: named `casino.js`/`rewards.js` and exports; still no per-file create/modify table |
| R-3 | Major | Verification rows cite missing scripts/queries | **Partially fixed**: test names and commands added; screen tour and places 2/3 still missing |
| R-4 | Major | Rake invariant contradicts production `rake_cap` setting | **Fixed in doc**: global 300 setting, 3×bb only when 0; test still uses test config |
| R-5 | Major | 5 MB upload cap unreachable behind 6 MB body cap | **Fixed**: body cap raised to 8 MB; doc states decoded 5 MB |
| R-6 | Major | Startup can pass against stale server | **Open**: preconditions documented; no port nonce |
| R-7 | Major | Packaging check cannot prove Developer ID | **Fixed in doc**: `codesign -dv` authority assertion |
| R-8 | Major | Commands lack cwd/tool/target | **Fixed in doc**: repo-root commands and app cwd |
| R-9 | Major | Phase 2 "partly" with no remainder | **Fixed in doc**: marked implemented |
| R-10 | Major | "Seeded hands" unsupported | **Open**: doc says scripted tables; RNG injection not implemented |

Severity key: Blocker = must resolve before treating the spec as an approval gate; Major = resolve before the next feature; Nit = cleanup.

## Code changes made during review

*   `app/server/db.js`: `addTransaction` now uses `BEGIN IMMEDIATE` / `COMMIT` with `ROLLBACK` on failure.
*   `app/server/poker.js`: default shuffle RNG is `node:crypto.randomInt`; tests can still inject a deterministic RNG.
*   `app/electron/main.cjs`: single-instance lock; CDP is opened only with `GGPOKER_DEV=1` or `GGPOKER_CDP=1`.
*   `app/server/index.js`: `readBody` rejects bodies over 8 MB with HTTP 413.
*   `app/server/engine.test.js`: 8 tests covering deck integrity, hand ranking, Hold'em/Omaha selection, rake floor/cap, side pots, uncontested pot and tournament payout.
*   `app/server/ledger.test.js`: 3 tests covering ledger atomicity, balance continuity and rollback; isolated with `GGPOKER_DATA` temp dir.
*   `app/package.json`: `pnpm test` → `node --test server/*.test.js`.

## Verification performed

*   `pnpm test` → **11 passed, 0 failed** (8 engine + 3 ledger).
*   `pnpm build` → success.
*   `node --check` on `server/index.js`, `server/table.js`, `server/db.js`, `electron/main.cjs`.
*   Packaged and relaunched `DanGG.ro.app`; `/api/lobby` → **200**.
*   All package changes signed and applied to `~/Applications/DanGG.ro.app`.

## Residual open items

1.  **Phase 3 module split**: `casino.js`/`rewards.js` are named but not created; the router still contains the logic.
2.  **Crash reconciliation**: buy-ins are still stranded if the server dies mid-session. Bound: one buy-in per seated player per crash. No auto-restart. Needs `session_id` on buy-in/cash-out rows and a startup sweep.
3.  **Cashier replay protection**: deposits/withdrawals/admin credits are not idempotent. Add an idempotency key + unique index if this becomes a contract requirement.
4.  **Port ownership**: single-instance lock is in place, but a foreign process on 5198 before launch is still not rejected; add a nonce/health check.
5.  **WS protocol**: no `stateVersion`, resync, or disconnect policy.
6.  **Threat model**: loopback is not a boundary; add Origin/Host validation, move the token out of the query string, add login throttling, decide on `sandbox: false`.
7.  **Bots**: no deterministic seeded mode; add one for engine tests and document the CPU/timer budget.
8.  **Router boundary**: `app/server/index.js` still contains casino/reward domain logic.
9.  **Balance movers**: casino, prop bets, bad-beat/GG Care, leaderboards and welcome/daily amounts still need explicit invariant rows.
10.  **Requirement IDs**: add `INV-*` / `SEC-*` identifiers and a route/auth table if this document is to serve as an approval gate.

## Recommendation

Treat the design as **conditionally approved for the current local demo**: the money-write path and engine tests now exist, and the document no longer claims properties the code does not have. Do not call it production-ready until the residual items above are closed, especially crash reconciliation, the WS protocol version, and the local threat model.

*Produced with EGM, `dsh-egm` 0.3.1.*
