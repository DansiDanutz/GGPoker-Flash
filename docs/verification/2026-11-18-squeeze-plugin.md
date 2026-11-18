# Optional 3D Card Squeeze

This change adds a built-in optional cosmetic extension to the existing shared cash
and tournament inspector. It does not alter cards, game rules or settlement.

| Feature | Default | Optional 3D Card Squeeze |
| --- | --- | --- |
| Card inspection | Free 2D renderer | Curved two-card surface, lighting and shadows |
| Play Money | Free | Free preview, explicitly selected |
| Organizer Cash Chip games | Free | $1 per calendar month or $10 lifetime |
| Choice | Selected initially | Player opts in; switch back at any time |
| Unsupported WebGL | Works in 2D | Falls back to 2D |

The purchase belongs to the player's account on this installation, not to an
organizer, table or device. A separate Organizer/Contributor membership is not
required. Local open-source use and Play Money testing remain free. This is a
hosted access policy, not DRM or a restriction on AGPL source rights.

## Billing and activation

Purchases debit the existing USD service-credit ledger: 100 cents for one
calendar month, 1,000 cents for lifetime. Cash Chips, player wallets, publisher
commission credits and poker balances are not used. Monthly renewal is manual;
there is no automatic recurring debit. Renewing active monthly access adds a
calendar month after its current expiry, clamped to the last day when needed.
Renewing expired access starts from now. Access is inactive at the exact expiry
instant. Lifetime access has no scheduled expiry. Upgrading costs the full $10;
unused monthly time is not refunded or converted.

Each purchase and entitlement update is one SQLite transaction. Idempotency keys
are scoped to the buyer, checked against the requested plan, and retained in the
browser session across page reloads if a response is lost. A retry returns the
recorded operation without a second debit. A fresh purchase after lifetime access
is refused. Service billing off disables purchases while preserving free previews.

The Marketplace shows both included and extra features, pricing, renewal terms,
access status, balance, preview and purchase controls. A successful purchase selects
3D on that device; the choice is scoped by account and can be changed back to the
free default. Before each two-card inspection, the client checks the authenticated
access endpoint. The server reads the actual table economy; tournament tables use
the persisted tournament economy, because their playing stacks are tournament
chips even when tickets cost Cash Chips. Caller-supplied preview flags cannot
turn a Cash Chip game into Play Money. Unknown tables and failed access requests
use the free renderer. An already-open inspection can finish; the next inspection
checks access again. PLO keeps the standard renderer.

## Reproduce without production data

Run from `app/`, with temporary/cache/artifact directories on approved scratch
storage. The browser tools create disposable loopback sandboxes and accept no
production base URL.

```sh
node --test server/squeeze-3d.test.js server/squeeze-reference.test.js server/squeeze-surface.test.js
node tools/squeeze-plugin-browser-smoke.mjs
node tools/squeeze-3d-browser-smoke.mjs
node tools/table-reference-browser-smoke.mjs
pnpm exec tsc --noEmit -p tsconfig.json
```

The UI billing rehearsal deliberately substitutes payment responses to simulate
an accepted purchase with a lost response and reload. Ledger and authorization
assertions run against real disposable SQLite/server fixtures separately.
The renderer test verifies that the default never activates WebGL, then checks
actual 3D card identities, context loss, unsupported WebGL, disposal and reduced
motion. Table rehearsals cover the free default and explicit free 3D preview in
cash and tournament games at phone widths.

The regression was first observed on the previous implementation: a requested
free default rendered `webgl` instead of `2d-default`. No live payment, customer
balance change or deployment is part of this verification.

## Approval and remaining limits

The operator stated: “My DCO 1.1 certification covers these changes.” New commits
carry the configured author's sign-off; prior authorship/history is preserved.
The earlier 3D renderer phone evidence remains documented in
[the renderer report](2026-11-18-3d-card-squeeze.md). This follow-up changes access
selection and billing, not card geometry. iOS, low-end Android and long thermal
runs remain unverified. Public promotion, marketplace publisher attribution and
production release remain separate approval steps; this built-in listing does
not fabricate a contributor submission or a public PR number.
