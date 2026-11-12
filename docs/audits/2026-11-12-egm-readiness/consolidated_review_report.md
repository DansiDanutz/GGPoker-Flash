# EGM Consolidated Review — dangg.live Production Readiness

*   **Target:** [production_readiness_draft.md](production_readiness_draft.md) (Revision 4)
*   **Code state:** `origin/main` `6861a79`; live build `20261112133548`
*   **Flow:** EGM `egm-review`, consolidated preset, Stages 5 → 6 → 7 → 8 → 9, 9 fresh-context Goldfish reviewers. The Elephant verified each disputed claim against the code or the live hosts and revised the draft after Stages 7, 8 and 9.
*   **Stage reports:** [zoom_out](zoom_out_report.md) · [comprehension](comprehension_report.md) · [critic](critic_report.md) · [intermediate_zoom_out](intermediate_zoom_out_report.md) · [implementation_readiness](implementation_readiness_report.md)

## Verdict

**dangg.live is NOT production ready for public promotion.** It is fine to keep running as an unpromoted, low-visibility beta. The core engineering holds up: 618/618 tests pass, CI is green, auth and TLS are sound, and the admin allowlist resists header spoofing. What fails is operational and legal readiness.

## Action items

### 🔴 Blockers (must fix before public launch)

| # | Item | Evidence | Raw findings |
|---|---|---|---|
| B1 | **Third-party GGPoker art, fonts, sounds and name served publicly.** Takedown risk. The asset README itself says the files are for local use only | `/assets/chrome/jackpot.png` → 200 | S5-1, S6-1, S7D-6, S9-9 |
| B2 | **Running code can't be identified or tied to a CI-green commit.** Deploys copy files from a dirty Mac tree; `/healthz` has no commit field, and the plan must also change `admin-platform.js` | `/healthz` build-only; `admin-platform.js:164-167, 215-227` | S5-3/4, S6-4/6, S7D-1/12, S9-1/3/7 |
| B3 | **Unthrottled sign-up mints $1,050 play money per account; login limiter is per-account only** (anyone can lock out any player; password spraying is not throttled) | `index.js:1138-1153`, `:1123` | S5-5, S7D-4/8, S7S-5, S9-6 |
| B4 | **Backups: retention overstated, never restored.** Nano mirrors with `--delete`, so it keeps 14 days, not 30; 30 plaintext copies sit in `/data`; no restore drill | `nano-backup-pull.sh:22`, `backup.sh:12`, host `ls` | S7D-10, S9-2/4/11 |

### 🟡 Major

| # | Item | Raw findings |
|---|---|---|
| M1 | No HSTS on the live edge. The unused `caddy` service in `compose.yml` would fight Traefik for :80/:443 | S5-2, S7S-1 |
| M2 | Admin allowlist fails open when `GGPOKER_ADMIN_ALLOW` is empty (set today). The fix must account for the SSH tunnel arriving from 172.x | S7D-3, S8-1, S9-5 |
| M3 | Personal data (email, legal names, verification documents) sits in unencrypted backups on two shared hosts | S7D-5, S9-10 |
| M4 | Design of record (`dangro-clone.md`) still says loopback-only, no TLS, assets not redistributed | S8-4 |
| M5 | Disk at 78 % on Dexter, above the 75 % alert; `/healthz` warns only at 90 % | S7D-10, S8-7, S9-8 |
| M6 | No 18+ or age-gating decision for the casino-style games | S7D-6 |
| M7 | Deploy plan details: release layout vs cron/env/Nano paths, workflow-pinned CI check, poll timeout, file list, restore-drill steps | S9-3/7/11/12 |

### 🟢 Nits / follow-ups

6-character password minimum; WebSocket token in URL (Traefik access log confirmed **off**); client has no E2E tests; `index.js` ~3,000 lines; duplicate iCloud files (`CHANGELOG 2.md`, `ruffle/* 2.wasm`); HTTP→HTTPS uses 307; evidence anchors and wording (S7S-8..16, S9-14..17).

## Claims refuted or confirmed by the Elephant

| Claim | Result |
|---|---|
| A forged `X-Forwarded-For` bypasses the admin allowlist (S7D-2) | **Refuted live.** All 4 allow-rule IPs were spoofed and all got 403; Traefik overwrites the header |
| `GGPOKER_TRUST_PROXY` unset makes the limit site-wide (S6-3) | **Refuted.** It is `1` in production |
| WebSocket tokens land in proxy access logs (S7D-9) | **Refuted for today.** Traefik has no `--accesslog` |
| Evidence came from the dirty local tree (S7D-1) | **Confirmed and fixed.** Re-ran on a clean `6861a79`: 618/618 |
| Nano keeps 30 days (S9-2) | **Refuted.** It keeps 14 days (13 files, `rsync --delete`) |
| Plaintext backups pile up in `/data` (S9-4) | **Confirmed.** 30 files |
| An admin create-account route exists (S8-5) | **Refuted.** None at `6861a79` |

## Traceability key

S5 = Stage 5 zoom-out · S6 = comprehension · S7D/S7S/S7T = critic design/structural/style · S8 = intermediate zoom-out · S9 = implementation readiness + codebase details + style.

## Next step

Dan decides B1 (remove the assets, or accept the risk in writing), then the plan's Stage 9 decisions get filled in and Phase 1 is implemented as one PR per goal.

## Implementation status (2026-11-12, 21:50 UTC)

Live at `6e44cea` (2026-11-13) (deployed with `deploy/deploy.sh`, CI green; `/healthz.commit` matches).

| PR | Item | Status |
|---|---|---|
| [#70](https://github.com/DansiDanutz/GGPoker-Flash/pull/70) | B3: per-IP sign-up (5/h) and failed-login (30/15 min) limits | Live |
| [#71](https://github.com/DansiDanutz/GGPoker-Flash/pull/71) | B2: `/healthz.commit`, CI-gated `deploy/deploy.sh` | Live |
| [#72](https://github.com/DansiDanutz/GGPoker-Flash/pull/72) | M1: HSTS 1 day; `caddy` removed. 1 year scheduled for 2026-11-19 | Live |
| [#73](https://github.com/DansiDanutz/GGPoker-Flash/pull/73) | M2: admin allowlist fails closed | Live |
| [#74](https://github.com/DansiDanutz/GGPoker-Flash/pull/74) | B4: Nano keeps 30 days; no plaintext left in `/data` | Live |
| [#75](https://github.com/DansiDanutz/GGPoker-Flash/pull/75) | M3: backups encrypted (CMS, RSA-OAEP + AES-256-GCM), key only in the Mac Keychain; 62 old plaintext snapshots on Dexter and Nano encrypted or removed | Live |
| [#76](https://github.com/DansiDanutz/GGPoker-Flash/pull/76) | M6: 18+ notice on all casino games, login and Terms | Live |
| [#77](https://github.com/DansiDanutz/GGPoker-Flash/pull/77) | M5: `/healthz` warns at 80% disk; Dexter cleaned 80% → 74–75% | Live |
| [#78](https://github.com/DansiDanutz/GGPoker-Flash/pull/78) | B4: restore drill from the Nano copy, about 21 s to a working sign-in | Done |
| [#79](https://github.com/DansiDanutz/GGPoker-Flash/pull/79) | B1: all GGPoker art, sounds, Flash effects and product names replaced with original DanGG work (455-file manifest; boot migration renamed stored names). Old SWFs, Ruffle and unused GG sounds now 404 live; live files match git | Live |

All blockers and major findings are closed: [#80](https://github.com/DansiDanutz/GGPoker-Flash/pull/80) replaced the macOS `say` voice lines with Dan's cloned voice, [#81](https://github.com/DansiDanutz/GGPoker-Flash/pull/81) amended the design record (M4). Still open: GG files remaining in git history (needs a history rewrite if wanted), `deploy/.env.example` Caddy comments (blocked by the secret guard; needs Dan).
