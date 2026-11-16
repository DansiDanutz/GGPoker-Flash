# First paid launch: manual NervixPay funding

Prepared 16 November 2026. This is a rollout procedure, not evidence that paid production is enabled.

## Verified receiving setup

- Merchant: `37b595c2-ae97-4ca0-9dcd-71452c8f4c3c`, signed-in Seme account shared with Fake or Real. The customer-facing merchant name is **Fake or Real**; OpenPoker checkout titles identify the product. Do not rename the shared merchant or change its receiving wallets.
- NervixPay Settings showed five receiving networks locked and four verified wallets. Cashier showed $4.92 funded fee credits, $0 unpaid fees, and available payment-link capacity.
- Saved reusable service-credit links:
  - $9: `https://nervixpay.live/l/b0afce77-773a-48a0-9a73-72274791313d`
  - $10: `https://nervixpay.live/l/9aae5873-9e81-4ac0-be07-3b189ffded2f`
- Each accepts **USDC on Polygon** or **USDT on BNB Chain**, with a fixed nominal token amount equal to the credit package. Follow the exact checkout amount, including any provider matching suffix; network gas is separate.
- Descriptions explicitly say manual operator verification, separate membership activation, no automatic renewal and no player deposit.
- The merchant already has an active webhook for another project. Do not replace it. No OpenPoker API credential, webhook or automatic external payout is needed for this manual release.

The NervixPay website page is an integration checklist, not external underwriting approval. Its audit of `https://dangg.live/marketplace` found zero price locations in the current SPA's initial HTML. The saved manual links are independently active. This revision includes a real no-JavaScript pricing fallback; after deployment, rerun the audit and review any actual findings. Do not claim the website checklist is approved until its UI says so, and do not create duplicate links blindly.

## Activation and migration

Production was inspected read-only at `2026-11-16T10:33:48Z`: SQLite quick check `ok`, no private tables or private tournaments, and zero active paid-access rows for the three management products. Service-credit/chip tables were not installed. Health reported current production commit `ca602f28761267ed59da554d23aff4a2a7bca061`, healthy, 22 rooms, no stale rooms and no warnings. This includes the newer creator-news fix and supersedes the earlier baseline observation; preserve it in the release.

Recheck these facts immediately before activation. Do not convert global demo balances, legacy grants or public tables into organizer chips. If private resources appear meanwhile, review their owners first: usage billing requires a membership and prepaid cash start; legacy unscheduled Spins remain legacy. Startup refuses unresolved active paid-manager purchase promises.

1. Obtain approval for the exact reviewed release, customer notices and the following activation flags. Earlier production approval covered only the baseline with paid enforcement off.
2. Require passing current-head CI and `danslab-workflow qa-check --path <checkout> --pr 212`. Merge through the repository's authorized process, wait for main CI, and use the existing `deploy/deploy.sh --dry-run <merge-sha>` workflow.
3. Create and verify a fresh encrypted database backup using the established host procedure. Tag the current image for rollback, record the exact current image/commit and preserve the previous values of these three flags without copying other environment secrets.
4. Deploy the exact main commit with all three flags off first. Verify health, SQLite integrity, public admin denial, config responses, new tables and unchanged existing resource counts.
5. At the approved activation step, set only these entries in the existing host `deploy/.env` and recreate only the game service:

   ```dotenv
   GGPOKER_USAGE_BILLING=enforce
   GGPOKER_ORGANIZER_CHIPS=enforce
   GGPOKER_NERVIXPAY_MANUAL_FUNDING=on
   ```

   `GGPOKER_NERVIXPAY_MANUAL_FUNDING` defaults off and exposes links only with usage billing enforced. Automated `checkout_enabled` remains false: it describes automatic settlement, not the manual links.
6. Verify `/api/marketplace/billing` reports `mode=enforce`, `manual_funding.enabled=true`, the two expected links and `checkout_enabled=false`; verify chip configuration is enforced. Test signed-in desktop/mobile display and no automatic external navigation. Do not create fake live funding or grant complimentary paid balances as a test.
7. The account holder completes one real checkout themselves. An operator verifies it using the procedure below before credit posting. Verify exactly one ledger entry, membership activation only after explicit purchase, and the Organizer grant only once. Record evidence with private customer details omitted from public reports.

## Receiving and crediting a payment

1. The signed-in user opens a $9 or $10 checkout. The visible reference sent is `openpoker:user:<numeric-user-id>` via the documented `ref` query parameter. OpenPoker does not send their email. A checkout opening, screenshot, return URL, email or browser message is not proof of final payment.
2. In the merchant's **Payments** ledger, verify the final `paid` order belongs to the exact merchant and one of the two OpenPoker link IDs. Check token/network, exact amount received including matching suffix, transaction, recipient and final status. Resolve underpayments/expired/wrong-network payments with the provider before crediting.
3. Match the account reference and the user's signed-in support request. References are payer-supplied attribution, not authentication; resolve mismatches before posting. Never credit a screenshot-only claim or an unrelated project's order.
4. Record **900 or 1000 cents**, matching the purchased package. The provider's sub-cent matching suffix is not another credit package. Retain the exact received amount in the payment evidence; escalate any material amount discrepancy instead of rounding an arbitrary transfer into credits.
5. Use **Admin → Marketplace → Finance → Organizer service credits** through the existing private admin access. Enter the numeric user ID, package amount, and canonical unique reference `nervixpay:<order-id>`. Verify that the same chain transaction has not funded another order. The reusable `openpoker:user:<id>` is never a funding receipt ID.
6. Confirm the independent-verification checkbox and post. The server allows a same-user/same-amount receipt retry without granting twice, and rejects conflicting reuse. Check the user's credit history. Funding alone does not activate a membership.
7. If interrupted after posting, read the ledger before trying again. Reuse the same provider reference, never a newly invented receipt. Escalate an uncertain identity, amount or settlement status without posting.

## Manual service-credit refunds

Refund decisions are handled through Support; these controls do not promise an automatic refund or transfer money. They do not unwind consumed memberships, hosted services or purchased Cash Chips.

- **Before credit posting:** resolve an approved refund externally, verify completion and mark the receipt in the operator's reconciliation record as refunded. Do not post the credits later.
- **After credit posting:** use the dedicated **Organizer service-credit refunds** section, not the unrelated marketplace order refund form. Select the original raw reference `nervixpay:<order-id>`, user, amount and reason. Reserve first. The server atomically removes the amount from available credits, caps all reserved/paid refunds at the original top-up and refuses insufficient balance. Keep the returned refund request ID.
- Only after a successful reservation does the account holder/operator carry out the approved external refund. Verify the actual receiver, amount, network, transaction and final settlement independently. Record the unique external refund reference and mark paid. This records settlement without a second debit.
- If no external payment was sent and cancellation is verified, cancel the reservation with a reason. This restores credits once. **Do not cancel a sent, pending or uncertain transfer**: it could later settle and create double value. Investigate it while the credits stay reserved.
- Paid/cancelled requests cannot switch states. Retries must preserve the original request/refund references and payload. Do not edit or delete ledger rows, mutate account balances directly, or disguise a cancellation as a fresh top-up.

## Stop and recover

To stop new funding, set `GGPOKER_NERVIXPAY_MANUAL_FUNDING=off`; this only removes in-app funding links. Already opened reusable provider links remain payable. If payment intake must stop, disable only these two OpenPoker links in NervixPay and reconcile any in-flight orders.

Do not turn usage/chip enforcement off on a running paid economy: that changes the meaning of private-game actions. Drain/stop affected games and use the tested financial recovery paths before any mode change. Keep private admin access available for unresolved refund, event and buyback reconciliation.

Before any paid state exists, rollback can use the recorded prior image and flag values. After paid state exists, never restore an old database backup or launch an older image that ignores the new ledger: that can discard balances or promises. Preserve the current database, stop intake/affected games and prepare a forward repair or an explicitly reviewed compatible rollback. Backups are recovery evidence, not permission to erase later payments.

## Launch limits

No automatic customer payouts, merchant-wide webhook replacement, API token provisioning, Diamonds or third-party automatic checkout are included. Cash Chip satellites stay disabled. Spin requires its full configured maximum payout reserve. Interrupted paid tournaments or partially settled Spins can require the documented audited recovery APIs.
