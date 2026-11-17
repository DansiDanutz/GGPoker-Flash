# OpenPoker product roadmap

**Status:** active · **Last reviewed:** 2026-11-17 · **Owner:** product
**Scope:** the open-source product plus DanGG.live as its first implementation.
**Supersedes:** the 2026-11-16 proposal (`2026-11-16-openpoker-business-feature-roadmap.md`), which remains the research basis.

This is the delivery order, not a promise of dates. A step starts only when its dependencies are
satisfied and its acceptance evidence exists.

## 1. Positioning

> **The open-source, self-hostable, mobile-first play-money platform that lets communities and
> independent operators run a complete poker experience.**

Three engines, in this order: **player activation → organizer revenue → publisher ecosystem.**
More table variants are not the growth strategy. Distribution, retention, operator trust and
repeatable fulfilment are.

**Non-goals:** real-money deposits, withdrawals, cash-value chips, live casino suppliers in the
game process, pay-to-win, hidden bots in human games.

## 2. Guardrails

- Gameplay stays play-money; the commercial ledger and the gameplay ledger never mix.
- Players never buy access to an organizer's game through an organizer product.
- Bots are labelled and confined to bot/practice surfaces; every metric splits human vs bot.
- AGPL source-offer obligations, asset provenance and the DanGG/OpenPoker brand policy hold.
- Claims in docs, pricing and marketing must point at evidence, not intent.

## 3. Where the product actually is

Verified against `main` and production on 2026-11-17 (`af3340d`, healthz healthy, billing and
organizer chips `enforce`, manual funding on).

| Capability | State | Evidence |
|---|---|---|
| Cash games, Hold'em/Omaha/Short Deck, fast-fold, Spin, tournaments | ✅ shipped | server suites, Chrome groups |
| Accounts, guest play, reconnects, spectating | ✅ shipped | `/api/auth/guest`, spectator tests |
| Private tables, invite links, waitlists | 🟡 partial | invite links exist; no host approval, revocation or QR handoff |
| Organizer memberships, chips, rake, tickets, manual buybacks | ✅ shipped | paid activation evidence, 1,313 tests |
| Marketplace, publisher profiles, contributor review queue | ✅ shipped | PR #219–#224, contributor browser flow |
| Automated checkout / fulfilment | 🟡 partial | NervixPay code present; manual funding, `checkout_enabled=false` |
| Organizations / team roles / workspaces | ⬜ absent | account `owner_id` only |
| Clubs, recurring leagues, member management | ⬜ absent | marketplace lists "club hosting" as a service, no domain model |
| Product analytics / event taxonomy | ⬜ absent | no analytics module |
| Reliability surface (status, build provenance, restore evidence) | 🟡 partial | healthz + monitoring + hourly backups; no public status view |
| Voice / video at tables | ⬜ absent | — |
| Extension SDK / isolated integrations | ⬜ absent | — |
| Managed hosting control plane | ⬜ absent | — |
| Bot API / academy | ⬜ absent | — |

## 4. North star and measures

**North star:** weekly active communities with returning human participants (owned community,
≥2 distinct humans, one completed qualifying game/event).

Supporting measures, all split human/bot:

- invitation → join → completed game conversion;
- paid organizer activation and renewal;
- checkout completion and automatic-fulfilment share;
- completed-hand and completed-event rate;
- support minutes per active workspace;
- reconciliation lag and payment exception rate.

No revenue, margin or churn target is set before a measured baseline exists.

## 5. Steps

### Phase 0 — Trust and evidence

**S1. Remove the false economy notice and fix money wording** · size S · status next
Outcome: paid users never see "inactive economy" while data loads, and Cash Chips are described
in chips, not legacy cents/play-money labels.
Acceptance: PR #215 merged and deployed; host dialog and organizer copy reviewed; screenshots at
390/1440.
Depends: —

**S2. Prove the paid loop in production** · size M · status in progress (harness merged, awaiting table evidence)
Outcome: one private table actually played end to end with operator-observed evidence.
Acceptance: hands played, rake row, hourly debit, service-credit and chip journal entries all
reconciled in one evidence file; no manual correction needed.
Depends: S1.

**S3. Event taxonomy v1, human/bot split** · size M · status shipped (v1)
Outcome: one versioned set of events (invite opened, guest joined, hand completed, checkout,
entitlement, renewal) and a way to read them.
Acceptance: dashboard totals reconcile to events; bot activity cannot inflate human activation.
Depends: —

**S4. Publish service truth** · size S · status planned
Outcome: build commit, health, backup status and known incidents visible to operators.
Acceptance: deployed source matches `/healthz`; last verified backup age shown; status page has a
documented owner.
Depends: existing monitoring and backup work.

**Phase 0 exit gate:** a paid organizer can be served end to end with evidence, and no money
surface lies about its state.

### Phase 1 — Activation

**S5. Invite-first guest funnel** · size L · status planned
Outcome: a shared link opens a mobile preview, a visitor joins with a bounded display name as a
labelled guest, the host can approve, remove and revoke, and the guest can convert to an account.
Acceptance: creation/use/revocation/expiry across browser, PWA and desktop; guest cannot forge
identity, replay a token or reach organizer actions; reconnect restores the right seat; removal
has defined settlement; works at 320–1440 px with keyboard and 200% reflow.
Depends: S3 (measurement).

**S6. Invite funnel instrumentation** · size S · status planned
Outcome: opens, join starts, joins, conversion and return are visible per invitation.
Depends: S3, S5.

**S7. Mobile share loop** · size M · status planned
Outcome: deep links for invitations, clubs, events and result cards; PWA install is optional.
Depends: S5.

**Phase 1 exit gate:** invited visitors measurably complete games, and the team can see where
they drop out.

### Phase 2 — Operator scale

**S8. Organizations, workspaces and roles** · size L · status planned
Outcome: tables, tournaments, clubs, orders and reports belong to a workspace with player,
organizer, manager, finance and read-only roles.
Acceptance: cross-workspace ID changes denied; finance cannot gain gameplay authority; removal
revokes access without erasing audit; existing resources migrate to a personal workspace.
Depends: S1–S2.

**S9. Automated NervixPay fulfilment** · size L · status planned
Outcome: customer checkout, authenticated notifications, idempotent settlement, renewals and
receipts; manual funding becomes the exception path.
Acceptance: sandbox proves wrong amounts, duplicate callbacks, late payments and restored
databases cannot unlock or double-charge; pending/confirmed/expired/refunded states are distinct.
Depends: S8 (billing identity).

**S10. Operator analytics and health** · size M · status planned
Outcome: organizers see activation, attendance, retention and owned-resource health.
Depends: S3, S8.

**Phase 2 exit gate:** a paid organizer operates without global administrator intervention.

### Phase 3 — Communities

**S11. Clubs MVP** · size L · status planned
Outcome: club profile, membership modes, roles, club-scoped tables/events, recurring schedules and
moderation. Federations stay out.
Depends: S8.

**S12. Branding, themes, custom domains** · size M · status planned
Outcome: workspace-scoped identity with preview, rollback and accessible contrast; no executable
injection and no licence/notice removal.
Depends: S8.

**S13. Managed hosting pilot** · size L · status planned
Outcome: isolated installation or workspace with guided setup, automated upgrades, backup status,
export and cancellation; pricing set only after measuring support cost.
Depends: S8–S10, capacity measurement.

**Phase 3 exit gate:** pilot clubs run recurring events and renew deliberately.

### Phase 4 — Ecosystem

**S14. Publisher self-service hardening** · size M
Versioned submissions, review states, quarantine and order history on top of the shipped
marketplace.

**S15. Extension SDK v1** · size L
Narrow versioned APIs, isolated execution with scoped credentials and bounded resources.

**S16. Bot-only seasons and academy** · size M
Separate bot lobby, public seasons, and beginner tutorials using the real evaluator.

**Phase 4 exit gate:** each item has a measured adoption hypothesis, a named owner and acceptable
support cost.

## 6. Explicitly deferred

- Real-money poker or cash-value prizes (separate legal and technical project).
- Diamonds/platform tournaments across organizers (50/50 proposal only).
- Federations/unions beyond a single club.
- Voice/video until S5–S6 show retention value and moderation cost.
- Additional game variants until activation or organizer sales justify them.

## 7. How this document stays honest

- Status changes land as part of the PR that delivers the step, never pre-emptively.
- The daily Hermes roadmap (`danslab.vercel.app/OpenPoker-roadmap`) tracks repository delivery;
  this file tracks product order. Both must agree on what shipped.
- A step without acceptance evidence stays `planned`, however much code exists.
- Re-review this file when a phase gate is reached, not on a calendar.
