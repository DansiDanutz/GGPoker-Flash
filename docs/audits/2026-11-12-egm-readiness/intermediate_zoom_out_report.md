# Stage 8 — Intermediate Zoom Out Report

Target: `production_readiness_draft.md` Revision 2 (full file). Reviewer: `egm-zoom-out` (fresh context). Verdict: **Revise**. Stage 5 fixes landed; the later additions added two heavy items and one conflict.

1. **Major — fail-closed guard in the wrong place.** `preflight.sh` runs on the Mac and is not called by `deploy.sh`; empty-list fail-closed would also block the SSH tunnel (loopback). Fix: in production treat an empty `GGPOKER_ADMIN_ALLOW` as loopback-only in `adminNetworkAllowed`, log a warning at boot. → **Applied.**
2. **Major — backup encryption vs restore drill.** The drill must decrypt with the off-host key, timed; `backup.sh` plaintext `VACUUM INTO` output must be deleted; pull script and monitoring match on file names. → **Applied.**
3. **Major — WebSocket rework over-scoped.** Confirm Traefik access logging is off instead. **[verified]** Traefik `crawdbot-worker-traefik-1` runs with no `--accesslog` flag, no config file and no access-log environment variable. → Rework moved to follow-ups.
4. **Major — design of record contradicts the deployment.** `dangro-clone.md` says loopback only, no TLS, assets not redistributed. → **Applied:** step added to amend it; `ARCHITECTURE.md` and `deploy/README.md` named as the operative production record.
5. **Major — "admin can create accounts" does not exist.** **[verified]** No admin create-user route at `6861a79`. → Mitigation reworded.
6. **Nit — dirty-tree check redundant with `git archive`; `tar -x` over `~/dangro` leaves deleted files.** → Extract into a fresh release directory.
7. **Nit — disk item belongs in Phase 1 as a G1 prerequisite; thresholds disagree (75/85/90 %).** → Moved; one threshold chosen.
8. **Nit — verification misses the later items.** → Added.
9. **Nit — limiter implementation detail too fine.** → Trimmed.

No issues: phase split and verdict wording, HSTS ramp, Traefik labels for G4, Alternatives, reuse of `prune-docker.sh`.
