# EGM Stage 5 Initial Zoom Out — Goldfish Review

**Reviewer:** zoom_out (fresh explore subagent, completed)
**Mode:** REVIEW
**Verdict:** CHANGES REQUIRED — 3 Blockers, 5 Majors, 3 Nits.

## Blockers

### Z1 — Active-hand persistence and atomic settlement are not designed
**Scope:** target lines 79, 99, 106–111, 115–131, 152–169.

The plan requires restart recovery and atomic hand/wallet/receipt rollback without defining the shared persistence architecture. Current graceful shutdown cashes out cash seats (`docs/ARCHITECTURE.md:312-329`, `app/server/index.js:3363-3379`), and tournament snapshots are settled-hand-only (`app/server/tournament-state.js:7-25`). `addTransactionEx` owns its SQLite transaction (`app/server/db.js:623-653`), so sequential hand/wallet/receipt writes are not atomic and cannot simply be wrapped in another transaction.

Required repair: define durable active-hand/negotiation state; one transaction boundary for game, wallet, receipt and recovery writes; graceful/hard-crash semantics for cash, Rush, Spin, RIMT and Battle; validation and rollback on write failure. Reuse room-owner lifecycle where appropriate, not its settled-hand-only restriction.

### Z2 — Spin and Battle have no house-funding/exposure model
**Scope:** target lines 54–55, 115–131, 163–165.

Current Spin exposure is minted (`app/server/table.js:467-474`, `app/server/index.js:735-737`). The plan adds insurance and finite bounties without defining owner capitalization or an explicit signed house-mint ledger. Reference `docs/rea/spin-registration-runtime.md:25-52`, `docs/rea/spin-insurance.md:43-57`, and `docs/rea/battle-royale.md:261-285` require exposure reservation.

Required repair: choose and test one house policy and conservation equation. Registration must fail safely when committed exposure cannot be funded; an inconvenient outcome must never be rerolled.

### Z3 — Reference inventory is incomplete
**Scope:** target lines 30–60, 76–83, 133–138, 158–168.

Missing explicit traceability includes Straddle; RIMT observers/computer policy; Rush Helmet, observer chat, Shuffle, richer reserved actions and notes/HUD/history; Rabbit-aware HandRank; tournament pause/cancel/withdrawal/elimination/results and owner monitoring; Battle previews/panes/HUD/profile/notes/reporting/archive; Electron, installed PWA, pop-out windows and global overlays.

Required repair: one row per current-reference behavior with source guide/code, target status, current proof, required action and local-policy/external-unknown disposition. Separate implemented reference behavior, source-only contracts, target extras and native unknowns.

## Majors

### Z4 — RIMT activation, roles, observers and existing side effects are unspecified
**Scope:** target lines 14, 43, 46–47, 56–57, 104–111, 166.

Specify eligibility/migration from global Run It Twice, proposer/decider selection and ties, inter-board allocation, guests/trusted computers, observer/folded announcements, timeout versus refusal, and the once-per-hand behavior of Bad Beat Jackpot, leaderboard points, missions and history. Current `app/server/badBeat.js:33-41` is single-board. Add regression tests for each.

### Z5 — Spin insurance timing and predeal barrier are unspecified
**Scope:** target lines 54, 99, 113–120, 164.

Insurance selection/debit must occur during registration before multiplier disclosure; post-draw changes must fail. The first hand/action clock must wait for the authoritative wheel/insurance presentation barrier, with reconnect resume but no redraw, repayment or settlement replay. Add partial failure, stale-rule, insufficient-funds, lost-acknowledgement and interrupted-presentation tests. Evidence: reference `docs/rea/spin-insurance.md:25-33`, `docs/rea/spin-wheel-presentation.md`, `docs/rea/spin-player-queue.md:1-5`.

### Z6 — Battle needs an executable practice-event contract
**Scope:** target lines 55, 122–131, 165.

Define capacity, starting stack, blinds, final seats, Rush duration, entry cost, prize shares and bounty inventory using existing tournament configuration patterns. Resolve stage duration/hand-limit/clock policy without assuming a fixed nine-player final or collapsing populations. Include or explicitly disposition Battle previews, event panes, HUD/profile/notes/reporting and durable public bounty archive. Evidence: reference `docs/rea/battle-stages.md:5-38`.

### Z7 — Whole-app audit lacks route × role × state journeys
**Scope:** target lines 32–36, 95–103, 140–156, 158–169.

Add signed-out/guest/user/admin; empty/populated/loading/error/offline/reconnect/first-launch/install/update/not-found; casino, slots, Prop Bet, rewards, settings and authorized admin transitions; global seat offers, Quick Menu, toasts, overlays and detached windows. Final real-browser gameplay must include PLO/PLO5/PLO6, Short Deck, AoF and target-only games, not only cash/tournament/Rush/Spin/RIMT/Battle.

### Z8 — Mobile evidence needs safe-area, virtual-keyboard, orientation and focus cases
**Scope:** target lines 60–74, 80–82, 140–148, 153–167.

Add installed-PWA safe areas, virtual keyboard during bet/chat/login/cashier/settings, dynamic viewport/orientation, dialog focus containment/return, live-region announcements and physical Safari/iOS versus Chromium gaps. Retain 430 px and exact 844×390 landscape. Report “tested mobile matrix passes,” not universal “no gaps.”

## Nits

### Z9 — Status vocabulary and proof citations are inconsistent
Use only Verified, Implemented locally, Partial, Missing and External unknown. Replace “Keep” and generic “server tests” with named test files/commands/journeys.

### Z10 — Baseline structural probes need durable machine-readable artifacts
Preserve exact commands, counts, timestamps and JSON for touch, accessible-name, overlap and clipping probes. The 110-image report contains only route, viewport, excerpt, overflowX and scrollH.

### Z11 — Evidence precedence is implicit
Pinned current code and detailed workflow guides supersede summary status files, which supersede historical checkpoints and older target inventories. Link relevant REA guides directly in traceability rows.

## Positive observations

The play-money boundary is clear; local implementation is distinguished from native verification; all 22 React routes are listed; zero overflow is not treated as sufficient; and Battle stays disabled until a real flow exists.

**Reviewer completion:** zoom_out completed Stage 5. The reviewer reported reading the full target, linked designs, pinned reference FEATURES/STATUS and relevant guides/code, baseline report and representative images. No files were edited by the reviewer.
