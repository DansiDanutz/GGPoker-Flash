# Full review status — 2026-11-11

## Completed

- **Stage 5 — Initial Zoom Out** on `docs/designs/dangro-clone.md` + project context. Report: `zoom_out_report.md`.
- Code fixes from Stage 5:
  - Admin `set` on balance/play chips/tickets/gems is now a delta through `addTransaction`.
  - Blackjack is server-authoritative; the client cannot submit a payout amount; `settle` is rejected.
  - Design corrected for gross pot, Spin cashability, synthetic lobby numbers, `t()` status and the dead rake fallback.

## Not run in this pass

- Stage 6 — Comprehension
- Stage 7 — Design Critic / Structural / Style
- Stage 8 — Intermediate Zoom Out
- Stage 9 — Implementation Readiness / Codebase Details

The prior full-run reports in `docs/designs/reviews/` cover the same stages before the latest fixes. A fresh 6–9 pass is the next step if the user wants a single consolidated report for this exact revision.

## Open items carried forward

1. Lobby occupancy is synthetic; project it from `LIVE_TABLES`/`WAITLISTS`.
2. Tier 2 has no budget rule; freeze or require deletions.
3. Phase 3 module split: prefer `claimPeriod()` beside `addTransaction` over a new `rewards.js`.
4. Formatting rule (`money()` only) is violated in Lobby/Rewards.
5. Admin `resetpw` does not write an audit row.
6. Server failure in `main.cjs` loads a blank window instead of a blocking error.
7. `rake_cap` fallback (`3 × bb`) is dead in production.
8. Blackjack response balance uses the pre-request user snapshot; a concurrent movement could make it stale.

## Verification

- `cd app && pnpm test` → 11 passed.
- `pnpm build` → success.
- Packaged and relaunched; `/api/lobby` → 200.
- Blackjack exploit (`settle` with arbitrary amount) → `unknown action`.
- Admin set → `admin_set` ledger row with `balance_after`.
