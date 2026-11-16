# OpenPoker CLI

The CLI is included in the source repository and has no dependencies of its own.
It provides one entry point for browser and server contributors. Local development
and Play Money testing are free; the $9/month Contributor membership applies only
to official marketplace submission, not ordinary open-source PRs.

## First run

Install [Node.js 26 or newer](https://nodejs.org/en/download) and
[pnpm 10.32.1](https://pnpm.io/installation). With Node/npm installed, you can install
that pnpm version using `npm install --global pnpm@10.32.1`. The CLI reports missing
tools but never installs global tools automatically. Use macOS, Linux, or a Linux
distribution inside Windows Subsystem for Linux (WSL); native Windows is not supported
by this first CLI. Keep the clone and Node/pnpm installation inside WSL.

```sh
git clone https://github.com/OpenPoker4all/OpenPoker.git
cd OpenPoker
node openpoker.mjs doctor
node openpoker.mjs setup
node openpoker.mjs sandbox
```

On a fresh clone, `doctor` reports missing app dependencies. `setup` installs them
with the existing frozen pnpm lockfile. It downloads packages, runs their normal
installation hooks and requires disk space/network access. It skips the optional
Electron binary download for web contributors; desktop developers should follow the
existing Electron setup separately. Then `doctor` should pass.

Open the sandbox URL printed in the terminal. It runs the actual browser and game
server with temporary data, virtual balances and payments disabled. Browser changes
hot-reload. Restart after server edits. Ctrl+C stops it and removes its temporary
data; keep lasting fixtures in source. No production credentials or data directory
are inherited by the sandbox server. See [sandbox details](CONTRIBUTOR_SANDBOX.md).

## Short command (optional)

From the repository root, `npm link` makes `openpoker` available on your PATH using
npm's global prefix. This links your local clone; it does not publish a package.
If your global prefix is not writable or not on PATH, keep using `node openpoker.mjs`
instead. Remove the link with `npm uninstall --global openpoker-cli` when finished.
Linking multiple clones switches which clone the command uses; `openpoker doctor`
prints the selected clone. [npm link documentation](https://docs.npmjs.com/cli/v11/commands/npm-link/).

```sh
npm link
openpoker help
openpoker doctor
openpoker sandbox
```

The commands below also work as `node /path/to/OpenPoker/openpoker.mjs <command>`
from any directory, without linking or installing a root package.

| Command | Behavior |
| --- | --- |
| `help` (or no command) | Print commands, requirements and first-run guidance. |
| `doctor` | Check Node, pnpm and required app packages; exit 1 when fixes are needed. |
| `setup` | Run `pnpm install --frozen-lockfile` in `app`, skipping the Electron binary. |
| `sandbox` | Start the disposable Play Money browser and server on loopback ports. |
| `dev` | Run the existing `pnpm run dev`: persistent local app data, API on 5198 and browser on 5199. It uses your environment; use `sandbox` for isolated testing. |
| `test` | Run every `app/server/*.test.js` file with Node's test runner. |
| `test account-hub.test.js` | Run named files from `app/server`; multiple filenames are accepted. Paths, shell patterns and runner flags are not accepted. |
| `check` | Run TypeScript checking, then the complete server test suite. Stop on the first failure. |
| `build` | Build the web bundle in `app/dist`, then verify source/license build metadata. |

Commands return nonzero when a check or child process fails. The CLI does not deploy,
take payments, merge PRs or approve marketplace submissions. It runs source you trust;
use a disposable VM for untrusted plugin code.

## Before submitting a contribution

```sh
openpoker test your-feature.test.js
openpoker check
openpoker build
```

Exercise your plugin's browser/game flows and record the results. `check` covers
TypeScript and server tests; it does not run the browser smoke suites. CI runs the
additional browser checks. Follow [CONTRIBUTING](../CONTRIBUTING.md) for PRs and
[the contributor workflow](CONTRIBUTOR_SANDBOX.md) for reviewed marketplace listing.

If a command fails, start with `doctor`. Missing packages need `setup`; an unsupported
pnpm version needs the pinned version above. For ports 5198/5199 already in use,
stop your own development process or use `sandbox` (it chooses available ports).
Do not stop another user's service or delete their data to clear an error.
