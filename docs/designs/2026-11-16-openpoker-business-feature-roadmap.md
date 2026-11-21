# OpenPoker business-leverage feature roadmap

**Status:** Revised against agreed product decisions and source/test evidence on 18 November 2026. Future milestones are proposed; no merge, deployment or price change is authorized by this document.

**Date:** 16 November 2026 · **Audit revision:** 18 November 2026 (Europe/Bucharest)

**Product:** OpenPoker, with DanGG.live as the first official implementation

**Primary audience:** Product leadership, maintainers, designers, engineers and commercial operators

**Related specifications:** [Marketplace](../MARKETPLACE.md), [Marketplace implementation](../MARKETPLACE_IMPLEMENTATION.md), [Licensing](../LICENSING.md), [Scale plan](../../deploy/SCALE-PLAN.md)

## 1. Executive recommendation

OpenPoker should not try to win by adding more isolated casino games or by presenting itself as another real-money poker room. Its strongest position is:

> **The open-source, self-hostable, mobile-friendly poker platform with free Play Money, separately scoped organiser Cash Chip games, and reviewed contributor customisations, supported by management services and a commercial marketplace.**

The business should develop three reinforcing engines:

1. **Player adoption:** make joining a game immediate, social and repeatable.
2. **Organizer revenue:** sell reliable management, branding, analytics, hosting and support to the people operating those communities.
3. **Publisher growth:** let trusted developers and studios sell compatible services through the existing marketplace and its documented commission model.

The current product already has substantial gameplay depth. The next business gains are more likely to come from **distribution, community ownership, operational trust and repeatable commercial fulfillment** than from another table animation or game variant.

### Recommended investment order

1. Synchronise DanGG with approved public OpenPoker and reconcile conflicting roadmap statements.
2. Close the paid-organiser recovery and reconciliation evidence gaps; reuse existing billing and game capabilities.
3. Automate one verified service-credit funding path, retaining audited exception handling.
4. Improve invitation-first guest joining and instrument the complete human activation funnel.
5. Harden the existing contributor path and establish a minimum versioned extension contract; do not postpone the marketplace foundation to P2.
6. Add clubs, narrowly scoped staff permissions, selectable themes and recurring events; pilot hosting before building a control plane.
7. Defer voice/video, bot seasons and a large academy until adoption and support evidence justify them.

## 2. Scope and non-negotiable boundaries

### 2.1 Product scope

The repository describes OpenPoker as open-source play-money software with:

- React/TypeScript, Node.js, SQLite and WebSocket infrastructure;
- browser, installable PWA and Electron surfaces;
- cash games, multiple Hold'em/Omaha/Short Deck variants, fast-fold, Spin and tournament systems;
- bots, spectating, rewards, profiles, casino simulations and administration;
- private table and tournament hosting;
- a marketplace with management products, entitlements, a separate commerce ledger and a documented 20% publisher commission.

This roadmap treats those as the starting platform, not as proof that every feature is deployed, production-ready or available as a paid product.

### 2.2 Agreed economy and commercial boundaries

Free Play Money and organiser Cash Chip games are distinct modes. Calling the entire product “play-money only” is inaccurate for the agreed product model. This section records product decisions and technical behavior, not a legal classification or a claim of permission to operate in every jurisdiction.

| Unit / account | Agreed purpose and boundary |
| --- | --- |
| Free Play Money | Free local development, game trials and practice. Cannot fund service credits, organiser Cash Chips, real payments or buybacks. |
| Service credits (USD cents) | Pay OpenPoker membership, setup, rescheduling, cash table-hours and organiser chip packs. Separate from every gameplay balance and publisher commission account. |
| Organiser Cash Chips (whole chips) | Separate balance per organiser, transferable to users within that organiser's economy. Can only fund that organiser's games and eligible tickets; never another organiser's tables. |
| Tournament playing chips | Starting stacks defined by tournament setup and granted on valid ticket registration. They are not a transferable Cash Chip wallet or a currency conversion. Prizes settle back into organiser Cash Chips under the event contract. |
| Publisher commission credits | Prepaid commission funding under the marketplace model; separate from player chips and organiser service credits. Top-ups are not plugin sales. |
| Diamonds | Approved economic model: issuing one Diamond costs the organiser 10,000 of their own Cash Chips ($1 platform supply value). The organiser sets the player resale price; the player requests purchase through Marketplace and the organiser approves manually. This fixed issuance cost replaces the earlier 50/50 split. Balance, issuance and approval implementation is in development; cross-organiser tournaments, prizes, trading and redemption remain deferred pending settlement tests. |

**Agreed tariff, retained rather than repriced:**

- Organiser: **$9 per calendar month**, with **100,000 Cash Chips per membership period**. Early renewal must not release the next period's grant early or twice.
- Extra organiser inventory: **$1 of service credits buys 10,000 Cash Chips**. USDC/USDT receipts fund credits only after the actual token, chain, recipient, amount and receipt are verified. This wholesale inventory price is not a universal player buyback promise.
- Contributor: **$9 per calendar month** for official marketplace submission and earning eligibility. Local development, local Play Money tests and ordinary open-source PRs remain free. Contributor membership does not include an organiser chip grant.
- Cash table: **$10 setup**; bill each active hour in advance. Lifetime paid table-hours are pooled across that organiser's tables: hours **1–50 $5**, **51–100 $4**, **101–200 $3**, **201–500 $2**, **501 onward $1**. Two tables for one hour count as two paid table-hours. Retries/free resumes do not advance the counter; there is no monthly reset or retroactive discount.
- Tournament: **$5 setup**, **$1 reschedule**. Spin & Go: **$3 setup**, **$1 reschedule**. Free Play Money resources incur none of these paid hosting charges.

**Transfers, tickets, prizes and rake:**

1. The organiser distributes its own Cash Chips. A user may hold separate balances with several organisers, without pooling them. The organiser determines any player-facing external payment terms; the platform wholesale rate does not determine that agreement.
2. Organisers or users purchase tickets with scoped Cash Chips. A transferable ticket binds to its event and configured entry/starting-stack terms. Redeeming it creates a tournament seat with the configured playing chips; it does not mint freely convertible tournament money.
3. Cash tables let the organiser select **2%, 3%, 4% or 5%** rake and a whole-chip cap. Existing test-table settings remain 5% and 300 chips; they are not compulsory defaults for every organiser.
4. Rake is recorded in the scoped burn account, reducing circulating Cash Chips. It is not minted back into the organiser wallet. Any external monetary margin is the organiser's own arrangement; rake is not a platform profit guarantee.
5. Paid three-player Spin & Go awards **one winner** the combined ticket Cash Chips minus the selected 2–5% rake. No random monetary multiplier is implied by the paid pooled model.
6. Tournament main prizes use their reserved pool. Mystery Bounty draws use a separately prefunded organiser reserve, not an unfunded promise or a second debit from the ticket pool. Each eliminated player's bounty goes to covering winners of that player's final contested pot; tied covering winners split in whole chips with the remainder clockwise from the dealer. Unused reserve returns through the ledger.
7. Manual buyback is implemented: chips lock in escrow, the organiser reports an external payment with evidence, and the recipient confirms before chips return to organiser inventory. The OpenPoker API does not send that money. Automated NervixPay buyback/withdrawal execution remains **missing and deferred from the next milestone**; do not advertise it as live.
8. Check conservation per organiser across wallets, table/ticket/event escrows and burn. Record grants/purchases separately as supply creation. A replay must not repeat a grant, debit, transfer, ticket consumption, bounty or prize.

Keep software purchases separate from participation: players do not need an Organiser subscription merely to play, although a paid event can require its configured Cash Chip ticket. No paid odds changes, hidden bots, purchasable cards or pay-to-win advantage. Preserve privacy, source/license notices, asset provenance and truthful operator disclosures. Platform-wide cash-out, cross-organiser liquidity and automated external payouts are not delivered by this roadmap revision.

### 2.3 DanGG development, OpenPoker approval and release workflow

Follow [Development, approval and releases](https://github.com/OpenPoker4all/OpenPoker/blob/ed03bf43f9f17c74160ca576ec13a728a85d6a98/docs/DEVELOPMENT-WORKFLOW.md) and [Contributor Play Money workflow](https://github.com/OpenPoker4all/OpenPoker/blob/ed03bf43f9f17c74160ca576ec13a728a85d6a98/docs/CONTRIBUTOR_SANDBOX.md):

1. **Our team develops in DanGG**, on feature branches from a synchronised private main. Keep DanGG branding separate from reusable changes. Test browser and server behavior with disposable data, then review through a DanGG PR.
2. **Promote selected shared commits to public OpenPoker**, starting from its latest main. Preserve authorship and inspect the public diff; never merge the entire private history upstream. Other contributors can use their own public forks and do not need DanGG access.
3. **OpenPoker maintainers decide acceptance.** CI is evidence, not approval; contributors cannot approve their own publication. Not every user votes on every change. Core fixes must demonstrate an improvement; themes and similar alternatives can coexist as selectable reviewed products.
4. **Code approval and marketplace publication are separate.** Official submission requires Contributor membership and an approved publisher. Review binds to the public PR head; merge, deployment of the registered version, admin approval and publication each have their own checks. Free previews are for shipped integrations, not unimplemented catalog promises.
5. **Deploy an explicitly approved public release** after final CI, verified backup and deployment checks. A private CI pass is not deployment permission. Production branding must comply with the reviewed release/configuration policy; do not silently deploy unreviewed private code.
6. **Synchronise accepted public main back into DanGG through a sync PR**, preserving branding and both histories. Independently hosted installations choose their update timing; publish compatibility and migration notes rather than forcing upgrades.

Contributor message: **Build it. Test it. Get approved. Earn when customers pay to use your plugin or customisation.** The agreed platform commission is 20% of eligible publisher receipts; exact accounting follows the commerce contract. Acceptance alone does not create company equity, guaranteed sales or automatic royalties. Current new plugin listings use quote/manual access until their paid offer and fulfilment are configured.

### 2.4 Audit baseline and status meanings

Source checked on 17 November 2026:

- Public OpenPoker main: `ed03bf43f9f17c74160ca576ec13a728a85d6a98` (analytics PR #249). DanGG.live `/healthz` reported that commit, healthy with no warnings at the audit read. Health is not a new browser or payment verification.
- DanGG integration was behind the audited public release; a companion sync PR brings that release and these documentation corrections into the private integration tree. Merge remains a maintainer decision.
- Reused Codex test source: `8d42c1eb23a0aae8bd28ee017aa2cdf1ffcaf850`. Against audited public main the server changes are the new product-events module/tests and analytics wiring in index.js. The unchanged domain modules were tested in place; the analytics module/tests were extracted from the exact public commit for their isolated test.
- **86 targeted tests passed, 0 failed**, covering billing, scoped chips, tickets/buybacks/bounties, pooled Spin, contributor approval, marketplace commerce and analytics. This is not a new full-suite, browser or deployment certification.
- Prior local evidence includes the controlled live Mystery retest, receipt reconciliation, tied eliminations and simultaneous multi-side-pot integration tests. Isolated tests do not become live end-to-end proof merely because their module hashes match production.

Status labels: **Verified** = named checks/evidence for a bounded claim; **Implemented—unverified** = code exists but this audit did not prove the full journey; **Missing** = no complete implementation located in the inspected sources; **Deferred** = deliberately outside the next milestone, whether or not a foundation exists. Mixed features list both their delivered part and remaining gap.

| Capability | Status and evidence | Remaining gap |
| --- | --- | --- |
| Organiser/Contributor billing, grants and hourly tiers | **Verified**, targeted `organizer-billing.test.js` and `organizer-chips.test.js`; modules under `app/server/` | Automatic renewal/payment collection is not implied by calendar-month membership logic. |
| Scoped transfers, cash escrow and rake | **Live-verified**, [controlled paid Cash Game evidence, 17 November](2026-11-17-paid-cash-loop-verification.md), release `0ce0cf7d6e830b1e9dcefce0a31b443c467f36d4`: setup, first hour, retries, capped rake, pause and full reconciliation | [Hourly renewal live-verified](2026-11-17-hourly-renewal-verification.md); [insufficient-credit recovery verified](2026-11-18-insufficient-credit-recovery-verification.md); [normal active-hand expiry verified](2026-11-18-active-hand-expiry-verification.md); all-in/side-pot expiry, pricing-tier transitions and restart recovery remain pending live verification. |
| Tournament tickets, main pools, manual buyback and Mystery reserve | **Verified**, `organizer-chip-events.test.js`, bounty tests and prior live/isolated records | Hard-process restart during a partially settled Mystery batch still needs integrated proof. |
| Paid Spin net pool and 2–5% rake | **Verified**, `organizer-chip-spin.test.js`, including partial-payout recovery | No claim of a new live Spin run today. |
| Local browser/server sandbox and OpenPoker CLI | **Implemented—unverified in this audit**, launcher, CLI and existing tests; [sandbox specification](https://github.com/OpenPoker4all/OpenPoker/blob/ed03bf43f9f17c74160ca576ec13a728a85d6a98/docs/CONTRIBUTOR_SANDBOX.md) | Re-run CLI/browser acceptance for any changed integration; this is trusted source development, not hostile uploaded-code isolation. |
| Contributor review and Rake Lab registration | **Verified** review state machine in `contributor-submissions.test.js`; registered Rake Lab 1.0.0 / PR #224 | Current browser/publisher state not rechecked; generic paid plugin installation/royalties remain missing. |
| Profile avatar and role guidance; organiser/contributor management UI | **Implemented—unverified**, `ProfilePane.tsx`, `ProfileRoleGuide.tsx`, `OrganizerChips.tsx`, `ContributorWorkspace.tsx` | Fresh mobile/accessibility and complete management journey checks. |
| Guest play | **Implemented—unverified**, `/api/auth/guest` and `guest-auth.test.js` | Invitation approval/revocation/expiry/QR/account conversion is not established by guest login. |
| Analytics v1 | **Verified** six isolated module tests; [exact source](https://github.com/OpenPoker4all/OpenPoker/blob/ed03bf43f9f17c74160ca576ec13a728a85d6a98/app/server/product-events.js) and index wiring inspected | Only guest/account creation and hand completion are emitted. Checkout/entitlement/renewal are declared, not emitted; invitation events, scheduled retention and organiser dashboards are missing. Mixed human/bot hands count as human activity, not distinct human players or communities. |
| Manual funding and commerce ledger | **Verified** receipt replay and commerce domain tests; prior confirmed USDC reconciliation | Generic automatic NervixPay fulfilment/webhook and automated external buyback are missing. A manual receipt confirmation is not a webhook. |
| Health, backups, snapshots and recovery | **Verified** current health; **implemented—unverified** current restore behavior | Fresh integrated restart drill and operator status/backup-age view; do not infer durability of in-memory Mystery draws from ledger idempotence. |
| Workspace roles and clubs | **Missing** complete team/workspace and recurring-club domain model in inspected sources | Preserve organiser ledger identity during any ownership migration. |
| Themes/branding | **Implemented—unverified** existing DanGG identity and first-party presentation | Generic reviewed theme installation, preview, switching and rollback are missing. |
| Isolated third-party runtime / versioned SDK | **Missing**; source-integrated plugins and sandbox already exist | Minimum supported manifest/API/compatibility contract comes earlier; arbitrary browser/server upload execution remains deferred. |
| Managed hosting, media, creator suite, bot seasons and academy | **Deferred**; existing hosting, spectating and practice bots are foundations only | No complete self-service hosting/media/season/academy product verified. |

Test evidence: the audit ran 86 targeted tests (0 failures) across billing, scoped chips, event tickets/bounties, pooled Spin, contributor submissions, commerce and analytics. Historical live and isolated reconciliation reports remain operator-local because they contain account and payment identifiers. Reviewers can reproduce domain tests with `cd app && node --test server/organizer-billing.test.js server/organizer-chips.test.js server/organizer-chip-events.test.js server/organizer-chip-spin.test.js server/contributor-submissions.test.js server/bounty-settlement.test.js server/marketplace-commerce.test.js server/product-events.test.js`.

**Delivery tracker:** [docs/ROADMAP.md](../ROADMAP.md) is the concise delivery order; this document supplies the agreed economy, detailed feature proposals and audit scope. The tracker is aligned in the same change. Future status updates must name their tested commit and distinguish source, isolated tests and deployed user journeys.

## 3. Competitive lessons and resulting opportunities

| Competitor | What it demonstrates | OpenPoker response |
| --- | --- | --- |
| [PokerTH](https://webclient.pokerth.net/host-a-server) | Open-source self-hosting, browser access, nickname-only entry, invitations and lightweight operation | Match its low-friction access while offering a broader operator and game platform |
| [PokerNow](https://www.pokernow.com/) | A private game can start through a shared browser link without downloads or accounts; video and voice make it social | Build an invitation-first funnel and optional social presence before adding more lobby complexity |
| [ClubGG](https://en-clubgg.com/) | Clubs, custom ring games, tournaments, member management and recognizable mobile identity create community retention | Make organizations and recurring community programming first-class product objects |
| [Zynga Poker](https://www.zynga.com/games/zynga-poker/) and [WSOP Free Poker](https://www.playwsop.com/) | Free-play growth depends on onboarding, daily habits, progression and live operations | Give organizers measurable retention tools without introducing pay-to-win mechanics |
| [EvenBet](https://evenbetgaming.com/solutions/poker-room-development/) | Operators pay for management, reliability, integrations, anti-fraud, customization and support | Sell dependable operation and service rather than relying only on feature count |
| [OpenPoker.ai](https://docs.openpoker.ai/faq/) | Virtual-chip bot seasons and public leaderboards can attract developers | Consider a separate, clearly labeled bot competition surface after the core human community works |

### Main competitive gaps worth closing

1. Guest accounts exist; invitation-specific approval, revocation, conversion and mobile handoff still need a complete flow.
2. Private resources need to evolve into durable organizations with staff roles and member relationships.
3. The commercial foundation needs automated fulfillment, renewal, reconciliation and support workflows.
4. Operators need evidence about activation, retention, event attendance and service health.
5. The project needs simple managed deployment and upgrade paths for non-expert operators.
6. Publishers need a safe, versioned integration and fulfillment path before the ecosystem can scale.

## 4. Business model to support

### 4.1 Free open-source core

The core remains the adoption and credibility engine. It supplies the game engine, essential player experience, self-hosting and documented extension points. Its success is measured by usable installations, contributors, retained communities and reliable upgrades—not by restricting rights granted under the license.

### 4.2 Official hosted service

DanGG.live can remain the free player-facing showcase and reference implementation while offering paid organizer capabilities through the existing marketplace. It should demonstrate the exact commercial and operational behavior customers can buy.

### 4.3 Managed OpenPoker hosting

Offer managed deployment for organizations that do not want to operate servers. The product is the managed technical service: provisioning, updates, backups, monitoring, branding support and defined recovery objectives. It does not itself provide automated player deposits, withdrawals or regulatory approval for an organiser’s external arrangements.

Possible packaging dimensions, without setting unvalidated prices:

- workspace or installation scope;
- included resource and concurrency limits based on measured capacity;
- standard versus priority support;
- custom-domain and branding assistance;
- retention/export options;
- staging and review environments for larger customers.

### 4.4 Organizer subscriptions and services

Retain the agreed $9 memberships and existing setup, rescheduling, lifetime hourly tiers and scoped Cash Chip supply model in section 2.2. Use the existing Cash Games, Tournaments and Spin management products to validate willingness to pay. Add clubs, analytics, engagement and branding only when each has a complete ownership model and usable operator interface.

Professional services can include setup, migration, theme implementation, training and prioritized troubleshooting. These services should have clear deliverables rather than ambiguous lifetime promises.

### 4.5 Publisher marketplace

Retain the documented 20% commission on eligible publisher receipts. The platform's value must come from discovery, review, billing, compatible delivery, updates and support infrastructure. Do not depend on a claim that open-source users cannot modify their own installations.

### 4.6 Optional player cosmetics

Only after the community has retention, consider non-gameplay cosmetics such as table themes, card backs, avatars, celebration effects or profile presentation. These must not change odds, hide information, provide unfair data or confuse play chips with purchases. This is a later experiment, not a foundational revenue assumption.

## 5. Prioritized feature portfolio

Priority indicates recommended discovery and delivery order, not a promise of revenue. Effort is relative and must be estimated by the implementation team after technical design.

| ID | Feature | Priority | Business effect | Relative effort | Main dependency |
| --- | --- | --- | --- | --- | --- |
| F01 | Instant guest games and invitation funnel | P0 | Acquisition and activation | Medium | Guest identity, abuse controls |
| F02 | Measurement and product analytics | P0 | Decisions, conversion and retention | Medium | Event taxonomy, privacy policy |
| F03 | Organizations, workspaces and team roles | P0 | Paid organizer foundation | Large | Ownership migration |
| F04 | Automated commercial fulfillment | P0 | Repeatable revenue | Large | NervixPay adapter, reconciliation |
| F05 | Reliability, recovery and service transparency | P0 | Trust and support cost | Large | Operational instrumentation |
| F06 | Mobile invitation and sharing loop | P0 | Organic distribution | Medium | F01, PWA/deep-link testing |
| F07 | Clubs, memberships and recurring leagues | P1 | Retention and organizer value | Large | F03 |
| F08 | Managed hosting and operator control plane | P1 | Recurring service revenue | Large | F03–F05, measured capacity |
| F09 | Branding, themes and custom domains | P1 | Paid customization | Medium | F03, asset review |
| F10 | Organizer analytics and member engagement | P1 | Renewal and community growth | Large | F02, F03, F07 |
| F11 | Social presence, voice and video | P1 | Session quality and differentiation | Large | Moderation, consent, provider economics |
| F12 | Spectator and creator tools | P1 | Content-led acquisition | Medium | Spectating, privacy controls |
| F13 | Publisher self-service and version review | P0 foundation / P1 expansion | Marketplace supply | Large | F04, review operations |
| F14 | Versioned extension SDK and isolated integrations | P0 minimum contract / P2 arbitrary runtime | Ecosystem expansion | Very large | F13, security architecture |
| F15 | Bot-only developer seasons | P2 | Developer acquisition | Large | Public bot API, anti-abuse controls |
| F16 | Poker academy and guided practice | P2 | Beginner activation | Medium | Explainable evaluator and content |

## 6. Detailed feature specifications

### F01 — Instant guest games and invitation funnel

**Audit status (17 November 2026):** Implemented—unverified: guest account/session foundation. Missing: full invitation permissions, revocation, expiry and conversion.

**Problem:** PokerNow demonstrates that a shared link and immediate play remove substantial social friction. OpenPoker already creates guest Play Money accounts. That is not yet proof of the full invitation-specific approval, expiry, revocation and conversion journey.

**Proposed scope:**

- A host creates a private table or event and receives a revocable invitation link and QR code.
- The invitation opens a mobile-first preview showing game type, host, start state, play-money label and what information joining requires.
- A visitor chooses a bounded display name and joins as an explicitly identified temporary guest.
- The guest receives only the permissions needed for that game. No global account, financial surface or unrelated private data is exposed.
- The host can approve requests, require a room code, lock the room, remove a guest and revoke unused invitations.
- A guest can convert to a durable account after the session while retaining permitted history and profile preferences.
- Existing authenticated users can join through the same link without a duplicate identity.

**Business value:** increases invitation completion, produces more occupied tables, creates a measurable path from visitor to registered player and makes private hosting more valuable.

**Dependencies:** guest-session model, invitation-token storage and expiry, rate limits, host moderation, abuse reporting, privacy copy and reconnect behavior.

**Acceptance evidence:**

- Invitation creation, use, revocation and expiry work across browser, PWA and desktop.
- A guest cannot forge another identity, replay an expired token or invoke organizer actions.
- Reconnect restores only the correct guest seat.
- Removing a guest has defined hand-settlement and chip-return behavior.
- The complete journey works at 320, 390, 768, 1024 and 1440 pixels, with keyboard and 200% reflow checks.
- No invitation token leaks into analytics events or public logs.

**Initial metrics:** invitation opens, join starts, successful joins, guest-to-account conversion, host approval time, guest abuse rate and first-week return rate.

### F02 — Measurement and product analytics

**Audit status (17 November 2026):** Verified: taxonomy v1 module. Missing: commercial emitters, invitation funnel, scheduled retention and organiser/community reporting. Extend v1; do not rebuild it.

**Problem:** Without a shared event taxonomy, the team cannot tell whether new features improve adoption, retention or merely create activity from bots.

**Proposed scope:**

- Define versioned events for invitation opened, guest joined, account created, first human game completed, club joined, event created, checkout started, entitlement activated and renewal.
- Separate human and bot activity in every adoption metric.
- Provide organizer dashboards scoped to owned resources and platform dashboards for aggregate operations.
- Every chart displays unit, date range, source, coverage, update time and whether data is partial or stale.
- Supply CSV export with the same authorization filters as the screen.
- Use consent and retention controls appropriate to the collected data; avoid collecting card content or credentials for product analytics.

**Business value:** identifies drop-off, supports pricing experiments, reduces support diagnosis time and supplies evidence for renewals.

**Acceptance evidence:** dashboard totals reconcile to underlying events; bot-only games cannot inflate human activation; dates use explicit time zones; deleted or revoked resources follow a documented reporting policy.

**Initial metrics:** weekly active human players, weekly active communities, first-game completion, organizer activation, paid conversion, renewal and support time to resolution.

### F03 — Organizations, workspaces and team roles

**Audit status (17 November 2026):** Missing: workspace/team ownership. Defer bulk migration until a minimal staff-role need is proven; preserve organiser-scoped financial IDs.

**Problem:** Account-level `owner_id` is sufficient for an initial host flow but not for a company, club team or publisher with several staff members.

**Proposed scope:**

- Introduce organizations with separate player, organizer, manager, finance and read-only roles.
- Bind tables, tournaments, clubs, themes, orders, entitlements and reports to an explicit workspace.
- Add invitations, role changes, revocation and audit history.
- Keep platform administration separate from organization administration.
- Support ownership transfer and offboarding without deleting history.
- Preserve existing resources through a deliberate migration to a personal workspace.

**Business value:** enables team sales, managed hosting, commercial billing identity, safer delegation and larger organizer accounts.

**Acceptance evidence:** a member cannot access another workspace by changing IDs; finance roles cannot gain gameplay authority; removing a staff member revokes future access without erasing audit records; purchases never grant platform administrator privileges.

**Business metrics:** multi-member workspaces, workspace activation, team invitations accepted and paid workspaces retained.

### F04 — Automated commercial fulfillment

**Audit status (17 November 2026):** Verified: manual receipt-bound ledgers and replay controls. Missing: automatic provider fulfilment and recurring payment collection.

**Problem:** The existing marketplace can record independently verified commercial events, but manual fulfillment limits scale and creates support work.

**Proposed scope:**

- Complete the automatic NervixPay adapter around existing receipt-bound service-credit and commerce ledgers; preserve manual exception handling and prior credited receipts.
- Add customer checkout, trusted payment creation and lookup, authenticated notifications, idempotent settlement and renewal.
- Present pending, confirmed, expired, exception, refunded and revoked states distinctly.
- Add invoices/receipts appropriate to the configured legal seller and tax process.
- Provide publisher and organizer self-service order history and support references.
- Reconcile external payment state before accepting new orders after restoration or prolonged downtime.

**Business value:** converts interest into repeatable sales, reduces manual reconciliation and enables recurring organizer and hosting revenue.

**Acceptance evidence:** sandbox and controlled live reconciliation prove that wrong amounts, duplicate callbacks, late payments and restored databases cannot unlock or double-charge access. Existing games continue under the documented continuity policy.

**Business metrics:** checkout completion, payment exception rate, automatic fulfillment share, renewal rate, refund rate and reconciliation lag.

### F05 — Reliability, recovery and service transparency

**Audit status (17 November 2026):** Verified: health and prior bounded recovery tests. Missing evidence: hard-restart Mystery settlement recovery and an operator-facing service-truth view.

**Problem:** Operators buy dependable service. A broad catalog cannot compensate for failed events, unclear build provenance or unplanned recovery.

**Proposed scope:**

- Public and private status views for build commit, service health, update state and known incidents.
- Per-organizer health for owned tables/events without exposing other customers.
- Automated pre-upgrade checks, verified backups, restoration rehearsals and rollback evidence.
- Reconnect and pending-action recovery tests for every supported game family.
- Capacity telemetry for connections, active tables, event scheduling, write latency and error rates.
- A published support and incident model appropriate to each commercial plan.

**Business value:** increases trust and renewal while reducing emergency support and operational risk.

**Acceptance evidence:** deployed source matches health metadata; a test restore proves the intended recovery; game and commercial recovery are reconciled independently; no availability or scale claim exceeds measured coverage.

**Business metrics:** completed-hand rate, completed-event rate, recovery time, failed upgrades, support incidents per active workspace and renewal after incidents.

### F06 — Mobile invitation and sharing loop

**Audit status (17 November 2026):** Implemented—unverified: PWA/link foundations. Missing: complete invitation/mobile handoff and attributed return journey.

**Problem:** The PWA already reduces installation friction, but mobile growth needs a deliberate sharing and return journey.

**Proposed scope:**

- Deep links for invitations, clubs, tournaments, replay summaries and creator shares.
- QR presentation at desktop tables for phone handoff.
- Safe-area-aware share sheets and clear installed-app/browser behavior.
- Shareable result cards that reveal no private hole cards unless explicitly allowed after the hand.
- Re-engagement notifications only with explicit opt-in and per-category controls.
- Continue as browser remains available; installation is optional rather than a blocker.

**Business value:** lowers acquisition cost through existing players and increases return visits to scheduled community activity.

**Acceptance evidence:** links survive install/open transitions, expired invitations have recovery actions, notifications never expose sensitive cards or account data, and Android/iPhone/browser behavior is tested rather than inferred.

**Business metrics:** shares per active host, invitation acceptance by device, PWA install completion, notification opt-in and return attendance.

### F07 — Clubs, memberships and recurring leagues

**Audit status (17 November 2026):** Missing: complete club membership/recurring-league domain. Deferred beyond the next milestone.

**Problem:** Clubs create a durable reason for players to return and for organizers to pay. A private table alone is a resource; a club is an ongoing community.

**Proposed scope:**

- Club profile, identity, description, owner workspace, managers and membership states.
- Invite-only, request-to-join and open discovery modes.
- Club-scoped tables, tournaments, announcements, roles, rules and moderation.
- Recurring schedules, seasons, standings, attendance and configurable non-cash recognition.
- League scoring with transparent tie rules and corrections through auditable adjustments.
- Member export, club transfer and orderly closure.
- Later federation/unions only after individual club isolation and operation are proven.

**Business value:** increases retention and creates a natural paid organizer package combining management, branding, analytics and support.

**Acceptance evidence:** cross-club data isolation, member approval and removal, recurring event generation without duplicates, restart-safe seasons, transparent scoring and mobile-complete club management.

**Business metrics:** weekly active clubs, returning members, events per club, attendance rate, club organizer conversion and club renewal.

### F08 — Managed hosting and operator control plane

**Audit status (17 November 2026):** Deferred: concierge hosting pilot first; self-service provisioning/control plane is missing.

**Problem:** Self-hosting is valuable to developers but a barrier to nontechnical communities. Managed operation converts the open-source foundation into a service business without removing software freedoms.

**Proposed scope:**

- Provision an isolated customer installation or explicitly isolated workspace.
- Guided setup for identity, branding, initial club, administrators and invitation.
- Automated upgrades with compatibility checks, maintenance notice and rollback.
- Backup status, export request, incident history and service limits visible to the operator.
- Custom domain support after ownership verification and safe certificate automation.
- Plan entitlements enforced at provisioning/management boundaries, never by interrupting active hands.
- Documented data export and cancellation process.

**Business value:** recurring hosting and support revenue, larger nontechnical customer segment and a controlled environment for commercial add-ons.

**Dependencies:** F03–F05, measured capacity, tenant isolation, deployment automation and support runbooks.

**Acceptance evidence:** one customer's credentials, data, domains and background jobs cannot affect another; cancellation/export works; source offers match deployed modifications; capacity plans reflect measured load.

**Business metrics:** time to first hosted game, successful upgrade rate, managed-service gross margin, support cost per installation and hosting churn.

### F09 — Branding, themes and custom domains

**Audit status (17 November 2026):** Implemented—unverified: first-party branding. Missing: optional marketplace theme selection/install/rollback. Preserve alternatives instead of replacing the default.

**Problem:** Community identity is a concrete organizer benefit and a professional-service opportunity.

**Proposed scope:**

- Workspace-scoped logo, color palette, typography choices, table theme, lobby banners and welcome content.
- Accessible contrast and localization checks in the theme editor.
- Preview before publication and versioned rollback.
- Custom-domain verification and status for managed hosting.
- Asset provenance declaration, file restrictions and moderation.
- Distinguish independent service identity from official OpenPoker/DanGG endorsement.

**Business value:** paid branding packages, faster onboarding and marketplace opportunities for reviewed themes.

**Acceptance evidence:** branding cannot inject executable content, hide play-money disclosures or remove required license/source notices; mobile and enlarged-text layouts remain usable; source and asset rights are recorded.

**Business metrics:** branded workspace activation, theme purchase/usage, setup completion and branding-related support effort.

### F10 — Organizer analytics and member engagement

**Audit status (17 November 2026):** Missing: organiser-scoped retention and engagement dashboards. Depends on extending existing analytics and consent controls.

**Problem:** Organizers renew when they can understand and improve their community, not merely see raw hand counts.

**Proposed scope:**

- Club funnel: invited, joined, activated, returned and dormant members.
- Event attendance, late registrations, completion, table occupancy and human/bot split.
- Opt-in announcements, segmented reminders and reactivation campaigns.
- Configurable missions and rewards that use play-money objects without cash-value claims.
- Fatigue controls, frequency caps and responsible-play settings.
- Exportable scheduled reports with clear freshness and coverage.

**Business value:** makes club and event management measurably useful and supports higher-value organizer plans.

**Acceptance evidence:** no cross-workspace member data, messaging consent and unsubscribe work, metrics reconcile, and reports distinguish zero from missing or partial data.

**Business metrics:** organizer weekly active use, campaign-attributed attendance, dormant-member reactivation, report usage and organizer renewal.

### F11 — Social presence, voice and video

**Audit status (17 November 2026):** Deferred: no new voice/video implementation in the next milestone.

**Problem:** PokerNow's integrated voice/video shows that home-game social presence can matter more than advanced game variety.

**Proposed scope:**

- Begin with presence, friend join indicators and text-based table/community interaction.
- Evaluate voice/video through a separately scoped service or established self-hostable provider rather than embedding untrusted code in the game process.
- Host controls for mute, remove, room lock and default media-off joining.
- Clear microphone/camera consent and visible active-media state.
- Defined moderation, reporting, retention and regional/data-handling policy.
- Usage caps or commercial packaging based on measured provider and bandwidth cost.

**Business value:** stronger social retention and a differentiated hosted-club package.

**Acceptance evidence:** media failure never interrupts a hand; denied permissions leave playable poker; guests understand recording/retention behavior; abuse controls work; mobile backgrounding and reconnect are tested.

**Business metrics:** social-session retention, voice/video adoption, incremental session length, moderation incidents and media cost per active community.

### F12 — Spectator and creator tools

**Audit status (17 November 2026):** Implemented—unverified: spectator foundation. Deferred: full creator/delayed overlay/export product.

**Problem:** Creators can distribute the product through entertaining events, but only if spectating and sharing are safe and simple.

**Proposed scope:**

- Creator links for public events and approved club showcases.
- Delayed spectator mode for competitive events where live information could affect play.
- Commentator overlays, standings, result cards and privacy-safe replay exports.
- Tournament/creator branding scoped to the organizer.
- Explicit player consent for public display of profile information.
- Creator referral attribution with transparent, non-spam reporting.

**Business value:** content-led acquisition, larger event audiences and additional branding/streaming services for organizers.

**Acceptance evidence:** private cards and hidden tournament information cannot leak through API, replay, screenshots or delayed-state race conditions; revoked public access stops future updates; mobile spectator layouts remain usable.

**Business metrics:** creator-link attendance, spectator-to-player conversion, shared-result opens and referred active communities.

### F13 — Publisher self-service and version review

**Audit status (17 November 2026):** Verified: contributor submission/review state machine. Missing: complete version-to-paid-offer-to-support self-service; keep this foundation early.

**Problem:** Publisher growth requires a repeatable process that does not depend on private administrator intervention for every edit and sale.

**Proposed scope:**

- Publisher organization, team roles and merchant onboarding.
- Draft products, immutable version submissions, compatibility declarations and support terms.
- Review status, actionable rejection reasons and resubmission.
- Credit balance, reservation, order, commission, refund and sales-eligibility views.
- Version quarantine, staged updates, customer notices and rollback.
- Operational service-level and contact requirements for listed publishers.

**Business value:** expands supply and marketplace commission potential without equivalent growth in internal administrative work.

**Acceptance evidence:** publishers cannot approve themselves, alter another publisher's product or change a bound order; every published version maps to reviewed artifacts and permissions; credit funding and commission reports reconcile.

**Business metrics:** approved publisher activation, review turnaround, first-sale time, active products with sales, publisher retention and commission net of reversals.

### F14 — Versioned extension SDK and isolated integrations

**Audit status (17 November 2026):** Implemented—unverified: free CLI/sandbox and source-integrated plugins. Missing: minimum versioned API/manifest compatibility contract. Defer arbitrary uploaded-code execution.

**Problem:** Arbitrary third-party code in the game process would create unacceptable security, privacy and stability risk.

**Proposed scope:**

- Narrow documented APIs for authorized reports, events, themes and external services.
- Versioned manifests declaring capabilities, permissions, data access, compatibility and operational requirements.
- Separate process/service execution with scoped credentials, bounded resources and explicit network permissions.
- Test fixtures, local simulator, migration guidance and sample extensions.
- Signed or digest-bound release artifacts and reproducible review packages.
- Offline behavior that does not interrupt active games during a marketplace outage.

**Business value:** enables safe third-party innovation and commercial distribution beyond first-party development capacity.

**Acceptance evidence:** an extension cannot read private cards, unrestricted SQL, platform secrets or another organizer's data; timeouts are bounded; permissions are visible; upgrades and rollback preserve customer data.

**Business metrics:** successful external integrations, compatibility failure rate, extension-caused incidents, update adoption and extension revenue.

### F15 — Bot-only developer seasons

**Audit status (17 November 2026):** Deferred: existing practice bots are not a bot-season platform.

**Problem:** A documented bot API could attract developers, but hidden bots in human games would damage trust.

**Proposed scope:**

- Separate bot-only lobby, virtual-chip seasons, public leaderboards and reproducible rules.
- API keys, action deadlines, idempotency, reconnect and rate limits.
- Same-owner restrictions and anti-collusion monitoring.
- Public bot labeling and separate statistics from human activity.
- Local deterministic simulator and replayable evaluation fixtures.
- Optional sponsored developer events only after separate legal and prize review.

**Business value:** developer acquisition, API credibility and potential paid tooling or hosted evaluation services.

**Acceptance evidence:** bots cannot enter human-only rooms; scoring and rebuy rules are deterministic; same-owner collusion controls are tested; no leaderboard counts bots as human engagement.

**Business metrics:** active developers, submitted bots, completed evaluation runs, returning teams and developer-to-operator conversion.

### F16 — Poker academy and guided practice

**Audit status (17 November 2026):** Deferred: a complete accessible academy is not established by existing practice games.

**Problem:** New players may understand an invitation but not the rules, controls or strategy, causing early abandonment.

**Proposed scope:**

- Interactive rules, hand-ranking and betting tutorials using the actual server evaluator.
- Clearly labeled practice tables with bots and no competitive ranking.
- Explainable pot-odds and hand-strength learning views outside real competitive decision assistance.
- Beginner missions linked to completing actions rather than winning at all costs.
- Localized, accessible content and mobile-first exercises.
- Organizer-authored onboarding for club-specific rules.

**Business value:** improves beginner activation and gives clubs a lower-friction way to onboard members.

**Acceptance evidence:** examples agree with engine tests, tutorial completion works by keyboard and touch, no assistance is exposed where live rules prohibit it, and localized content remains readable at enlarged text.

**Business metrics:** tutorial completion, first-game completion, beginner retention and support questions per new player.

## 7. Delivery phases and exit gates

### Next milestone M1 — Recovery-safe paid organiser pilot

**Outcome:** prove that an existing paid organiser can complete and recover a game/payment lifecycle without duplicate credits, lost Cash Chips or misleading operational status. Do not add a new game, reprice memberships, create a workspace migration or build a generic plugin runtime in this milestone.

**Why first:** our strongest recent evidence covers live normal settlement and isolated retry/side-pot cases. It does not prove what happens when the process loses its in-memory draw/hand state midway through a multi-bounty batch. Receipt reconciliation has also required manual intervention. These are bounded operational gaps in an already implemented paid product.

| Step | Deliverable | Acceptance gate |
| --- | --- | --- |
| M1.1 | DanGG sync PR from current approved OpenPoker, preserving branding; align public delivery tracker with this agreed economy/status | Public source ancestry retained, reviewed diff, CI on resulting private head, no private history published. Product owner accepts tracker wording; no merge implied by this roadmap. |
| M1.2 | Deterministic process-kill/restart test with disposable persistent SQLite | Kill before first bounty, after one bounty commits, and after payment but before acknowledgement/checkpoint. Restart preserves original draw/recipients and pays each once, or explicitly pauses the event for audited resolution. No silent redraw or assumed auto-resume. Verify ticket count, escrows, grants, burn and whole-chip supply. |
| M1.3 | Receipt recovery drill for the existing verified-funding path | Reuse one canonical payment reference; duplicate, wrong-token, late-confirmed and restored-database scenarios cannot grant credits twice. Preserve original request and actual receipt evidence. An unresolved mismatch stays in review. No new payment required for disposable fixtures. |
| M1.4 | **Verified: paid Cash Game first-hour loop** | [Live evidence](2026-11-17-paid-cash-loop-verification.md), 17 November, release `0ce0cf7`: $15 funded once; $10 setup + $5 prepaid hour; two hands, 310-chip rake including 300-chip cap; paused, all balances reconciled, collector `proven`. [Hourly renewal verified](2026-11-17-hourly-renewal-verification.md): one $5 debit, retry safety and no charge across the next paused boundary with $5 available. [Insufficient-credit recovery verified](2026-11-18-insufficient-credit-recovery-verification.md): unfunded automatic pause, rejected retries, one $5 top-up and one $5 resumed-hour debit, paused and reconciled. [Normal active-hand expiry verified](2026-11-18-active-hand-expiry-verification.md): post-expiry showdown, blocked next deal, no extra debit and reconciled chips; harness recovery documented. **Pending:** pricing-tier transitions 50→51, 100→101, 200→201, 500→501; all-in/side-pot expiry; restart recovery. |

**Owners:** DanGG implementation and test maintainer; OpenPoker maintainers for public acceptance; operator for any live payment/production decision. Assign named delivery owners at PR intake; do not invent commitments or dates here.

**Exit:** targeted fault/replay tests pass; required CI passes on exact promotion head; evidence contains reproducible commands, commit, expected/actual balances and recovery disposition. There is no open unexplained accounting discrepancy. A documentation or isolated-test pass does not certify a fresh production rollout.

### M2 — Automatic funding and measurable invitations

Implement the smallest automatic verified service-credit funding path over the existing ledgers, plus its exception queue and audit trail. Keep token/network validation and once-only settlement. Do not combine this with automated organiser-to-player withdrawals or a full workspace migration. Then complete the guest invitation flow and mobile handoff, extending taxonomy v1 with actual emitters and retention scheduling. Exit: controlled reconciliation and measured invitation-to-completed-human-game evidence.

### M3 — Contributor earning path and optional customisations

Use the existing CLI, sandbox, Rake Lab registration and review queue. Establish the minimum versioned manifest/API contract and compatibility checks; demonstrate one configured paid offer, commission, access delivery, refund isolation and support path before claiming automatic plugin earnings. Allow approved themes to coexist with preview/switch-back. Local testing and ordinary PRs remain free. Full hostile-code isolation is a separate larger project.

### M4 — Clubs, staff and hosting pilot

Implement the smallest useful organiser staff permissions and club recurring-event model. Migrate ownership only with financial isolation/rollback proof. Add branding and organiser analytics; pilot managed setup with a few supported customers before a provisioning control plane. Exit: recurring events, intentional renewal, export and safe upgrades with measured support cost.

### M5 — Optional expansion

Voice/video, creator suites, bot seasons, academy, arbitrary plugin execution and managed-hosting automation require separate adoption/cost evidence. Diamond economics now use a fixed 10,000 organiser Cash Chip issuance cost per Diamond and organiser-set resale prices, replacing the earlier 50/50 proposal. Cross-organiser tournament and settlement features remain deferred; do not advertise them as functioning.

**Creator opportunity — mobile landscape (19 November 2026): deferred.** The default mobile experience is portrait-only, including poker tables. A contributor may propose an optional landscape layout through free Play Money testing and the existing approval workflow. Acceptance must cover readable cards/stacks, unobstructed actions, keyboard access, cash/tournament layouts, rotation during an active hand without lost session state or duplicate actions, and switching back to the free portrait default. No landscape entitlement, paid listing, price or automatic layout-plugin installation is implemented by this decision. Desktop remains a separate wide-screen experience.

## 8. Commercial experiments before large builds

1. **Guest invitation pilot:** add the smallest safe guest flow and observe whether invited visitors actually complete games. Do not build a large social network before this signal exists.
2. **Paid organizer pilot:** use the existing controlled commercial process to validate that organizers pay for management and understand the service terms.
3. **Club concierge pilot:** operate recurring events with limited manual administration to learn which club controls are genuinely needed.
4. **Managed setup pilot:** provide a bounded setup service to a nontechnical organizer and record every manual step before automating provisioning.
5. **Branding pilot:** deliver one accessible independent identity and measure setup effort, support needs and customer value.
6. **Publisher pilot:** onboard a small number of trusted publishers through the existing review and ledger before opening general self-service.
7. **Media discovery:** test whether target communities value voice/video enough to justify its moderation and operating cost.

Each experiment needs a baseline, target population, success measure, stop condition and support-cost record. Avoid using raw registrations or bot hands as evidence of business traction.

## 9. Measurement framework

### 9.1 North-star measure

**Weekly active communities with returning human participants.**

An active community should require an owned community/workspace, at least two distinct human participants and successful completion of a qualifying game or event. Exact thresholds should be versioned in the analytics taxonomy. This measure resists growth based only on bots, empty tables or one-time registrations.

### 9.2 Business metrics

- **Monthly recurring revenue:** sum of active recurring commercial subscriptions, separated from one-time services and publisher credits.
- **Net marketplace commission:** captured eligible commission minus documented reversals; publisher top-ups are not sales revenue.
- **Managed-service gross margin:** managed hosting revenue minus attributable infrastructure, payment, support and operating costs.
- **Organizer activation:** a new organizer creates and successfully runs an event with human participation within a defined initial window.
- **Retention:** returning players, communities and paid workspaces measured separately.
- **Churn:** paid workspaces whose service ends under the documented definition, excluding unresolved payment exceptions from misleading success totals.
- **Support burden:** support time and incidents per active paid workspace.
- **Cash acquisition efficiency:** acquisition cost and payback should be calculated only after attribution and gross-margin data are reliable.

No revenue, margin, lifetime-value or churn target should be invented before a baseline exists.

### 9.3 Quality guardrails

Business growth must not worsen:

- hand and tournament completion;
- ledger and commercial reconciliation;
- reconnect and recovery success;
- accessibility and mobile usability;
- privacy and moderation response;
- support time per community;
- source/license compliance;
- frequency and severity of game-integrity incidents.

## 10. Principal risks and mitigations

| Risk | Business consequence | Mitigation |
| --- | --- | --- |
| Building too many features before measuring activation | Engineering cost without retention or sales | Run small pilots and phase gates |
| Guest anonymity increases abuse | Moderation cost and unsafe communities | Bounded guest identity, host controls, rate limits and reporting |
| Account-level ownership cannot support teams | Security exposure and blocked team sales | Complete workspace migration before managed multi-customer growth |
| Payment automation fails or restores stale state | Lost revenue and customer distrust | Idempotent settlement, separate ledger and provider reconciliation |
| SQLite/process-local state limits growth | Poor events and failed upgrades | Follow measured scale plan; do not claim horizontal readiness prematurely |
| Voice/video cost and moderation exceed value | Negative margins and trust incidents | Pilot, measure cost and use explicit consent/controls |
| Third-party extensions compromise game data | Severe privacy and integrity incident | Narrow APIs, isolation, version review and quarantine |
| Bots contaminate human games or metrics | Reputation damage and misleading analytics | Explicit bot-only scopes and separate reporting |
| Branding implies official or GGPoker affiliation | Legal and reputational risk | Enforce brand and asset-provenance review |
| Paid player features become pay-to-win | Community distrust | Restrict later purchases to non-gameplay value |
| Marketplace supply arrives before review/support capacity | Poor products and customer refunds | Controlled publisher onboarding and readiness requirements |
| Commercial licensing is misunderstood | Customer disputes and license violations | Sell hosting/services transparently while preserving AGPL obligations |

## 11. Recommended immediate backlog

1. Reconcile the public delivery tracker with this economy/status revision and prepare the DanGG sync PR (M1.1).
2. **Completed:** the [first-hour paid Cash Game loop](2026-11-17-paid-cash-loop-verification.md) is live-verified (M1.4 / S2). [Hourly renewal is also verified](2026-11-17-hourly-renewal-verification.md). [Insufficient-credit recovery is verified](2026-11-18-insufficient-credit-recovery-verification.md). [Normal active-hand expiry verified](2026-11-18-active-hand-expiry-verification.md), including harness recovery. Next billing evidence: all-in/side-pot expiry, pricing-tier transitions and restart recovery; do not repeat the completed paid run or inflate production usage for tests.
3. Add deterministic persistent-database restart cases around each Mystery draw/settlement checkpoint (M1.2).
4. Prove safe pause and audited resolution where automatic resume cannot be shown correct (M1.2).
5. Exercise canonical receipt replay and wrong-token/late-payment/restored-database exceptions without new money (M1.3).
6. Publish one operator-local reconciliation record with commit, balances, limits and unresolved gaps (M1 exit).
7. Implement one automatic service-credit fulfilment path and keep manual exceptions visible (M2).
8. Extend existing analytics with real commercial/invitation emitters and scheduled retention; do not claim declared events are collected (M2).
9. Deliver revocable guest invitations and mobile join/reconnect/account conversion, with human-only funnel metrics (M2).
10. Complete one contributor version-to-offer-to-payment-to-support pilot and minimum SDK contract (M3).
11. Pilot selectable reviewed themes, then club staff/recurring events and managed setup (M3–M4).
12. Keep Diamonds, automated external buybacks, large workspace migration, media and bot seasons out of M1; revisit with explicit contracts and evidence (M4–M5 or separate project).

## 12. Product decisions still requiring evidence

- Which customer segment shows the strongest willingness to pay: friend groups, clubs, educators, content creators, developers or commercial community operators?
- Do guests need full anonymous play, or is a lightweight nickname plus host approval sufficient?
- Is club retention strong enough to support recurring organizer subscriptions?
- Which managed-hosting tasks consume the most support time?
- Do customers prefer capability subscriptions, bundled workspace plans or setup plus support contracts?
- Can publishers acquire sales through the marketplace without the platform subsidizing unsustainable support?
- Is voice/video a retention driver for the target communities or an expensive niche feature?
- Does a bot developer program attract future operators without distracting from human gameplay?

These are discovery questions, not assumptions to hide in a revenue forecast.

## 13. Final recommendation

Use the existing game depth as proof of technical capability, but make the next business chapter about **helping organizers create retained communities reliably**.

The most valuable combined offer is:

> **Invite players instantly, run a branded club with recurring events, understand its health, and let OpenPoker handle the software, commerce and operational burden.**

That offer connects player growth to organizer revenue and later publisher expansion while preserving open-source rights and the explicit separation of free Play Money, service credits and organiser-scoped Cash Chips.
