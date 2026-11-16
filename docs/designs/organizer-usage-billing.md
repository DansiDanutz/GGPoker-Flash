# Organizer service-credit billing

Status: draft implementation, disabled by default. This is separate from the already deployed PR #210. Do not enable commercial billing until the remaining launch decisions below are resolved.

## Tariffs and boundaries

All service amounts are integer USD cents. Organizer and Contributor memberships each cost $9 per calendar month. Renewal is an explicit credit purchase; there is no automatic membership renewal. A user choosing both roles pays both memberships. Contributor membership concerns commercial marketplace participation, not source-code contributions.

| Service | Charge |
| --- | --- |
| Private cash table setup | $10 once per table |
| Active cash table | $5 for each hour, charged in advance |
| Private tournament setup | $5 once |
| Tournament reschedule | $1 per successful schedule change |
| Private Spin & Go setup | $3 once per table |
| Spin & Go reschedule | $1 per successful schedule change before its launch |

Service credits, publisher commission credits, and player game balances are separate accounts. First-party membership and usage receipts do not incur an additional 20% publisher commission. The existing commission ledger remains separate; automatic third-party plugin publishing and checkout are not part of this release.

The private finance operator can record independently verified service-credit funding with a unique receipt reference. Replaying the same receipt and amount is harmless; reuse for another payer or amount fails. This records an externally verified payment; it does not transfer funds or verify a provider transaction automatically. `GGPOKER_NERVIXPAY_MANUAL_FUNDING=on` exposes the verified $9/$10 NervixPay links only with billing enforced. The signed-in account reference uses the provider's `ref` parameter; operator verification is still required.

Unused service-credit refunds reserve available credits against the original top-up before any external payment. Private operators may record independently verified settlement or cancel an externally unpaid reservation; cancellation restores credits once. Paid/cancelled states and conflicting references cannot be reused. Refund recovery is available for closed or banned payers and while billing is off, but always requires an active private administrator. Memberships, consumed services and Cash Chip purchases are not automatically unwound. See the [first paid launch runbook](first-paid-launch-runbook.md) for verified merchant/link IDs, receipt matching, refund operations and rollout/rollback order.

## Lifecycle

`GGPOKER_USAGE_BILLING=off` preserves legacy creation and does not debit setup, membership or usage charges. `enforce` selects the new model independently of the old `GGPOKER_MARKETPLACE_ENFORCEMENT` flag. An invalid mode fails startup.

An organizer creates a cash table paused. Starting charges $5 immediately. The next charge occurs at the previous paid-through timestamp, before a new hand can start. An active table remains billable even when empty. Stopping prevents renewal; resuming within its already-paid period is free. No partial-hour rebate is issued automatically. Insufficient credits, an inactive owner or expired membership pauses further deals; an existing hand can finish normally. A restart pauses expired sessions without billing downtime. Missing an entire unpaid hour also pauses rather than collecting missed charges.

Setup, debit, ledger and idempotency record share one SQLite transaction. Creation failure rolls everything back. Idempotency keys belong to the authenticated user and a specific request; changing the action or payload under an existing key fails. Monetary journals reject updates and deletes. Public requests cannot credit accounts or charge another organizer's resources.

Tournament and Spin fees cover setup of the resource, not every subsequent Spin cycle. Scheduled Spin tables cannot seat players before their launch. Rescheduling is allowed only before launch; Spin must have no seats. An unchanged timestamp is free. Events already configured can finish after membership expiry. Platform administrators retain operational controls for public resources; private billed resources use their owner's workflow and cannot be silently duplicated or reconfigured through administration.

## Migration and launch

Active legacy paid access to the three management products blocks startup in `enforce` mode until the purchased promises are reconciled. Other commerce history is retained. Existing private cash tables have no retroactive setup charge but require a funded start when enforcement is activated. Existing private Spin tables without a launch schedule are grandfathered for setup and keep their existing lifecycle; their owners need membership for new management operations. Review these resources before activation.

No new billing configuration has been deployed. Production now includes PR #214's unrelated creator-news fix; paid enforcement and automated checkout remain off. The runbook records the read-only migration inventory and exact observed production commit.

## Organizer Cash Chips and tickets

`GGPOKER_ORGANIZER_CHIPS=off` is the default. `enforce` requires service-credit billing enforcement. Newly hosted private resources are permanently marked as organizer-chip games. Legacy resources and free USD/PLAY/TICKET/GEM wallets are never converted.

- Each paid Organizer month grants **100,000 Cash Chips**. Early renewal schedules the next grant for its next membership period. Contributor memberships do not grant player chips.
- An active Organizer can buy **10,000 additional Cash Chips for $1 of service credits**, atomically and replay-safely.
- Balances are keyed by organizer and user. Transfers preserve the organizer identity; chips cannot fund another organizer's game or ticket.
- The wholesale price does **not** set player deposit/buyback terms. Organizers negotiate external monetary terms themselves.
- Cash buy-ins, rebuys and pending top-ups use organizer escrow. Bots, insurance, jackpots and free game rewards cannot mint into this economy. Settlement reconciles all funded sessions before publishing a win, and burns exact rake. Dealt players' mid-hand departures wait for settlement; nonparticipating seats may leave immediately.
- Restart refunds each last-committed cash holding once. An unfinished hand rolls back to its settled checkpoint, with no original-buy-in or free-wallet fallback.

Tickets bind organizer, tournament, current holder, buy-in, fee and starting stack. Purchase escrows chips once; transfer changes the holder; redemption grants one registration. Unregister restores the ticket, including repeated cycles. Start verifies the exact funded participant set, burns fees and refunds unused issued tickets. Prizes contain buy-ins only. Cancelling an unstarted event refunds current holders. Tournament playing stacks cannot be withdrawn; awards credit organizer-scoped Cash Chip wallets.

STANDARD, FLIP, BOUNTY and MYSTERY have funded prizes. Bounties require separate organizer reserves. Cash Chip satellites are refused until target-event tickets are explicitly bound; legacy unbound TICKET balances cannot pay prizes.

Spin requires an explicit **20,000× stake** reserve before players join: 100 million chips at a 5,000 stake. This materially exceeds a new organizer's allowance. The draw commits three funded seats and a verified payout schedule before publication. Exact place payouts are idempotent; unused reserve returns to the organizer and entry surplus over prizes burns as rake. Waiting reserves can be cancelled after players leave. An interrupted committed round with any recorded finishing place requires private operator reconciliation; stake refunds never stack on top of paid prizes.

## Buybacks and exceptional recovery

A buyback specifies chips plus separately negotiated payment amount/currency/details. The request locks payout escrow. The organizer pays externally and reports a unique receipt matching the agreement. Recipient confirmation returns chips to organizer inventory: **buybacks do not burn chips**. Unreported requests may be cancelled/rejected; reported payments stay locked until confirmation or audited resolution.

No automated NervixPay customer payout is implemented or claimed. A receipt report is an assertion, not automatic provider verification. A supported merchant payout contract remains necessary before any future automatic payout implementation.

Recovery APIs require an authenticated administrator through the existing private-network boundary:

- `POST /api/admin/marketplace/chips/buybacks/:id/resolve`: `{resolution:"paid"|"refund",reason}`.
- `GET /api/admin/marketplace/chips/spin/:roundId` returns the stored outcome and participants. `POST .../:roundId/resolve`: `{userId,place,reason}`. Only disputed/completed rounds qualify; the amount comes from the immutable outcome. Evidence must establish finishing places.
- Tournament snapshots carry a financial-journal revision. Restart pauses an event whose snapshot is absent or predates a committed payout. `GET /api/admin/marketplace/chips/tournaments/:id` exposes escrow, tickets and journals. `POST .../:id/resolve`: `{awards:[{userId,amount}],reason}` allocates **exactly** remaining prize escrow to event participants and closes the event, returning unused bounty reserve. Existing payouts remain. The operator must review hand history/player agreements before choosing the allocation.

Exceptional recovery is audited and replay-safe, requires operator attention and does not invent a finish order or resume stale paid stacks.

## Later phase: Diamonds

Diamonds are for future OpenPoker tournaments shared across organizers' players. The proposed organizer-interface sales model splits profit **50% organizer / 50% platform**. No Diamond ledger, sale or conversion is enabled. Price and distributable-profit calculation belong to that later design.

## Verification and launch gates

Tests cover billing periods, hourly charges, receipt boundaries, setup rollback, organizer isolation, immutable burns, mint/rake conservation, tickets, exact entrant sets, bounties, buybacks and recovery. Real HTTP/WebSocket tests drive a raked hand with a pending top-up and prove exactly-once restart refunds without altering free USD. Browser CI exercises grants, packs, transfers, tickets and mobile rendering on a disposable enforced fixture.

This paid revision is a draft and is undeployed. Activation requires verified funding, review of legacy-resource migration and customer notices, passing current-head review/CI and separate authorization for an exact production rollout. NervixPay's website-placement checklist is not external underwriting approval. Earlier production approval covered only PR #210 with paid enforcement off.
