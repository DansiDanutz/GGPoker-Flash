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

The private finance operator can record independently verified service-credit funding with a unique receipt reference. Replaying the same receipt and amount is harmless; reuse for another payer or amount fails. This records an externally verified payment; it does not transfer funds, verify a provider transaction automatically, or initiate a refund. The provider merchant, website approval, receipts and refund/reconciliation process must be verified before accepting live credit funding.

## Lifecycle

`GGPOKER_USAGE_BILLING=off` preserves legacy creation and does not debit setup, membership or usage charges. `enforce` selects the new model independently of the old `GGPOKER_MARKETPLACE_ENFORCEMENT` flag. An invalid mode fails startup.

An organizer creates a cash table paused. Starting charges $5 immediately. The next charge occurs at the previous paid-through timestamp, before a new hand can start. An active table remains billable even when empty. Stopping prevents renewal; resuming within its already-paid period is free. No partial-hour rebate is issued automatically. Insufficient credits, an inactive owner or expired membership pauses further deals; an existing hand can finish normally. A restart pauses expired sessions without billing downtime. Missing an entire unpaid hour also pauses rather than collecting missed charges.

Setup, debit, ledger and idempotency record share one SQLite transaction. Creation failure rolls everything back. Idempotency keys belong to the authenticated user and a specific request; changing the action or payload under an existing key fails. Monetary journals reject updates and deletes. Public requests cannot credit accounts or charge another organizer's resources.

Tournament and Spin fees cover setup of the resource, not every subsequent Spin cycle. Scheduled Spin tables cannot seat players before their launch. Rescheduling is allowed only before launch; Spin must have no seats. An unchanged timestamp is free. Events already configured can finish after membership expiry. Platform administrators retain operational controls for public resources; private billed resources use their owner's workflow and cannot be silently duplicated or reconfigured through administration.

## Migration and launch

Active legacy paid access to the three management products blocks startup in `enforce` mode until the purchased promises are reconciled. Other commerce history is retained. Existing private cash tables have no retroactive setup charge but require a funded start when enforcement is activated. Existing private Spin tables without a launch schedule are grandfathered for setup and keep their existing lifecycle; their owners need membership for new management operations. Review these resources before activation.

No new billing configuration has been deployed. The approved PR #210 production deployment keeps paid enforcement off and checkout disabled.

## Newly requested chips and tournament tickets

The owner additionally requires Organizer subscription Cash Chip allowances, user transfers, and transferable tournament-specific tickets purchased with an organizer's Cash Chips. This work is not implemented by this billing draft.

A ticket must bind its tournament, owner, entry value and configured starting stack. For example, a $10 entry ticket redeems for that tournament's starting stack; tournament chips are not ten dollars worth of freely convertible cash. Purchase and redemption must not debit twice, and a transferred ticket must be redeemable only by its current holder. Ticket value/stack changes, registration cancellation and event cancellation need explicit consistent accounting.

Pending owner decisions: the monthly Cash Chip allowance included in $9, and whether these are game-only balances or withdrawable money. The current application's USD-denominated player wallet is play money; do not turn its existing free/demo balances into redeemable funds. Do not combine player chips with the service-credit ledger. These decisions block chip grants, ticket implementation and paid launch, not the default-off billing tests.

## Verification

Focused service tests cover membership dates and replay, receipt replay, setup rollback, role/action conflicts, upfront cash billing, free paid-period resume, insufficient credits, expired membership, failed ledger writes, and restart recovery. HTTP integration tests cover owner boundaries, fees and rescheduling plus the production private-network finance boundary. A game-engine test proves an unfunded table takes no blinds and an already-running hand still settles.
