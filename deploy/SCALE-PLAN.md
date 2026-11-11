# DanGG.ro production architecture and scale plan

This is the bridge from the current local Electron build to a 100–1,000
concurrent-player operation.

## Phase 1 — isolated single VM (launch)

- One dedicated DigitalOcean FRA1 droplet:
  - **8 vCPU / 16 GB / 160 GB** for production;
  - **4 vCPU / 8 GB** for staging.
- Docker Compose:
  - Node game server;
  - Caddy TLS;
  - SQLite volume.
- DNS: `dangg.live` public A record.
- Admin: SSH tunnel to `127.0.0.1:5198`; no public admin hostname.
- Backups: nightly SQLite `VACUUM INTO`, weekly DO volume snapshot, off-host
  copy.
- Monitoring: `/healthz`, container health, DO uptime checks, alerting on
  process, disk, TLS expiry and WebSocket failures.

This phase is appropriate for an early play-money launch and hundreds of
connected clients, depending on table count. It is **not** the 1,000-player
architecture.

## Phase 2 — PostgreSQL + Redis (100–1,000)

### Runtime shape

```text
                    ┌──────────────┐
Players ── TLS ────►│ Caddy / edge │
                    └──────┬───────┘
                           │
                 ┌─────────┴─────────┐
                 │ Node game workers │  (2–4 processes or 2 VMs)
                 └────┬─────────┬────┘
                      │         │
              PostgreSQL      Redis
              ledger/users    sessions, queues,
              hands/tourneys  pub/sub, leader lock
```

- **PostgreSQL managed service** for users, ledger, hands, tournaments,
  transactions, bonuses, reports and audit.
- **Redis** for:
  - session lookup;
  - table/tournament event pub/sub;
  - WebSocket presence;
  - Rush queues;
  - distributed locks for tournament scheduling;
  - rate limiting.
- **Node workers**:
  - HTTP/WebSocket API processes;
  - tournament scheduler worker (single leader via Redis lock);
  - payout/ledger reconciliation worker.
- **Caddy/load balancer** with WebSocket support and health checks.
- Static frontend served from CDN/object storage rather than the game process.

### Why the current build cannot do 1,000 as-is

- SQLite is a single writer.
- Table state is in one Node process.
- Tournament scheduling and Rush movement are process-local.
- Electron/embedded mode is not used in production; the VM runs the Node server.

### Migration order

1. Add PostgreSQL driver and repository layer behind the existing `db.js` API.
2. Migrate schema:
   - users;
   - sessions;
   - transactions/ledger;
   - hands;
   - tables/tournaments/registrations;
   - bonuses/claims;
   - social/notifications;
   - reports/audit.
3. Run dual-read/shadow comparisons before cutover.
4. Move sessions to Redis.
5. Add `PUBLISH`/`SUBSCRIBE` for table events.
6. Split scheduler into a leader-elected worker.
7. Add a second Node worker behind the edge and load test.
8. Retire SQLite for production; keep it for local/Electron demo.

### Capacity gates

Do not claim 1,000-player readiness until:

- PostgreSQL connection pooling and query latency are measured under load;
- Redis failover is tested;
- two workers can share table state safely;
- tournament scheduler cannot double-run;
- ledger reconciliation passes;
- backup restore is rehearsed;
- a load test sustains target WebSocket connections, actions and tournament
  scheduling without dropped events.

## Security boundaries

- Public: player site/API and WebSocket.
- Private: admin, database, Redis, SSH.
- Admin access from the Mac Studio via SSH tunnel or Tailscale; never a public
  admin subdomain.
- Play-money only until payment/legal review. NervixPay chip sales are not part
  of this phase.
- Secrets in `.env`/secret manager only; never in git or chat.

## Cost/scale decision

Recommended order:

1. Staging 4 vCPU / 8 GB.
2. Production 8 vCPU / 16 GB + managed PostgreSQL/Redis.
3. Horizontal workers only after the data layer is shared and tested.

Do not add more droplets while the game state is still process-local; that
creates split-brain tables and duplicate tournament winners.
