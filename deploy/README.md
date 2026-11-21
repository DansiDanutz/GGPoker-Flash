# Production deployment (Dexter)

This directory contains the production stack for the play-money room at
**https://dangg.live**. It is separate from the Mac-local desktop shell; the same
repository builds both.

## Current live deployment

| | |
|---|---|
| Site | https://dangg.live and https://www.dangg.live |
| Host | Dexter — DigitalOcean FRA1, 2 vCPU / 8 GB, 96 GB disk |
| SSH alias | `dexter` (key-based; see `~/.ssh/config` on the Mac) |
| App path | `/home/Dexter1981/dangro` |
| Compose project | `dangro` → `dangro-game-1` |
| Image | `dangro-game:latest` |
| Port | `127.0.0.1:5198` only (public traffic enters via Traefik) |
| Database | `dangro_game-data` volume → `/data/ggpoker.db` (SQLite WAL) |
| Edge | Shared **Traefik v3** on the host, Let's Encrypt, HTTP→HTTPS |
| Docker network | `crawdbot-worker_default` (external) |
| Admin | Loopback + SSH tunnel only; no public admin hostname |
| Demo accounts | Disabled (`GGPOKER_SEED_DEMO=0`, `NODE_ENV=production`) |

Related runbooks:

- [`ALWAYS-ON.md`](ALWAYS-ON.md) — restart policy, watchdog, backups, uptime checks.
- [`DNS.md`](DNS.md) — DNS records, TLS and Traefik routing.
- [`MONITORING.md`](MONITORING.md) — monitoring checklist and incident rules.
- [`SCALE-PLAN.md`](SCALE-PLAN.md) — capacity planning beyond one SQLite writer.
- [`DEXTER-STAGING.md`](DEXTER-STAGING.md) — host-specific notes.
- [`edge/README.md`](edge/README.md) — Traefik + socket proxy: apply, verify and rollback.
- [`monitoring/README.md`](monitoring/README.md) — Prometheus scrape jobs, alert rules and the Grafana dashboard.

> Dexter also runs peer services (Grafana, Prometheus, Nomad, Postgres/Redis,
> Traefik). Never restart or reconfigure those as part of a DanGG deploy; the
> disk is the main shared constraint (~18–22 GB free).

## How the host is laid out

The host copy is **not a git checkout** — it is a file copy of the repository.
Deploys copy changed source files from the Mac and rebuild the image:

```
~/dangro/
  app/            source (src/, server/, public/, package.json, pnpm-lock.yaml)
  deploy/         compose.yml, .env, backup.sh, keepalive.sh, docs
  backups/        nightly SQLite snapshots (also pulled by Nano)
```

The official extracted assets (`app/public/assets/*`) are intentionally gitignored.
They must exist on the host for the real table art; otherwise the build falls back to
CSS/brand placeholders.

## Deploying a change

From the Mac, after the change is merged to `main` and CI is green:

```bash
deploy/deploy.sh --dry-run      # list what would change on Dexter
deploy/deploy.sh                # deploy origin/main (or: deploy/deploy.sh <sha>)
```

The script:

1. verifies the commit and push CI against the public release source;
2. uploads the committed archive to a private, per-run staging directory on the host;
   unchanged files can share disk blocks with the existing release via rsync hard links;
3. takes the host maintenance lock before tagging the rollback image or changing live
   files. It checks the installed watchdog against the operator's committed DanGG
   version, and keeps that watchdog, lock file, backups and host configuration in place;
4. mirrors the release, builds it, and recreates the game service under the same lock;
5. from the rollout host, polls the configured public health URL until it reports the
   requested commit or the 180-second deadline expires. The lock is held throughout.
   The host needs Bash, util-linux `flock`, rsync, curl, and Python 3.

See [watchdog installation](ALWAYS-ON.md#watchdog) before the first locked rollout.
Dry runs do not take the lock or create host staging directories.

Check what is running at any time:

```bash
curl -fsS https://dangg.live/healthz   # → {"commit":"<sha>", ...}
```

Deployment takes seconds of downtime after a successful build. The service worker
serves navigation network-first, so browsers and installed apps pick up the new
bundle on the next launch/reload; hashed assets are immutable.


## Rollback

```bash
ssh dexter 'cd ~/dangro/deploy && \
  docker tag dangro-game:rollback-<stamp> dangro-game:latest && \
  docker compose up -d game'
```

Alternatively restore the latest verified SQLite backup into the volume. Keep the
failed database for analysis before overwriting it.

## Backups

Nightly (04:15 UTC) via `backup.sh` using SQLite `VACUUM INTO`, encrypted to
`backup-recipient.pem` (`backups/backup-<stamp>.db.cms`), 14-day retention on Dexter;
Nano pulls the snapshots at 05:00 UTC with 30-day retention. Manual snapshot before an
upgrade:

```bash
ssh dexter 'cd ~/dangro/deploy && ./backup.sh'
```

Decrypt on the Mac with `tools/backup-decrypt.sh <file>.db.cms` (see `ALWAYS-ON.md`).

## Admin access

Admin uses a separate TLS listener. The game port, including host loopback, refuses admin requests even with a valid admin session. Production without an operator TLS configuration disables admin access. The operator must present the pinned client certificate **and** log in as an application administrator. Root, administrators of Docker, and anyone who obtains the operator private key remain trusted.

Before a rollout, provision these files outside the repository under `/etc/dangg/operator-tls`:

- `server.key` and `server.pem`: the server key and matching certificate (including its chain), valid for `localhost` with server authentication. Trust the issuing CA in the operator's browser. Do not bypass certificate warnings.
- `operator.pem`: the operator’s **public**, dedicated self-signed client certificate with client authentication usage. Keep its private key in the operator’s personal keychain, never on the VM, in a shared browser profile, or in the repository. Only this leaf is admitted. Replace the pinned certificate and restart the game to revoke or rotate it.

Make the directory root-controlled and read-only to the game container; grant its runtime UID read access to the server key, not host users generally. Compose mounts this directory read-only. Missing or invalid TLS files prevent startup: stage them before enabling the new Compose config. The SSH host login and the application admin login remain separate.

From the operator's Mac, run `./deploy/open-admin-tunnel.sh <ssh-host>`. Open **https://localhost:5197**, choose the operator client identity and log in. Port 5198 remains available for game health checks. No public admin hostname or Traefik route is needed.

Rehearse locally before rollout: ordinary game traffic should still work. Public admin traffic should be refused by the edge; direct HTTP on the game port must return 403 even with an admin token. Through the TLS tunnel, missing or unrelated client keys must fail the handshake. With the operator key, signed-out admin requests return 401; signed-in admin requests return 200. A forwarded IP or another local OS account does not grant access.

## Environment (`deploy/.env`)

| Key | Purpose |
|---|---|
| `DOMAIN` | Public domain used by the edge (`dangg.live`) |
| `GGPOKER_PUBLIC_ORIGIN` | Allowed public origin (`https://dangg.live`) |
| `GGPOKER_ALLOWED_HOSTS` | Additional host allowlist entries |
| `GGPOKER_TRUST_PROXY` | Set to 1 to enable forwarding from the exact peers listed below. |
| `GGPOKER_TRUSTED_PROXY_IPS` | Comma-separated literal proxy peer IPs; default empty. Pin the immediate Traefik peer and any trusted intermediate proxies before rollout. Each must append its observed peer or replace the header with a verified client address. Missing trust groups public rate limits under the socket peer and blocks forwarded admin requests. |
| `GGPOKER_REGISTER_LIMIT_PER_HOUR` | Accounts one client IP may create per hour (default 5) |
| `GGPOKER_LOGIN_IP_LIMIT` | Failed sign-ins one client IP may make per 15 minutes, across all accounts (default 30) |
| `GGPOKER_ADMIN_ALLOW` | Development-only IP filter when operator TLS is not configured; cannot open the production game port |
| `GGPOKER_ADMIN_PASSWORD` | Admin password (required, ≥16 chars) |
| `GGPOKER_SEED_DEMO` | `0` in production (no demo/guest accounts) |
| `NODE_ENV` | `production` |
| `PORT` | `5198` |
| `GGPOKER_BIND` | Bind address inside the container |

Keep `.env` out of git. Rotate the admin password and the DigitalOcean API token after
any provisioning work.

## Desktop client in remote mode

The signed desktop app can use the live server instead of starting a local one:

```bash
GGPOKER_SERVER_URL=https://dangg.live \
  "$HOME/Applications/DanGG.app/Contents/MacOS/GGPokerClone"
```

In remote mode the Electron shell does not spawn a local server and its CSP is limited
to the configured HTTPS/WSS origin. Admin should still use the tunnel.

## Security notes

- Keep admin on the loopback SSH tunnel; never publish `/api/admin`.
- Use the DigitalOcean Cloud Firewall as well as UFW — Docker publishes ports outside
  UFW's default rules.
- Play money only for this phase. Selling chips for real money requires payment
  integration, terms, age/geolocation checks and legal review first.

## License and corresponding source

Use `deploy/deploy.sh` to publish a CI-green commit with its full `GIT_SHA`.
The login source link and `version.json` identify that commit; `/legal/LICENSE` and
`/legal/MIT-legacy.txt` preserve the current and historical terms, with dependency
notices at `/legal/THIRD-PARTY-NOTICES.txt`. The rollout script passes the public repository it checked for ancestry and green CI.
For a direct Compose build, set `SOURCE_REPOSITORY` in the build environment.
Use the repository containing the exact `GIT_SHA`; confirm intended recipients can open
that commit. The image build refuses an unset repository and checks the bundled source
link and notices. It does not verify remote access or publish source.
See [licensing](../docs/LICENSING.md) for source obligations and archive builds.
