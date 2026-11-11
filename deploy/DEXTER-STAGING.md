# Dexter public deployment

Status: **live on Dexter** for play-money testing at production scale limits.

Public URL: **https://dangg.live** (and https://www.dangg.live)

## What is running

- Path: `/home/Dexter1981/dangro`
- Compose project: `dangro`
- Container: `dangro-game-1`
- Image: `dangro-game`
- Port: `127.0.0.1:5198` on Dexter (public traffic enters through Traefik)
- Database volume: `dangro_game-data`
- Admin password: generated on the VM in `deploy/.env`
- Demo accounts: disabled (`GGPOKER_SEED_DEMO=0`)
- Caddy: **not started** (ports 80/443 belong to the existing Traefik)
- Traefik: **routing dangg.live** with Let's Encrypt TLS; shared configuration
  change is documented in `DNS.md`

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

Open:

```text
https://dangg.live
```

HTTP redirects to HTTPS. The Let's Encrypt certificate covers `dangg.live` and
`www.dangg.live`. DNS records and verification commands are in `DNS.md`.

## Capacity

Dexter is 2 vCPU / 8 GB with ~18 GB free disk and also runs fleet services. It
is live for play-money testing, not the recommended host for 100–1,000
concurrent players. See `README.md` and `SCALE-PLAN.md` before paid acquisition.

## Shared Traefik

Traefik now has the Let's Encrypt HTTP challenge resolver enabled. Its previous
compose file was backed up before the change. After recreating the game
container, Traefik may need a refresh/restart before it picks up the new
container address; verify with the commands above.
