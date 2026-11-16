# Install an independent OpenPoker room

This guide covers the portable **web client, game server and installable PWA**.
It creates a separate Compose project and database. DanGG's existing production
stack remains in `deploy/compose.yml`; do not use its Dexter runbooks for a new room.
Desktop packaging and the DanGG desktop updater are outside this portable release.

OpenPoker is play-money software. Start with a small installation and review the
known limitations in [RELEASE.md](RELEASE.md) before opening it to players.

## 1. Clone and initialize

Use Linux or macOS with Git, Bash, Docker and the Docker Compose v2 plugin
supporting `up --wait`. Docker must be running. The container supplies Node 26 and
pnpm 10.32.1; neither is required on the host. Choose a published, CI-green source
revision. A fresh checkout must contain only committed source, so the running
build can link to its exact corresponding source.

```bash
git clone https://github.com/OpenPoker4all/OpenPoker.git
cd OpenPoker
./tools/openpoker-install.sh init
./tools/openpoker-install.sh up
```

Open **http://localhost:5198**. Create a player account to try the lobby and tables.
The installer creates `deploy/portable/.env` with mode `0600` and a random admin
password. Read `GGPOKER_ADMIN_PASSWORD` privately in that file to sign in as `admin`.
It is not printed by the installer. Production starts without the demo player and
guest accounts. The admin password seeds a new database; editing the variable
later does not reset an existing account's password.

The first build downloads the container base and dependencies. Startup waits for
the game's health check. `up` refuses an uncommitted source tree, and records the
full built Git SHA only after successful startup. The local env and backups are
ignored by Git. Do not commit credentials, player data or signing keys.

If another service uses port 5198, initialize with a different port:

```bash
./tools/openpoker-install.sh init --port 5298 --project my-poker --name 'My Poker Room'
```

Run `init` only once per configuration. It refuses to overwrite an existing env
file. Edit that private file for later configuration changes, then run `up`.
The helper makes this file authoritative for project, port, public identity and
credentials; exported deployment variables cannot override it. Only the source SHA
is supplied internally from the clean checkout during `up`. The two supported path
overrides are `OPENPOKER_ENV_FILE` and `OPENPOKER_BACKUP_DIR`.

## 2. Configure the installation identity

The portable Compose file explicitly selects `OPENPOKER_PROFILE=portable`.
Other build paths default to the existing `dangg` profile. Public identity is
compiled into the web/PWA build; changing it requires `up`, not just `restart`.
The same values are supplied at build time and runtime.

| Setting in the private env file | Purpose |
|---|---|
| `OPENPOKER_PROJECT` | Compose project and persistent volume prefix. **Keep it stable once the room has data.** |
| `OPENPOKER_PORT` | Host port, published on `127.0.0.1` only. Default `5198`. |
| `OPENPOKER_SITE_NAME` | Public installation name. Default `OpenPoker`. |
| `OPENPOKER_SITE_ORIGIN` | Absolute `http://` or `https://` origin without a path. Default `http://localhost:5198`. |
| `OPENPOKER_SITE_LOGO` | Optional local root-relative logo asset path, such as `/my-room/logo.svg`. |
| `OPENPOKER_SITE_ICON` | Optional local root-relative PWA/favicon asset path; a square 512×512 PNG is recommended for phone compatibility. |
| `OPENPOKER_SITE_IMAGE` | Optional local root-relative social preview asset path. |
| `OPENPOKER_SUPPORT_EMAIL` | Optional operator support address. |
| `SOURCE_REPOSITORY` | Public repository containing the exact deployed source commit. Forks with code changes must point to their corresponding source. |
| `GGPOKER_ADMIN_ALLOW` | Admin network allowlist. Defaults cover loopback and the Docker bridge gateway through the private published port. |
| `GGPOKER_TRUST_PROXY` | Default `0`; enable only behind a proxy that replaces client-supplied forwarding headers. |

The default portable logo/icon files are shipped under `app/public/openpoker/`.
For custom images, add them under `app/public/`, review their rights and commit
them before building. External image URLs are not supported by these settings.
Publish any covered changes and use the corresponding source repository URL.
Existing database settings and catalogs are retained; initial site/club defaults
apply to a fresh database. Update an existing room's editable settings through its
admin interface. The portable profile starts without DanGG's service catalog.

The engine still ships shared reference artwork and sounds. Profile selection is
not an asset-rights audit. Read [licensing](LICENSING.md),
[asset documentation](../app/public/assets/README.md) and [brand policy](../TRADEMARKS.md).
Normal builds use committed assets and do not require proprietary client extraction
or asset regeneration. Regenerating every asset has separate tool/input requirements.

## 3. Add your own HTTPS domain (optional)

Localhost works for a local trial. For a public site and installed phone app, use
your own HTTPS origin and an edge proxy on the same host. The game port stays
bound to loopback. This repository does not provision DNS, open firewall ports or
change an existing proxy.

The example [Caddyfile](../deploy/portable/Caddyfile.example) is for a
host-installed Caddy directly facing the internet. It blocks `/api/admin*` on the
public domain and forwards ordinary HTTP and WebSocket traffic to the private game
port. Replace the example hostname and, if needed, port. Install Caddy using its
[official instructions](https://caddyserver.com/docs/install), point the hostname's
DNS to this host, and provide ports 80/443 for its
[automatic HTTPS](https://caddyserver.com/docs/automatic-https).

Edit your private env file:

```dotenv
OPENPOKER_SITE_ORIGIN=https://poker.example.org
GGPOKER_TRUST_PROXY=1
```

Replace `poker.example.org` with your hostname, run `./tools/openpoker-install.sh up`,
then validate and load your Caddy configuration. The example replaces incoming
`X-Forwarded-For` with the directly connected client's address; see
[Caddy's proxy header documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers).
It is not a configuration for a CDN or additional proxy in front of Caddy.

Check the public origin, `/healthz`, source/license links and PWA installation.
Verify that `/api/admin/settings` receives **403** through the public domain.
Use a private SSH tunnel for administration on a remote host:

```bash
ssh -N -L 5198:127.0.0.1:5198 your-user@your-host
```

Then open `http://localhost:5198/#/admin`. Match both tunnel ports to the configured
host port if it differs. The private route remains available while the public proxy
blocks administrative APIs.

If Docker uses a custom address pool outside `172.16.0.0/12`, find the private
gateway with `docker network inspect <project>_default` and add that exact IP to
`GGPOKER_ADMIN_ALLOW`, then run `up`. Do not use `*` or expose the game port publicly
to work around an admin allowlist error.

## 4. Operate and update without resetting data

```bash
./tools/openpoker-install.sh status
./tools/openpoker-install.sh logs
./tools/openpoker-install.sh restart
./tools/openpoker-install.sh stop
```

`restart` keeps the current container and configuration; `stop` keeps both container
and volume. Run `up` again to start or apply a configuration/source change.
The named volume `<OPENPOKER_PROJECT>_game-data` stores `/data/ggpoker.db` and related
runtime data. Do not change the project name, run `down --volumes`, or delete the
volume during an update.

Before changing source revisions, make a backup and note the currently running
commit from `/healthz`. Fetch and select the published tag or commit you intend to
run, read its migration notes, then run `up` from that clean checkout. The helper
also takes a database snapshot if the game is already running, builds the new image
before replacing the container, and reuses the existing volume. A failed build
leaves the existing container running. A failed startup needs operator review; the
previous image/source and snapshot remain available.

Do not assume a previous binary can read a migrated database. For rollback, use a
documented compatible source revision; otherwise restore the saved snapshot into
an isolated recovery installation first. See the procedure below.

## 5. Back up and verify recovery

```bash
./tools/openpoker-install.sh backup
```

This uses SQLite `VACUUM INTO` in the running container, copies the consistent
snapshot to `deploy/portable/backups/` with mode `0600`, then removes only that
temporary snapshot from the live volume. It does not copy an open WAL database
file directly. A failed copy leaves the snapshot in the container for recovery.
Backups contain private player/account data. Keep the directory private and arrange
encrypted off-host copies and retention appropriate to your operation. The helper
does not upload or delete old backups.

Test recovery in a **different project and port**, keeping the original volume:

```bash
RECOVERY_ENV="$HOME/.config/openpoker-recovery.env"
OPENPOKER_ENV_FILE="$RECOVERY_ENV" ./tools/openpoker-install.sh init \
  --project openpoker-recovery --port 5298 --name 'OpenPoker Recovery'

docker compose --env-file "$RECOVERY_ENV" -f deploy/portable/compose.yml build game

# Set this to the snapshot you selected; keep the path quoted.
OPENPOKER_BACKUP='/absolute/path/to/openpoker-snapshot.db'
docker compose --env-file "$RECOVERY_ENV" -f deploy/portable/compose.yml \
  run --rm --no-deps -T --entrypoint node game --input-type=module -e '
    import { createWriteStream } from "node:fs";
    import { pipeline } from "node:stream/promises";
    import { DatabaseSync } from "node:sqlite";
    const file = "/data/ggpoker.db";
    await pipeline(process.stdin, createWriteStream(file, { flags: "wx", mode: 0o600 }));
    const db = new DatabaseSync(file, { readOnly: true });
    const result = db.prepare("PRAGMA quick_check").get();
    db.close();
    if (result.quick_check !== "ok") throw new Error("Snapshot failed SQLite quick_check");
    console.log("Snapshot copied into a previously empty recovery volume");
  ' < "$OPENPOKER_BACKUP"

OPENPOKER_ENV_FILE="$RECOVERY_ENV" ./tools/openpoker-install.sh up
```

The `wx` flag refuses to overwrite any database in the recovery volume. Use a new
project if a previous recovery attempt already created one. Recovered accounts,
passwords and room settings come from the snapshot; the recovery env's freshly
generated admin password does not replace them. Verify the restored room before
making any production switch. Keep the original database and backup for diagnosis.

## 6. Verify the release you run

The build writes its full source commit and source URL to `/version.json`; `/healthz`
reports the same commit. The login footer offers source and license information.
Check that the source URL opens without privileged access and contains that exact
commit. A source archive build must likewise supply `GIT_SHA`; the portable helper
uses an actual Git checkout to avoid guessing it.

Before a public release, execute the fresh-install, account/table, restart/backup,
branding, source and PWA checks in [RELEASE.md](RELEASE.md). A green unit/build job
alone does not prove that this Docker installation or a public HTTPS setup works.
