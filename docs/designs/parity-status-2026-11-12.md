# Parity status — 2026-11-12

Snapshot for any harness (Claude Code, Codex, DSH) picking up the DanGG parity
work. Branch/worktree: `~/Desktop/DavidAi/GGPoker-flash`, `main` at the commit
that added this file. Plan: [p0-design-plan.md](p0-design-plan.md). Gap source:
[replica-gap-analysis.md](replica-gap-analysis.md).

## Verification baseline

```sh
cd app && node --test server/*.test.js   # 361 tests
npx tsc --noEmit
npx vite build
node tools/soak-tournament.mjs           # 60 bots, must PASS
```

## Shipped in this pass

- **Wait lists (W1–W7):** pure FIFO model with caps, table/group queues, seat
  offers + expiry, bot/seat guards, HTTP API, real lobby counts/position,
  header chip + seat-offer modal, Group View action, admin monitor + clear.
- **Lobby (F1/F2):** native pill filters, per-tab columns, size/game chips,
  Filters popover (Hide full / Has seats), native stake-row Group View.
- **Tournaments (T1–T3):** all registrants seated at start with late-opener
  deep link; `payoutTable` with ledger-equal settlement, Prizes tab and bubble
  line; soak tool + fixes for stale `inHand`, duplicate places and unpaid 2nd.
- **Chat (C1/C3/C4):** server validation/history/allowlist/observers read-only;
  docked 300 px panel with unread badge, reactions, mute/report, settings;
  dealer log as an opt-in DanGG extra (Chat/Dealer tabs).
- **Rush (R1–R5):** pool module keyed by game+blinds, stake ladder + PLO Rush,
  pool lobby + leaderboard/info, admin-configurable Cash Drop (DanGG rule),
  fair FIFO queue with starvation bound.
- **Admin (A1–A6):** role management, chat moderation, audit filters/CSV,
  transaction filters/CSV, user search/pagination, DB backup download.
- **Leaderboard (L1):** cross-room VIP/Elo/XP tabs, me-rank.
- **Mobile fixes:** admin nav wrap, users card rows, compact leaderboard
  podium, page overflow 0 at 390×844.

## Capture-gated — do not invent

These need native evidence before claiming parity:

- **C0/C2:** native table chat (layout, observer rules) and reaction artwork
  extraction. Dealer log is a DanGG extra, not native.
- **R0:** native Rush pool/Cash Drop overlay; Cash Drop rule is labelled DanGG.
- **T0:** native tournament prize bands and start notification.
- **Spin & Gold / Battle Royale:** rules, payout multipliers and formats are
  unobserved; current implementations are deliberately conservative/labelled.

## How to continue

1. Work on a branch, not `main` directly:
   `git checkout -b design/parity-loop-<n>`.
2. Use the T3 Claude Agent (Opus/Fable) with a one-slice brief; verify with the
   commands above; commit `feat|fix|docs(scope): ...`; update
   `p0-design-plan.md` and `CHANGELOG.md`.
3. Keep the soak green for any tournament/payout change.
4. Old `stash@{0}` (`welcome-login work`) is superseded by PR #35; do not apply
   it blindly.

A passing local test is not parity: each closed row needs a same-viewport
native comparison or an explicit "could not observe" note.
