# DanGG (dangg.live) Production Readiness Assessment

*   **Author:** David (orchestrator), for Dan Semenescu
*   **Status:** Revision 4, after EGM Stages 5-9. The verdict is final; the Detailed Implementation Plan is an outline and needs the Stage 9 decisions (see `implementation_readiness_report.md`) before coding
*   **Date:** 2026-11-12
*   **Code state assessed:** `origin/main` at `6861a79` (fetched 2026-11-12 19:25 UTC).
    Line references below are to that commit.
*   **Operative record for production:** [ARCHITECTURE.md](../../ARCHITECTURE.md)
    and [deploy/README.md](../../../deploy/README.md). The original design
    [dangro-clone.md](../../designs/dangro-clone.md) still describes a
    loopback-only local app (no TLS, assets not redistributed); the public
    deployment has outgrown it (see Phase 1, step 4).
*   **Operations docs:** [deploy/README.md](../../../deploy/README.md),
    [deploy/ALWAYS-ON.md](../../../deploy/ALWAYS-ON.md),
    [deploy/MONITORING.md](../../../deploy/MONITORING.md),
    [deploy/SCALE-PLAN.md](../../../deploy/SCALE-PLAN.md)

--------------------------------------------------------------------------------

## Context for a fresh reader

DanGG is a play-money online poker room served publicly at `https://dangg.live`.
The internal project name is "dangro" (container `dangro-game-1`, design doc
`dangro-clone.md`); DanGG is the public brand. It is a React 19 web client plus
one Node.js process that owns the game state, the HTTP API, the WebSocket tables
and a SQLite database. It runs as one Docker container on one DigitalOcean
droplet, **Dexter** (2 vCPU, 8 GB RAM, Frankfurt), which also hosts other
services behind a shared Traefik reverse proxy that terminates TLS. A second
DigitalOcean droplet, **Nano**, run by the same operator, holds off-host backup
copies and runs an uptime check. No real money moves: chips and tournament
tickets have no cash value.

The question: **may dangg.live be promoted as a public production service, and
if not, what is the minimum work that makes it so?** "Production ready" here
means: a stranger can sign up and play without the operator watching; the
operator can prove which commit is running and roll back to a known one; the
service can be restored after host loss within a measured time; and known
legal-takedown exposure is removed or formally accepted by the operator.

## Verdict

**Not ready for public promotion.** It is acceptable to keep running as a
low-visibility beta without promotion. Registration is open to anyone today;
there is no invite gate.

Observed passing: server tests (618/618 on `6861a79`), CI, password hashing,
TLS, security headers except HSTS, health checks, watchdogs, and an admin
allowlist that resists a forged `X-Forwarded-For`. Backup files exist on both
hosts, but a restore has never been tested.

Launch blockers: **G1** (traceable deploys), **G2** (third-party assets and
trademark), **G3** (sign-up and login abuse limits). G4-G6 ship in the same
release. G5 must pass before any public promotion.

## Evidence

Collected 2026-11-12 19:20-19:40 UTC.

| Check | Result | How measured |
|---|---|---|
| Server tests | 618 pass, 0 fail on a clean `6861a79` worktree | `node --test app/server/*.test.js` |
| CI on `main` | Last 5 runs green (server tests, `tsc --noEmit`, `vite build`) | `gh run list --branch main` |
| Dependency advisories | None in production dependencies | `pnpm audit --prod` |
| Liveness | `/healthz` 200 in 0.11 s, `ok:true`, 14 rooms, 0 stale, no warnings | `curl` |
| Deployed build | `build 20261112133548` (13:35 UTC), version `1.1.0`; no commit field. The running commit is unknown | `/healthz` |
| TLS | Let's Encrypt, valid to 2027-02-09; HTTP returns 307 to HTTPS | `openssl s_client`, `curl -I` |
| Headers | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`. **No HSTS** | `curl -I` |
| Admin surface | `/api/admin/*` returns 403 "restricted to the Mac Studio network", also with a forged `X-Forwarded-For` matching each of the 4 allow rules | `curl -H X-Forwarded-For` |
| Proxy trust | `GGPOKER_TRUST_PROXY=1`; Traefik overwrites client `X-Forwarded-For` | `docker exec printenv`, test above |
| Auth | scrypt with per-user salt, `timingSafeEqual`, 30-day bearer tokens | `app/server/db.js:21-31`, `:705-708` |
| Login limiter | Counts failed attempts per login name only | `app/server/index.js:1123` |
| Register | No limiter; credits `default_balance + welcome_bonus` (105,000 cents = $1,050 play money by default) and 5 tickets per account; minimum password length 6 | `app/server/index.js:1138-1153` |
| Shuffle RNG | `crypto.randomInt` | `app/server/poker.js:2-4` |
| Third-party assets | Extracted GGPoker art served publicly (`/assets/chrome/jackpot.png` → 200); `app/public/assets/README.md` says they are for local use only | `curl` |
| Host | Container healthy, up 6 h; disk 78 % (above the 75 % alert in `MONITORING.md`); RAM 1.5 of 7.9 GB | `docker ps`, `df`, `free` |
| Watchdog | `keepalive.sh` restarts the container on failed `/healthz` every 2 min (Dexter); uptime check every 5 min with a Discord webhook (Nano) | `crontab -l` |
| Backups | Nightly 04:15 UTC on Dexter (14 days). Nano pulls 05:00 UTC with `rsync --delete`, so it mirrors Dexter: **14 days, not the documented 30** (13 files). Every run also leaves a plaintext copy inside the `/data` volume (30 files today). Unencrypted; never restored | `ls` on both hosts, `nano-backup-pull.sh:22`, `backup.sh:12` |
| Legal pages | In-app "Terms of play" and "Privacy" modals | `app/src/pages/Login.tsx` |

## The Problem

*   **P1. The running code cannot be identified.** `/healthz` reports a build
    timestamp, not a commit. `main` has 25 commits after the deployed build,
    including chip-economy changes (Bad Beat Jackpot, PR #64). Deploys copy
    files from the operator's Mac (`deploy/README.md:60`), whose working tree
    currently has uncommitted server changes, so a deploy can ship code that CI
    never ran. Tagging a rollback image is optional in the runbook.
*   **P2. Third-party artwork and trademark on a public site.** The public site
    serves art, fonts and sounds extracted from the GGPoker client, and the
    name appears in identifiers (`GGPOKER_*` variables, `GGPokerClone`). This
    can end the service by takedown. There is no age-gating decision for the
    casino-style games (Sic Bo, slots).
*   **P3. Account and login abuse.** Sign-up has no rate limit and credits an
    unbounded number of accounts with $1,050 of play money each, which can distort
    leaderboards, tournaments and the jackpot. The login limiter is keyed by
    account only: anyone can lock out any player with failed attempts, and
    guessing one password across many accounts is not throttled.
*   **P4. No HSTS.** `deploy/Caddyfile` sets it, but the live edge is Traefik.
    `deploy/compose.yml` still defines an unused `caddy` service bound to host
    ports 80/443, which a plain `docker compose up -d` would start.
*   **P5. Recovery is untested and the admin guard fails open.** One process,
    one SQLite file, one shared host. The Nano copy can be about 25 hours old,
    and off-host retention is 14 days, not the 30 the docs claim.
    If a rebuilt host lacks `GGPOKER_ADMIN_ALLOW`, `adminNetworkAllowed`
    returns true and `/api/admin` is public.
*   **P6. Personal data.** SQLite holds email addresses, legal names and
    verification documents; backups of it sit unencrypted on two hosts.
    WebSocket auth passes the 30-day token in the URL (`/ws?token=`); Traefik
    access logging is off today (no `--accesslog` flag), so it is not recorded.
*   **P7. Six-character password minimum.**
*   **P8. Test scope.** The suite covers the server only; the client is checked
    by hand.

## Goals and Non-Goals

### Goals

*   **G1 (launch blocker, P1).** Every deploy is one CI-green commit; `/healthz`
    reports it; a rollback image is always tagged.
*   **G2 (launch blocker, P2).** The public build serves no GGPoker art, fonts,
    sounds or name, or the operator signs a written risk acceptance in
    `ARCHITECTURE.md`. An 18+ notice on the casino section.
*   **G3 (launch blocker, P3).** At most 5 registrations per IP per hour; failed
    logins limited per IP as well as per account.
*   **G4 (P4).** HSTS on the live edge; the `caddy` service removed.
*   **G5 (gate for promotion, P5).** One timed restore from the Nano backup;
    in production an empty admin allowlist means loopback only.
*   **G6 (P6).** Backups encrypted at rest; Traefik access logging stays off
    (recorded in `deploy/README.md`).

### Non-Goals

*   Real-money play, KYC or gambling licensing.
*   Horizontal scaling or leaving SQLite (`deploy/SCALE-PLAN.md` covers growth).
*   Client end-to-end tests (P8): known gap, not a launch blocker.
*   Refactoring `app/server/index.js` (about 3,000 lines).
*   Follow-ups: raise the password minimum to 8 for new passwords (P7); send
    the WebSocket token in the first message instead of the URL (P6).

## Proposed Approach

*   **Deploy (G1):** a script on the Mac refuses a dirty tree or a commit with
    no green CI run, tags `dangro-game:rollback-<date>` on Dexter, sends exactly
    that commit with `git archive <sha> | ssh dexter tar -x`, builds with
    `--build-arg GIT_SHA=<sha>`, and runs `docker compose up -d game`. The Vite
    plugin adds `commit` to `dist/version.json`, and `buildPlatformReport` /
    `buildHealthSummary` in `app/server/admin-platform.js` pass it through to
    `/healthz` (today they drop unknown fields). Git and GitHub credentials stay off the shared host.
*   **Assets (G2):** the build already falls back to CSS and brand
    placeholders when `app/public/assets` is missing (`deploy/README.md:48-50`).
    Deploy without the extracted assets, check that fonts and sounds fall back,
    and rename user-visible GGPoker strings.
*   **Limits (G3):** new `createRateLimiter` instances (`app/server/security.js`)
    keyed by `requestIp(req)`, which is trustworthy because Traefik overwrites
    `X-Forwarded-For`.
*   **Edge (G4):** Traefik headers middleware on the `dangro` router labels.

## Alternatives Considered

*   **Launch now and patch later.** Rejected: a takedown cannot be reversed by
    a later patch, and a bad deploy cannot be traced without G1.
*   **G1: Git checkout on Dexter.** Rejected: puts GitHub credentials on a
    shared host. **G1: CI builds an image and pushes it to a registry.** Viable
    later; needs a registry account and secrets in CI, which is more setup than
    the Mac-side script.
*   **G2: license the assets.** Not realistic for a hobby play-money site.
    **G2: accept the risk in writing.** Allowed by the definition, but keeps the
    takedown exposure.
*   **G3: CAPTCHA or email verification.** Stronger, but adds a third-party
    dependency or mail delivery. Revisit if the IP limit is evaded.
*   **Managed platform with Postgres and managed backups.** Would also cover G5,
    but changes the persistence model and does not address G1-G3.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| HSTS is cached by browsers for the max-age | A later HTTP-only subdomain breaks | Start with `max-age=86400` and no `includeSubDomains`; raise after a week |
| Shared NAT (mobile carriers, offices) hits the IP limit | Real players refused sign-up | Limit 5/hour per IP and a clear 429 message; a blocked player waits out the hour (there is no admin create-account route) |
| Removing assets breaks UI parts that have no fallback | Broken table or lobby visuals | Test the asset-less build locally before deploy |
| Restore drill touches production data | Data loss | Restore only onto a scratch host or local Docker |
| Admin guard change locks the operator out | No admin access | Unverified: through Docker's published port the tunnel may arrive from the bridge gateway (172.x), not loopback. Check the source address seen by the container before choosing the fallback rule |
| Encrypted backups cannot be decrypted | Restore impossible | Key held off both hosts; decryption is part of the timed drill |

## Detailed Implementation Plan

### Phase 1 — Launch blockers

1.  **G1 — traceable deploy.**
    *   `app/vite.config.ts`: read `process.env.GIT_SHA` and add `commit` to the
        `version.json` it writes.
    *   `app/server/admin-platform.js`: carry `commit` into
        `buildPlatformReport().server` and `buildHealthSummary`; test in
        `admin-platform.test.js`.
    *   `deploy/Dockerfile`: `ARG GIT_SHA` in the build stage, exported to the
        `pnpm build` step.
    *   Prerequisite: commit `deploy/prune-docker.sh` (already in Dexter's
        crontab, Mondays 04:17 UTC; already committed at `6861a79`) and bring disk under 75 %, the single alert
        threshold; align the `/healthz` warning to it. Every deploy adds a
        rollback image, and a full disk fails the build.
    *   New `deploy/deploy.sh` (runs on the Mac): `gh run list --commit <sha>
        --status success` non-empty or exit; `ssh dexter docker tag
        dangro-game:latest dangro-game:rollback-$(date +%Y%m%d-%H%M)`;
        `git archive <sha> app deploy tools` extracted into a fresh
        `~/dangro/releases/<sha>` directory (so deleted files do not survive),
        with `.env` and data volumes kept outside it; `docker compose build
        --build-arg GIT_SHA=<sha> game && docker compose up -d game`; then poll
        `/healthz` until `.commit == <sha>`.
    *   Done when `/healthz.commit` equals the deployed SHA and that SHA has a
        green CI run.
2.  **G2 — assets and name.** Delete the extracted assets on Dexter (keep a
    local copy), build, and walk the login, lobby, table and casino screens.
    Replace user-visible "GGPoker" strings. Add an 18+ line to the casino
    section and the Terms modal. If Dan chooses risk acceptance instead, record
    it in `ARCHITECTURE.md`.
3.  **G3 — abuse limits.** In `app/server/index.js`, using `createRateLimiter`:
    5 registration attempts per IP per hour; 30 failed logins per IP per 15
    minutes alongside the existing per-account limit. Tests in
    `app/server/http.test.js`: sixth register from one IP returns 429; a
    second IP still succeeds.
4.  **Record.** Amend `dangro-clone.md` non-goals and trust boundaries to say
    the service is public behind Traefik/TLS, or mark it superseded by
    `ARCHITECTURE.md`.

### Phase 2 — Same release

5.  **G4 — HSTS.** In `deploy/compose.yml`, add labels
    `traefik.http.middlewares.dangro-hsts.headers.stsSeconds=86400` and
    attach `dangro-hsts` to the `dangro` router; delete the `caddy` service
    and its volumes; move `deploy/Caddyfile` to `deploy/legacy/`.
6.  **G5 — admin guard.** In production, an empty `GGPOKER_ADMIN_ALLOW` allows
    loopback only and logs a warning at boot (`adminNetworkAllowed`); add a
    test.
7.  **G6 — backups.** `backup.sh` encrypts the `VACUUM INTO` snapshot with
    `age` to a public key whose private half is held off both hosts, then
    deletes the plaintext, including the copy it leaves in `/data`. Drop
    `--delete` from `nano-backup-pull.sh` (or add an archive folder) so Nano
    really keeps 30 days, and correct `MONITORING.md:17-18`. Update the file pattern in `nano-backup-pull.sh`
    and the backup-age check in `MONITORING.md`. Record in `deploy/README.md`
    that Traefik access logging is off.

### Phase 3 — Gate for promotion

8.  **G5 (restore drill).** Copy the newest Nano backup to local Docker,
    decrypt it with the off-host key (inside the timed window), run the
    current image against it, run
    `PRAGMA integrity_check`, log in, open a table. Record the elapsed time and
    the backup's age at drill start in `deploy/ALWAYS-ON.md`.

### Verification

*   CI green on the release commit; `curl -s https://dangg.live/healthz | jq -r .commit` equals it.
*   `curl -sI https://dangg.live/ | grep -i strict-transport` returns a header.
*   Six `POST /api/auth/register` from one IP: the sixth returns 429; 31 failed
    logins from one IP across different accounts: the 31st returns 429.
*   `curl https://dangg.live/api/admin/stats` from outside returns 403.
*   18+ notice visible on the casino section; `docker compose config` lists no
    `caddy` service.
*   `file` on the newest Nano backup does not report SQLite; Traefik command
    line has no `--accesslog`.
*   `curl https://dangg.live/assets/chrome/jackpot.png` returns 404.
*   Restore drill time and data age recorded.
