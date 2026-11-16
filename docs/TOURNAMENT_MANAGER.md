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
