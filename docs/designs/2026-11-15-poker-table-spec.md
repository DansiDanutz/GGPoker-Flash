# Poker table: behaviour spec for review

*   **Author:** Dan Semenescu
*   **Status:** EGM rounds 1-5 fixed (decisions in Appendices A-F)
*   **Date:** 2026-11-15
*   **Code:** `app/server/table.js` (engine), `app/server/index.js` (socket handlers),
    `app/src/pages/TablePage.tsx` (table screen), `app/src/components/table/*`,
    `app/src/game/*` (pure helpers), `app/src/table-*.css` (stage, art, phone, tips).
*   **Related:** [table-fidelity-audit.md](table-fidelity-audit.md),
    [2026-11-14-table-chrome-pass.md](2026-11-14-table-chrome-pass.md).

--------------------------------------------------------------------------------

## Context for a fresh reader

DanGG (dangg.live) is a play-money online poker site styled on GGPoker / KKPoker,
phone first. Chips are play money; there is no real-money path. Bots fill seats.
This document states how one table **must** behave. It is the yardstick for a
review of the live code: every place the code does not do what a rule says, or a
rule the code has no answer for, is a finding. The reviewer should name the rule,
the file and line, and a concrete failing scenario.

Out of scope: lobby, cashier, tournaments' lobby and payouts, casino games.
In scope: one cash table (Hold'em, PLO 4/5/6, Short Deck, All-in-or-Fold, Fast
Fold) and the table screen of a tournament or Spin.

## 1. Seating and buy-in

1.  A player picks a free seat (or is given one) and buys in between the table's
    `min_buyin` and `max_buyin`; the buy-in is taken from the balance atomically.
    No negative balance, no buy-in larger than the balance.
2.  A seat reserved for one player cannot be taken by another until the hold
    expires.
3.  A player who sits mid-hand waits for the next hand. A new player either posts
    the big blind at once or waits for the big blind ("Wait for BB", the
    *Auto-post blinds* option off; it can be set before sitting and goes with
    the join). Missed blinds are owed on return. A waiter is dealt in at once
    when nobody else is ready to play, so a table never stalls on a waiter. This
    applies from the second hand of a table's life; the first hand deals
    everyone in. Only automatic moves (Rush seats, tournament balancing) and
    bots skip the new-player blind; a returning account always owes it.
4.  Leaving mid-hand folds the hand: every chip already bet stays in the pot,
    and the players left face no bet from the departed seat. The price to call
    becomes the highest bet that still stands: live and folded bets, and a
    departed seat's bet only up to the price at which it was retired
    (preflop never below the big blind). A player owes a new decision only if
    a full raise by someone else still stands after their last action. Chips not committed go back to the balance.
    Leaving between hands returns the whole stack.
5.  Add chips: up to `max_buyin` total; during a hand the chips are paid now and
    join the stack at the next deal (also for a player who has folded).
    Remove chips down to `min_buyin` only while
    not in a live hand: between hands, or after folding (the folded stack is no
    longer at risk). Bot seats refill from the house when they run low; that is
    the one allowed chip source outside the balance ledger.

## 2. Hand flow and rules

1.  Dealer button moves one live seat clockwise each hand; heads-up the button
    posts the small blind and acts first preflop, last after.
2.  Straddle (when the table host allows it; only the host may switch it): every
    eligible seat (not the blinds) is asked at once before cards, as in the
    native client; *Straddle* in options auto-posts it. The live straddle acts
    last preflop.
3.  Legal actions: fold, check (only when nothing to call), call, bet/raise.
    Minimum raise = the last full raise size; an all-in for less than a full raise
    does **not** reopen betting for players who already acted. The server tells
    each player (`raiseLocked`) so the table never offers a raise it would
    refuse.
4.  Pot-Limit games cap a raise at the pot after the call. Short Deck: flush beats
    full house, A-6-7-8-9 is a straight. All-in-or-Fold offers only fold or all-in;
    an all-in smaller than the bet to call is still accepted.
5.  Side pots are built for every all-in level; each pot is awarded to the best
    eligible hand; ties split, odd chip to the first seat left of the button.
6.  An uncalled bet is returned before showdown.
7.  Rake (if any) is taken only from pots that saw a flop.

## 3. Turn clock and time bank

1.  Each turn has a visible draining ring. When it runs out the player checks if
    possible, otherwise folds.
2.  Time Bank cards add `TB_CARD_SECONDS` each; offered only on your own turn
    once `TB_OFFER_SECONDS` (10 s) or less are left, and the server refuses a
    card asked for earlier; each card is spent once. When the clock runs out
    facing a bet, one card is spent automatically (once per turn) before the
    fold. A second timeout in a row still gets that card; two timeouts sit the
    player out.
3.  A player who times out twice in a row is sat out.

## 4. Pre-actions (reserved actions)

1.  While not your turn you may tick one of: Check/Fold, Fold to any bet, Check
    (or Call X), Call Any.
2.  A ticked Call X lapses if the price changes. Fold-to-any persists across
    streets. Call Any calls any amount (checks when nothing to call).
3.  On your turn the ticked action fires once; then the tick clears.

## 5. Bet sizing UI

1.  Preset buttons (opening: 2BB/3BB/4BB/Pot; later: 33/50/75/100% pot) are
    editable in Table options. A preset never yields an illegal amount: below the
    minimum it becomes the minimum, above the stack it becomes all-in.
2.  The slider and −/+ move between min-raise and all-in in the chosen unit; the
    last step snaps to all-in.
3.  *Confirm bets* (on by default) asks before every bet and raise; it can be
    switched off in Table options or with *Don't ask again*.

## 6. All-in and run it

1.  When all remaining players are all-in with cards to come, each is asked to
    run it once, twice or three times (or the remembered *Run it* choice is
    used). All must agree to run more than once; otherwise it runs once. A
    disconnected or sat-out player with no remembered choice counts as "once".
    A player who leaves during the choice forfeits; the others keep their
    answers and the clock, and the board runs at once if nobody else still
    has to answer. If only one hand is left, it wins without a run-out.
2.  Each run is dealt and paid as its own share of the pot.
3.  Bots are not asked: they accept whatever the human players choose.
4.  *Run it* is offered on cash tables only. Rush, All-in or Fold, Spin and
    tournament tables always run once and do not show the option.

## 7. Showdown, show and muck

1.  At showdown the last aggressor on the final street shows first (and must
    show); if that street was checked through, the first live seat left of the
    button shows first. That first seat always shows, even with *Auto-muck*
    on. Winners show; other losers muck unless *Auto-muck* is off.
2.  After the hand anyone dealt in (folded or not) may show one card, then more,
    or all; a shown card stays shown on the seat, folded or not. Opponents see
    only the shown cards.
3.  Hole cards of other players are never sent to a client unless shown
    (server-side, not hidden by CSS).

## 8. Sitting out

1.  *Sit out next hand* and *Sit out next BB* take effect at the right moment;
    a sat-out player is dealt out and skipped for blinds (owing them on return).
2.  A player sat out too long is stood up and the stack returned.

## 9. Disconnects

1.  A disconnected player keeps the seat; their turn times out normally (with
    time bank) and they are sat out after it. The idle-seat sweep never cashes
    out a player who still holds a live hand; it marks them away and waits for
    the hand to end. That hand plays on the normal clock with the time bank;
    the player is not dealt the next one. On reconnect they resume with the current state, including
    their own hole cards. Refreshing the balance (e.g. after Add chips) never
    reconnects the table socket.
2.  Every action carries the hand number and the turn number (Fast Fold needs
    only the hand number); an action meant for an earlier turn is refused, and
    an action without them is refused with a message to reload the page.

## 10. Table screen (phone first)

1.  Portrait phones (≤ 760px wide, taller than wide): hero at the bottom, other
    seats around a rail; nothing in the action panel or overlays ever covers a
    seat's name plate, cards or bet.
2.  The table never moves when your turn starts or ends.
3.  Folded players look inactive (greyed, no highlight). The player to act has the
    turn ring.
4.  Every icon-only control names itself after a one-second hover or
    press-and-hold.
5.  Chat and 12 reactions; spectators cannot chat or react.
6.  Hand strength label for the hero ("One pair", ...) only while the hero is in
    the hand (hidden after a fold).

## 11. State and security

1.  The server is the only authority: the client can never act out of turn, bet
    an amount the rules forbid, or change another player's options.
2.  Every socket message is validated (types, ranges, table membership).
3.  Chips are conserved: at every moment, stacks + pots + uncalled bets + balances
    moved in/out balance exactly. No path creates or destroys chips.

## Appendix A: EGM round 1 decisions

Round 1 (three goldfish: codebase details, implementation readiness, design)
found two CRITICAL and five HIGH issues, all fixed on `fix/table-egm-round1`
with tests: run-it double pay on leave, Add-chips cash-out via reconnect,
disconnect forfeiting a live hand, straddle toggle by any player, free hands
for new players, stale actions landing on a later turn, and no time bank on a
timeout. MEDIUM fixes: raise offered after a short all-in, hand label after a
fold, slider step and all-in snap, manual time bank at any clock, showdown
order, −/+ tooltips.

Decided, not changed (rules above updated to match the code):

*   Straddle is asked of every eligible seat, not only UTG (native behaviour).
*   A folded player may remove chips before the hand ends.

Known gaps, not in this round (LOW, tracked):

*   Leaving from one browser tab while a second tab is open keeps the seat
    until the second tab closes.
*   Pre-actions are held by the client only; a reconnect clears them.
*   Rathole guard on rejoin (minimum buy-in after leaving with a big stack).
*   Moving-button and dead-button rules when a blind leaves are not specified.
*   Landscape phone layout, accessibility (screen reader names beyond tooltips),
    hand history and rabbit hunt are out of this spec's scope.

## Appendix B: EGM round 2

Two goldfish (codebase details, implementation readiness) re-reviewed the
round-1 branch. Both HIGH findings are fixed with tests:

*   The new-player blind was waived for any account with a saved time bank,
    which is every account that ever left a cash table. Only automatic moves
    and bots skip it now.
*   All-in-or-Fold: a stack shorter than the big blind could not go all-in
    (the all-in became a call, which AoF refused). It is accepted now.

Open MEDIUM items for round 3:

*   Leaving mid-hand returns the leaver's unmatched bet instead of forfeiting
    it, and leaves `minRaise` at the old bet.
*   A table can stall when the only other seat is waiting for the big blind.
*   The Wait-for-BB choice cannot be made before sitting at an idle table.
*   A folded player's shown card is not kept on the seat in the snapshot.
*   The 60-second disconnect sweep sits out a player before their turn, so
    the turn folds with no clock or time bank; the automatic card is skipped
    on a second timeout in a row.

LOW: run-it round reopens when a player leaves; bots never vote on run-it;
actions without hand/turn numbers are accepted; Run it option shown where it
does nothing; AoF all-in skips Confirm bets; checked-down first-to-show seat
may stay mucked.

## Appendix C: EGM round 3

All five MEDIUM items from round 2 are fixed with tests: a leaver forfeits
the bet (no free bluff), a waiter is dealt in rather than stalling the table,
Wait for BB can be chosen before sitting, a folded player's shown card stays
on the seat, and a dropped player's live hand runs on the clock and time
bank. The LOW items listed in Appendix B remain open.

## Appendix D: EGM round 3 review

Two goldfish re-reviewed the round-3 code. One HIGH, fixed with tests:

*   The 60-second idle-table close (no sockets left) cashed out every seat,
    undoing the disconnect protection: a dropped player's live hand was
    folded, and a running Spin seat took the lowest place. The close now
    waits for the hand to end and never closes a running Spin with a human
    seated.

Also fixed, MEDIUM regressions from round 3:

*   When a re-raiser leaves, the raise level that still stands comes back
    with its minimum raise, and players who already matched it are not asked
    again.
*   A waiter is released after "Sit out next hand" lands at the deal, so the
    table cannot go idle on a waiter.

Open MEDIUM/LOW for a later round:

*   Tournament and Spin seats that drop are sat out at once (instant fold,
    no clock or time bank).
*   Reconnecting cancels a sit-out the player chose before dropping.
*   The Auto-post switch and the saved join choice can disagree after a
    waiter is released or after Post now.
*   Option messages coerce booleans (`!!`) instead of type-checking them.
*   A folded player's Add chips lands before the hand ends.
*   After a cash-out on disconnect, the reconnecting client re-buys in
    without asking.

## Appendix E: EGM round 4 (review of the round-3 fix)

Three HIGH findings, fixed with tests:

*   A finished Spin with a human still seated never closed. The idle close
    now protects a Spin only until it has a winner.
*   When a raiser left, a raise made earlier by a player who had since left
    stopped counting. The bet to call is now the highest bet anyone else
    made, departed or folded seats included.
*   Withdrawing a full raise reopened betting for a player locked by an
    earlier short all-in. A player now owes a new decision only if a full
    raise still stands after their last action.

## Appendix F: EGM round 5 and the open MEDIUM/LOW items

Round 5 (review of the round-4 fix) found one HIGH, fixed with a test: a
second player leaving on the same street was not retired, because the first
leaver's bet still counted as standing. A departed seat's bet now stands only
up to the price at which it was retired.

The MEDIUM/LOW items left open in Appendix D are also fixed, with tests:

*   Option messages accept only real booleans; `"false"` is refused.
*   A reconnect sits the player back in only if they had not chosen to sit
    out before dropping.
*   A tournament or Spin player who drops in a live hand keeps that hand on
    the clock and time bank, then is blinded out from the next hand.
*   Chips added by a folded player during a hand join at the next deal.
*   While seated, the saved Auto-post choice follows the seat's setting, so
    the switch and the next join always agree.
*   A reconnect whose seat was cashed out watches the table instead of
    buying in again unasked.

Still open (LOW, Appendix B): run-it round reopens when a player leaves;
bots never vote on run-it; actions without hand/turn numbers are accepted;
Run it option shown where it does nothing; AoF all-in skips Confirm bets;
a checked-down first-to-show seat may stay mucked.

## Appendix G: EGM round 6

One HIGH, fixed with a test: the round-5 "watch instead of re-buying" rule
also caught a tournament player moved to another table while disconnected,
so the reconnect watched the old table and never reached the redirect; the
player was blinded out. The rule now applies to cash tables only, and a
tournament move keeps the player's remembered sit-out choice.

## Appendix H: EGM round 7

No CRITICAL. One HIGH candidate (pre-existing, not a regression), fixed:
reloading the page after a cash-out bought in again from the URL's buy-in.
The tab now remembers it held a seat (per-tab session storage, cleared on
leaving the table), so a reload watches instead. A MEDIUM, also fixed: a
tournament move now carries "sit out next hand", so a player dropped
mid-hand is not dealt in at the new table.

## Appendix I: the open LOW items

The six LOW items left open since Appendix B are closed, with tests:

*   An action without a hand number, or a turn action without a turn number,
    is refused and asks the player to reload (a cached old app can no longer
    act blind).
*   A player leaving during the run-it choice no longer reopens it: the
    others keep their answers and the clock.
*   Bots' run-it vote, decided: bots are not asked and accept the humans'
    choice (rule 6.3).
*   The *Run it* option is hidden on Rush, All-in or Fold, Spin and tournament
    tables (the snapshot sends `runItOffered`).
*   The All-in or Fold shove (button and hotkey) goes through *Confirm bets*.
*   On a checked-down river the first seat to show tables its hand even with
    *Auto-muck* on.

## Appendix J: final review

No CRITICAL or HIGH. One MEDIUM, fixed with tests: a Rush move seats the
player at a new table before the client hears of it, so a reload in that
moment rejoined the old table and only watched while the clock ran at the new
seat. A Rush rejoin with no seat now follows the player to their seat in the
same pool. Rare or long-standing LOW items left for later: an absent player's
saved run-it choice still counts after they leave; Enter in All-in or Fold
sends a raise the server refuses; a rolled-back tournament move drops the
saved sit-out flags; an action is stamped with the turn number current when it
is sent, not the one drawn on screen.

A re-review of that fix found one MEDIUM, fixed: after the redirect the tab
joined the new table as a fresh buy-in, so a second move in that moment could
charge again. The tab now carries its seat memory to the new table and joins
as a rejoin; a join that asks to watch is never redirected.
