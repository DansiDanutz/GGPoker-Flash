# Continuous integration

Every push to `main` and every pull request runs the `CI` workflow
(`.github/workflows/ci.yml`):

| Job | What it runs |
| --- | --- |
| **Server tests** | `node --test server/*.test.js` in `app/` |
| **Typecheck and build** | `tsc --noEmit`, then `vite build` |

Electron's binary download is skipped in CI (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`)
because neither job needs it.

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
