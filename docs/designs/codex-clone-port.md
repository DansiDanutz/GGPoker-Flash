# Codex clone → DanGG port ledger

Source: `/Users/davidai/Documents/ChatGPT/REA/GGPoker` (Codex's independent local
reconstruction; `FEATURES.md`, `GOAL.md` and its modules are the reference). This file
exists because the earlier passes used summaries of that clone instead of reading it.
Rows marked **next** are not implemented in DanGG yet.

| Codex clone (module / evidence) | DanGG before this pass | Status |
| --- | --- | --- |
| Betting options: mouse-wheel direction, BB/SB wheel unit, Enter Always/Never confirm, don't-round (`betting-preferences.mjs`, `playgg.mjs`, `network.mjs`) | One "Always confirm bets" switch, default off; no wheel, no unit | **Ported** wheel direction, BB/SB unit, Always/Never (native default Always) and Don't round: pot-fraction shortcuts ceil to the small blind unless Don't round is on; Opening, Pot and Max bypass rounding (native BettingInfo). |
| Card Squeeze: conceal fresh hole cards, wheel/hover/drag/Open peel, Hold'em + PLO4/5/6, per-hand skip on reconnect (`card-squeeze.mjs`, 61 native frames) | None — own cards always face-up | **Ported**: native frames/compositor, Settings toggle, action lock, reconnect skip. Artwork is host-local (gitignored) like the table assets. |
| Chip Shuffle: original-frame cosmetic, own-only Off preference, Up/Combine/Other sounds, wheel frames (`chip-shuffle.mjs`) | None | **Ported** (menu trigger, native sprite, Up/Combine sounds, table broadcast, local hide setting; wheel-scrub and Other cue still open) |
| Native play-chip denominations: `playChipLayout`, 7-chip bet cap / 9-chip pot cap, mirrored groups, 1000/5000/25000 values (`chip-shuffle.mjs`) | Simple 3–12 chip pot pile sized by big blind | **Ported for the pot**: 1/5/25/100 BB columns, 9-chip cap, colours. Bet stacks and the exact native sprites remain open. |
| Anticipatory Fold / Check-Fold / Check / amount-bound Call, one-shot and price-cancelled (`betting-preferences.mjs`, `network.mjs`) | Functional pre-action checkboxes | **Ported** with the native background/box/hover/selected/check sprites. AOF reserved buttons, Rush layout and the native clock/bet widgets remain open. |
| Showdown sequencing: reveal order, 200 ms card flip, board throw, WIN timing (`network.mjs`, `table-audio.mjs`) | Immediate reveal + win overlay | **Ported** the seat-order reveal (~2 s) and delayed badge/pot/sound. Board throw and exact native timing remain open. |
| Ready-for-next-hand gate (no auto-deal) | Timed auto-deal + 10 s bust reload window | Deliberate difference: DanGG keeps its timer and reload window |
| Player notes, custom avatars, card backs/fronts, felt/room themes, sound volume/mute, wait list | Already present | No action |
| Owner backup/verify and in-app restore | No owner backup UI | **Ported**: bounded `VACUUM INTO` snapshots with retention, restore through the existing queue, and table duplicate. |
| Four-seat private rooms, scheduled freezeouts, prize shares | DanGG has tournaments, private tables and its own seating engine | No action |

Evidence for the reference rows lives in the clone's `FEATURES.md` and
`home-art/rea/*.json`. The clone is not a source to copy blindly: its server, table model
and client are different, so ports keep DanGG's server-authoritative design and tests.

## Table fidelity pass (2026-11-12)

Done after the three main ports, following the audit in
`docs/designs/table-fidelity-audit.md`: native pot/wager chip sprites and caps, native
dealer disc, native 46-frame WIN APNG, dealer-origin board throw with a staggered flop,
and larger fanned seat cards. DanGG keeps its responsive seat ring, themes and action bar.
Still open: frame-exact native timings, portrait/plate frames, clock/bet-widget art,
AOF/Rush reserved layouts.

## Feature parity pass (2026-11-12, branch `t3/ggpoker-clone-feature-parity`)

Every row was tested first and then checked in a real browser against a temporary server
(own data dir, bots playing live hands).

| Codex clone (module / evidence) | DanGG before | Status |
| --- | --- | --- |
| Lobby AvgPot / VPIP / H/hr measured from hands (`lobby-stats`) | Estimated demo numbers with a dot | **Ported**: last 20 saved hands per table, 5 s cache, invalidated on hand save. Seen live: `$181 · 44%`. |
| Best-five focus: winners' five cards lift, others dim at brightness 0.6 over 400 ms; c0 h1 d2 s3 tie rule (`Card3D`, `NewHandVO`) | Winner badge only | **Ported**: main-pot winners only, Omaha exactly-two, Short Deck ranks. A live check found that the focus read the made hand as hole cards; fixed (`8fbf7bd`). |
| Final 5 s turn urgency: 0.5 s half-period pulse, 0.2 s on own seat (`PlayerTurnEffect3D`) | Steady ring | **Ported** |
| 11-colour note palette with ten private 20-character label titles (`player-labels`) | 4 named colours | **Ported**: legacy colours migrate; titles edited on My Page. |
| SB/BB markers beside the blinds | Dealer button only | **Ported** (snapshot `sbSeat`/`bbSeat`) |
| Per-table felt and background (`table-look`) | Global Game Settings look | **Ported**: "This table" override in the table menu, synced across tabs. |
| Grouped hotkeys, F1–F4 and Ctrl+1–4 defaults, modifier combos, conflict-free reassignment (`hotkey-bindings.mjs`) | Four single-key bindings | **Ported**: 13 actions in Table actions / Functions / Options. A browser may reserve Ctrl+1–4; the desktop app receives them. |
| Opponent HUD: room VPIP / PFR / hands / wins and recent hands, cards only when shown | Notes only | **Ported** (`GET /api/tables/:id/hud`, login required) |
| Hand history positions and winning cards | Flat list | **Ported**: `hands.meta`, position labels, detail modal, mucked cards hidden from non-owners. |
| Owner-set action time per cash table | Fixed clock | **Ported**: 5–300 s, live-updates a running table. |
| Spin & Gold Info / Blind Structure / Payout side panel | None | **Ported** (`GET /api/spin/info`) |

Found and fixed during this pass: the live `win` event broadcast mucked hole cards to
every client (`d09e958`); mucked hands now go out with `cards: null`.

Still open or left out on purpose: ready-for-next-hand gate (DanGG keeps its timer),
Short Deck dead-ante rules (native evidence unverified), detached chat window, tournament
levels in seconds and per-player antes. The official GGPoker client could not be captured
from this session because it lacks macOS Screen Recording permission, so this pass relies
on the evidence in the Codex clone.

## Table rules parity pass (2026-11-12)

Checked against the REA contracts (pots, per-pot awards, sit-out, show cards, chip motion,
turn indicator). Changes: `server/pots.js` (`buildPots`, `oddChipOrder`) now settles
`doShowdown` and `runoutTwice`; `stand()` returns a leaver's unmatched bet; antes are dead;
a missed big blind is posted on return; `showCards` follows native rules; the client adds
`seatLabel.ts`, `autoTopUp.ts`, `chipCollect.ts` and the own-seat-only urgency and time bank.
Open items: per-pot payout motion, clock banks and audio, take-seat popup, side-pot piles,
waiting list, seat geometry and card-flip timing. The PLO short-blind cap is excluded (TDA
rule, not observed natively).
