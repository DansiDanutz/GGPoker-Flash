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
| TLS expiry | Let's Encrypt through Traefik, auto-renewed | certificate expiry |
| DNS | `dangg.live` → `46.101.219.116` at Namecheap | — |

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
- Certificate valid to 2027-02-09, issued by Let's Encrypt.

## Known risk: disk headroom

Dexter sits at **~85% disk (≈15 GiB free)** while also running Grafana,
Prometheus, Nomad, Postgres/Redis and a crawler. A full disk takes the site down
in a way no watchdog can fix. Keep an eye on `df -h /` and prune old backups if
it drops further.

Longer term, this host was never sized for the game server — see the fleet
assessment in `deploy/README.md` for the dedicated-host recommendation.
