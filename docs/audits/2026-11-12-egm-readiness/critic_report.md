# Stage 7 — Critic Report (design, structural, style)

Target: `production_readiness_draft.md` L1-130. Reviewers: `egm-design`, `egm-structural`, `egm-style` (fresh contexts). Standard: `feature-spec-standard.md`.
Elephant verification notes are marked **[verified]** or **[refuted]**.

## Design critic

1. **Blocker — evidence mixes three code states.** The 428-test run and line citations came from the dirty local tree (`dc3e6b7` plus uncommitted changes), not `6861a79` or the deployed build. **[verified]** Re-ran on a clean `6861a79` worktree: **618 pass, 0 fail**; register at `index.js:1138`, still unthrottled.
2. **Major — spoofable `X-Forwarded-For` could bypass the admin allowlist and G3.** **[refuted live]** A forged XFF matching each of the 4 `GGPOKER_ADMIN_ALLOW` rules still returns "Admin access is restricted"; Traefik overwrites the header. Keep a regression test.
3. **Major — admin allowlist fails open** when `GGPOKER_ADMIN_ALLOW` is empty (`index.js` `adminNetworkAllowed`). **[verified in code]**; it is set in production today. A rebuilt host without it would expose `/api/admin`.
4. **Major — login limiter keyed by login only:** anyone can lock any account; spraying across accounts is unthrottled. **[verified]** `index.js:1123` (6861a79).
5. **Major — personal data unassessed:** email, legal names and verification documents in SQLite; unencrypted backups on two hosts.
6. **Major — G2 scope:** trademark also appears in identifiers (`GGPOKER_*`, `GGPokerClone`); no age-gating decision for casino-style games. Asset fallback already exists, so the fix is cheap.
7. **Major — Alternatives lacks G1 delivery options; no Risks section.**
8. **Major — G3 should be a launch blocker:** public promotion draws account-minting scripts.
9. **Major — WebSocket token in URL** (`/ws?token=`), 30-day lifetime; may land in proxy access logs.
10. **Nit — disk 78 % exceeds the 75 % alert in `MONITORING.md:16`; `/healthz` warns at 90 %.** No backup-age alert evidence.
11. **Nit — rollback tag is optional in the runbook;** make it required.
12. **Nit — say plainly that the running code cannot be verified today.**

## Structural

1. **Blocker — no Risks and Mitigations section** (HSTS is sticky, NAT false positives for an IP limiter, asset removal breaking UI, drill touching production).
2. **Major — no Proposed Approach section;** the chosen path is only in Verdict prose.
3. **Major — alternatives exist only at the whole-launch level;** G1, G2, G3 need their own.
4. **Major — problems and goals not traceable;** label P1-P7, add "Addresses: Pn", place P6.
5. **Nit — Verdict placement;** move near the top.
6. **Nit — goals lack priority tags.**
7. **Nit — `file:line` anchors drift;** pin to the commit.
8. **Nit — timestamp in heading.**

## Style

1. **Major — "Engineering health is good … backups observed working"** overclaims; backups exist, restore unverified.
2. **Major — "the actual blocker"** names only G2 while the verdict names two.
3. **Major — definition of ready ("not exposed to a legal takedown") contradicts G2 Option B (accept in writing).**
4. **Major — "invited players"** implies a gate that does not exist (registration is open). Same as Stage 6 #2.
5. **Major — G3 untestable as written;** state the threshold.
6. **Major — "small", "anything players would miss"** are vague; give a trigger for G5.
7. **Major — P6 has no Goal/Non-Goal.**
8-16. **Nits —** "pays out" → "credits chips"; "money-adjacent" → "chip-economy changes"; "breaks" → "can distort"; "unlimited" → "an unbounded number of"; "Weak" heading; "shortest list"; redundant "no test covers"; backup age is ~25 h not 24 h; "fix forward" wording.
