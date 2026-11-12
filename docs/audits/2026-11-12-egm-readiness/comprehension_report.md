# Stage 6 — Comprehension Report

Target: `production_readiness_draft.md`. Reviewer: `egm-comprehension` (fresh context, document only).

## What this proposes

The document answers whether dangg.live is ready for public promotion: no, but fine as an invite-only beta. Two launch blockers: G1 (deploys not traceable to a commit) and G2 (the public site serves GGPoker art, fonts and sounds). Three more before launch: G3 per-IP sign-up limit, G4 HSTS at the live edge, G5 timed restore drill. Three phases: traceable CI-gated deploy plus the asset decision; limiter, HSTS, 8-char passwords; restore drill and disk headroom.

## How the existing system works, per this document

One Node.js process (API, WebSocket tables, SQLite) in one Docker container on droplet "Dexter", behind shared Traefik for TLS. Deploys copy files from a Mac by rsync/ssh; no Git on the host; `/healthz` reports only a build timestamp. Watchdog on Dexter; a second host "Nano" runs an uptime check and pulls nightly backups. Registration is open and unthrottled; each new account gets 105,000 chips and 5 tickets.

## Findings

1. **Major — L64-70, L135-143, G1/G2 conflict.** Doc never says how the untracked assets reach the server; a clean-clone deploy would drop them or break the build and settle G2 by accident.
2. **Major — L113-114, L144-148, verdict describes a state the system is not in.** "Beta for invited players" / "invite-only behind a login wall", but registration is open to anyone and no invite gate exists or is planned.
3. **Major — L152-155, `GGPOKER_TRUST_PROXY` in production.** If unset, every request appears to come from Traefik and the limit becomes site-wide. *Elephant check: production container has `GGPOKER_TRUST_PROXY=1` (`docker exec dangro-game-1 printenv`). Resolved by evidence; add to the doc.*
4. **Major — L138-141, G1 setup steps unstated.** Clone and fetch credentials on Dexter, authenticated `gh`, how `GIT_SHA` is passed, who runs the script.
5. **Major — L47+, "Nano" undefined.** G5 depends on it.
6. **Major — L143 vs L93-94, done-condition.** "`main` HEAD" vs "a CI-green commit"; use "the deployed SHA, which has a green CI run".
7. **Nit — L160, L168, items without a goal** (password floor, disk headroom).
8. **Nit — undefined terms:** dangro vs DanGG, Bad Beat Jackpot / #64, tickets, stale rooms, cashier, rollback tag, `waitlist-http.js` path, what `keepalive.sh` does.
9. **Nit — L152, "login lockout limiter" ≠ per-IP rate limit.** Confirm the limiter supports N per IP per hour.
10. **Nit — L165-167, restore drill:** backup format, image tag, definition of "data age".
11. **Nit — L157, `stsIncludeSubdomains`:** state whether `*.dangg.live` subdomains exist.
