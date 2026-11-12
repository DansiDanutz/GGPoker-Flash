# Codex clone → DanGG port ledger

Source: `/Users/davidai/Documents/ChatGPT/REA/GGPoker` (Codex's independent local
reconstruction; `FEATURES.md`, `GOAL.md` and its modules are the reference). This file
exists because the earlier passes used summaries of that clone instead of reading it.
Rows marked **next** are not implemented in DanGG yet.

| Codex clone (module / evidence) | DanGG before this pass | Status |
| --- | --- | --- |
| Betting options: mouse-wheel direction, BB/SB wheel unit, Enter Always/Never confirm, don't-round (`betting-preferences.mjs`, `playgg.mjs`, `network.mjs`) | One "Always confirm bets" switch, default off; no wheel, no unit | **Ported** wheel direction, BB/SB unit and Always/Never (native default Always). Don't-round is still open because DanGG presets do not round today. |
| Card Squeeze: conceal fresh hole cards, wheel/hover/drag/Open peel, Hold'em + PLO4/5/6, per-hand skip on reconnect (`card-squeeze.mjs`, 61 native frames) | None — own cards always face-up | **Next** |
| Chip Shuffle: original-frame cosmetic, own-only Off preference, Up/Combine/Other sounds, wheel frames (`chip-shuffle.mjs`) | None | **Next** |
| Native play-chip denominations: `playChipLayout`, 7-chip bet cap / 9-chip pot cap, mirrored groups, 1000/5000/25000 values (`chip-shuffle.mjs`) | Simple 3–12 chip pot pile sized by big blind | **Next** (refine the pot pile to denominations) |
| Anticipatory Fold / Check-Fold / Check / amount-bound Call, one-shot and price-cancelled (`betting-preferences.mjs`, `network.mjs`) | Functional pre-action checkboxes | **Partial**: behaviour exists, native sprites/geometry do not |
| Showdown sequencing: reveal order, 200 ms card flip, board throw, WIN timing (`network.mjs`, `table-audio.mjs`) | Immediate reveal + win overlay | **Next** |
| Ready-for-next-hand gate (no auto-deal) | Timed auto-deal + 10 s bust reload window | Deliberate difference: DanGG keeps its timer and reload window |
| Player notes, custom avatars, card backs/fronts, felt/room themes, sound volume/mute, wait list | Already present | No action |
| Owner backup/verify and in-app restore | No owner backup UI | Later |
| Four-seat private rooms, scheduled freezeouts, prize shares | DanGG has tournaments, private tables and its own seating engine | No action |

Evidence for the reference rows lives in the clone's `FEATURES.md` and
`home-art/rea/*.json`. The clone is not a source to copy blindly: its server, table model
and client are different, so ports keep DanGG's server-authoritative design and tests.
