# Stage 7 — Structural Review

**Target:** `docs/designs/dangro-clone.md` L1–L402 (feature specification)
**Standard:** `feature-spec-standard.md`
**Reviewer:** fresh-context EGM Goldfish (`egm-structural`)

## Verdict

Fails on two blockers. Mechanically well-formed (single H1, no skipped levels, balanced fence, valid links, all mandatory topics present), but structurally untraceable and un-statused: it presents a pre-implementation spec, a post-implementation record and a forward plan at once, and no requirement carries an identifier. It cannot be used as an approval gate.

## Findings

### S1 — Blocker · Risks & Limits

The standard requires failure modes, security implications, scalability limits and mitigations. The in-range risk list has seven flat bullets with no mitigations; mitigations appear only in the out-of-range plan. The admitted restart gap (seats dropped, buy-in stranded) has no mitigation entry and its phase pointer is wrong. No limits statement exists: concurrency, table count, database size and the single-operator assumption are unbounded.
**Recommendation:** Use `Risk ID | Failure mode | Security/scalability implication | Mitigation | Status` and add a Limits block (single process, loopback, no TLS, no deposit replay protection, one WS per table, ~1.4 GB asset floor). Every deferred mitigation names a phase.

### S2 — Blocker · Document type / normative status

`Status: Proposed — post-implementation design record` is interleaved with prescriptive "must" sentences and descriptive "is" sentences, with no RFC-2119 convention, requirement identifiers, or per-statement enforced/tested/aspirational status. A reviewer cannot tell what the code does versus what it is required to do, so the document cannot function as an approval gate.
**Recommendation:** Pick one type. For a contract-of-record, split normative content into `INV-01…`, `SEC-01…` with `Requirement | Status | Evidence | Owner`; move as-built narrative to an appendix.

### S3 — Major · Section ordering

Risks precede the architecture they qualify; Alternatives come after the architecture and are never referenced again. The alternatives section is a detached appendix rather than the justification.
**Recommendation:** Problem → Goals/Non-Goals → Alternatives → Architecture → Risks → CUJs → NFR, with back-references at decision points.

### S4 — Major · Alternatives depth

Three alternatives with pros/cons/rejection but one-sentence rationales and no criteria (complexity, cost, performance, scalability). No baseline "keep the dev server only" and no alternative addressing the loopback HTTP server as a trust boundary.
**Recommendation:** Table with criteria; add Alternative D (single-process Electron + IPC, no HTTP/WS listener) with the loopback exposure trade-off.

### S5 — Major · Duplicated normative content

Six constraints appear two to four times without cross-references: client evaluator display-only, CDP dev affordance, upload caps, loopback/no TLS, rake formula, buy-in/refund. A change requires synchronized edits and no copy is authoritative.
**Recommendation:** One canonical home per constraint; cross-reference the rest.

### S6 — Major · Traceability goals → CUJs → invariants → verification

Admin goal includes promotion/mission/settings creation and audit review, but no CUJ covers them. The 13 invariants have no IDs, so the verification table cannot map 1:1, and L100's "invariant → test mapping" does not exist.
**Recommendation:** Add `ID | Requirement | Goal | CUJ | Verification row | Test`; give invariants IDs; add CUJ 7 or demote clauses.

### S7 — Major · Cross-reference integrity

Four dangling references: "Phase 2" for restart reconciliation (no such phase), invariant→test mapping (absent), "generated JSON diff" (no path/command), `readBody` (no file anchor).
**Recommendation:** Named anchors and code paths; add the reconciliation phase or move to Open Items.

### S8 — Major · Prerequisite dependency buried

The licensed GGPoker client installation and 1.4 GB assets are the hardest prerequisite, first mentioned mid-document, while Context says assets "exist" without saying they cannot be reproduced without the client.
**Recommendation:** Add Dependencies and prerequisites (macOS floor, licensed client/path, Developer ID cert, Node/pnpm, disk, offline).

### S9 — Major · Path convention inconsistency

~25 file references, zero links, three roots (repo-root, app-root `src/lib/...`, bare `poker.js`). `src/lib/i18n-dict.json` is unresolvable; bare `poker.js` is ambiguous with the client evaluator.
**Recommendation:** Declare repo-root relative, fix paths, add links for the three main source files.

### S10 — Major · Open items scattered

Unresolved work appears in five places under four vocabularies with no single list; one item is both risk and security must; restart has a wrong phase pointer; the test gap is out of range.
**Recommendation:** One Open Items table (`ID | Gap | Impact | Trigger | Owner | Phase`) and single references elsewhere.

### S11 — Nit · Heading-case/pseudo-heading asymmetry

One H2 is sentence case; Tier 1/2 and Decided/Risks are bold paragraphs, unanchorable; no TOC.
**Recommendation:** Title Case H2, promote to H3, add TOC.

### S12 — Nit · Duplicated auth sentence in HTTP surface

The auth rule is stated twice in four lines; a subjectless fragment opens the section.
**Recommendation:** Merge into one sentence.

### S13 — Nit · No terminology section

NLHE, PLO/PLO5, bb, WAL, FIFO, CDP, CSV unexpanded; two acronym domains.
**Recommendation:** Add a small glossary or expand at first use.

### S14 — Nit · Prose where tabular

Zero tables in a 400-line contract; alternatives and route families are transposed tables.
**Recommendation:** Convert alternatives, route families and decisions to tables.

### S15 — Nit · Formatting noise

Decorative dash rules, drafting credit outside a section, one 118-column line, mixed list indentation.
**Recommendation:** Remove rules, fold credit into metadata, rewrap, standardize lists.

### S16 — Nit · Metadata incomplete

No owner/approver, version/revision, normative scope, supersedes or related-documents list.
**Recommendation:** Definition table with owner, approvers, status, version, date, scope, related docs.

## What passes

- Heading hierarchy: one H1, sequential H2→H3, ATX with one space.
- Mandatory topics all present; failures are shape/status, not absence.
- Both in-range links resolve; code fence balanced and language-tagged.
- CUJs use a stable `Given/When/Then` triple; the best-structured section.

## Priority

1. S2 (document type + requirement IDs).
2. S1 (mitigations + limits).
3. S5/S10 (de-duplicate; one Open Items table).
4. S6/S7 (traceability and dangling refs).
5. S3/S4 (ordering and alternatives).
6. S8/S9 (prerequisites and paths).
7. S11–S16 (cosmetic).
