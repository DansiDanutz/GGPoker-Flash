# Continuous integration

Every push to `main` and every pull request runs the `CI` workflow
(`.github/workflows/ci.yml`):

| Job | What it runs |
| --- | --- |
| **Server tests** | `node --test server/*.test.js` in `app/` |
| **Typecheck and build** | `tsc --noEmit`, then `vite build` |

Electron's binary download is skipped in CI (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`)
because neither job needs it.

## Opt-in tournament soak (`SOAK=1`)

`tools/soak-tournament.mjs` plays a whole multi-table tournament with bot
entrants through the real `TournamentRoom` and `PokerTable` code on a virtual
clock (tables tick every 260 ms and the room sweeps every 2 s, as in
`app/server/index.js`). It is **not** part of `npm test` and is **not** wired
into `ci.yml`. On every sweep it checks chip conservation, that no player sits
on two tables or goes missing, unique finishing places, and that every table
break completes; at the end it checks places N..2 plus one winner and that the
payouts sum to the prize pool. It exits `0` when every run passes, `1` on any
breach (with a failure summary) and `2` on bad arguments.

```bash
node tools/soak-tournament.mjs                       # 60 entrants, 6-max, blinds every 1 virtual minute
node tools/soak-tournament.mjs --runs=3              # the plan's "3 consecutive runs"
node tools/soak-tournament.mjs --entrants=12 --quiet # quick local check
```

Options: `--entrants`, `--seats`, `--stack`, `--blind-every` (virtual minutes),
`--runs`, `--max-hours` (virtual-time cap per run), `--bot-iterations` (equity
samples per bot decision; `0` keeps the production default) and `--quiet`.
A full 60-entrant run takes about 10–20 s of wall time.

To run it in CI, add an opt-in job that only runs when the repository variable
`SOAK` is `1` (or from a manual dispatch). Do not add it to the default
required checks:

```yaml
  soak:
    if: vars.SOAK == '1'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '26'
      - run: node tools/soak-tournament.mjs --runs=3
```

The script imports only server modules with no third-party dependencies, so
the job needs no install step.

## Branch protection

`main` is guarded by the `protect-main` ruleset (id `27057638`):

- deleting the branch is refused;
- force-pushing is refused;
- **Server tests** and **Typecheck and build** are required status checks.

Because the required checks can only run after a commit exists, direct pushes
to `main` are refused with `2 of 2 required status checks are expected`.
Changes therefore land through a pull request:

```bash
git switch -c my-change
# ...edit...
git commit -am "Describe the change"
git push -u origin my-change
gh pr create --fill
gh pr checks --watch
gh pr merge --squash
```

## Emergency bypass

There is no bypass actor. An admin who genuinely must push directly has to
disable the ruleset from **Settings → Rules → `protect-main`** for the duration
of the push, then restore it to *Active* immediately.

Note that `enforcement=evaluate` is not available on this plan (it requires
GitHub Enterprise); the only non-blocking state is `disabled`, which turns the
rules off entirely. Because re-enabling by hand is easy to get wrong, capture
the current definition before changing it:

```bash
gh api repos/DansiDanutz/GGPoker-Flash/rulesets/27057638 > /tmp/protect-main.json
```

That file is the authoritative record of the rules to restore, including the
two required status checks.

Prefer the pull-request path; the bypass exists only for break-glass changes.
