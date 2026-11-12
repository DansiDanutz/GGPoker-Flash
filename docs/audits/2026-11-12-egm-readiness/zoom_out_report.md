# Stage 5 — Initial Zoom Out Report

Target: `production_readiness_draft.md` (full file). Reviewer: `egm-zoom-out` (fresh context). Standard: `zoom-out-standard.md`.

Verdict: context check passes; problem framing is sound. Two plan items clash with the existing deploy setup; one proposes new plumbing where code exists.

1. **Blocker — L135-148, G1 couples to G2.** `deploy/README.md:48-50`: GGPoker assets are not in Git and must be copied onto the host; the build falls back to CSS/brand placeholders when missing. A clean-clone deploy therefore silently picks G2 Option A. Fix: decide G2 before designing G1; note Option A is cheap because the placeholder fallback already exists (verify fonts and sounds, remove the GGPoker name from the UI).
2. **Major — L138-140, L157-159, Caddy service.** `deploy/compose.yml:44-60` still defines a `caddy` service binding host :80/:443; the runbook uses `docker compose up -d game`. Plain `up -d` would fight the shared Traefik. Fix: remove the `caddy` service in G4; keep `up -d game` until then.
3. **Major — L136-137, reuse existing build identity.** `app/vite.config.ts` writes `dist/version.json {version, build, time}`; `appVersionInfo()` (`index.js:125`) feeds it to `/healthz`. Fix: add `commit` to `version.json` from a `GIT_SHA` build arg (Docker build stage has no `.git`).
4. **Major — L138-141, Git and `gh` on Dexter.** Puts GitHub credentials on a shared host. Fix: a Mac-side deploy script that refuses dirty trees and non-green commits, then `git archive <sha> | ssh dexter tar -x` and builds `game`.
5. **Nit — L152-155, limiter reference.** `loginLimiter` is keyed by login and counts failures only (`index.js:1085`). Name `createRateLimiter` (`security.js:76`); new instance counting every register attempt per `requestIp(req)`; in-memory, resets on restart.
6. **Nit — L160-161, password floor has no goal.** Add G6 or move to follow-ups.
7. **Nit — L168-170, `prune-docker.sh` uncommitted.** Name its cron entry or make "commit and schedule" the task.
8. **Nit — L6, L58-60, commit baseline.** Local `main` HEAD is `dc3e6b7`; the doc cites `6861a79`. Write `origin/main` and the fetch time.

No issues: objective and definition of "production ready"; non-goals; PaaS rejection; G5 sizing.
