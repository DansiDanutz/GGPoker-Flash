# Contributing to OpenPoker

Contributions here target the shared OpenPoker software. DanGG.live is the first
official implementation; preserve the distinction between the upstream project and
an operator's service branding and deployment configuration.

Fork the repository, create a topic branch and open a pull request against `main`.
Describe the change and verification. Preserve authors, copyright notices and
third-party licenses. Do not submit proprietary client assets, credentials or user data.

## Setup and verification

Use Node 26+ and pnpm 10.32.1. From the repository root:

```sh
node openpoker.mjs doctor
node openpoker.mjs setup
node openpoker.mjs sandbox
```

The [CLI guide](docs/CLI.md) covers the optional `openpoker` command, focused tests,
checks and builds. The sandbox uses disposable Play Money data. For normal persistent
development, the existing app commands also remain available:

```sh
cd app
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:5199 (API/WebSocket server: 5198). Committed assets are ready to
use; optional regeneration and prerequisites are in `app/public/assets/README.md`.
Hosting instructions are in `deploy/README.md` and `docs/LICENSING.md`.

Before a PR, run the required CI checks from `app/`:

```sh
pnpm test
pnpm exec tsc --noEmit -p tsconfig.json
pnpm build
```

Check affected user flows, keyboard access and mobile layouts for UI changes. With a
local server running, `pnpm smoke` performs read-only API smoke checks. Add meaningful
behavior tests and keep incidental dependency updates out. Both CI jobs must pass;
respect required reviews and branch protections. See `docs/CI.md`. Deployment uses
`deploy/deploy.sh` for CI-green main commits.

## License and Developer Certificate of Origin

Future contributions use `AGPL-3.0-only`, preserving documented third-party exceptions.
Contributors retain copyright; no assignment CLA or proprietary relicensing grant
is required or implied.

Read the official, unmodified [DCO 1.1](DCO). Certify your right to submit each future
contribution with your own sign-off:

```sh
git commit -s
```

This adds `Signed-off-by: Your Name <your-email@example.com>` using your configured
identity. Use only an identity you are entitled to certify with. Never sign for another
author, fabricate certification or rewrite others' commits. For a missing sign-off,
coordinate with its author to supply their certification; maintainers review it in
the PR. This policy does not retroactively add sign-offs to historical work.

DCO does not assign copyright or automatically authorize proprietary relicensing of
others' contributions. Separate commercial licensing requires the relevant rights;
commercial hosting under AGPL remains permitted. See [licensing](docs/LICENSING.md)
and [brand policy](TRADEMARKS.md).
