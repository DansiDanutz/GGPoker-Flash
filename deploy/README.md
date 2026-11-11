# DanGG.ro production deployment

This directory is the VM-ready deployment for the existing Node/SQLite game
server. It is intentionally separate from the Mac-local Electron shell.

## Fleet assessment (2026-11-11)

Existing DigitalOcean droplets reachable over Tailscale:

| Host | CPU / RAM | Disk | Role |
|---|---|---|---|
| Dexter | 2 vCPU / 8 GB | 96 GB, ~78% used | fleet gateway, Grafana, Prometheus, Nomad, Postgres/Redis, crawler |
| Nano | 2 vCPU / 8 GB | 96 GB, ~76% used | NERVIX, n8n/worker, Nginx, Docker, Redis |

They are **not suitable as the production poker host**:

- both are already running peer production services;
- both have only ~22–24 GB free;
- 2 vCPU / 8 GB is not enough headroom for 100–1,000 concurrent players,
  tournament workers and WebSocket traffic;
- putting a public game server next to the fleet increases blast radius and makes
  upgrades/restarts unsafe.

Recommended dedicated host for the first production phase:

- **DigitalOcean Frankfurt (FRA1)**, 8 vCPU / 16 GB / 160 GB SSD, dedicated CPU
  if the budget allows;
- private VPC, DO Cloud Firewall allowing only 22 (restricted), 80 and 443;
- Caddy on the host for TLS;
- Docker Compose for the game + Caddy;
- optional managed PostgreSQL + Redis at the next scale step.

A 4 vCPU / 8 GB host is adequate for staging and an early play-money launch.
For a real 1,000-concurrent target, move the database to managed PostgreSQL and
use Redis for sessions/queues/leader election; do not run 1,000 players on one
SQLite writer.

## DNS state

`dangg.live` is registered at **Namecheap** and currently parked:

```text
NS   dns1.registrar-servers.com / dns2.registrar-servers.com
A    dangg.live -> 162.255.119.244 (parking page)
MX   eforward*.registrar-servers.com
SPF  v=spf1 include:spf.efwd.registrar-servers.com ~all
```

Once the VM has a public IPv4, replace only the parking A record and add the
admin host:

```text
A  dangg.live         <VM public IPv4>   TTL 300
A  admin.dangg.live   <VM public IPv4>   TTL 300
```

Do not remove the MX/SPF records unless the domain's email is being retired.
Caddy obtains certificates automatically once DNS resolves.

## DigitalOcean access blocker

`doctl` is installed, but its current context returns **401 Unauthorized** for
both droplet listing and account lookup. A DigitalOcean API token with
`droplet:read` and `droplet:create` (or an existing SSH-reachable new VM) is
required before a new host can be provisioned.

## Deploy

On the new Ubuntu VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out/in, then:
git clone <repo> dangro
cd dangro/deploy
cp .env.example .env
# edit DOMAIN, GGPOKER_ADMIN_ALLOW and GGPOKER_ADMIN_PASSWORD
# production refuses to seed with a password shorter than 16 characters
docker compose up -d --build
docker compose ps
curl -fsS https://dangg.live/api/lobby
```

The game container is only exposed on the internal Compose network. Caddy owns
80/443. Do not publish `5198`.

## Mac Studio admin

Admin API access is limited by `GGPOKER_ADMIN_ALLOW`. The default example allows
the Tailscale CGNAT range `100.64.0.0/10` and localhost. Caddy forwards the real
client IP through `X-Forwarded-For`, and the server trusts it only because
`GGPOKER_TRUST_PROXY=1`.

Open `https://admin.dangg.live` from the Mac Studio on Tailscale and sign in with
the admin account. Public players cannot call `/api/admin/*` even if they log in.

The player site is `https://dangg.live`.

## Desktop client in remote mode

The signed Electron app can use the VM instead of spawning a local server:

```bash
GGPOKER_SERVER_URL=https://dangg.live \
  "$HOME/Applications/DanGG.ro.app/Contents/MacOS/GGPokerClone"
```

For a packaged app launched from Finder, create a small wrapper or launchd agent
that sets `GGPOKER_SERVER_URL=https://dangg.live`. In remote mode the Electron
process does not start or own a local game server and its CSP is limited to the
configured HTTPS/WSS origin.

The Mac Studio admin should use a browser at `https://admin.dangg.live` while
connected to Tailscale; the admin API is IP-restricted independently.

## Backups

The SQLite volume is `game-data`. Take a consistent backup before upgrades:

```bash
mkdir -p backups
docker compose exec -T game node --input-type=module \
  -e "import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync('/data/ggpoker.db'); db.exec(\"VACUUM INTO '/data/backup-$(date +%Y%m%d-%H%M%S).db'\"); db.close();"
docker compose cp game:/data/backup-$(date +%Y%m%d-%H%M%S).db backups/
```

Also enable DigitalOcean weekly volume snapshots and copy backups off the VM.

## Security notes

- Keep `deploy/.env` out of git.
- Restrict admin to Tailscale; never expose `/api/admin` publicly.
- Use DO Cloud Firewall, not only UFW, because Docker publishes ports outside
  UFW.
- Rotate the DigitalOcean API token after provisioning.
- Play-money only for this phase. Selling chips for real money requires payment
  integration, terms, age/geolocation checks and legal review before launch.
