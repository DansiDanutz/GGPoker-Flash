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
| Multi-table tournaments (flights, balancing, breaks) | One 6-seat `tourney-<id>` table; engine merged in `server/tournament.js` but not wired | Wire seating at tournament start, add `table_move`/`table_break` socket events and client rebinding |
| Lobby wait lists and full filters | No wait lists; partial filters | Codex `FEATURES.md` lobby row: "complete native navigation, waiting lists, tournament categories and filters" |
| Rush depth | One stake pool; no Cash Drops | Codex Rush row: "multiple stake levels, Cash Drops, native layout/timing and queue fairness" |
| Spin & Gold gameplay | Information-only screens | Codex traced exact chip/time values from incoming tourney config; multiplier mapping unresolved — do not infer from payout probabilities |
| Battle Royale | Nothing | Reference label only; rules and format unobserved. Treat as unknown, not "coming soon" |
| Table chat and reactions | Emotes only | Codex Hold'em row: "native chat/reaction parity" unverified |

## P1 — fidelity

| Gap | Notes |
| --- | --- |
| Seated action geometry | Native button placement unmeasured; Codex explicitly leaves this open |
| Card geometry / anti-aliasing | Six official sprites exist in DanGG; pixel match unverified |
| Betting/settings parity | Codex verified defaults (2/3/4BB preflop, 33/50/75/100% postflop). DanGG implements shortcuts; "Always confirm" Enter-to-bet is documented natively and not implemented here |
| Spectator mode | Codex observed: unseated observer sees the public live hand, board, stacks and payout with no betting controls. DanGG has no spectator path |
| Cross-room leaderboard | Codex: private room standings only; cross-room identity ranking missing in both |
| Owner console | Multi-user permissions and in-app restore absent in both |
| Visual / platform | Screen-by-screen comparison, accessibility and native packaging still open |

Not a gap: the cashier. GGPoker has a wallet; DanGG is play-money by design.

## Where each replica is stronger

- **Codex**: native evidence depth — REA captures, 3D ATF table-atlas audit, PLO4/5/6 evaluation tests, Spin rule tracing, per-room felt isolation.
- **DanGG**: product depth — deployed site, CI-gated `main`, SSE notifications, per-variant Elo, remappable hotkeys, nine native backgrounds, ledger and session hardening.

## Build order

1. Multi-table tournament seating (engine done; wire it).
2. Spectator mode — small, well-observed, closes a visible gap.
3. "Always confirm" Enter-to-bet.
4. Wait lists, then Rush stakes and Cash Drops.
5. Spin & Gold gameplay once the multiplier mapping is evidenced.
6. Battle Royale last; rules unobserved.

Each item lands as its own PR with tests; nothing is marked done without a
comparison screenshot or an explicit evidence gap.
