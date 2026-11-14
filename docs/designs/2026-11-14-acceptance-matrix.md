# Acceptance audit + coverage matrix (round 14)

Objective criteria (4), (5) and (6) were exercised against the running build at
`http://127.0.0.1:5198` on `origin/main` @ `46a3cff`.

## Rendered widths

63 route/width combinations: **9 routes × 320/390/430/768/1024/1440/1920**.

Routes: `/`, `/tournaments`, `/casino`, `/slots`, `/my-page`, `/rewards`, `/cashier`,
`/settings`, `/hand-history`.

Result: **0 unintended horizontal overflow** (`documentElement` and `body` delta = 0 on
every combination). Captures: `docs/screenshots/audit-r14` (63 PNGs).

## Keyboard

14 `Tab` presses on Home at 1440: every focused control is a visible button with a
**2 px gold focus outline**; no off-screen focus; order follows the top bar → window
controls → page. It wraps through BODY back to the window controls, so there is no
keyboard trap.

## 200 % zoom

1440 physical at 200 % = **720 CSS px**: the app reflows to the phone shell (top bar,
hero, quick actions, bottom tab bar), **0 px overflow**. Evidence:
`docs/screenshots/audit-r14/zoom-200-home.png`.

## Coverage matrix

| # | Reference section | State | Evidence |
|---|---|---|---|
| 01 | Home / lobby feed | **ported** | `desk-pass/compare.png` |
| 02 | Tournaments list | **ported** | `desk-pass/compare-tournaments.png` |
| 03 | Slots catalogue | **ported layout**, 6 originals vs 30+ | `desk-pass/compare-slots.png` |
| 04 | Casino | **ported structure**, no live dealer | `desk-pass/compare-casino.png` |
| 05–10 | Cash lobbies | **hero carousel + tables**; promotion column & player list partial | `desk-pass/compare-holdem.png` |
| 04 | Table (live hand) | **chrome + celebration**; flags/LIVE badge/info bar partial | `desk-pass/compare-table.png` |
| 07 | My Page | **ported** | `desk-pass/compare-mypage.png` |
| 08 | Rewards (Ocean) | **ported** | `desk-pass/compare-ocean.png` |
| 09 | Settings | **ported shell**, 6 groups vs 12 granular pages | `desk-pass/compare-settings.png` |
| 10 | Cashier | **ported**; withdraw unreachable (play money) | `desk-pass/compare-cashier.png` |
| 11 | PokerCraft | **ported timeline** | `desk-pass/compare-pokercraft.png` |
| 13 | Message centre | **ported** | `desk-pass/compare-msg.png` |
| 14 | Wallet / transactions | **ported** | `desk-pass/compare-wallet.png`, `compare-tx.png` |
| 15 | Tournament lobby details | **modal exists**; reference dock not built | `docs/screenshots/desk-pass` |
| 16 | Mystery Bounty / Spin & Gold | **table lists + info panels**; dedicated buy-in hex grid not built | — |
| 17 | In-table features | show cards, run-it-twice, time bank, notes, chat, reactions, rabbit/runout | — |
| 18 | Jackpots / satellites / limits | jackpot banner/count-up, satellites in tournament filters, deposit limits | — |

## Known gaps (next)

1. Cash lobby: Promotion column and live player-list panel (reference 07).
2. Tournament lobby: docked details panel with structure/prizes tabs (reference 020/208).
3. Spin & Gold: dedicated buy-in hex grid + top-prize feed (reference 10).
4. Settings: split the six groups into the reference's twelve granular pages.
5. Table: pod flags / LIVE badge / tournament info bar.
6. Live-dealer casino and real-money withdrawal are out of scope for a play-money build.

## Tooling

`app/tools/audit.mjs` runs the 63-combination overflow check, the keyboard walk and the
200 % zoom capture. `app/tools/shots.mjs` produces the per-width captures.
