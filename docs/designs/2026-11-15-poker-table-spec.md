# Poker table: behaviour spec for review

*   **Author:** Dan Semenescu
*   **Status:** EGM round 1 fixed; round 2 review (decisions in Appendix A)
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
    *Auto-post blinds* option off). Missed blinds are owed on return. This
    applies from the second hand of a table's life; the first hand deals
    everyone in. Rush (fast-fold) seats and players returning with a saved
    time-bank record do not owe a new-player blind.
4.  Leaving mid-hand folds the hand; chips not committed go back to the balance.
    Leaving between hands returns the whole stack.
5.  Add chips: up to `max_buyin` total; during a hand the chips are paid now and
    join the stack at the next deal. Remove chips down to `min_buyin` only while
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
    full house, A-6-7-8-9 is a straight. All-in-or-Fold offers only fold or all-in.
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
    fold.
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
    A player who leaves during the choice forfeits; if only one hand is left,
    it wins without a run-out.
2.  Each run is dealt and paid as its own share of the pot.

## 7. Showdown, show and muck

1.  At showdown the last aggressor on the final street shows first (and must
    show); if that street was checked through, the first live seat left of the
    button shows first. Winners show; other losers muck unless *Auto-muck* is
    off.
2.  After the hand anyone dealt in (folded or not) may show one card, then more,
    or all; a shown card stays shown. Opponents see only the shown cards.
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
    the hand to end. On reconnect they resume with the current state, including
    their own hole cards. Refreshing the balance (e.g. after Add chips) never
    reconnects the table socket.
2.  Every action carries the hand number and the turn number; an action meant
    for an earlier turn is refused.

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
