# Dexter staging deployment

Status: **running on Dexter as a private staging server**, not public production.

## What is running

- Path: `/home/Dexter1981/dangro`
- Compose project: `dangro`
- Container: `dangro-game-1`
- Image: `dangro-game`
- Port: `127.0.0.1:5198` on Dexter only
- Database volume: `dangro_game-data`
- Admin password: generated on the VM in `deploy/.env`
- Demo accounts: disabled (`GGPOKER_SEED_DEMO=0`)
- Caddy: **not started** (ports 80/443 belong to the existing Traefik)
- Traefik: **not modified**

## Verify from Dexter

```bash
cd ~/dangro/deploy
docker compose ps
curl -fsS http://127.0.0.1:5198/healthz
docker compose logs --tail=100 game
```

## Mac Studio admin access

```bash
ssh -N -L 5198:127.0.0.1:5198 dexter
```

Leave that terminal running and open:

```text
http://127.0.0.1:5198
```

Stop the local Mac Electron app first if it already owns 5198:

```bash
pkill -9 -x GGPokerClone
```

## Player access

Players cannot reach this staging server yet. `dangg.live` still points to
Namecheap parking and no public TLS route exists. Do not point DNS at Dexter
until the Traefik TLS decision is made.

## Why this is staging

Dexter is 2 vCPU / 8 GB and ~80% disk after the image build. It already runs
fleet services. It is acceptable for functional testing and Mac Studio admin
verification, not the 100–1,000-player production target.

## To expose publicly

Preferred: a dedicated VM with Caddy (see `README.md` and `SCALE-PLAN.md`).

Alternative on Dexter: add a Traefik router for `dangg.live` and enable ACME
TLS in the existing Traefik. That requires a planned Traefik restart and a DNS
A record; it must be treated as a peer-service change, not an automatic step.
