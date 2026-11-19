# Account workspaces aligned with DanGG

## Intent
Profile, Organizer, Contributor and Marketplace should share the graphite surfaces,
warm gold navigation and readable typography of the DanGG application. A player
should recognize the same product when leaving a table to manage their account.

## Implementation
- Scope the shared account theme to account, platform and club surfaces. Game table
  styling and existing branding assets remain independent.
- Put avatar and nickname editing first in Profile; retain the role guide below it.
- Use gold only for navigation, selected categories, monetary summaries and primary
  actions. Preserve error/success distinctions and explicit status text.
- Give billing balances and membership summaries individual cards, readable labels
  and consistent spacing. Keep Play Money, service credits and organizer Cash Chips
  separate; no prices, API calls, confirmations or ledger behavior change.
- Keep the Organizer's six sections, their deep links and draft preservation.
- Reuse installed components and CSS; no new runtime dependency or image download.

## Verification scope
The disposable Organizer browser rehearsal covers six tabs at 1280, 390 and 320px,
profile editing order, Contributor and Marketplace overflow, guest access gating,
club profile save, member approval, draft persistence and unchanged service-credit
ledger. Screenshots are captured at each width. These are test accounts, not live
payment evidence. TypeScript and whitespace checks accompany the browser run.

## Release boundary
This is a private DanGG design review. Public promotion, merge and deployment need
maintainer approval. Real-device usability and owner visual approval remain release
checks; browser emulation does not prove physical-phone behavior.
