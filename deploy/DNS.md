# dangg.live live DNS

Status: **live on Dexter** (2026-11-11).

Registrar: **Namecheap**  
Nameservers: `dns1.registrar-servers.com`, `dns2.registrar-servers.com`  
Public IPv4: **46.101.219.116**

## Current records

| Type | Host | Value | TTL |
|---|---|---|---|
| A | `@` | `46.101.219.116` | Automatic / 30 min |
| A | `www` | `46.101.219.116` | Automatic / 30 min |
| TXT | `@` | existing SPF record | Automatic |

The old Namecheap parking CNAME and URL Redirect record were removed.

`www` is an A record rather than a CNAME because Namecheap rejected deleting the
old parking records while the apex A and redirect were in a conflicting state.
Both records point at the same Traefik listener and serve the same certificate.

## TLS and routing

TLS is terminated by the existing **Traefik v3** on Dexter:

- HTTP `:80` redirects to HTTPS.
- HTTPS `:443` uses a Let's Encrypt certificate for `dangg.live` with
  `www.dangg.live` as a SAN.
- The game container remains bound to `127.0.0.1:5198`; Traefik reaches it over
  the `crawdbot-worker_default` Docker network.
- UFW allows inbound `80/tcp` and `443/tcp`.

Traefik was changed to enable its Let's Encrypt HTTP challenge resolver. A
timestamped backup of the previous Traefik compose file is in
`~/projects/crawdbot-worker/docker-compose.yml.pre-dangro-*`.

## Verify

```bash
dig @dns1.registrar-servers.com dangg.live A +short
dig @dns1.registrar-servers.com www.dangg.live A +short

curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://dangg.live/healthz
curl -sS -o /dev/null -w '%{http_code}\n' https://dangg.live/healthz
curl -sS -o /dev/null -w '%{http_code}\n' https://www.dangg.live/healthz

echo | openssl s_client -servername dangg.live -connect dangg.live:443 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

Expected: HTTP `302` to HTTPS, HTTPS `200`, certificate issuer Let's Encrypt,
and both hostnames covered.

## Admin

There is intentionally **no public admin hostname**. Admin remains the SSH
tunnel to the loopback game port:

```bash
ssh -N -L 5198:127.0.0.1:5198 dexter
```

## Rollback

Restore the previous parking A record (`162.255.119.244`) and remove the `www`
A record. Existing MX/SPF records were not changed.
