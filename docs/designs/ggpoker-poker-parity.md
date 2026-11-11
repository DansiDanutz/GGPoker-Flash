# GGPoker Poker Parity Audit

*   **Date:** 2026-11-11
*   **Source:** installed GGPoker client, account `DansiDanutz`, Play Money lobby
*   **Method:** desktop accessibility could not read the CEF surface, so the audit
    uses window captures and coordinate navigation. No hand was played and no
    buy-in was confirmed. The account showed USD 237.83 / P$0; the first Hold'em
    join attempt returned "Insufficient Balance" for a $500 buy-in.

## Observed lobby

| Screen | Capture | Formats / features observed |
|---|---|---|
| Poker Home | `research/screens/ggpoker/home.png` | Promo carousel, For You cards (Fish, WSOP Express, Reddit, Rush & Cash leaderboard), GGPoker.TV live tiles. |
| Hold'em | `research/screens/ggpoker/holdem2.png` | 6-max and 9-max, stakes from $0.02/$0.05 to $10/$20, daily jackpot promos, players, Join. |
| All-in or Fold | `research/screens/ggpoker/allin.png` | Hold'em and Omaha filters, table preview, last jackpot, winner-of-last-100 stats, Open/Join. |
| Rush & Cash | `research/screens/ggpoker/rush.png` | Hold'em and PLO filters, pros column, hands/hour, fast-fold wording. |
| PLO | `research/screens/ggpoker/plo.png` | **PLO, PLO5 and PLO6** filters; 6-max; stakes $2/$5 to $10/$20. |
| Short Deck | `research/screens/ggpoker/shortdeck.png` | Short Deck cash tables, ante-style stakes, 6-max. |
| Spin & Gold | `research/screens/ggpoker/lobby.png`, `tournaments.png` | 3-max and 6-max, buy-ins $0.25–$50, multipliers, insurance option, jackpot/prize tables, winners. |
| Mystery Battle Royale | `research/screens/ggpoker/holdem.png` | Rush stage, final table, Mystery Jackpot Bounties up to $10,000, top-3 paid. |
| Tournaments | `research/screens/ggpoker/mtt.png` | Series filters, Flip & Go, GGMasters, PLO Series, WSOP Express, satellites, bounty hunters, late registration, guarantee/prize/payout details, buy-in filters. |

## Clone status

| Item | Status |
|---|---|
| Hold'em cash, 6/9-max, stakes, jackpot promos | Present. |
| PLO | Present. |
| PLO5 | Present, but previously dealt four hole cards; fixed to five. |
| PLO6 | **Added** in this change: six hole cards, PLO filter and tables. |
| Short Deck | Present. |
| All-in or Fold | Present as a table game; the forced all-in/fold loop is not a full recreation. |
| Rush & Cash | Present as a fast table; not a true fast-fold pool. |
| Spin & Gold | Present; 3-max, multipliers, prizes. 6-max and insurance are not implemented. |
| Mystery Battle Royale | Present as a tournament-style table; stage/mystery-bounty mechanics are not implemented. |
| Flip & Go | Listed in the client vocabulary, but no tournament/table implementation. |
| Bounty Hunters / Mystery Bounty | Not implemented. |
| Satellites / tickets | Tickets exist as a currency; satellite qualification is not implemented. |
| Tournament late registration, payout table, series filters | Partial; clone MTT list is simpler. |
| Lobby table preview, last jackpot, winner stats, pro column | Not implemented. |
| Table features | Chat, time bank, rabbit and hotkeys exist; run-it-twice, insurance, straddle, auto-muck and card squeeze are not confirmed/implemented. |

## Priority

1.  **PLO5/PLO6 correctness** — done in this change.
2.  **Tournament formats** — Flip & Go, Bounty Hunters, Mystery Bounty, satellites.
3.  **Game loops** — true Rush & Cash fast-fold, true All-in or Fold, Spin & Gold 6-max/insurance.
4.  **Table features** — run-it-twice, insurance, straddle, auto-muck, card squeeze, rabbit parity, hand history/notes.
5.  **Lobby parity** — Table View preview, last jackpot, winners, pro column, MTT series/payout filters.

The official client was not joined for a hand: the account had insufficient balance
for the selected Hold'em table, and the audit deliberately avoided a real-money
buy-in. The table-level items above therefore come from the lobby previews and the
client's own tournament/table screens, not from a played hand.
