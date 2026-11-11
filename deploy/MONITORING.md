# Production monitoring checklist

## Required

- DigitalOcean Uptime check: `https://dangg.live/healthz` every 60 seconds.
- Container health: `docker compose ps` must show `game` healthy.
- TLS expiry: `curl -vI https://dangg.live` and Caddy logs.
- Disk: alert at 75%; the SQLite volume and Docker images are the main growth.
- Backup: alert if the nightly `deploy/backup.sh` file is older than 36 hours.
- Admin tunnel: confirm only the Mac Studio can reach `127.0.0.1:5198` on the VM.

## Useful commands

```bash
cd /opt/dangro/deploy
docker compose ps
docker compose logs --tail=200 game
docker compose logs --tail=200 caddy
curl -fsS https://dangg.live/healthz
df -h
```

## Incident rules

- Do not restart Dexter/Nano peer services as part of this app.
- If the game container is unhealthy, capture logs before restarting.
- If the database is corrupt, restore the latest verified backup and keep the
  failed database for analysis.
