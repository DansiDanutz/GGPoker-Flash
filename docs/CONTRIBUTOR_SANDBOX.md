# Contributor Play Money workflow

Anyone can clone OpenPoker and change browser UI, server game rules, or both. Local development and Play Money testing are free. A $9/month Contributor membership is required to submit a plugin for official marketplace listing and revenue participation; ordinary open-source PRs do not require a subscription.

Guests see the free game experience. Signed-in accounts also have Contributor, Organiser and Marketplace workspaces. The Marketplace and Contributor workspace link to free Play Money trials for the three implemented management plugins and all shipped contributor registrations. Planned products are not executable trials.

## Run the full app locally

Use the repository's supported Node version (26) and pnpm (10.32.1). Clone or fork the source into your own development machine or VM, then:

```sh
node openpoker.mjs doctor
node openpoker.mjs setup
node openpoker.mjs sandbox
```

The command starts the actual game server plus Vite, each on an available loopback port. The terminal prints the URL and a randomly generated temporary admin password. Use that admin or create ordinary test accounts. Seeded balances are virtual. Hosting is unrestricted by paid memberships inside this local sandbox.

Each run has a new database and Vite cache in an OS temporary directory. The launcher sets billing, organizer Cash Chips and NervixPay funding off and does not inherit payment credentials or the operator's data directory. Ctrl+C stops both processes and removes that run's data. A hard machine crash may leave that temporary directory; its printed location can be inspected before removal. For a remote VM, use SSH port forwarding to the printed port; the launcher deliberately does not bind publicly.

Browser edits hot-reload. Restart after server edits; the new run gets fresh test data. Keep code changes and durable test fixtures in the repository, not in the temporary database. This is a development environment for source you choose to execute, not a security boundary for hostile code. Use a disposable VM when testing code you do not trust.

On a paid hosted installation, the hosting dialog also offers **Play Money · free testing**. These resources persist on that installation, use virtual player balances, have the normal eight-resource account limits, and never debit service credits or organizer Cash Chips. Their economy is fixed at creation. Billing actions cannot convert them into paid resources. Organizer games keep their existing paid setup, hourly tiers, and separate chip ledger.

## Build a plugin

Use existing React components and game server modules rather than a special uploaded-code SDK. A plugin may introduce a UI feature, a new game, or server rules. Add the actual integration and tests with the source change. Never route Play Money through organizer chip, payment, or withdrawal code.

For a marketplace plugin, add a descriptor to `app/server/contributor-plugins.js` in the same PR:

```js
{
  id: 'my-game',
  name: 'My Game',
  summary: 'What players can try.',
  version: '1.0.0',
  prNumber: 123,
  playPath: '/my-game?mode=play_money',
}
```

Create the PR first to obtain its number, then add that number before final testing. The internal `playPath` must open an implemented free mode. The descriptor is not a runtime loader: the PR must wire the browser route, server handlers, permissions, game behavior, cleanup and tests. No user-submitted source is imported by the production server. Maintainers review the registered route and both money boundaries before accepting it.

Include tests for the behavior your plugin changes: authorization, invalid input, chip conservation, rake limits, repeated actions, disconnect/rejoin and restart recovery where applicable. Run the affected tests, the full server suite, type-check and browser checks. Record a reproducible Play Money test procedure in the submission notes.

## Submit, review, merge and activate

1. Open a ready-for-review PR targeting `OpenPoker4all/OpenPoker:main`. The latest **CI** workflow must succeed on its exact head commit. Failed, pending, missing or unavailable GitHub verification blocks submission.
2. On the official installation, activate Contributor membership and get the publisher profile approved. In Contributor, submit the plugin ID, upstream PR URL and test notes. Local testing stays free; there is no automatic charge for submitting.
3. Maintainers review source and tests using the normal GitHub process and merge accepted work. The application never merges a PR automatically. A changed PR head needs a new submission; old records cannot silently approve new code.
4. In Admin → Marketplace → Pluginuri, an administrator verifies the PR author's ownership of the contributor account and records an approval reason. Approval requires a merged PR and successful CI on the submitted head.
5. Deploy the reviewed source through the normal release process. **Publish and activate** checks GitHub again and requires the matching plugin ID/PR registration in the running release. It publishes the marketplace listing and records that version against the contributor account in one transaction. Approval alone does not publish.
6. Administrators can revoke a published listing with a recorded reason. The generic catalog editor cannot bypass the contributor release workflow. Source already merged into the AGPL repository remains available for local use.

GitHub identity is confirmed by the administrator, not inferred from the user's typed name. A cloned installation maintains its own users and approval database; it cannot activate a contributor account on the official service. Official submissions must be made while signed in to the official service.

New plugin listings use the existing quote/manual-access model. This change does not invent per-plugin prices, automatically charge plugin purchases, or enable royalties/checkout. The agreed publisher commission and service-credit system remain separate from free Play Money tests.

## Operator verification

The GitHub verifier uses fixed upstream endpoints, a ten-second timeout and public read access. A GitHub outage or public API rate limit prevents new submission/approval/publication; it does not execute a client-supplied success report. It uses [PR metadata](https://docs.github.com/en/rest/pulls/pulls) and the latest [CI workflow run for the submitted head](https://docs.github.com/en/rest/actions/workflow-runs).

Before a production rollout, back up the SQLite database and run CI plus the browser smoke suites. Existing rows get `play_money=0`, preserving their paid lifecycle. The new tables and columns are additive. Keep the previous image and database backup for rollback. A production deployment requires explicit operator approval.
