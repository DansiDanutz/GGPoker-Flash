# Stage 9 — Implementation Readiness Report

Target: `production_readiness_draft.md` Revision 3, DetailedRange L183-255. Reviewers: `egm-implementation-readiness`, `egm-codebase-details`, `egm-style` (fresh contexts), against a clean checkout of `6861a79`. Standard: `implementation-readiness-standard.md`.

Verdict: **the plan is not implementation-ready.** It fails the Zero-Decision Rule and the test-plan requirement. The assessment verdict (not ready for public promotion) is unaffected; the corrections below strengthen it.

## Blockers

1. **`/healthz` drops `commit`.** `buildPlatformReport` (`app/server/admin-platform.js:164-167`) copies `version/build/time`; `buildHealthSummary` (`:215-227`) outputs `version/build`. G1 needs a Modify step there plus a test; `deploy.sh` needs a poll timeout. (Both reviewers.)
2. **Nano keeps 14 days, not 30.** `nano-backup-pull.sh:22` uses `rsync -az --delete`, mirroring Dexter's 14-day prune. **[verified]** 13 files on Nano. `MONITORING.md:17-18` repeats the wrong claim.
3. **Release-directory layout breaks paths.** `compose.yml` `env_file: .env`, cron (`keepalive.sh`, `backup.sh` in `~/dangro/deploy`), and Nano's pull path all assume the current layout. Decide the layout (e.g. `~/dangro/current` symlink), and list crontab and doc edits.

## Majors

4. **Plaintext backups pile up in the volume.** `backup.sh:12` writes `/data/backup-*.db` and never deletes it. **[verified]** 30 files in `/data`.
5. **SSH-tunnel admin path may not be loopback.** Through Docker's published port the container often sees the bridge gateway (172.x). The "tunnel keeps working" mitigation is unverified; the boot warning cannot live in per-request `adminNetworkAllowed`.
6. **G3 under-specified:** record every attempt (before validation?); 429 text; the test needs `GGPOKER_TRUST_PROXY=1` and forged XFF; existing tests register 5 accounts on one server (`http.test.js:421-423`), so a test override is needed; per-IP login reset semantics; no login-limit test; limiter `Map` grows without bound.
7. **`gh run list --status success` matches any workflow** (incl. `tournament-soak.yml`); pin `--workflow`.
8. **`prune-docker.sh` is already committed at `6861a79`;** `/healthz` disk threshold is `admin-platform.js:210` (90 → 75) plus `ARCHITECTURE.md:235`, `ALWAYS-ON.md:167` and its test.
9. **G2 open decisions:** string list and replacement brand, `GGPOKER_*`/`GGPokerClone` scope, 18+ wording and target files, screen-check pass criteria; risk acceptance recorded in two different places; G1/G2 ordering (`git archive` omits gitignored assets).
10. **G6 open decisions:** where `age` and keys live, new file pattern, existing plaintext backups on both hosts.
11. **Restore drill unspecified:** image, env file, loading the volume, test account, timer start/stop.
12. **No file list** (Create/Modify/Delete).
13. **Style:** restore drill reuses ID G5 (clash with admin guard); verification checks a login limit no test covers.

## Nits

14. Evidence anchors: `db.js:21-31`; token lifetime at `db.js:705-708`; welcome credit is `balance` in **cents** of play-money USD (105,000 = $1,050), adjustable by admin settings; `requestIp` is in `index.js:93`, not exported.
15. Exact Traefik label `traefik.http.routers.dangro.middlewares=dangro-hsts`; `--remove-orphans`; dated max-age raise.
16. Stronger verification: `age -d` + `PRAGMA integrity_check`; confirm `/assets/*` 404 is not an SPA fallback.
17. Style: split multi-action bullets, "Done when" per item, name "Same release as Phase 1".

Verified accurate by `egm-codebase-details`: `index.js:1107`, `1123`, `1138-1153`, `118` (fail-open guard), `poker.js:2-4`, `deploy/README.md:48-50,60`, `caddy` on 80/443, `dangro` router labels, 75 % alert in `MONITORING.md:16`.
