# Development, approval and releases

## Repository roles

- **OpenPoker4all/OpenPoker** is the public upstream. Its `main` contains accepted
  shared software; contributors submit public PRs there.
- **DansiDanutz/DanGG** is the private integration repository for the DanGG team.
  Develop marketplace features and shared improvements on feature branches here,
  test them, then promote selected changes to OpenPoker for approval.
- **DanGG.live** is production. A private branch or successful DanGG CI run does
  not authorize deployment. Release an explicitly approved public main commit
  after CI, backup and the deployment checks.
- **GGPoker-clone** is a reference for selected improvements. Port one reviewed
  feature at a time with its tests; do not merge unrelated application histories.

DanGG and OpenPoker are separate repositories, not a GitHub fork pair. Preserve
both histories. Synchronize by merging public main into a DanGG sync branch and
opening a DanGG PR; never overwrite main or blanket-publish private history.
Keep DanGG branding commits separate from shared feature commits.

## Who approves?

OpenPoker maintainers accept, request changes or reject public PRs. The repository
owner controls maintainer access; `@DansiDanutz` is the current CODEOWNERS contact.
CI is necessary but is not a product approval. Agents may prepare and test work;
merging and production deployment require the operator's explicit decision.
Contributors do not merge their own work merely because tests pass.

There is no vote required from every OpenPoker user. Each independent operator
chooses which published version to install and when to upgrade. Staying on an
older version does not prevent upstream development. Review migration notes,
back up persistent data and test upgrades before changing a running installation.
Older versions do not automatically receive new fixes or features.

## Improvements versus optional alternatives

A shared correction or replacement must demonstrate its benefit against the
current behavior and pass regression tests. Maintainers approve the tradeoff;
a contribution is not accepted just because its author calls it better.

An alternative such as a table theme need not replace the default or suit every
player. Review readability, contrast/accessibility, phone layouts, performance,
compatibility, rights to the assets and the ability to switch safely. Approved
alternatives can be offered as named choices with creator attribution.

The intended marketplace experience is free Play Money preview, an explicit
choice of an optional product, payment only for a configured paid offer, and
activation with a way to switch back. This policy does not claim that a generic
marketplace theme installer or automatic royalties already exist. Implement and
verify those product capabilities before advertising them as available.

## DanGG development

For a new developer clone (respect the machine's storage policy):

```sh
git clone https://github.com/DansiDanutz/DanGG.git
cd DanGG
git remote add openpoker https://github.com/OpenPoker4all/OpenPoker.git
```

Existing shared worktrees must keep their current remotes. Add a `dangg` remote
if needed and use explicit remote names; do not rename another agent's `origin`.
The commands below use `dangg` for the private repository. In a fresh clone,
replace `dangg` with `origin`, or add the `dangg` alias.

Before a feature, fetch both repositories. If public main has advanced, complete
the sync PR first. Start the feature from the synchronized private main:

```sh
git fetch openpoker main
git fetch dangg main
git switch -c feat/my-feature dangg/main
git config branch.feat/my-feature.pushRemote dangg
node openpoker.mjs doctor
# Run setup only when dependencies are missing or the lockfile changed.
node openpoker.mjs sandbox
```

The existing sandbox provides browser and server development with temporary
Play Money data, loopback binding and paid enforcement off. Do not use customer
accounts, payment credentials or the production database. It is local staging;
this workflow does not provision a second public hosting service. Paid ledger
behavior is tested with disposable fixtures in the server suite.

Keep each shared feature in focused commits. Push explicitly to DanGG, open a
DanGG PR and run its CI and affected user-flow tests. Private acceptance permits
integration in DanGG; public upstream acceptance remains a separate decision.

## Promote an approved feature

Start a public branch from the latest OpenPoker main, then cherry-pick only the
reviewed shared feature commits, preserving authorship. Do not merge DanGG main
wholesale into public main: it may contain branding, experiments and private
workflow details. Inspect the entire diff for credentials, personal data and
unrelated changes before pushing.

```sh
git fetch openpoker main
git switch -c upstream/my-feature openpoker/main
git cherry-pick -x <reviewed-feature-commit>
git diff openpoker/main...HEAD
# Re-run the required checks against this public branch.
git push openpoker HEAD:refs/heads/upstream/my-feature
gh pr create --repo OpenPoker4all/OpenPoker --base main --head upstream/my-feature
```

Contributors without upstream write access push to their own public fork and
open the same kind of PR. They do not need DanGG access. Follow [CONTRIBUTING](../CONTRIBUTING.md)
for DCO, rights and verification. Never invent another author's sign-off.
If GitHub PR registration is required for a marketplace plugin, use its public
OpenPoker PR number, not its private DanGG review number.

After approval and public CI, a maintainer merges the PR. Fetch the resulting
public main and merge it back through a DanGG sync PR. Test the resulting tree;
resolve cherry-pick overlaps without dropping either side's changes. Use merge
commits for synchronization so the public main remains an ancestor of DanGG.
Feature PRs may use the repository's normal merge policy.

Production is built from the approved public commit, not the private integration
commit. `deploy/deploy.sh` fetches public OpenPoker main explicitly and checks its
public main push CI even when run from a DanGG clone. It remains subject to an
explicit production decision and backup procedure. Preserve the source link and
license notices for the exact released version. DanGG-only branding that must
ship in production needs its own reviewed public change before that release.

## Contributor recognition and earnings

**Build it. Test it. Get approved. Earn when customers pay to use your plugin or
customisation.** This is the standing contributor message.

Recognize accepted authors in Git history and their publisher listing. Local
creation and Play Money testing stay free. The $9 Contributor membership applies
to official marketplace submission, not ordinary open-source contributions.

Code approval and commercial publication are distinct. Follow the
[submission and approval flow](CONTRIBUTOR_SANDBOX.md): verify the author, approve
the publisher and submitted public PR, merge and release the registered plugin,
then approve and publish its marketplace listing. Record the product's price,
license, support/refund terms and publisher identity before offering paid access.

Approved publishers are earning contributors or revenue-sharing partners, not
company shareholders by virtue of approval. Do not promise company equity,
voting rights, guaranteed earnings or payment for every free use or merged fix.
The agreed marketplace model charges a 20% platform commission on eligible paid
sales, with rounding and settlement defined by [commerce](MARKETPLACE.md).
Do not describe that as automatic royalties: new plugin listings currently use
quote/manual access until their paid offer and settlement are actually configured.
Advertisements must distinguish that current capability from planned automation.

## Verification and repository settings

Both repositories use the same CI: server tests, typecheck/build, source/notices
verification and the three Chrome smoke suites. CI artifacts identify the actual
repository; private build links are for authorized reviewers only.

Main branches should reject deletion and force pushes and require PRs plus
**Server tests** and **Typecheck and build**. Check live GitHub rules: they are
repository settings, not inherited by syncing Git. Document any plan or permission
restriction rather than claiming the policy is enforced when it is not.
