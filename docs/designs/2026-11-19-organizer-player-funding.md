# Player Cash Chip requests and organizer approval

Status: implemented on `feat/organizer-player-funding`; targeted verification passed; full CI pending.
No production payment or deployment is part of this change.

## Agreed flow

A player with zero Cash Chips requests 20,000 from their organizer. The organizer
chooses one of two actions:

1. **Credit from my stack** transfers 20,000 existing organizer Cash Chips to the
   player. This creates no debt, repayment schedule or automatic charge.
2. **Create payment link** sets a USD price for those 20,000 chips and creates a
   request-specific NervixPay product. Chips move from the organizer wallet into
   escrow. The hosted checkout displays the payment QR. A merchant-verified paid
   receipt releases the reserved chips to the player exactly once.

The organizer can decline a request before an offer exists. Prices and quantities
cannot change after an offer. A failed link request can be retried against the same
reservation. After an offer exists, cancellation/refund requires operator review:
there is no unsafe local cancellation while an external checkout might still pay.

## User experience

An approved member opens **Organizers → their club → Request Cash Chips**, enters
an amount and sends the request. No existing chip balance is required. The player
sees the requested quantity, organizer, price and status in the same club page.

The organizer opens **Organizer → Transfers → Player chip requests**. Direct
credit and paid offers both require explicit confirmation. The price is chosen
by the organizer; the platform wholesale chip rate is not imposed on players.
Both participants can recheck a NervixPay payment ID. The server fetches the
receipt; neither browser payment claims nor checkout redirects release chips.

The first version uses an operator-configured merchant connection per organizer.
It does not provide a browser form for payment API secrets or a self-service
merchant onboarding flow. Missing connections block paid offers before chips
are reserved. Direct credit remains available.

## Existing implementation to reuse

- `app/server/organizer-chips.js`: organizer-scoped wallet and table escrow,
  immutable chip journal, atomic transfers, idempotent references and supply
  reconciliation. Borrowed chips must come from the organizer's funded balance.
- `app/server/organizer-clubs.js`: club ownership and approved membership.
- `app/server/organizer-chip-routes.js`: authenticated Cash Chip routes and
  strict accepted request fields. Actor identity comes from authentication.
- `app/server/organizer-chip-events.js`: existing buyback workflow is the reverse
  direction of payment; it must not be relabeled as a player funding request.
- `app/server/club-entry-provider.js`: merchant-scoped verification, bounded
  provider requests and receipt validation patterns.
- `app/server/club-entry-ledger.js`: immutable payment records and transaction
  uniqueness patterns. Its club-entry commissions and grants do not apply here.
- `app/src/lib/organizer-chips-api.ts`: authenticated client API.
- `app/src/components/OrganizerChips.tsx` and `OrganizerWorkspace.tsx`: existing
  organizer transfer and navigation surfaces.
- `app/src/pages/Organizers.tsx`: player-facing club entry point.

The current server wires one configured club-entry merchant using
`NERVIXPAY_CLUB_TOKEN` and `NERVIXPAY_CLUB_MERCHANT_ID`. This is not an
organizer-by-organizer merchant connection. Platform service-credit checkout
also cannot stand in for payments owed to an organizer. Receiving merchant
ownership and a secure server-side connection must be established before
automatic organizer payment links and verification are enabled. Never expose
provider tokens to the browser or label an unverified pasted link as verified.

## Required invariants

- Only the requesting member and owning organizer can see their requests.
- The member must be active and approved when requesting and when the organizer
  credits/offers chips. The organizer needs an active membership for approval.
- Transfers and reservations use existing funded balances, never minting chips
  or spending service credits. Failed reservations roll back completely.
- Creation keys and state transitions prevent duplicate transfers/reservations.
  One outstanding request per member/organizer avoids duplicate active requests.
- A verified receipt must match the request reference, product, amount and asset.
  Provider payment IDs and network transactions cannot be reused for funding.
- Settlement is atomic with the receipt and chip movement. Restarting or retrying
  verification cannot release chips twice. Paying does not mint chips.
- A blocked recipient leaves escrow intact for operator review. No browser can
  mark a request paid or change its price after reservation.

## Merchant configuration

Set the following JSON in the **server-only** `ORGANIZER_NERVIXPAY_CONNECTIONS`
environment variable, replacing placeholders through the operator's secret
management process. Do not commit actual credentials or expose a VITE variable.
The deployment compose service already consumes its server `.env` file.

```json
{"ORGANIZER_USER_ID":{"merchantId":"VERIFIED_MERCHANT_ID","token":"SERVER_ONLY_TOKEN"}}
```

The token requires `integrations:verify`, `payment_links:read`,
`payment_links:write` and `payments:read`. The provider confirms merchant identity,
unblocked status and live mode before creating a checkout. Each organizer's
merchant receives that organizer's payments. Do not reuse the platform's club
entry/service-credit merchant unless that merchant actually belongs to the
organizer and the operator intentionally configures it.

The hosted product offers Polygon USDC and BNB USDT, matching the existing
provider contract. It advertises Cash Chips, not membership or platform credits.
A returning browser never proves payment. Verification currently uses the
NervixPay payment UUID from the receipt; automatic polling/webhooks are not added.

## Validation

Use disposable users, merchant responses and chip balances only. Targeted tests
cover identity/ownership, approved membership, duplicate and conflicting actions,
insufficient supply, immutable receipts, payment mismatch and conservation.
The browser harness `app/tools/organizer-funding-browser-smoke.mjs` covers a
zero-balance member requesting 20,000 chips, organizer approval, replay and
reconciliation, plus the missing-merchant path at mobile and desktop widths.
No test uses production credentials, balances or checkout payments.

Merge, public promotion and production rollout remain separate approved steps.
Ordinary direct approval creates no debt. The separately accepted session-credit
flow described below implements net-loss settlement under explicit repayment terms.

Local evidence: 17 funding service/provider/route/integration tests passed; TypeScript passed; eight browser assertions passed at 320px, 390px and 1280px with no browser errors. Payment receipts in the paid-loop tests are simulated. Real merchant onboarding/payment and physical-phone verification remain pending.

Approval and failed provider actions refresh the organizer balance immediately. The browser test asserts the displayed 80,000-chip balance after a 20,000-chip approval. The existing table-reference smoke uses a locator to reacquire action buttons across live renders; its six cash/tournament/rotation checks passed locally.

## Reverse flow: request USDT cash-out

Players can request a USDT cash-out from the same club page, including holders
who are no longer approved club members. Only available chips in that organizer's
wallet can be reserved; table/ticket balances cannot be spent a second time.
The player enters the chip quantity, requested USDT amount, network and receiving
wallet. The requested price follows the organizer's terms, not the platform's
wholesale rate.

The existing buyback ledger handles this flow:

1. The request atomically reserves chips in payout escrow.
2. The organizer sees the request in **Organizer → Transfers → Cash-out requests**
   and accepts it **before** sending money. Acceptance records `processing_at`
   without moving chips and locks player cancellation during payment.
3. The organizer pays externally, then reports the exact amount, network,
   destination and unique receipt. This is a manual report, not blockchain or
   NervixPay verification performed by OpenPoker.
4. The player checks their wallet and explicitly confirms receipt. Only then do
   the reserved chips move back into the organizer's inventory. Confirmation
   retries cannot transfer chips again.
5. Before acceptance the player can cancel; the organizer can decline an unpaid
   request. Both return the reserved chips. After reporting payment, disputes
   stay reserved for the existing administrator resolution process.

No automatic outbound USDT payment or NervixPay payout API is introduced. Never
use an incoming checkout link as an outbound payment. An organizer must reject
an accepted request only if payment has not been sent.

The acceptance timestamp is an additive migration. Existing reported/paid rows
remain valid. Do not downgrade to a version that ignores `processing_at` while
accepted cash-outs are pending, because that would remove the cancellation lock.

Validation includes legacy-schema migration, acceptance authorization/replay,
blocked cancellation, report-before-accept refusal, and existing buyback receipt
and escrow tests. The browser fixture returns 5,000 of a player's 20,000 chips
for a simulated 1.50 USDT payment, confirms twice, and reconciles organizer 85,000
plus player 15,000 = 100,000 chips. No real USDT is sent during this test.

## Session credit: settle net used/lost chips

A transfer request means asking the organizer to send Cash Chips. A normal
transfer remains a gift/transfer without debt. The separate **Offer session
credit** action proposes a maximum USD repayment for the requested quantity.
The player must explicitly accept those terms before the organizer's existing
chips move; no chips are minted and no service credits are consumed.

For this initial cash-table implementation the player starts with zero available
chips and no chips committed to seats, tickets or cash-outs in that organizer's
economy. One outstanding session is allowed per player/organizer. While active,
non-table transfers, ticket purchases and cash-outs are blocked centrally to
prevent borrowed chips leaving the session. Other organizers' balances remain
separate. Tournament session lending is not included.

After leaving all tables, either participant can end the session. The server
atomically returns the lesser of available chips and the original principal.
Winnings above the principal stay with the player. The payment is calculated
once as `ceil(fullPriceCents * usedChips / principalChips)` using integer
arithmetic. Rounding up to a cent is shown before acceptance. Thus 10,000 chips
at a maximum $10, with 7,000 returned, creates a $3 payment. No loss creates no
payment link. Retries must neither reclaim chips nor charge again.

The resulting settlement uses the organizer's verified NervixPay connection.
Missing provider configuration does not prevent ending the session or returning
unused chips: the debt remains visible and link preparation can be retried.
Payment verification clears that debt only; it never delivers more chips. A
checkout cannot be used as an outbound cash-out. No automatic wallet charge,
interest, collection process or platform guarantee is created.

Do not downgrade to a build that ignores session-credit locks while sessions are
active. Session debt and payment records persist across restarts; no debt is
forgiven or chips minted by restarting. Existing seat recovery returns table
escrow to the player's wallet, after which settlement can be requested.

Session-credit verification: 59 focused ledger/service/provider/route/integration tests,
TypeScript, and 18 disposable browser checks passed. The browser scenario exercised
a 10,000-chip advance, a 7,000-chip return and a $3 balance, rejected settlement
with open seats, and preserved the 100,000-chip supply on retries and provider
unavailability. The tests use no live funds.
