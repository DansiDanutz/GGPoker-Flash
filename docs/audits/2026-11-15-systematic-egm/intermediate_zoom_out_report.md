# EGM Stage 8 Intermediate Zoom Out

**Reviewer:** zoom_out (fresh explore subagent, completed)
**Verdict:** CHANGES REQUIRED — 3 Blockers, 9 Majors, 3 Nits.
**Immutable target baseline:** `8ee5793ff63d24248d398f9597f5ba76ff85ab32`
**Reference:** `15a230e26b8bb82eec196455d0c6e601b8bd478f`

## Blockers

1. **B1 — Durable active-play state and atomic settlement remain undesigned** (Z1; lines 79, 95–131, 150–169). Define durable private deck/negotiation/timer/stage/presentation checkpoints and one unit-of-work boundary for game, wallet, house, receipt and checkpoint writes. `addTransactionEx` already owns its transaction; tournament snapshots reject in-progress hands; graceful close and crash refund paths can conflict with recovery. Specify graceful/hard crash behavior and checkpoint-validation failure handling.

2. **B2 — Spin and Battle still lack house capitalization/exposure accounting** (Z2, C2; lines 54–55, 59, 115–131, 163–165). Current Spin mints exposure without an operator debit. Choose capitalized escrow or a signed house-mint ledger with a conservation equation, worst-case reservation, safe underfunding refusal, atomic unused release and no affordability reroll.

3. **B3 — “Every reference workflow” remains unsupported** (Z3, C3; lines 16, 30–60, 78, 133–138, 158–168). Inventory omissions include Card Squeeze, Chip Shuffle, Straddle, Bet-and-Muck, Add Chips/Auto Buy-In/Top-Up, FairPlay, cash departure, RIMT observers/computers, Rabbit-aware HandRank/history, Rush Helmet/Shuffle/observer chat, tournament lifecycle/results, Battle previews/HUD/profile/notes/reporting/archive and Electron/PWA/pop-outs/global overlays. Several are already target README features and need preservation proof.

## Majors

1. **M1 — Architecture, alternatives and failure mitigations remain absent** (C1, C4, C5). Add component/data-flow decisions, alternatives and risks. Reuse pot/settlement, TournamentRoomOwner, spin.js and keyed ledger identities rather than parallel engines or bespoke idempotency.

2. **M2 — Feature phases precede their shared foundation.** Add a Phase 1 architecture gate for transaction/checkpoint and house-exposure contracts, then per-phase regression/browser gates. Keep each feature guarded until its complete vertical slice passes.

3. **M3 — Command identity/revision rules are not generalized.** Require hand/event identity and expected revision on every new mutation plus durable operation IDs for financial commands. Bind retries to account, operation, rule revision and selected options. Existing `action-version.js` compatibility acceptance of missing handNo is insufficient for new commands.

4. **M4 — RIMT activation, roles, presentation and side effects remain incomplete** (Z4, C7). Define owner opt-in/migration, eligibility, roles/ties, guests/computers, disconnects, observers/folded announcements, allocation and insufficient-deck behavior. Current missions read the first result and BBJ is single-board; define once-per-hand BBJ, points, missions, Rabbit, HandRank and history semantics with regression tests.

5. **M5 — Spin registration, insurance timing and predeal synchronization remain underspecified** (Z5, C8). Define configuration ownership/revision/validation, partial failure, pre-draw insurance, stale retries, lost acknowledgements, absent players and durable presentation barrier. Reconnect must not redraw, repay, replay settlement or replay sound.

6. **M6 — Battle lacks an executable stage/configuration contract** (Z6, C9). Define capacity, stack, blinds, final seats, duration/hand limits, entry, prize shares, bounty inventory, shootout bounds/byes, ties, carried clocks/stacks, exhausted inventory and final-knockout ordering. Separate event/advancing/table populations and add Battle-specific surfaces. Keep the guard until verified.

7. **M7 — Phase 5 requires unbounded rediscovery** (C10, C11). Link Auto Fold, HandRank and HUD guides and summarize 169 classes, account/rate/position/delay/cancellation/Cash Drop/mobile-editor rules; preflop/draw/double-board/session/all-time/own/opponent distinctions. Do not infer branded tournament rules from banners.

8. **M8 — Whole-app/mobile acceptance matrices remain incomplete** (Z7, Z8, C12). Make one route × role × data-state × interaction × viewport matrix authoritative. Include target-only games, global overlays/detached windows, 430 px, 844×390, safe areas, virtual keyboard, dialog focus, live regions and physical-browser limitations. Report “tested matrix passes.”

9. **M9 — EGM execution has a convergence loophole** (comprehension, C14). Expand/link EGM, name stages/roster/status and define clean rounds consistently. External unknowns are scope dispositions, never a waiver for unresolved Blocker/Major findings.

## Nits

1. Use one declared coverage status per row; RIMT and Spin are Partial. Cite exact tests/journeys.
2. Link machine-readable baseline probes with commands, timestamps, versions, selectors, geometry, focus order, scroll positions and counts.
3. Define wallet symbols, replace subjective measurements and pin target evidence by full commit plus timestamp/dirty-state identifier.

## Positive observations

The play-money boundary is clear; the plan avoids speculative infrastructure and invented native values; Battle remains guarded; zero document overflow is not treated as mobile usability.

**Reviewer completion:** zoom_out completed Stage 8 read-only. The reviewer reported reading the full target, prior reports, target README/architecture/server modules and pinned reference matrix/guides. No tests were run and no files edited by the reviewer.
