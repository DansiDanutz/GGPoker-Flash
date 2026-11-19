# Organizer workspace

Every signed-in registered player can open **Organizer**. An active membership
is required for organizer services; browsing the workspace does not purchase one.
Guests see a sign-in prompt.

| Section | What the organizer can do |
| --- | --- |
| How it works | Follow the first-game checklist and understand service credits, organizer Cash Chips, Play Money, tickets, rake and prepaid hours. |
| Transfers | Use the existing organizer-scoped wallets, Cash Chip transfers, ticket transfers and manual buyback workflow. Drafts survive section changes. |
| NervixPay | Open configured service-credit top-ups, read receipt-verification instructions and inspect the service-credit ledger. |
| Management | Check membership, expiry and balance; explicitly activate or renew and navigate to club/game management. |
| My Tables | Open cash/tournament/Spin setup and manage existing games, schedules, cash sessions and permitted rake settings. |
| My Casino | Edit the public poker club, set its existing entry policy, share its link and approve/reject pending member requests. |

The selected section is stored in the URL, for example
`#/organiser?tab=my-tables`. Unknown sections fall back to How it works.
A public club link uses `#/organizers?club=<owner ID>`.

## Payment and chip boundaries

Service credits pay platform fees. Organizer Cash Chips are separate wallets for
each organizer; Play Money is separate again. The workspace reuses the existing
server validation, permissions and idempotency keys. It does not create a new
payment or settlement implementation.

NervixPay service-credit funding remains operator-verified. Returning from a
checkout never credits an account. Player buybacks remain a manual payment and
recipient-confirmation flow. Disabled or unconfigured payment services are
identified in the interface. Club profile changes and member approval do not
transfer chips or purchase tickets.

“My Casino” currently means the organizer's poker club. Slots, roulette, merchant
onboarding, automatic player withdrawals and new casino games are outside this
release. The existing paid club-entry checkout still requires server configuration
and verified payment.

## Verification

Run from `app/`:

```sh
node tools/organizer-workspace-browser-smoke.mjs
```

The test starts the existing disposable sandbox. It covers the six sections at
1280, 390 and 320 pixels, URL persistence, transfer draft preservation, club profile
saving, free membership approval, public club deep links and the guest gate. It
checks that browsing and club management leave service credits and their ledger
unchanged. Its active membership is inserted only into the disposable database;
no real checkout, production account or payment provider is used.

Screenshots and the JSON result are written to `artifacts/organizer-workspace/`
(or `ARTIFACTS_DIR`). Existing organizer billing/chip tests remain responsible for
financial settlement and authorization regressions. A physical-phone check and
production deployment are separate release steps.
