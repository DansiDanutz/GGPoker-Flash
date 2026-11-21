# Tournament Manager

Open **Organiser → Create tournament** to configure a private event. The existing
`tournaments-manager` marketplace capability controls paid hosting. Local Play
Money testing remains free; choose the game economy before creating an event.

## Setup and costs

- Organiser membership: $9 per calendar month, renewed manually.
- Tournament setup: $5 in service credits, once per successful creation.
- Rescheduling an unstarted future event: $1 per changed schedule. Retrying the
  same operation does not charge again. There is no hourly tournament charge.
- Configure format, mode, buy-in, entry fee, starting stack, blind-level duration,
  start time and 2–1,000 maximum players. Up to eight active private events may
  be hosted; completed and cancelled history does not consume that allowance. Times are displayed in the browser's
  local timezone and sent to the server as UTC.
- Cash Chip events are freezeouts: registration closes at the scheduled start.
  They require at least two registered players. Re-entry, add-ons and Cash Chip
  satellite awards are not supported. Unsupported satellite creation is refused.

## Tickets and balances

The organiser can buy tickets from their own scoped Cash Chip wallet and transfer
them to players. Players with chips in that same economy can also buy tickets.
Each ticket is bound to its tournament, buy-in, fee and starting stack. A ticket
cannot be redeemed twice or bypass the configured player limit. Tournament stacks
are playing units and never become Cash Chip wallet balances directly.

At the start, buy-ins fund the prize escrow and entry fees leave circulation.
Unused issued tickets are refunded to their current holders. Bounty and Mystery
events additionally reserve the configured bounty per entrant from the organiser;
the event cannot start without that reserve. Organisers should fund it beforehand.

The existing blind curve starts approximately 50 big blinds deep and increases
blinds by 1.5 per level (20-level cap). Standard prizes use 50/30/20 for three or
more entrants and 62.5/37.5 for two; whole-chip rounding goes to first place. The
tournament lobby displays the server's exact prize table. Custom blind schedules
and custom payout percentages are not introduced by this release.

## Management and recovery

The Organiser tab lists event terms, capacity, registration count and status.
Open the lobby to inspect the field and payouts; select the invite-link field to
copy it. Rescheduling preserves ticket terms. Cancel an unstarted event to refund
issued and redeemed tickets to their current holders. Setup and rescheduling
service fees are not automatically refunded. Started events cannot be cancelled
through this control; interrupted-event resolution remains an audited operator
operation.

Winner payouts use the existing escrow ledger. Duplicate settlement requests do
not pay twice. Game recovery keeps the existing between-hand checkpoints and
operator recovery rules; this interface does not alter them.

## Verification

`node --test server/tournament-manager.test.js` covers invalid capacity without a
charge, paid setup replay, registration capacity, ticket transfer/redemption,
ownership checks, rescheduling replay, cancellation conservation, actual heads-up
hands and final payout/fee conservation. The Chrome organiser workflow covers
creation, displayed terms, five viewport widths, player ticket registration and
cancellation refunds. Existing event, room, checkpoint and billing tests remain
part of CI.

Mystery bounty draws and Cash Chip escrow validation share the same tiers:
0.1×, 0.25×, 0.5×, 1×, 2×, 5× and 10× the configured base. Each draw rounds to
whole chips with a one-chip minimum. Ordinary Bounty payouts remain exactly the
configured base. Replaying the same eliminated player's payout cannot pay twice.


The bounty belongs to the winner(s) of the last pot the eliminated player was
eligible to win. A tied winner must cover that player's full all-in to share it;
if only one tied winner covers, that winner receives the entire bounty. A higher
side-pot win alone does not earn a shorter player's bounty. Tied covering winners
split a single draw equally, with whole-chip remainders clockwise from the dealer.
A one-chip draw can therefore give one winner one chip and the other zero.

Cash Chip shares are committed together under one immutable knockout reference.
Changed recipients or amounts are rejected, identical retries pay nothing extra,
and older single-recipient references remain authoritative. A payout failure
leaves the busted seats in place and retries the same draw before ranking them.
The server bounty hook receives a total `amount` and ordered `shares` containing
`winnerId`, `winnerNick` and `amount`; client notifications remain one per positive
share and identify Cash Chip payouts explicitly.

### Upgrading tournament entry receipts

Before rollout, use a consistent offline backup to count existing registrations. On the old schema, every existing registration predates entry receipts:

```sql
SELECT tournament_id, COUNT(*) AS registrations
FROM tourney_regs GROUP BY tournament_id;
```

If any remain, schedule the upgrade after those entries have settled or been withdrawn under the old release. Recheck at the write freeze. The upgrade preserves registrations but leaves their entry IDs empty: the old ledger recorded paid entries by name, and free entries could have no ledger row. The new withdrawal path refuses an unverified refund. Do not reconstruct the paid amount from today's tournament price or match receipts by name alone.

After upgrading an offline copy, repeat the count with `WHERE entry_id IS NULL` before `GROUP BY`. An unexpected nonzero result needs operator reconciliation before enabling withdrawals for those entries.
