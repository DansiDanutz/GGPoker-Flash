# GGPoker feature gap inventory: native client vs DanGG

Date: 2026-11-12. Read-only audit. Native side: REA history (`~/Documents/ChatGPT/REA/GGPoker/{FEATURES,GOAL,STATUS}.md`, `home-art/rea/*.json`, `docs/rea/straddle-sitout.json`) and live-capture notes supplied with the task. DanGG side: grep of `app/src`, `app/server`, `CHANGELOG.md`, `docs/designs/*`. Nothing was run or clicked; no native app interaction. Status is from code presence, not from a live play-through (tests are named where they exist).

Direct answer: no. DanGG is a play-money clone with broad coverage of poker rules, lobby shell and admin, but several native surfaces are static, stubbed or absent (Battle Royale, Insurance, Ask GG, GGPoker.TV, level badges, Total Prize/My Points panel, real jackpot, Daily leaderboard ribbon, Spin gameplay fidelity, Mixed games). Counts below: DONE 22, PARTIAL 24, MISSING 12, UNVERIFIED 3.

Legend: DONE = behaves as observed natively; PARTIAL = exists but simplified, labelled DanGG-rule, or visually different; MISSING = no implementation; UNVERIFIED = could not confirm.

## 1. Lobby and game types
| Feature | Status | DanGG evidence | Native evidence |
|---|---|---|---|
| Tabs Home / AoF / Rush & Cash / Hold'em / PLO / Short Deck / Spin & Gold / Mystery BR | PARTIAL | `components/AppHeader.tsx:46-52` all tabs rendered; BR tab inert (below) | live capture; `rea/home-control-gap-audit.json` |
| Tournaments / Slots / Casino top tabs | PARTIAL | `AppHeader.tsx:22-24`, `pages/Tournaments.tsx`, `pages/Casino.tsx` (roulette, blackjack, crash, baccarat, dragon tiger), `server/slots.js` 5x3 10 lines | live capture; content is DanGG original, not native games |
| Pill filters, Group/Table view, columns, Hide full | DONE | `components/LobbyPills.tsx`, `LobbyFiltersPopover.tsx`, `LobbyGroupRows.tsx` (#F1/F2) | `rea/holdem-list-geometry.json` |
| Measured AvgPot / VPIP / H/hr columns | DONE | CHANGELOG 2026-11-12 Codex parity pass; `server/table-stats.js` | FEATURES Hold'em row |
| Waiting list with offered seats | DONE | `server/waitlist.js`, `components/SeatOfferModal.tsx`, `WaitlistChip.tsx` | `rea/waiting-list*.json`, `native-wait-list-strings.json` |
| Promotions carousel / Daily flipout banners | PARTIAL | `pages/Lobby.tsx:19-23`, `pages/Promotions.tsx:22` are static banners routing to /tournaments; no flipout events exist | live capture |
| Prop Bet | PARTIAL | `Lobby.tsx:457` rail button navigates to `/propbet`; confirm the route has real content (UNVERIFIED, no PropBet page in `src/pages`) | live capture |
| Ask GG assistant | MISSING | grep `ask.?gg` returns nothing | live capture |
| GGPoker.TV | MISSING | grep `gg.?tv` returns nothing | live capture |
| Cross-room leaderboards | PARTIAL | `lib/leaderboard.ts`, `pages/Rewards.tsx` VIP/Elo/XP tabs; no timed/prize leaderboards (Daily ribbon) | STATUS "Leaderboard" row |

## 2. Table gameplay rules
| Feature | Status | DanGG evidence | Native evidence |
|---|---|---|---|
| NLH 6-max, side pots, uncalled returns, odd chip | DONE | `server/pots.js`, `table.js`, `pots.test.js`, CHANGELOG parity pass | `rea/live-side-pots.json`, `uncalled-collection.json` |
| PLO / PLO5 / PLO6 / Short Deck | DONE | `table.js` game modes; `engine-rules.test.js` | `rea/plo*-runout.json`, `shortdeck-payout-oracle.json` |
| PLO short-blind pot cap | PARTIAL (deliberately omitted) | CHANGELOG: TDA rule not observed natively | `rea/plo-short-blind-rule.json` |
| Straddle prompt (5 s ask, doubling, all-in to) | DONE | `server/straddle.js`, `straddle-ws.test.js`, `game/straddlePrompt.ts` | `docs/rea/straddle-sitout.json` |
| Max straddle count | MISSING | CHANGELOG "Not done" | straddle-sitout.json (server rule unknown) |
| Sit-out 2:00 clock, Deal Me In (2 BB) | DONE | `server/sitOut.js`, `sit-out-timer.test.js` | straddle-sitout.json; live capture |
| 2x sit-out speed with waiting list; Wait for Blinds | DONE (meaning inferred) | `wait-for-blinds.test.js`; CHANGELOG says medium confidence | `rea/sitting-out-foundation.json` |
| Run-it-twice | PARTIAL | `table.js:66,847,1071` exists; native RIT eligibility/UI unobserved (UNVERIFIED vs native) | not in REA evidence list |
| Rabbit hunt | DONE | `TablePage.tsx:531,650` (`rabbit` event) | live capture |
| Show cards (1 or both, 3 buttons) | PARTIAL | `TablePage.tsx:837-858` pick-and-Show + Show all; native 3 explicit Show buttons/hotkeys | `rea/show-cards.json`, `show-font-hotkeys.json` |
| Auto-muck | DONE | `table.js:194,822` | FEATURES |
| Pre-action checkboxes (Fold/Check, Check, Call) | DONE | `TablePage.tsx:69,135,655-662,1349-1367` | `rea/reserved-actions-*.json` |
| Bet presets 33/50/75/100, BB openers, no-round option | DONE | `game/betting.ts:29`, `lib/tablePrefs.ts:4-5`, `bet-rounding.test.js` | `rea/betting-presets-verification.json`, `betting-rounding-verification.json` |
| Rebuy / top-up / auto top-up | DONE | `server/index.js:2876` rebuy, `lib/autoTopUp.ts`, `auto-topup.test.js` | `rea/rebuy-*.json`, `top-up-*.json` |
| Time bank | PARTIAL | `game/turnClock.ts`, settings 5-60 s; native banks/refills/paid TimeChip unobserved (CHANGELOG "clock banks open") | `rea/native-time-bank-research.json`, `timebank-hotkey.json` |
| Insurance (all-in) | MISSING | `TablePage.tsx:1059` disabled button "not available in DanGG yet" | live capture (Spin insurance help) |
| Bomb pot | DONE (DanGG extra) | `table.js`, `lib/api.ts`, Lobby host form | not native-observed |
| Ante/dead money | DONE | `ante-dead.test.js` | `rea/tournament-ante-verification.json` |
| Reserved seat "R" / take-seat popup | PARTIAL | `TablePage.tsx:1304` Take seat button, waitlist offers; native R marker/popup (`rea/take-seat-*.json`) listed open in CHANGELOG | `rea/take-seat-flow.json`, `own-reservation-prompt.json` |

## 3. Table UI, animation, sound
| Feature | Status | DanGG evidence | Native evidence |
|---|---|---|---|
| Native chip/dealer/WIN APNG, card flip, board throw | DONE | `docs/designs/table-fidelity-audit.md` | `rea/native-win-verification.json`, `native-board-throw.json` |
| Per-pot award animation, live side-pot piles | PARTIAL | `TablePage.tsx:407 awardPot`; CHANGELOG still lists "payout animation per pot, live side-pot piles" open | `rea/per-pot-awards.json`, `static-side-pots.json` |
| Squeeze | DONE | `game/squeeze.ts` | `rea/squeeze-assets.json` |
| Best-five focus, fold dimming, 5 s red clock | DONE | CHANGELOG 2026-11-12 | `rea/best-five-focus.json`, `fold-dimming.json`, `aof-turn-urgency.json` |
| Exact native seat anchors, nameplate frames, clock digits, bet widget art | PARTIAL | table-fidelity-audit.md "Still open" | `rea/six-seat-player-layout.json` |
| Sounds from native MP3s, per-channel mix | DONE | `lib/sound.ts`, Settings channels (parity-backlog) | `rea/local-sound-comparison.json`, `audio-channels.json` |
| Chip Shuffle animation/audio | UNVERIFIED | grep finds no explicit chip-shuffle setting in src | `rea/chip-shuffle-*.json` |
| Reduced motion | PARTIAL | `prefers-reduced-motion` in `styles.css`, `design-v2.css`, `table-chat.css` only | `rea/reduced-motion-runout.json` |
| Bad Beat Jackpot counter | PARTIAL | `AppHeader.tsx:26-28` shows static `199026635` from `getSetting('jackpot')` (`server/index.js:1204`); no accrual, trigger or payout | live capture |
| Total Prize / My Points panel (tournament/leaderboard) | MISSING | grep returns nothing | live capture |
| Daily leaderboard ribbon at table | MISSING | no table-level ribbon in `TablePage.tsx` | live capture |
| Player level badges at seats | MISSING | only `VIP n` text in profile popup (`TablePage.tsx:1531`) | live capture |

## 4. Rush & Cash, AoF
| Feature | Status | DanGG evidence | Native evidence |
|---|---|---|---|
| Rush pools, quick fold, queue fairness, stake ladder | DONE | `server/rush-pool.js`, `rush-lobby.js`, `rush-ladder.test.js` | `rea/rush-*.json` |
| Cash Drop | PARTIAL | `components/table/CashDropBanner.tsx`; 12% DanGG rule, labelled | FEATURES: native Cash Drop rule unobserved |
| AoF table (shove-or-fold, free BB showdown) | DONE | `table.js:906,948,1549` | `rea/aof-*.json` (many) |

## 5. Tournaments
| Feature | Status | DanGG evidence | Native evidence |
|---|---|---|---|
| MTT seating, balancing, table breaks | DONE | `server/tournament.js`, `tournament-room.js`, `soak-tournament.mjs` | FEATURES said multi-table open; DanGG has since built it |
| Payout table, satellites (ticket), bounty field | PARTIAL | `tournament.js:209-217`; bounty/ticket are fields, PKO bounty mechanics unverified | native prize bands unobserved (parity-status "T0") |
| Rebuy/add-on/re-entry | MISSING | rebuys refused in tournaments (`index.js:2882`) | not evidenced natively |
| Branded formats (Flipout, Daily $100k, Mystery Bounty) | MISSING | banners only | live capture |
| Tournament-specific navigation categories | PARTIAL | `components/TournamentFilterBar.tsx` | FEATURES Lobby row |

## 6. Spin & Gold, Battle Royale
| Feature | Status | DanGG evidence | Native evidence |
|---|---|---|---|
| Spin multiplier draw, prize shares | DONE | `server/spin.js` (ticket table from native dialogs) | `rea/spin-rule-evidence.json` |
| Spin starting stack/time bank, wheel animation, matching | MISSING | `spin.js` header: starting chips/time bank "unobserved, null" | FEATURES Spin row |
| Spin Info/Blind Structure/Payout panel | DONE | `components/SpinInfoPanel.tsx` | `rea/spin-information-verification.json` |
| Mystery Battle Royale | MISSING | `server/battleroyale.js` disables the tables; tab is inert | FEATURES "Game rules and format" |

## 7. Cashier and wallet
| Feature | Status | DanGG evidence | Native evidence |
|---|---|---|---|
| Play-money wallet, ledger, deposit/withdraw mock, bonuses, tickets | PARTIAL | `pages/Cashier.tsx` (deposit/withdraw only simulate); no native Cashier layout | `rea/player-wallet-cashier-source.json` |
| Rush/tournament wallet integration | DONE | ledger types `tourney_buyin`, `cashdrop` (`Cashier.tsx:54`) | FEATURES said open; since closed |
| Real payments / KYC | MISSING (by design) | play money only | n/a |

## 8. Social, chat, emotes, notes, HUD
| Feature | Status | DanGG evidence | Native evidence |
|---|---|---|---|
| Table chat (docked, mute, report) | DONE | `components/table/TableChat.tsx`, `server/chat.js` | parity-status "C0" capture-gated |
| Emotes | PARTIAL | `ReactionPicker.tsx`, 8 reactions, CSS chips until native art extracted | `rea/reaction-history*.json` |
| Friends / DMs / reports / notifications | DONE (DanGG extras) | `pages/MyPage.tsx`, `ReportPlayerModal.tsx` | `rea/fairplay-*.json` for report flow |
| Player notes, 11 colours, labels | DONE | `NoteColorPicker.tsx`, `player-labels.js` | `rea/player-labels.json`, `player-notes.json` |
| Opponent HUD | DONE | `OpponentHud.tsx`, `hud-http.test.js` | `rea/native-hud-*.json` |
| Own HUD advanced/global metrics | MISSING | FEATURES "Advanced own HUD metrics" | `rea/own-hud.json` |
| Offline player list | MISSING | FEATURES | n/a |

## 9. Settings, hotkeys
| Feature | Status | DanGG evidence | Native evidence |
|---|---|---|---|
| 13 hotkeys remappable | DONE | `lib/hotkeys.ts`, `hotkeys.test.js` | `rea/hotkey-categories.json` |
| Card back/felt/background, per-table look | DONE | `lib/tableLook.ts`, `table-look.test.js` | `rea/table-appearance-overrides.json` |
| Language | PARTIAL | `lib/i18n.tsx` and dict exist; coverage not measured (UNVERIFIED) | n/a |
| Show hand strength, BB display | DONE | `game/eval.ts`, stack click toggle | `rea/stack-status.json` |

## 10. History, replayer
| Feature | Status | DanGG evidence | Native evidence |
|---|---|---|---|
| Hand history list, detail, street replay | DONE | `HandDetailModal.tsx` (700 ms replay), `hand-history.js` | `rea/history-*.json` |
| Native 5-column report, PNG save, anonymize, hide | PARTIAL | detail modal differs from native column layout; save/anonymize not found in client (grep `anonym` 1 hit) | `rea/history-columns-model.json`, `history-save.json`, `history-hide.json` |
| Share-hand / screenshot | MISSING | grep none | n/a |

## 11. Promotions, leaderboards, jackpots, profile, levels
| Feature | Status | DanGG evidence | Native evidence |
|---|---|---|---|
| Missions, daily bonus, rakeback, rewards page | DONE (DanGG originals) | `pages/Rewards.tsx`, `Ocean.tsx` | not native-evidenced |
| XP / VIP / Elo | DONE | `pages/Elo.tsx`, `MyPage.tsx:123` | live capture (level badges) |
| Real jackpot mechanics | MISSING | see Bad Beat above | live capture |

## 12. Accessibility and packaging
| Feature | Status | DanGG evidence | Native evidence |
|---|---|---|---|
| PWA / installable | DONE | `public/manifest.webmanifest`, `sw.js`, `pages/InstallApp.tsx` | n/a |
| Electron desktop, multi-window tables | PARTIAL | `app/electron`, parity-backlog "multi-table windows"; no tiled multi-table layout | native 4-table tiling (UNVERIFIED) |
| Accessibility | PARTIAL | 149 `aria-` attributes; no systematic audit | STATUS "accessibility parity open" |
| FairPlay report flow | PARTIAL | report modal exists; native categories/outcomes (`rea/fairplay-categories.json`) not mirrored | `rea/fairplay-flow.json` |

## Counts
DONE 22 | PARTIAL 24 | MISSING 12 | UNVERIFIED 3 (Chip Shuffle, Prop Bet page, native 4-table tiling). Items marked UNVERIFIED in-cell are counted in their nominal status.

## TOP 15 work queue (impact on "feels like GGPoker" x feasibility without real money)
1. **Player level badges at seats.** Native: coloured level badge by nameplate (live capture). DanGG: only VIP text in profile popup. Show `xp`/`vip_level` badge on seat plates, reuse existing fields. S.
2. **Bad Beat Jackpot that behaves.** Native: counter ticks up from rake and pays on qualifying beats. DanGG: static `199026635`. Accrue from rake, server-side trigger rule (labelled DanGG), animate counter. M.
3. **Per-pot award animation and live side-pot piles.** Evidence `rea/per-pot-awards.json`, `static-side-pots.json`. DanGG listed open; `awardPot` exists but is single-stage. M.
4. **Total Prize / My Points panel and Daily leaderboard ribbon.** Native tournament/leaderboard HUD at the table. DanGG has none. Needs a points model on existing leaderboard data. M.
5. **Three explicit Show buttons + hotkeys.** `rea/show-cards.json`, `show-font-hotkeys.json`. DanGG uses pick-then-Show. S.
6. **Real emote artwork and animation.** `rea/reaction-history*.json`; DanGG renders CSS chips. Extract assets (parity-status C2) and wire `SeatReaction`. S-M.
7. **Take-seat popup and "R" reserved seat marker.** `rea/take-seat-flow.json`, `own-reservation-prompt.json`. DanGG has a plain button and queue offers. M.
8. **Insurance for all-ins.** Native Spin insurance help text; DanGG shows a disabled stub. Server already emits `insurance_bought/paid` events; implement equity-priced offer. M-L.
9. **Native table geometry: seat anchors, nameplate frames, clock digits, bet widget.** table-fidelity-audit.md "Still open"; `rea/six-seat-player-layout.json`. L.
10. **Spin & Gold wheel, matching and multiplier-dependent stack.** `rea/spin-rule-evidence.json`; stack/time bank still null. Blocked on capture for stack; wheel animation and lobby matching are buildable. M.
11. **Hand history parity: five-column report, PNG save, anonymize/hide.** `rea/history-columns-model.json`, `history-save.json`, `history-hide.json`; share-hand image. M.
12. **Time bank banks and refills, plus clock exhaustion behaviour.** `rea/native-time-bank-research.json`, `timebank-hotkey.json`. S-M.
13. **Branded tournament formats: Daily Flipout, Mystery Bounty, PKO.** Banners exist with no events behind them (`Promotions.tsx:22`). Implement as DanGG-labelled schedules on the existing MTT engine. M-L.
14. **GGPoker.TV and Ask GG surfaces.** Native lobby entries; DanGG has none. Ask GG can be a canned FAQ/help panel; TV a static video list. S-M.
15. **Battle Royale (Mystery).** Tables disabled (`server/battleroyale.js`); rules unobserved. Needs more live captures before building; lowest feasibility, listed because the tab is visibly dead. L.

Not queued (out of scope or blocked): real payments/KYC, Chip Shuffle (verify first), PLO short-blind cap (deliberately excluded), max straddle count (server rule unknown), Mixed games/HORSE (not seen natively).

## Caveats
- Status is by code grep and prior CHANGELOG claims; features were not exercised in a browser during this audit.
- Native evidence for jackpot, level badges, Total Prize, Ask GG and GGPoker.TV comes only from the live-capture list in the task, not from REA JSON.
- Counts are by row and subjective for PARTIAL vs DONE.
