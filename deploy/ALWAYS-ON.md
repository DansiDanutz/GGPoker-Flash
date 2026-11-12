# Always-on operation (Dexter)

How `dangg.live` stays reachable, and how to check it. Everything here runs on
the DigitalOcean droplet `Dexter`; the Mac is not part of the serving path.

## Layers of protection

| Layer | Mechanism | Survives |
| --- | --- | --- |
| Container crash | `restart: unless-stopped` in `compose.yml` | process exit, OOM kill |
| Host reboot | `docker` service enabled at boot + restart policy | reboot |
| Hung app (process alive, not answering) | `keepalive.sh` via cron every 2 min | deadlock, stuck event loop |
| Data loss | `backup.sh` via cron at 04:15 UTC, keeps 14 days | bad deploy, corruption |
| Loss of the droplet | `nano-backup-pull.sh` on Nano, 05:00 UTC, 30 days | host loss, disk failure |
| Droplet / route / certificate outage | `nano-uptime-check.sh` on Nano every 5 min → Discord | anything Dexter cannot report itself |
| TLS expiry | Let's Encrypt through Traefik, auto-renewed | certificate expiry |
| DNS | `dangg.live` → `46.101.219.116` at Namecheap | — |

The watchdog only helps while Dexter is alive. The last two rows run on the
**other** droplet, so they still notice when Dexter is unreachable.

Docker's own healthcheck (`/healthz`, every 30s) only *marks* a container
unhealthy — it does **not** restart it. That gap is why the watchdog exists.

## Watchdog

`keepalive.sh` probes the app over loopback. If `/healthz` is not 200 it runs
`docker compose restart game`, waits 20s and probes again. It has a 5-minute
cooldown so a genuinely broken build does not get restarted in a tight loop, and
it keeps `keepalive.log` bounded at ~1 MiB.

Install or reinstall on the host:

```bash
scp deploy/keepalive.sh dexter:~/dangro/deploy/keepalive.sh
ssh dexter 'chmod +x ~/dangro/deploy/keepalive.sh'
ssh dexter 'crontab -e'
```

```cron
*/2 * * * * /home/Dexter1981/dangro/deploy/keepalive.sh >/dev/null 2>&1
15 4 * * * cd /home/Dexter1981/dangro/deploy && ./backup.sh >> backups/backup.log 2>&1
```

Both entries are installed on Dexter as of 2026-11-11.

## Off-host backups (Nano)

Dexter snapshots the database nightly. Nano pulls those snapshots so a lost
droplet does not mean lost data:

```bash
scp deploy/nano-backup-pull.sh nano:~/dangro-backup-pull.sh
ssh nano 'chmod +x ~/dangro-backup-pull.sh'
```

```cron
0 5 * * * /home/Nano1981/dangro-backup-pull.sh >> /home/Nano1981/dangro-backup-pull.log 2>&1
```

Nano keeps 30 days under `~/dangro-backups`; Dexter keeps 14. The pull mirrors
with `--delete`, so the copy never drifts from the source. It authenticates with
Nano's existing key, which is trusted by Dexter's `authorized_keys`, and needs one
firewall rule on Dexter: `ufw allow from 157.230.23.158 to any port 22` (Nano's
public IP only).

Restore: copy any `backup-*.db` back into the `game-data` volume as
`ggpoker.db` and restart the container.

## External monitoring (Nano)

Dexter's watchdog cannot report its own death. Nano checks the public endpoint
every 5 minutes and alerts on **state changes only**, so a long outage does not
spam the channel:

```bash
scp deploy/nano-uptime-check.sh nano:~/danggro-uptime-check.sh
ssh nano 'chmod +x ~/danggro-uptime-check.sh'
```

```cron
*/5 * * * * /home/Nano1981/danggro-uptime-check.sh >/dev/null 2>&1
```

The Discord webhook is read at runtime from the host's existing
`~/droplet-discord-alert.sh` rather than copied into this repo.

## Checking it

```bash
# from the host
ssh dexter 'curl -fsS http://127.0.0.1:5198/healthz && docker compose -f ~/dangro/deploy/compose.yml ps'

# from anywhere
curl -fsS https://dangg.live/healthz

# what the watchdog has been doing
ssh dexter 'tail -20 ~/dangro/deploy/keepalive.log'

# backups
ssh dexter 'ls -lh ~/dangro/deploy/backups | tail -5'
```

## Verified on 2026-11-11

- `docker stop dangro-game-1` → `/healthz` unreachable → `keepalive.sh`
  restarted the container → `/healthz` 200 again in ~20s.
- `backup.sh` produced a consistent 228 KB snapshot (`VACUUM INTO`, so it is
  safe while the server is running).
- `nano-backup-pull.sh` copied that snapshot to Nano (232 KB on arrival).
- Uptime check: healthy run exits 0 and records `200`; a simulated unreachable
  endpoint logged `ALERT DOWN` and flipped state to `000`; a simulated recovery
  logged `ALERT RECOVERED`.
- The Discord webhook accepted a labelled test message (HTTP 204).
- Certificate valid to 2027-02-09, issued by Let's Encrypt.

## Known risk: disk headroom

Dexter sits at **~85% disk (≈15 GiB free)** while also running Grafana,
Prometheus, Nomad, Postgres/Redis and a crawler. A full disk takes the site down
in a way no watchdog can fix. Keep an eye on `df -h /` and prune old backups if
it drops further.

Longer term, this host was never sized for the game server — see the fleet
assessment in `deploy/README.md` for the dedicated-host recommendation.


## Disk headroom (Docker)

The 96 GB droplet can fill with Docker build cache and one `dangro-game:rollback-*` tag per
deploy. A full disk stops `docker compose build` with `no space left on device` and leaves
the previous container running. `deploy/prune-docker.sh` keeps the newest three rollback
tags, prunes the build cache and dangling images, and prints the resulting filesystem line.

Run it weekly (and after any `no space left on device` build):

```cron
17 4 * * 1 /home/Dexter1981/dangro/deploy/prune-docker.sh >> /home/Dexter1981/dangro/deploy/prune.log 2>&1
```

The admin **Platform** section shows `Disk free` / used percent (the container overlay is
backed by the host root filesystem), so pressure is visible before a deploy fails.


## Tournament recovery soak

`node tools/tournament-soak.mjs --cycles 2` starts disposable servers on random ports with
temporary databases, creates a two-player event, waits for a settled-hand snapshot,
`SIGKILL`s the server, restarts it on the same data directory and asserts that the room,
both players and the original table id come back. Run it after changing
`tournament-room.js`, restart recovery or the tournament scheduler; it never touches the
production database or the 5197/5198 servers. Exit code 1 means at least one cycle failed.
