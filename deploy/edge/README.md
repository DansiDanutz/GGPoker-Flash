# Edge proxy (Traefik + socket proxy)

The shared Traefik edge that fronts `dangg.live` (and the other services on Dexter) runs
from a host-only compose project, kept here so it can be rebuilt from the repository.

## Where it runs

| | |
|---|---|
| Host | Dexter |
| Active directory | `/home/Dexter1981/traefik-edge` |
| Compose project | `crawdbot-worker` (historical name, kept so the existing container and certs volume are adopted) |
| Network | `crawdbot-worker_default` (shared with the game container) |
| Certs | Docker volume `crawdbot-worker_traefik_certs` → `/letsencrypt` |

`deploy/deploy.sh` copies this directory to `~/dangro/deploy/edge/` as a reference, but
**does not** run it. The live copy is the one under `~/traefik-edge`.

## Why a socket proxy

Traefik needs Docker's API to read container labels and route traffic. Mounting
`/var/run/docker.sock` into the proxy grants full control of the host's Docker daemon.

Instead, `tecnativa/docker-socket-proxy` holds the socket read-only on an internal
network (`traefik-socket`) with no published ports. Traefik talks to it over
`tcp://socket-proxy:2375`, and the proxy only allows the read endpoints Traefik uses
(`CONTAINERS`, `NETWORKS`, `SERVICES`, `INFO`, `VERSION`, `PING`, `EVENTS`).
Writes are rejected (`POST /containers/create` → 403), and `TASKS` is off.

## Apply a change

```bash
ssh dexter
cd ~/traefik-edge
sudo docker compose -p crawdbot-worker up -d
```

Then verify, in order:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://dangg.live/            # 200
curl -sS -o /dev/null -w '%{http_code}\n' http://dangg.live/             # 302
curl -fsS https://dangg.live/healthz | head -c 120                       # {"ok":true,...}
docker inspect crawdbot-worker-traefik-1 --format '{{range .Mounts}}{{.Destination}} {{end}}'
# must print only: /letsencrypt
docker logs --since 5m crawdbot-worker-traefik-1 2>&1 | grep -i error    # empty
```

## Rollback

If routing breaks after an edit, restore the pre-socket-proxy configuration — Traefik
reads the Docker socket directly again:

```bash
ssh dexter
cd ~/traefik-edge
sudo docker compose -p crawdbot-worker -f docker-compose.rollback.yml up -d
```

That recreates the container from the same certs volume, so certificates are unaffected.
The rollback file deliberately omits the socket proxy; the proxy container can be left
running or removed with `docker rm -f crawdbot-worker-socket-proxy-1`.

## Notes

- Never restart or reconfigure the other services on the host (Grafana, Prometheus,
  Nomad, Postgres, Redis) as part of an edge change.
- The ACME account email and Let's Encrypt storage path are part of the Traefik command;
  changing them forces re-issuance.
