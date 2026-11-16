# EGM Stage 9 Implementation Readiness

**Reviewer status:** implementation_readiness completed; codebase_details completed; style completed.
**Verdict before remediation:** CHANGES REQUIRED — 3 Blockers, shared Major findings, Nits.

## Blockers

1. **No enforceable file boundary or zero-decision design (lines 95–156).** Required per-phase Create/Modify/Delete manifests, exact exports, schemas, endpoints/messages, migrations, ownership and named tests.
2. **Restart recovery and atomic settlement lacked feasible architecture (lines 99, 106–131, 152–169).** Required durable private active-play state and one transaction for game, wallet, house, receipt, side effects and checkpoint, with graceful/hard crash and fault-injection rules.
3. **Spin/Battle exposure was undefined (lines 115–131, 163–165).** Required owner capitalization or explicit signed house-mint policy, worst-case reservation, safe underfunding refusal, conservation and no affordability reroll.

## Major findings

1. Feature work preceded persistence/bank/mobile foundations; add an architecture gate and per-phase regression/browser gates.
2. RIMT eligibility, owner migration, roles/ties, guests/bots, disconnect, allocation and insufficient-deck rules were unresolved.
3. RIMT first-board-only mission behavior, absent BBJ path, privacy projections and once-per-hand side effects were unspecified.
4. New mutations lacked common identity/revision/operation contracts; legacy missing-hand compatibility was insufficient.
5. Spin queue/insurance/predeal behavior lacked per-match results, pre-draw commits, authoritative acknowledgements, absent-player and local configuration decisions.
6. Battle lacked executable configuration, stage transitions, hunter/bounty/prize rules and public-field allowlists.
7. Auto Fold, HandRank and HUD required exact contracts, not unbounded rediscovery.
8. Reference/target workflows and final variants/games/admin journeys were incomplete.
9. Mobile acceptance lacked an authoritative matrix and valid 44×44/reflow/focus probes.
10. EGM convergence could occur before the final deliverable and contained an external-unknown waiver.
11. Final commands, expected totals, fixture points, artifacts and commit/dirty-state provenance were not reproducible.
12. Existing RIT2 discarded shared prefixes, split every pot in half, omitted Short Deck/BBJ and used only result zero for missions.
13. Spin direct seat purchase had no batch/queue/rule identity; legacy insurance code was unreachable and charged an invented stack premium; wheel refs were not authoritative.
14. Battle had independent guards and a blanket boot migration that could disable a new implementation after restart.
15. Auto Fold required 169 classes and cancellation semantics; HandRank required preflop/draw/multi-board/session/all-time distinctions.
16. Existing screenshot/touch/a11y tools did not cover all routes, fail on errors, enforce 44×44 or test real focus/zoom journeys.

## Nits

- Define “redraw” as no new random outcome/settlement replay; persisted rendering is allowed.
- Distinguish reopening an existing entry from paid re-entry.
- Use “tested mobile matrix passes,” canonical feature names and browser-driven journey language.

## Resolution status

The target design was rewritten with a shared unit-of-work and checkpoint architecture, owner-funded house bank and conservation equation, mandatory operation/revision identities, complete local gameplay rules, per-phase file manifests, route/workflow matrices, measurable mobile gates and exact final commands. These changes require fresh-context verification; this report alone is not proof of implementation.
