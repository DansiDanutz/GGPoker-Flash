# DanGG Marketplace and administration

The public catalog is at `/marketplace`; it is readable without creating an account or
entering the poker lobby. Hash navigation (`/#/marketplace`) is also supported.
`/marketplace/admin` opens the Marketplace section of the existing administrator console.
`/admin` opens the administration overview. All existing game-management sections remain
available, with direct links such as `/#/admin?section=users`.

## Operator access

The existing administrator account and private-network policy are required. Production
administration is **not exposed through a new public API**. Use the existing operator tunnel:

```sh
deploy/open-admin-tunnel.sh
```

Then open `http://127.0.0.1:5198/marketplace/admin` and authenticate with the configured
administrator account. The main overview is `http://127.0.0.1:5198/admin`.
No default production password is documented or introduced by this feature.

## What can be managed

- **Catalog:** product descriptions, category, delivery type, price presentation, currency,
  benefits, featured placement and order. Draft and archived products remain private.
- **Requests:** authenticated expressions of interest, with an administrator response and
  pending/approved/declined state. The response is visible to its requesting account only.
- **Access:** a manual registry of service access for an existing active account, optional
  expiration and internal notes. Grants can be revoked. Expired grants are displayed as
  expired even though their stored historical state is `active`.
- **Content:** public heading, introduction, request guidance and accepting/pausing requests.
- **Plugins:** built-in management capability registry, implementation status and paid
  access for the current account. Cash Games, Tournaments and Spin & Go have working
  management adapters. Conventional Sit & Go and Social Casino management remain planned.
- **Finance:** publisher review, verified commission-credit funding, offer ownership,
  reserved orders, payment binding, operator-verified settlement and full-refund records.

The broader console still manages users, tables, tournaments, waitlists, branding,
promotions, missions, reports, moderation, settings, snapshots, transactions and audit logs.

## Commercial behavior

This release includes paid management enforcement and a separate commerce ledger. It
does not initiate NervixPay payments, automatically fetch payment evidence, issue invoices,
install third-party code or run recurring charges. The catalog keeps `checkout_enabled:
false`. An authenticated private operator can record payments independently verified in
NervixPay; this atomically consumes the reserved commission and grants the purchased term.
The console does not move money. Approving an interest request never implies payment.

The original four coming-soon offers are retained. Five management products are seeded
without overwriting operator edits. Three have implemented management adapters; the two
planned adapters cannot be published as available or sold. All begin with quotation
pricing: configure an actual USD amount and monthly, yearly or one-time term before
recording an order. Legacy manual grants cannot unlock these paid products. No marketplace
operation changes play chips, tickets, gems or any game ledger balance.

`GGPOKER_MARKETPLACE_ENFORCEMENT=off` preserves community/self-hosted behavior. `observe`
records missing purchases without blocking. `enforce` requires active paid access for
private hosting, applicable administrator creation/configuration/duplication and host
straddle changes. The existing authorization and private-network checks still apply;
purchases never grant administrator status. Inspecting resources, safety moderation,
cleanup and recovery remain available. This release licenses management actions: existing
tables can continue hands and Spin cycles after management access expires. It does not
implement session-by-session hosting shutdown.

Commission credits are USD cents, separate from NervixPay's own processing fees. Each
order reserves 20% (rounded up to the next cent) before payment. The organizer pays the
gross amount directly to the publisher; the platform consumes previously funded credits.
Insufficient publisher credits block new reservations, not paid customer access. Repeated
payment references cannot earn a second fee or extend access again. See the complete
[implementation plan](MARKETPLACE_IMPLEMENTATION.md) for the economic model, exact ledger,
provider contract, future publisher self-service and rollout procedure.

Community code follows the repository's AGPL-3.0-only policy and documented exceptions.
An offer labeled as a commercial module does not establish independent copyright or make
it compatible with the core by itself. See [LICENSING.md](LICENSING.md).

## Data and API

Four additive SQLite tables are initialized idempotently: `marketplace_products`,
`marketplace_settings`, `marketplace_requests`, and `marketplace_entitlements`. Initial
products and copy never overwrite operator edits on restart. Administrative changes are
recorded in the existing audit log. There are no destructive schema changes.
The commerce extension additionally initializes publisher, offer, order, payment-binding,
payment, immutable commission-journal, paid-access, refund and commerce-event tables.
Paid order access is intentionally independent of the older manual access registry.

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/marketplace` | Public | Published catalog and selected public settings |
| `GET /api/marketplace/me` | Signed-in account | Own requests and service access |
| `POST /api/marketplace/requests` | Signed-in account | Record interest in a published offer |
| `GET /api/admin/marketplace` | Existing private administrator access | Catalog, requests, access and counts |
| `POST /api/admin/marketplace/products` | Administrator | Create a product |
| `PATCH /api/admin/marketplace/products/:id` | Administrator | Edit, publish or archive a product |
| `PATCH /api/admin/marketplace/settings` | Administrator | Update public marketplace copy |
| `PATCH /api/admin/marketplace/requests/:id` | Administrator | Review a request and send an in-app response |
| `POST /api/admin/marketplace/entitlements` | Administrator | Grant or renew service access |
| `PATCH /api/admin/marketplace/entitlements/:id` | Administrator | Revoke service access |
| `GET /api/marketplace/management` | Public | Implemented/planned registry and installation enforcement mode |
| `GET /api/marketplace/management/me` | Signed-in account | Own paid capabilities and effective management access |
| `GET/POST /api/marketplace/publisher` | Signed-in account | Read or create own pending publisher profile; no credit or approval authority |
| `GET /api/admin/marketplace/commerce` | Private administrator | Publisher balances, offers, orders and bound payment quotes |
| `POST /api/admin/marketplace/commerce/...` | Private administrator | Reviewed publisher, credit, reservation, verified payment and refund operations |

Submitting an already pending request is idempotent. New requests are limited per account
to five per hour and ten per day; these limits persist across restarts. Account responses
omit internal grant notes. Product mutations validate a bounded allowlist of fields, and
all queries use bound parameters. The catalog supports up to 200 products; request/access
responses contain at most 500 matching records. The administrator request list puts
pending requests first, then orders by creation time; the account view shows the latest
requests and access records.

## Verification and deployment

Run the project's existing required checks plus the focused behavior tests:

```sh
cd app
node --test server/marketplace*.test.js server/management-*.test.js server/admin-guard.test.js
pnpm exec tsc --noEmit -p tsconfig.json
pnpm build
node tools/verify-source-build.mjs
node tools/marketplace-browser-smoke.mjs
```

The browser smoke requires an installed Chrome/Chromium (or `CHROME_PATH`). It starts
its own disposable local server and cannot target production. It checks the public
and administrator flows, mobile layouts and persisted access changes. CI uploads its
screenshots and report as the `marketplace-browser` artifact, retained for seven days.

Use the normal CI-green `main` deployment procedure in `deploy/deploy.sh`. The database
volume remains in place; the new tables are created on startup. Verify the deployed
commit through `/healthz`, then check the public catalog, private owner interface and
published source link. A public-network request to `/api/admin/marketplace` must remain
rejected by the existing network guard.

## Organiser tournaments

See [Tournament Manager](TOURNAMENT_MANAGER.md) for setup costs, game terms, scoped tickets, payouts, cancellation and recovery.

Spin & Go setup, funded prizes and transferable entry tickets: [Spin Manager](SPIN_MANAGER.md).
