# Replica gap analysis — DanGG vs. official GGPoker

Compiled 2026-11-12. DanGG (`dangg.live`) is the shipping product; this file is
the single build checklist. Evidence comes from two places, kept separate:

- **Official client** — REA 6.8.0 inventory of the installed `GGPoker.app` /
  `PLAYGG.RO` client, plus native observations recorded by the Codex clone at
  `/Users/davidai/Documents/ChatGPT/REA/GGPoker` (`FEATURES.md`, `GOAL.md`,
  `home-art/rea/*.json`).
- **DanGG** — this repository. `parity-backlog.md` is the older tracker and is
  partly stale (it still lists SSE notifications, per-variant Elo, hotkey
  remapping and the nine backgrounds as missing; all four shipped).

A passing local test is not parity. Every row below needs either a same-viewport
native comparison or an explicit statement of what could not be observed.

## P0 — structural, player-visible

| Gap | DanGG today | Evidence / next step |
| --- | --- | --- |
| Multi-table tournaments (flights, balancing, breaks) | Shipped: `server/tournament-room.js` seats humans across flights, ranks/pays the whole field, balances and breaks every 2 s, and sends `table_move` to moved players | 18 room tests, 3 engine↔room tests and an 8-entrant HTTP/WebSocket test. Remaining: absent registrants are not pushed into a table at the scheduled start, and only the top three places pay |
| Lobby wait lists and full filters | No wait lists; partial filters | Codex `FEATURES.md` lobby row: "complete native navigation, waiting lists, tournament categories and filters" |
| Rush depth | 7 pools (5 Hold'em, 2 PLO) with a native pool lobby (R2–R3, 2026-11-12); Cash Drop is a DanGG rule (R4); queue fairness (R5) and native screenshots (R0) still open | Codex Rush row: "multiple stake levels, Cash Drops, native layout/timing and queue fairness" |
| Spin & Gold gameplay | Information-only screens | Codex traced exact chip/time values from incoming tourney config; multiplier mapping unresolved — do not infer from payout probabilities |
| Battle Royale | Nothing | Reference label only; rules and format unobserved. Treat as unknown, not "coming soon" |
| Table chat and reactions | Emotes only | Codex Hold'em row: "native chat/reaction parity" unverified |

## P1 — fidelity

| Gap | Notes |
| --- | --- |
| Seated action geometry | Native button placement unmeasured; Codex explicitly leaves this open |
| Card geometry / anti-aliasing | Six official sprites exist in DanGG; pixel match unverified |
| Betting/settings parity | Codex verified defaults (2/3/4BB preflop, 33/50/75/100% postflop); DanGG implements the shortcuts. Enter-to-bet and the "Always confirm" option shipped 2026-11-12 (Settings → Betting), off by default. Still unverified: the native confirmation dialog's exact shape and whether it covers non-Enter bet paths |
| Spectator mode | Shipped 2026-11-12: lobby **Watch** and tournament **Watch live** open a read-only view (public hand, board, stacks, results; hole cards hidden; no betting, table options or rabbit hunt; watching never seeds bots). Four HTTP/WebSocket tests; the watcher follows the field when a tournament table breaks. Not verified: native spectator counts or observer-chat rules |
| Cross-room leaderboard | Codex: private room standings only; cross-room identity ranking missing in both |
| Owner console | Multi-user permissions and in-app restore absent in both |
| Visual / platform | Screen-by-screen comparison, accessibility and native packaging still open |

Not a gap: the cashier. GGPoker has a wallet; DanGG is play-money by design.

## Where each replica is stronger

- **Codex**: native evidence depth — REA captures, 3D ATF table-atlas audit, PLO4/5/6 evaluation tests, Spin rule tracing, per-room felt isolation.
- **DanGG**: product depth — deployed site, CI-gated `main`, SSE notifications, per-variant Elo, remappable hotkeys, nine native backgrounds, ledger and session hardening.

## Build order

1. ~~Multi-table tournament seating~~ — **done 2026-11-12** (flights, field-wide places,
   balancing/breaks, `table_move`/`table_break`, client rebinding).
2. ~~Spectator mode~~ — **done 2026-11-12** (read-only watch path and tournament watch entry).
3. ~~"Always confirm" Enter-to-bet~~ — **done 2026-11-12** (Enter-to-bet plus the confirm option).
4. Wait lists, then Rush stakes and Cash Drops.
5. Spin & Gold gameplay once the multiplier mapping is evidenced.
6. Battle Royale last; rules unobserved.

Follow-ups found while wiring item 1: seat online registrants at the scheduled start
(today they are seated when they open the event), widen payouts beyond the top three to
match the native payout table, and add a multi-hour soak test that exercises real table
breaks under bot play.

Each item lands as its own PR with tests; nothing is marked done without a
comparison screenshot or an explicit evidence gap.
