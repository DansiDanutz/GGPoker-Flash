# Diamonds: issuance and organizer approval

## Agreed economics

One Diamond costs the issuing organizer **10,000 of their own Cash Chips**.
This is $1 at the platform Cash Chip supply price. The organizer separately sets
the retail Cash Chip price paid by their players. The fixed issuance cost replaces
the earlier 50/50 organizer/platform Diamond revenue proposal.

The player requests a whole number of Diamonds through Marketplace. The request
records the organizer, quantity and quoted price. A request alone does not move
or reserve any chips. The organizer must approve manually; both balances must
still cover the agreement at approval time.

Approval burns the issuance cost from the organizer wallet, transfers the agreed
retail Cash Chips from the player to that organizer, and credits the Diamond
ledger in one transaction. The organizer must have the issuance cost before
receiving this sale's proceeds. A failed approval rolls everything back; retries
must not repeat any movement. Cancelling or rejecting a pending request moves
nothing. Changes to an offer do not change an existing request's price.

Cash Chips remain scoped to their organizer. Free Play Money and platform service
credits do not fund Diamond purchases. Session-credit chips cannot be converted.
Diamond balances retain the issuing organizer affiliation so a future redemption
system can identify the responsible organizer instead of losing that obligation.

## Current scope and release boundary

This change implements balance tracking, organizer offers and manually approved
issuance. It does **not** implement cross-organizer tournament entry, Diamond
prizes, inter-organizer trading, external payments or redemption. The interface
must state these limitations before a purchase request. No automatic payout or
cash conversion is promised by this release.

Before enabling cross-organizer events, define and test prize escrow, settlement
counterparties, organizer trading consent and agreed rates, redemption reserves,
disputes, rounding, cancellations and restart recovery. Diamond prizes must move
existing reserved supply, never mint an unfunded winner balance.

## Verification

Use only disposable users, memberships, chip accounts and Diamond ledgers.
Verify the fixed organizer debit, the player retail transfer, organizer isolation,
authorization, stale quotes, insufficient balances, atomic rollback, idempotent
approval, cancellation, session-credit exclusion and supply reconciliation.
Real payments and production balances are outside these tests.
