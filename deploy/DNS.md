# dangg.live DNS cutover

Registrar: **Namecheap**  
Nameservers: `dns1.registrar-servers.com`, `dns2.registrar-servers.com`

## Before cutover

Verify the new VM is healthy:

```bash
curl -fsS http://<VM_IP>:80/healthz
```

The game port `5198` must not be public.

## Records to set after the VM IP is known

In Namecheap → Domain List → dangg.live → Advanced DNS:

| Type | Host | Value | TTL |
|---|---|---|---|
| A | `@` | `<VM public IPv4>` | 300 |
| CNAME | `www` | `dangg.live.` | 300 |

Delete the existing Namecheap parking A/CNAME records for `@` and `www`.

Leave existing MX and SPF records intact unless email is being retired.

## Verify

```bash
dig @1.1.1.1 dangg.live A
curl -I https://dangg.live
```

Allow up to the TTL plus a few minutes. Caddy will retry ACME issuance once the
A record points to the VM.

## Rollback

Restore the previous parking A record (`162.255.119.244`) and delete the
`www` record; existing MX/SPF records are untouched. Admin is not a public DNS
record and must be reached through the SSH tunnel.
