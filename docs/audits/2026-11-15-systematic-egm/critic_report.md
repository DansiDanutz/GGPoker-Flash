# EGM Stage 7 Critic Review

**Target FeatureRange:** lines 1–92 of `docs/designs/2026-11-15-systematic-clone-mobile-egm.md`
**Reviewer status:** design_critic completed; structural completed; style completed. No reviewer was skipped.

## Blockers

### C1 — Mandatory alternatives analysis is absent (design, structural)
**Scope:** lines 38–60, 76–91.
Add Alternatives Considered covering shared-engine extension versus isolated workflow engines; explicit DanGG rules versus leaving unobserved gameplay disabled; adaptive mobile layouts versus scaled desktop compositions. Compare regression, complexity, performance, accessibility, scalability and scope trade-offs.

### C2 — Spin/Battle house-capital accounting is undefined (design, structural)
**Scope:** lines 54–55, 59, 79.
Multiplied Spin prizes and finite Battle bounties have no house bank/escrow or conservation equation. Define ownership, worst-case reservation before registration/draw, insufficient-capital refusal, atomic player/house/game commits and no affordability reroll. A 20,000× Spin at three 5,000 entries creates a 99,985,000-credit house obligation.

### C3 — Reference inventory does not support “every workflow” (design, structural, style)
**Scope:** lines 16, 30–60, 78, 85–91.
Add or explicitly disposition Card Squeeze, Chip Shuffle, buy-in/Add Chips, Auto Buy-In/Top-Up, FairPlay review, Straddle, Bet-and-Muck, cash departure, RIMT observers/computers, Rabbit-aware HandRank, Rush Helmet/Shuffle/observer chat, tournament pause/cancel/withdrawal/results, Battle previews/archive, Electron/PWA/pop-outs/global overlays and all target-only routes.

### C4 — Risks and mitigations are absent (structural)
**Scope:** lines 28, 76–91.
Add explicit failure modes and mitigations for partial settlement, stale commands, restart races, operator-bank insufficiency, private-card leakage, corrupt checkpoints, SQLite contention/failure, load/state growth, missing art and shared-fixture contamination.

## Majors

### C5 — Proposed target architecture and data flow are missing (design, structural)
**Scope:** lines 12, 38–60, 76–83, 89.
Define component ownership for negotiation state, multi-stage coordinators, timers, private/public projections, active-hand persistence and atomic game/wallet/receipt/recovery writes. Map reference modules to adapted DanGG boundaries rather than saying only “port.”

### C6 — Status/evidence dimensions and proof citations are inconsistent (design, structural, style)
**Scope:** lines 18–28, 40–60, 78, 83.
Separate implementation coverage, local rule provenance, browser/test evidence and native/operator knowledge. Replace Keep and other undefined statuses. Name exact target test files/commands/journeys and current reference guides/modules. State precedence: pinned current code and detailed guides, then summary status, then historical checkpoints.

### C7 — RIMT outcome-changing local rules and side effects are unspecified (design, structural)
**Scope:** lines 46–47, 79.
Specify owner opt-in/migration, eligibility, proposer/decider selection and ties, inter-board allocation, guests/trusted computers, timeout/disconnect versus refusal, observer/folded announcements and insufficient-deck behavior. Define once-per-hand effects for Bad Beat Jackpot, daily points, missions and history; include Rabbit-aware HandRank/history and unsupported Rabbit scopes.

### C8 — Spin registration/configuration/insurance timing is incomplete (design, structural)
**Scope:** lines 23–28, 54.
Decide explicit local starting configuration or keep play disabled. Define per-registration partial failure/refunds, operation identity across rule revisions, pre-draw insurance selection/debit, post-draw rejection, predeal presentation barrier, stale rules, lost acknowledgement and initial absent-player policy.

### C9 — Battle stage/settlement state machine is incomplete (design, structural)
**Scope:** line 55 and 79.
Define event/advancing/table populations, active-hand drain, equal stacks, bounded shootouts/byes, carried stacks, single survivor, rematch wallet behavior, final-knockout hunter ordering/odd credits and exhausted inventory. Add deterministic practice configuration and per-transition recovery plus Battle-specific surfaces.

### C10 — Auto Fold contract is missing (design, structural)
**Scope:** line 53.
Define 169 hand classes, account opt-in, rate/position semantics, Rush Hold’em preflop eligibility, delayed first action, Cash Drop interaction, cancellation on manual action/preference/account changes/reconnect/transfer/errors, stale-callback exclusion and accessible mobile editor.

### C11 — HandRank/advanced metrics and branded formats lack contracts (structural, style)
**Scope:** lines 52–53, 57.
Link `handrank-nativ.md` and `hud-sesiune-all-time.md`; distinguish preflop/draw/double-board/session/all-time/own/opponent behavior. Current reference does not provide general rebuy/add-on/re-entry or branded-format contracts; mark them external unknown or explicit local rules rather than inferring them from banners.

### C12 — Whole-app and mobile acceptance matrices are incomplete (design, structural, style)
**Scope:** lines 30–36, 45, 50, 60, 68–72, 80–83.
Define route × role × data-state × interaction × viewport journeys, including signed-out/guest/user/admin, loading/empty/populated/error/offline/reconnect/install/update/not-found, global overlays and target-only games. Add 430 px, exact 844×390 landscape, safe areas, virtual keyboard, dialog focus, live regions, contrast, reduced motion and physical-browser limitations. Replace subjective “crowded,” “tiny,” “close to,” “primary” and “unintended” with measured thresholds.

### C13 — Baseline probe artifacts are incomplete (design, structural)
**Scope:** lines 64–74.
Link actual probe results with tool/version, selectors, names, rectangles, focus order and scroll positions. Do not use screenshots alone to substantiate computed touch sizes or keyboard labels. Preserve exact commands, counts and timestamps.

### C14 — EGM execution/convergence is not self-contained (structural, style, comprehension)
**Scope:** lines 7 and 83.
Expand Elephant-Goldfish Model, link the installed workflow, name reviewer stages/roster/status and define clean rounds and two-round convergence. Identify the deliverable as the final reviewed branch/commit with dirty-state evidence where applicable.

### C15 — Terminology needs precise evidence sources and feature vocabulary (style)
**Scope:** lines 12, 20–28, 44–45, 49–50, 53–55, 59, 88–91.
Distinguish independent reference behavior, official-client/native evidence and unknown operator rules. Use canonical Rush & Cash, Spin & Gold and Mystery Battle Royale names. Define P$/T$/Gem, shared board prefixes, 2× sit-out countdown and 1–4 game registration. Replace subjective stronger/blind-copy/generic-design wording with objective constraints.

## Nits

- Apply the declared coverage statuses consistently; Spin and RIMT are Partial, not wholly Missing.
- Pin target evidence by full commit plus timestamp or dirty-state identifier.
- Replace colloquial “paying Bad Beat Jackpot,” “native emote art,” “queue-accelerated timer” and “real flow” with factual terms.
- Evidence cells must cite test files/commands/browser journeys, not only feature names.
- Define wallet symbols and exact mobile exceptions in one place.

## Reviewer process notes

The installed package uses `agents/design_critic.md` for the design persona; the reviewer used that available persona with `feature-spec-standard.md`. All reviews were read-only.
