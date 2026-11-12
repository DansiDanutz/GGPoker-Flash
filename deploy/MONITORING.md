# Production monitoring checklist

Live site: **https://dangg.live** on Dexter. Edge: shared Traefik v3. The watchdog and
backup jobs are described in [`ALWAYS-ON.md`](ALWAYS-ON.md).

## Required

- **External uptime**: Nano checks `https://dangg.live/healthz` every 5 minutes and
  alerts Discord when Dexter is unreachable.
- **Container health**: `docker compose ps` shows `dangro-game-1` healthy.
- **Watchdog**: `~/dangro/deploy/keepalive.log` — `/healthz` probe every 2 minutes,
  restart with a 5-minute cooldown, log capped at ~1 MiB.
- **TLS expiry**: Let's Encrypt through Traefik auto-renews; check the certificate when
  investigating an edge incident.
- **Disk**: keep headroom; the SQLite volume, Docker images and build cache are the main
  growth. `/healthz` warns at 80% used (`DISK_WARN_PCT`), which the Nano monitor relays to Discord;
- **Backups**: nightly snapshot at 04:15 UTC (14 days on Dexter) and the Nano pull at
  05:00 UTC (30 days). Alert if the newest snapshot is older than 36 hours.
- **Admin tunnel**: confirm only the Mac Studio can reach `127.0.0.1:5198` on the VM.

## Useful commands

```bash
cd ~/dangro/deploy
docker compose ps
docker compose logs --tail=200 game
curl -fsS http://127.0.0.1:5198/healthz
tail -40 keepalive.log
ls -lh backups | tail -5
df -h
free -h

# edge / TLS (shared Traefik on the host)
docker logs --tail=100 crawdbot-worker-traefik-1
echo | openssl s_client -servername dangg.live -connect dangg.live:443 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

Public checks from the Mac:

```bash
curl -fsS https://dangg.live/healthz
curl -fsS https://www.dangg.live/healthz
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://dangg.live/healthz
```

## Incident rules

- Do not restart Dexter's peer services (Grafana, Prometheus, Nomad, Postgres/Redis,
  Traefik) as part of a DanGG incident.
- If the game container is unhealthy, capture `docker compose logs` before restarting.
- If the watchdog is in its 5-minute cooldown, a repeated restart will not help — read
  the logs and the database state first.
- If the database is corrupt, restore the newest verified backup and keep the failed
  database for analysis.
- If the edge is down but the container is healthy, investigate Traefik and DNS
  (`DNS.md`) before touching the app container.
- Record the incident and the exact commands used in the deploy log.
