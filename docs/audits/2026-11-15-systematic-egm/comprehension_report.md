# EGM Stage 6 Comprehension Test

**Reviewer:** comprehension (fresh explore subagent, completed)

## What this proposes

This document proposes a systematic remediation of DanGG, a play-money poker and casino application, using the separate GGPoker-clone repository at a pinned commit as the behavioral reference. It covers every application route and gameplay surface, preserves working target behavior, and adds missing Run It Multiple Times, Spin & Gold, Battle Royale, and smaller reference-supported features using server-authoritative rules. It also requires mobile, responsive, keyboard, touch, and accessibility repairs, followed by deterministic fixtures, automated tests, real browser journeys, screenshots, and repeated fresh-context EGM reviews. Private operator behavior, real-money functionality, deployment, and unsupported claims of native parity are explicitly excluded.

## How the existing system works, per this document

DanGG is a React, Node, and SQLite application served at dangg.live, while GGPoker-clone is a separate reference implementation rather than directly reusable source code. The target begins with 862 passing Node tests, a clean TypeScript check, and a successful Vite build, but these results do not demonstrate feature parity or mobile usability. Existing functionality includes core poker settlement, waiting lists, several game variants, wallet and administrative features, history tools, and portions of tournaments, Rush, Spin, and table presentation; the traceability table identifies which behaviors should be kept, verified, completed, or newly implemented. The mobile baseline has no document-level horizontal overflow in 110 screenshots, but it still contains undersized controls, clipped labels, inaccessible keyboard stops, crowded poker controls, and possible fixed-navigation occlusion.

## Findings

### Blocker

None. Both ranges can be paraphrased, and the overall implementation sequence is understandable.

### Major

1. **Scope:** lines 7, 83, 100–102, 155–156, 162, 168. EGM is not expanded, defined or linked. The required reviewers, reviewer-status record and clean-round definition are not self-contained. Add the Elephant-Goldfish Model name, installed workflow location, five review stages, reviewer roster and the rule that a clean round has no unsettled Blocker/Major and no reviewer marked not-run; convergence requires two consecutive clean rounds.

2. **Scope:** Phase 5 and lines 53, 57, 135–138. Rush Auto Fold hand-chart behavior, HandRank, advanced own metrics and branded formats are not defined or linked to reference contracts. Add brief behavior definitions and exact reference guides/modules so implementation does not require unbounded rediscovery.

### Nit

1. **Scope:** lines 20–28, 46, 54–55, 60. Status-like labels such as native-verified, Missing reference behavior and Incomplete evidence and defects are inconsistent with the five declared statuses. Make them descriptive modifiers and keep one declared status per row.

2. **Scope:** line 59. P$, T$ and Gem are not defined. Add their wallet meanings or link the wallet documentation.

3. **Scope:** lines 99, 145, 148, 167. “All routes and named game states” lacks one definitive state checklist. Add a route × role × state matrix and make the final gate reference it directly.

**Reviewer completion:** comprehension reviewed FeatureRange lines 1–92 and DetailedRange lines 93–169, read-only, with no document standard.
