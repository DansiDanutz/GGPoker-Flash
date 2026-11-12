# Design goal — DanGG (GGPoker-flash) parity

Status: proposed · 2026-11-12
Owner: David
Orchestrator: DSH (T3 console)
Design/implementation models: Claude Opus 5.5, Claude Fable 5.2 (T3 `claudeAgent`)
Acceptance source: [replica-gap-analysis.md](replica-gap-analysis.md)

## Objective

Close the player-visible design and behaviour gaps between DanGG
(`dangg.live`, this repository) and the installed GGPoker client, using the
existing gap analysis as the single checklist, until the P0 set is complete and
the P1 set has same-viewport evidence.

This is a **play-money, non-affiliated** project. Official artwork/audio are
not redistributed; new work must use the repository's existing asset policy.

## Definition of done

The loop stops only when all of these are true:

1. Every **P0** row in `replica-gap-analysis.md` is either shipped with tests
   or explicitly marked "not observable / out of scope" with evidence.
2. Every **P1** row has either a same-viewport native comparison or a written
   "could not observe" note; no row is silently skipped.
3. `npm test`, the payment-health suite, typecheck and lint pass on the
   branch; CI is green.
4. `README.md`, `CHANGELOG.md` and `replica-gap-analysis.md` reflect the
   shipped state.
5. A human review approves the final visual diff set.

A passing local test is **not** parity.

## Roles

| Model / harness | Responsibility |
|---|---|
| Claude Opus 5.5 (T3 `claudeAgent`) | architecture, game-flow correctness, implementation review |
| Claude Fable 5.2 (T3 `claudeAgent`) | visual direction, layout/typography/art integration, screenshot critique |
| DSH orchestrator (this session) | picks the next gap, launches the right thread, enforces stop rules, updates state |
| Human (David) | approves scope changes, budgets, and the final visual sign-off |

## Loop protocol (one iteration)

1. Read `replica-gap-analysis.md`; pick the first unchecked P0 (then P1) item.
2. Open a T3 thread on the chosen model with the item, the reference evidence,
   and the constraint "one gap per iteration; leave tests + docs updated".
3. Collect: diff, test output, screenshots at the reference viewport.
4. Review against the native evidence; if it fails, write the reason back into
   the gap row and retry once with the failure attached.
5. Commit with `feat(parity): <gap>` or `fix(parity): <gap>`; update
   `CHANGELOG.md` and the gap row.
6. Repeat until Definition of done, or a stop condition below.

## Stop conditions

- Definition of done reached.
- 3 consecutive iterations with no merged change, or the same failure twice.
- Iteration budget (default 30) or token/credit budget reached.
- Human stop file `docs/designs/design-loop.stop` exists.
- Required model/auth unavailable.

Never run unbounded: each iteration must end with a commit, a documented
failure, or a stop.

## Prerequisites

- `claude auth login` completed (currently **not logged in**; T3 reports
  `unauthenticated`, so Opus/Fable cannot run yet).
- T3 provider `claudeAgent` enabled with `claude-opus-5-5` and
  `claude-fable-5-2`.
- The official client/evidence available locally for same-viewport captures.
- A branch dedicated to parity work (do not loop on `main`).
