# OpenPoker product delivery tracker

**Reviewed:** 17 November 2026 · **Status:** paid Cash Game first-hour loop and hourly renewal live-verified; remaining milestones proposed. Merge and deployment require approval.

This is the concise delivery order. The [business roadmap](designs/2026-11-16-openpoker-business-feature-roadmap.md)
contains the agreed economy, detailed feature proposals, audit evidence and acceptance criteria.
Neither document promises dates, guaranteed earnings or regulatory approval.

## Product and economy

OpenPoker is the shared open-source platform; DanGG is our branded integration and reference service.
Free Play Money, organiser Cash Chips, tournament playing stacks, service credits and publisher
commission credits are separate balances with separate purposes.

- Organiser membership: $9 per calendar month, including 100,000 organiser-scoped Cash Chips
  per period. Extra inventory costs $1 in service credits per 10,000 chips. Early renewal must
  not release the next period's grant early or twice.
- Cash Chips transfer only within their issuing organiser's economy. The wholesale inventory
  price does not set a player's externally negotiated payment or buyback terms.
- Cash table setup: $10. Each active hour is paid in advance at the organiser's lifetime paid
  table-hour tier: 1–50 $5; 51–100 $4; 101–200 $3; 201–500 $2; 501 onward $1.
  Tables share that counter; retries and free resumes do not increment it.
- Tournament setup: $5; rescheduling: $1. Spin & Go setup: $3; rescheduling: $1.
  Free Play Money resources do not incur these charges.
- Cash-table rake: 2%, 3%, 4% or 5%, with a whole-chip cap. Rake enters the scoped burn
  account; it does not mint replacement Cash Chips into the organiser wallet.
- Event-bound tickets spend scoped Cash Chips and grant the configured tournament starting
  stack. Main prizes settle from reserved Cash Chips. Paid three-player Spin has one winner,
  receiving all ticket Cash Chips minus the selected 2–5% rake.
- Mystery bounties use a separate prefunded reserve. Covering winners of the eliminated
  player's final contested pot receive the bounty, split with clockwise whole-chip remainders
  when tied. Unused reserve returns through the ledger.
- Manual buyback locks chips, records the organiser's external payment and requires recipient
  confirmation. OpenPoker does not send that money. Automated external payouts remain missing.
- Contributor membership: $9 per calendar month for official marketplace submission and earning
  eligibility. Local testing and ordinary open-source PRs stay free. Platform commission: 20%
  of eligible publisher receipts. Approval is not company equity or guaranteed income.
- Diamonds and platform-wide tournaments remain a later proposal, including 50/50 organiser /
  platform sharing. There is no active Diamond conversion or payout promise.

Players do not need an Organiser subscription merely to join; a configured paid event may
require its Cash Chip ticket. No paid odds manipulation, hidden bots or pay-to-win advantages.
Keep licence/source notices, privacy controls, asset provenance and truthful economy disclosures.
An external organiser cash-value arrangement cannot be described as “play-money only.”

## Development, approval and updates

Follow [the development workflow](DEVELOPMENT-WORKFLOW.md): develop and test team changes on
DanGG feature branches, retain its branding, and promote only selected reusable commits onto a
fresh public OpenPoker branch. External contributors can submit from their own public forks.
OpenPoker maintainers decide public acceptance; CI does not approve a PR or publish a product.
Marketplace publisher/version approval is separate from code merge and deployment.

Synchronise accepted public main back through a DanGG merge PR, preserving both histories.
Never publish private history wholesale. Production uses an explicitly approved public release
with final checks and verified backup. Independent operators choose which release to install.
Alternative themes can coexist as reviewed choices; they need not replace the default.

## Audited state

Baseline: public `ed03bf43f9f17c74160ca576ec13a728a85d6a98`; live health reported that commit and
no warnings on 17 November. Health alone does not verify the visible UI or payment configuration.
The business-roadmap audit passed 86 targeted tests, not a fresh full browser/live certification.

**Verified** means stated bounded checks passed. **Implemented—unverified** means source exists
but the complete journey was not exercised in that audit. **Missing** means no complete
implementation was found. **Deferred** is a delivery decision, not a claim of absent foundations.

| Capability | Status | Remaining evidence or work |
| --- | --- | --- |
| Membership, grants, lifetime hours, scoped chips and rake | Verified: billing/chip tests; [paid Cash Game first-hour loop and hourly renewal live-verified](designs/2026-11-17-paid-cash-loop-verification.md) | [Hourly renewal live-verified](designs/2026-11-17-hourly-renewal-verification.md); pricing-tier transitions, insufficient-credit renewal and restart recovery pending; changed-UI acceptance remains separate |
| Tickets, bounties and manual buyback | Verified: event/bounty tests and prior bounded live evidence | Hard restart midway through a multi-bounty settlement |
| Paid Spin net pool and single payout | Verified: pooled Spin tests, including partial recovery | No new live Spin run in the audit |
| Contributor review and Rake Lab registration | Verified: state-machine tests | Current browser/publisher state; configured paid offer and delivery |
| CLI, free browser/server sandbox, profile/role management | Implemented—unverified in the audit | End-to-end acceptance when changed; sandbox is not hostile-code isolation |
| Guest accounts and basic links | Implemented—unverified | Host approval, revocation, expiry, QR handoff and account conversion |
| Analytics v1 | Verified: module tests; emitters inspected | Only guest/account creation and hands emit; commercial events declared only; retention job, invitations and organiser dashboards missing |
| Manual funding and commerce accounting | Verified: replay/domain tests and prior receipt reconciliation | Automatic provider fulfilment/webhook and recurring collection missing |
| Health, backups, snapshots and recovery controls | Health verified; recovery implementation exists | Fresh process-restart drill, operator status and backup-age view |
| Workspaces, staff roles and clubs | Missing complete domain model | Preserve organiser ledger ownership during migration |
| Branding and optional themes | First-party branding implemented | Generic reviewed theme installation/switch-back missing |
| Minimum versioned extension contract | Missing; source-integrated plugins exist | Earlier foundation, separate from arbitrary uploaded-code execution |
| Hosting control plane, voice/video, creator suite, bot seasons, academy | Deferred | Existing hosting/spectating/practice bots are not those complete products |

Mixed human/bot hands count as human activity in analytics v1. They are not distinct human
players or retained communities. Do not substitute hand counts for the north star:
**weekly active communities with returning human participants**.

## Next milestone M1: recovery-safe paid organiser pilot

1. **M1.1 — Sync and documentation:** prepare the DanGG sync with approved public main, retain
   branding and align this tracker. Evidence: public ancestry, reviewed diff and CI on the final
   branch. Prepared PRs do not mean merged or deployed.
2. **M1.2 — Persistent restart drill:** kill a disposable process before first bounty, after one
   commits, and after payment but before acknowledgement/checkpoint. Preserve original draw and
   recipients, pay once, or explicitly pause for audited resolution. No silent redraw/auto-resume.
3. **M1.3 — Receipt recovery:** prove duplicate, wrong-token, late-confirmed and restored-database
   scenarios cannot credit twice. Bind actual token/chain/recipient/amount to one receipt; keep
   unresolved mismatches in review. No new customer payment needed for these fixtures.
4. **M1.4 — Paid Cash Game first-hour loop: VERIFIED** on 17 November 2026, release
   `0ce0cf7d6e830b1e9dcefce0a31b443c467f36d4`. [Live evidence](designs/2026-11-17-paid-cash-loop-verification.md):
   $15 funding once, $10 setup, $5 first prepaid hour, two hands, 310 chips of rake including
   a 300-chip capped hand, table paused and all balances reconciled; collector `proven`.
   **Hourly renewal: VERIFIED** in a [separate real-boundary run](designs/2026-11-17-hourly-renewal-verification.md)
   on the same release: exactly one $5 renewal, no duplicate debit on retries, and no charge
   across the following paused boundary despite $5 remaining.
   **Still pending:** pricing-tier transitions (50→51, 100→101, 200→201, 500→501),
   insufficient-credit renewal and restart recovery. No repeat paid run is needed for this evidence.

Exit: no unexplained accounting discrepancy; reproducible recovery disposition and expected /
actual balances; required checks on the exact public promotion head. No new game, repricing,
bulk workspace migration or generic plugin runtime belongs in M1.

## Following milestones

- **M2:** one automatic verified service-credit funding path with an exception queue; then
  invitation-first guest flow and mobile handoff, extending analytics v1 rather than rebuilding it.
  Automated player buybacks are a separate scope, not a dependency of funding.
- **M3:** one contributor version → paid offer → fulfilment → commission → refund/support pilot,
  minimum manifest/API compatibility contract, and selectable reviewed themes. Retain free local
  testing. Arbitrary uploaded browser/server code execution is deferred.
- **M4:** minimal staff roles, recurring clubs, scoped analytics and branding; pilot managed setup
  before a provisioning platform. Migrate ownership only with isolation and rollback evidence.
- **M5:** media, creator tooling, bot seasons, academy and broader runtime/hosting automation only
  after adoption, operating cost and support evidence. Diamonds remain a separate later contract.

## Existing step identifiers

Retain these IDs for code comments, evidence tools and older PRs; milestone order above governs.

| Step | Current disposition |
| --- | --- |
| S1 — Economy wording | Source fixes exist; align policy here and verify changed UI, not an old PR number |
| S2 — Paid-loop proof | **Verified: first-hour Cash Game loop**, [live evidence](designs/2026-11-17-paid-cash-loop-verification.md); [hourly renewal verified](designs/2026-11-17-hourly-renewal-verification.md); pricing-tier transitions, insufficient-credit renewal and restart recovery pending |
| S3 — Taxonomy v1 | Implemented and module-tested; partial emitters, not a finished dashboard |
| S4 — Service truth | Health foundation exists; operator recovery/status evidence in M1 |
| S5–S7 — Invitations/instrumentation/mobile | Guest foundation exists; complete in M2 |
| S8 — Workspaces | Missing full model; minimal staff scope in M4, no prerequisite for basic funding |
| S9 — Automatic funding | Missing automatic path; M2 over existing ledgers |
| S10 — Operator analytics | Missing complete scoped reports; extend v1 in M2/M4 |
| S11–S13 — Clubs/branding/hosting | Pilot in M4; preserve first-party branding now |
| S14 — Publisher self-service | Existing review flow; paid fulfilment pilot in M3 |
| S15 — Extension contract/runtime | Minimum contract in M3; arbitrary runtime deferred |
| S16 — Bot seasons/academy | Deferred to evidence-led M5 |

## Updating this tracker

Record tested commit, scope and proof when changing a status. Separate implemented, locally
verified, deployed and live-verified behavior. A listing, webhook helper, source registration,
health check or CI pass does not prove an entire paid user journey. This tracker and the business
roadmap must agree; external dashboards must not silently turn “partial” into “shipped.”
