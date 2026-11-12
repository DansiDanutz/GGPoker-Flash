# Production deployment (Dexter)

This directory contains the production stack for the play-money room at
**https://dangg.live**. It is separate from the Mac-local desktop shell; the same
repository builds both.

## Current live deployment

| | |
|---|---|
| Site | https://dangg.live and https://www.dangg.live |
| Host | Dexter — DigitalOcean FRA1, 2 vCPU / 8 GB, 96 GB disk, `46.101.219.116` |
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

From the Mac, with `main` up to date:

```bash
# 0) optional but recommended: tag the running image for rollback
ssh dexter 'cd ~/dangro/deploy && docker tag dangro-game:latest dangro-game:rollback-$(date +%Y%m%d-%H%M)'

# 1) copy the changed files (no git on the host; rsync or ssh cat)
cd app
for f in src/pages/Login.tsx src/styles.css …; do
  ssh dexter "cat > ~/dangro/app/$f" < "$f"
done

# 2) rebuild and recreate (build first — the old container keeps serving if it fails)
ssh dexter 'cd ~/dangro/deploy && docker compose build game && docker compose up -d game'

# 3) verify
curl -fsS https://dangg.live/healthz
curl -fsS https://dangg.live/api/lobby | head -c 200
ssh dexter 'cd ~/dangro/deploy && docker compose ps'
```

Deployment takes seconds of downtime after a successful build. The service worker
serves navigation network-first, so browsers and installed apps pick up the new
bundle on the next launch/reload; hashed assets are immutable.

If a deploy introduces new static files under `app/public/`, copy them before the
build. Do not copy `node_modules`, `dist`, or `server/data` from the Mac.

## Rollback

```bash
ssh dexter 'cd ~/dangro/deploy && \
  docker tag dangro-game:rollback-<stamp> dangro-game:latest && \
  docker compose up -d game'
```

Alternatively restore the latest verified SQLite backup into the volume. Keep the
failed database for analysis before overwriting it.

## Backups

Nightly (04:15 UTC) via `backup.sh` using SQLite `VACUUM INTO`, 14-day retention on
Dexter; Nano pulls the snapshots at 05:00 UTC with 30-day retention. Manual snapshot
before an upgrade:

```bash
cd ~/dangro/deploy
docker compose exec -T game node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync('/data/ggpoker.db'); db.exec(\"VACUUM INTO '/data/backup-$(date +%Y%m%d-%H%M%S).db'\"); db.close();"
docker compose cp game:/data/backup-YYYYmmdd-HHMMSS.db backups/
```

## Admin access

There is no public admin hostname. From the Mac:

```bash
ssh -N -L 5198:127.0.0.1:5198 dexter
# then open http://127.0.0.1:5198 and log in as admin
```

Through Docker's published port the request arrives from a Docker network gateway (inside `172.16.0.0/12`), which the `GGPOKER_ADMIN_ALLOW` allowlist admits.
The admin password is `GGPOKER_ADMIN_PASSWORD` in `deploy/.env` (≥16 characters).
Do not add an `admin.dangg.live` DNS record.

## Environment (`deploy/.env`)

| Key | Purpose |
|---|---|
| `DOMAIN` | Public domain used by the edge (`dangg.live`) |
| `GGPOKER_PUBLIC_ORIGIN` | Allowed public origin (`https://dangg.live`) |
| `GGPOKER_ALLOWED_HOSTS` | Additional host allowlist entries |
| `GGPOKER_TRUST_PROXY` | Trust proxy headers from Traefik |
| `GGPOKER_ADMIN_ALLOW` | CIDR allowlist for admin endpoints. If unset in production, only loopback and Docker networks (`172.16.0.0/12`, the SSH tunnel path) are admitted |
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
