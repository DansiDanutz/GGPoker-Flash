# Rake Lab: live Contributor trial

Plugin ID: `rake-lab`. Version: `1.0.0`.
Source PR: https://github.com/OpenPoker4all/OpenPoker/pull/224
Free route after deployment: `/#/rake-lab`.

Rake Lab is a real browser/server learning tool, not a new poker variant. It previews one cash-game pot using whole virtual chips, percentage rake, a cap and the no-flop/no-rake rule. It does not create games, change settings, settle hands, or read/write wallets. Side pots, tournaments and Spin payouts are outside this example.

## Test the source for free

```sh
node openpoker.mjs test rake-lab.test.js contributor-play-money.test.js
node openpoker.mjs sandbox
```

Open the sandbox URL, sign in with a local test account and choose Contributor → Rake Lab → Try in Play Money. The source registry makes this free trial available after deployment; publishing the official marketplace listing is a separate approval action.

- Default 6,000-chip pot, 5% rake, 300-chip cap: 300 removed, 5,700 left, cap reached.
- 1,000-chip pot at 2%, 3%, 4%, 5%: 20, 30, 40, 50 removed respectively.
- Uncheck “A flop was dealt”: no rake; the full pot remains.
- Pot 19 at 5%: rounds down to zero. A 20,000 pot at 5% still takes only 300.
- Negative, fractional, excessive or missing inputs must be rejected. No membership or financial charge is required to calculate.

CI runs the endpoint tests, existing full suite, TypeScript/build checks and Contributor browser checks, including the sample card and calculator on desktop/mobile widths.

## Submit on the official service

1. Wait for this PR's latest CI to pass and mark the PR ready for review. Capture its exact head; later source changes require a new submission.
2. The submitting account needs an active Contributor membership and an approved publisher profile with its actual NervixPay merchant ID. Never substitute a fixture or grant test credits in production. Ordinary source review and local testing stay free.
3. In Contributor, enter `rake-lab`, the PR URL above and the testing notes below. Submission itself does not charge credits.
4. After maintainer review and an explicitly authorized merge, the administrator confirms authorship and approves the submitted commit. This does not publish a listing.
5. After an explicitly authorized deployment containing the registration, “Publish and activate” creates the listing and records the release against the contributor account. Verify the free route, listing and owner record, plus unchanged service-credit/Cash Chip balances around these actions.
6. To retire the sample listing, use the audited revoke action. Revocation archives the listing; it does not remove merged open-source code or its free learning route.

Suggested submission notes (attach the final CI URL and head SHA):

> Rake Lab v1.0.0 provides a read-only single-pot virtual-chip preview. Endpoint checks cover all four rake rates, cap boundaries, rounding, no-flop/no-rake, input/method rejection and unchanged financial tables under paid enforcement. Browser checks cover the registered free trial, capped/no-flop results and five widths. No game settlement, wallet writes or payments are introduced.

Preparing this PR does not purchase a membership, approve a publisher, merge/deploy the sample, or publish a listing.
