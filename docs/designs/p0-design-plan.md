# P0 design plan — DanGG parity, iteration 1

Status: proposed · 2026-11-12
Branch: `design/parity-loop-20261112`
Inputs: [design-goal.md](design-goal.md), [replica-gap-analysis.md](replica-gap-analysis.md),
[parity-backlog.md](parity-backlog.md), [../ARCHITECTURE.md](../ARCHITECTURE.md), `README.md`.

This plan covers every open **P0** row in `replica-gap-analysis.md`. Each section gives the
target UX/UI, the reference evidence (and what is *not* evidenced), implementation slices
mapped to files, and the acceptance screenshots/checks that close the row. Order follows
the instruction to put design-visible work first:

1. [Lobby wait lists and filters](#1-lobby-wait-lists-and-filters)
2. [Table chat and reactions](#2-table-chat-and-reactions)
3. [Tournament remainder](#3-tournament-remainder)
4. [Rush depth](#4-rush-depth)
5. [Spin & Gold gameplay](#5-spin--gold-gameplay)
6. [Battle Royale](#6-battle-royale)

One slice = one PR with tests, a `CHANGELOG.md` line and an update to its gap row
(design-goal loop protocol). Nothing is marked done without a same-viewport comparison or
an explicit "not observable" note.

---

## 0. Ground rules for this plan

### Evidence sources and paths

| Tag | Location |
|---|---|
| **N** (native) | Captures and REA records under `/Users/davidai/Documents/ChatGPT/REA/GGPoker/home-art/` (`observed-*.png`) and `home-art/rea/*.json` |
| **C** (Codex clone) | `/Users/davidai/Documents/ChatGPT/REA/GGPoker/FEATURES.md` (line numbers cited), its tests and `engine/*.mjs` |
| **D** (DanGG) | this repository, `app/` |

### Capture protocol (applies to every "capture" step below)

- Native client: PLAYGG.RO / GGPoker play-money account, window **1200 × 957** (the size
  Codex used for its Spin/Rush captures). DanGG: Electron or Chrome at the same CSS size,
  default theme, `DansiDanutz` demo account on a local server.
- Observe or navigate only. **No real-money action, no registration, no bet** in the
  native client without David's approval.
- Store pairs as `docs/designs/evidence/<gap>/<state>-native.png` and
  `<state>-dangg.png`, plus an `evidence.json` with SHA-256, timestamp, viewport and what
  was *not* observable. Official artwork stays out of the public repo: commit DanGG
  captures only, and record native captures by hash and local path.
- DanGG screenshots: extend `tools/drive.mjs` (puppeteer-core, already logs in as the demo
  account) with a named scenario per state below. Don't add a second screenshot harness.

### Corrections to the gap analysis found while planning

The code and evidence differ from the current P0 rows in several places. Each slice below
starts from the real state. Update the gap rows when the first slice of that gap lands.

| Row | Gap analysis says | Actually (evidence) |
|---|---|---|
| Wait lists | "No wait lists" | A server-only, implicit wait list exists (`server/index.js:285–306`, `WAITLISTS` map). It joins only when `join_table` finds no free or bot seat (`:2363–2370`). There's no lobby entry point, no seat hold and no expiry. The lobby **Wait** column is a synthetic hash (`occupancyFor`, `:203–213`), not real data. |
| Rush | "One stake pool; no Cash Drops" | One stake is correct: 8 × `rush-platinum-*` at 500/1000 (`server/db.js:415`). But a Cash Drop **exists**: a 12% roll after each Rush hand awards 50% of the pot (100–5,000) to a random human (`server/index.js:361–368`). These values are invented, not evidenced. |
| Spin & Gold | "Information-only screens" | `spingold` tables are **playable** with a multiplier drawn uniformly from `[2,2,2,3,3,5,10,25,100]` (`server/table.js:100–104`). This breaks the gap row's own rule: "do not infer weights". |
| Battle Royale | "Nothing … rules unobserved" | 4 × `br-*` tables are seeded (`server/db.js:424–426`) and play as **ordinary Hold'em**, because `table.js` has no Battle Royale branch. The native lobby capture `N: home-art/observed-battle.png` *does* show the headline format (see §6). |
| Chat | "Emotes only" | Text chat exists: 200 chars, broadcast only, not persisted, no history for late joiners (`server/index.js:2520–2532`). The emote validator accepts **any** 1–4 code points (`:2540`), not an allowlist. `N: observed-chat.png` is the **AskGG** AI assistant panel, not table chat, so native table chat is still unobserved. |

---

## 1. Lobby wait lists and filters

### Target UX/UI

**Wait list (cash tables).**
- In **Table View**, a full table's row shows **Join Wait List** instead of **Join**. The
  row's Wait cell shows the real queue length (`-` when empty). The selected-table side
  panel shows the native copy "**N Players on Waiting List**", with N in white.
- In **Group View** (one row per stake + table size), **Join Wait List** queues the player
  for *any* table in that group. If they can't join, the native refusal copy appears.
- Joining shows a compact **Waiting List** chip in the app header ("2 wait lists"). Its
  popover lists each queue with the position (#3 of 5) and a **Leave** button.
- When a seat opens for the head of a queue, the player gets a seat offer anywhere in the
  app, including the lobby and other tables. The offer is a toast/modal: "Seat available
  at *Table* — **Take seat** (0:30)". It holds that seat against bots and other players
  until the countdown ends, then passes to the next player.
- Errors use the native strings verbatim (see evidence): full list, not eligible, no
  tables.

**Filters.**
- **Native-style pill filters** under each game tab, in the native position: above the
  column header, left-aligned.
  - Rush: **All / Hold'em / PLO**
  - PLO tab: **All / PLO / PLO-5 / PLO-6**
  - All-in or Fold: **All / Hold'em / Omaha**
- **Native column set** per tab (from captures):
  - Hold'em: Promotion · Table Size · Stakes · Buy-in · Players · Action
  - Rush: Promotion · Games · Stakes · Buy-in · Players · Pros · Hands/hr · Action
  - Table Size renders as a green **6-Max** / yellow **9-Max** chip.
- DanGG's existing stake/seat/speed dropdowns, search and ★ Favorites move into one
  **Filters** popover at the right of the pill row. They're DanGG extras, not native. Add
  **Hide full** and **Has seats**. Filter state persists per tab.
- **Tournament categories and filters** (Tournaments page): category rail plus a filter
  row with Game (NLH/PLO), Buy-in band, Status (Registering / Late reg / Running), Speed
  and **Registered only**. Search stays.

### Reference evidence

- N: `home-art/rea/native-wait-list-strings.json`. Strings come from the installed
  `string_table.json`, sha256 `c0ce0735…`: `WaitingList`, `JoinWaitList`,
  `PlayersOnWaitingList` ("`<font color='#ffffff'>{0}</font> Players on Waiting List`"),
  `MobileWaitingFull`, `YouCannotJoinWaitingList`, `LabelToJoinWaitingList`
  ("…you must be playing in a table with the same conditions as below") and
  `LabelFailedJoin`. Its own scope note says that **queue order, vacancy offer, expiry and
  grouping conditions are unobserved**.
- N: `home-art/observed-holdem.png`: Hold'em Group View with stake rows, 6-Max/9-Max
  chips, a players pill, **Join**, and a right panel with a Group View/Table View toggle
  and **Join Table**. There's no wait column in Group View.
- N: `home-art/observed-rush.png`: All / Hold'em / PLO pills and the Rush column set.
- C: `FEATURES.md:7` (lobby row: waiting lists, tournament categories and filters open in
  Codex too). `:47`, `:135` (PLO and AoF pill filters on real modes). `:253`, `:61`, `:69`
  (tournament category bar; native filter controls still differ).
- D: `server/index.js:203–213` (synthetic wait), `:285–306` (WAITLISTS),
  `:2363–2377` (implicit join), `:648`/`:2422` (`notifyWaitlist` calls).
  `src/pages/Lobby.tsx:85–151` (filters and sorting), `:375–397` (filter bar and Wait
  header), `:446–447` (view toggle). `src/pages/TablePage.tsx:225–230`, `:418`, `:1090`
  (waitlist banner).

**DanGG design decisions (not native, label them in code and docs):**
- FIFO order.
- 30 s seat hold.
- 10-player cap per table, 25 per group.
- At most 4 concurrent queues per player.
- Group eligibility in DanGG means same game + stakes + seats. The native "must be
  playing at a table with the same conditions" rule needs a capture first (step W0).

### Implementation slices

| # | Slice | Files | Tests |
|---|---|---|---|
| W0 | **Capture**: native Table View of a full table, the Join Wait List click flow on a play-money table (joining a queue is not a bet), the header indicator and the seat-offer dialog. If the offer is unobservable, record that. | `docs/designs/evidence/waitlist/` | — |
| W1 | ✅ **Done 2026-11-12.** **Pure wait-list model** `server/waitlist.js`: `join`, `leave`, `position`, `offer(tableId, seat, now)`, `accept`, `expire(now)` and `groupKey(cfg)`. Immutable state in, new state out. Holds `{tableId, seat, userId, deadline}`. Enforces the caps. | new `server/waitlist.js` | new `server/waitlist.test.js`: FIFO, duplicate join returns the existing position, cap → `full`, offer expiry advances to #2, leave during an offer releases the hold, group join resolves to the first free table |
| W2 | ✅ **Done 2026-11-12.** **Wire it into the table lifecycle.** Replace the inline `WAITLISTS`/`waitlistJoin`/`waitlistLeave`/`notifyWaitlist` in `index.js`. A seat freed at `:648`/`:2422` calls `offer`. **Bots must not take a held seat**: the bot-fill at `:2379` skips held seats, and `seatHuman` refuses a held seat to anyone but the holder. A 1 s sweep expires offers. | `server/index.js`, `server/table.js` (held-seat flag in `seatOf`/the free-seat finder) | extend `server/api.test.js`: 7th human on a full 6-max table queues, a seat opens, bots don't fill it, an offer reaches #1 over WS **and** SSE, accept seats them, expiry passes to #2 |
| W3 | ✅ **Done 2026-11-12.** **API + live counts.** Add `POST`/`DELETE /api/tables/:id/waitlist`, `POST /api/lobby/groups/:key/waitlist` and `GET /api/waitlists/me`. `lobbyTables()` returns the real `wait` (queue length) and `myWait`, and drops the hash-based wait. Add a `waitlist_offer`/`waitlist_update` SSE via `notifyUser`. | `server/index.js`, `server/validate.js`, `src/lib/api.ts` | `server/http.test.js`: auth required, 404 for an unknown table, private tables only for the owner/invitee, rate limit |
| W4 | **W4a ✅ Done 2026-11-12:** real Wait column (`0` when empty, gold dot when queued), Table View side panel with "N Players on Waiting List", "You are #n" and Join / Join Wait List / Leave Wait List (disabled when the queue is full), `src/lib/waitlist.ts` + tests. Row action stays out of Table View per the visual brief. **W4b ✅ Done 2026-11-12:** header Waiting List chip + popover (`WaitlistChip.tsx`), global seat-offer modal/toast with 30 s countdown (`SeatOfferModal.tsx`, state in `src/lib/waitlistState.tsx`), table-page banner on the shared state, Group View Join / Join Wait List / "#n · Leave", helper tests in `client-logic.test.js`. **Lobby UI.** Row action switches Join ↔ Join Wait List ↔ "#2 · Leave". Add the side-panel "N Players on Waiting List" line, the header Waiting List chip and popover (`AppHeader.tsx`), and a global seat-offer modal with countdown (`store.tsx`, so it works on any route). The table page banner at `TablePage.tsx:1090` uses the same state. | `src/pages/Lobby.tsx`, new `src/components/WaitlistChip.tsx`, new `src/components/SeatOfferModal.tsx`, `src/lib/store.tsx`, `src/lib/i18n-dict.json` (native strings) | `client-logic.test.js`: `waitlistActionFor(table, myWait)` returns join, joinWait, queued or full |
| F1 | **W5a ✅ Done 2026-11-12:** native pill rows (Rush All/Hold'em/PLO, PLO All/PLO/PLO-5/PLO-6, AoF All/Hold'em/Omaha) left-aligned above the column header and filtering the list; per-tab Group View column sets (Hold'em, Rush, PLO, AoF; Table View keeps its eight native columns per the visual brief) with the green 6-Max / yellow 9-Max Table Size chip, Games chip and variant row accent; pure `filterTables`/`sortTables`/`columnsFor`/`pillsFor`/`variantOf` in `src/lib/lobbyFilters.ts`; pill + stake/seat/speed/★ per tab in `localStorage` (`ggpoker.lobbyFilters`); empty state with **Reset filters**; tests in `client-logic.test.js`. **W5b (open):** Filters popover, Hide full, Has seats. **Native pill filters + column sets.** Add a pure `filterTables(tables, {tab, pill, stake, seats, speed, search, favOnly, hideFull})` helper extracted from `Lobby.tsx:126–151`. Pills per tab as above. Table Size chip. Dropdowns go into a Filters popover. Persist per tab in `tablePrefs.ts`. | new `src/lib/lobbyFilters.ts`, `src/pages/Lobby.tsx`, `src/index.css` | `client-logic.test.js`: each pill maps to the right `game` ids (`omaha5` → PLO-5), hideFull, search is case-insensitive, sorting is stable |
| F2 | **Group View as native stake rows.** Group the cash list by `game+sb+bb+seats`, with summed players, real wait and **Join** (first free seat in the group) or **Join Wait List** (group queue). This replaces today's card grid at `Lobby.tsx:401–410`. | `src/pages/Lobby.tsx`, `src/lib/lobbyFilters.ts` (`groupTables`) | `groupTables` unit tests (sum, ordering by stakes desc, private tables excluded) |
| F3 | **Tournament categories and filters.** Add a `filterTournaments` helper with game, buy-in band, status, speed, registered-only and category (the name needles stay as a fallback). Add the filter row UI. | new `src/lib/tournamentFilters.ts`, `src/pages/Tournaments.tsx` | unit tests for each predicate and an empty-state message |

`Lobby.tsx` is 669 lines. F1 and F2 should take it below 600 by moving the filter/group
logic out. They must not grow it.

### Acceptance

Screenshots (native ↔ DanGG, 1200 × 957):
1. `holdem-group-view`: Hold'em tab, Group View, ≥ 6 stake rows.
2. `holdem-table-view-full`: a full table selected, Wait = 3, side panel "3 Players on
   Waiting List", action **Join Wait List**.
3. `waitlist-queued`: header chip and popover with position and Leave.
4. `seat-offer`: offer modal with countdown, shown over the lobby (not the table).
5. `rush-pills` and `plo-pills`: each pill selected, list filtered.
6. `tournaments-filters`: category plus Status=Late reg plus Registered only.

Checks:
- [ ] `npm test` is green, with the new `waitlist.test.js` and the API/HTTP cases.
- [ ] The lobby `wait` value equals the server queue length; no hash-derived wait remains
      (`grep -n "1 + (h % 3)" server/index.js` returns nothing).
- [ ] A held seat is never taken by a bot or by another human over 50 randomized
      open/close cycles (test loop).
- [ ] Every user-visible wait-list string matches `native-wait-list-strings.json`
      byte-for-byte (except the HTML font tag, which renders as a white `<b>`).
- [ ] The gap row is updated. Anything native that can't be observed (offer dialog,
      expiry) is named in the row.

---

## 2. Table chat and reactions

### Target UX/UI

- **Chat panel** docked at the lower-left of the felt, collapsed by default to a chat
  button with an **unread badge**. Expanded, it has:
  - a scrollable log of the latest 50 lines that keeps scroll position unless pinned to
    the bottom;
  - a sender name coloured by role (self, other, system);
  - text-only rendering with long-word wrapping;
  - a 280-character input with a live counter in the last 40 characters;
  - Enter to send, which never triggers Enter-to-bet (already guarded at
    `TablePage.tsx:584`).
- **History on join**: a player or spectator who opens a running table sees the last 50
  lines, including those sent before they joined.
- **Dealer/system lines** in a muted style: "Hand #1234 started", "DanGG wins 1,200 with
  Two Pair". A **Chat / Dealer** filter toggle sits in the panel header. This depends on
  capture C0. If native has no dealer log, ship it as a DanGG extra, off by default.
- **Reactions**: a picker button next to the chat button opens a grid of reaction
  artwork, not emoji. A sent reaction shows as artwork (~64 px at table scale) beside the
  sender's seat for **4 s**, with a short pop-in, and is recorded in the chat log ("😀
  Laughing"). A chat line also shows as a bubble over the sender's seat for 4.5 s (as
  today).
- **Controls per line**: hover/long-press a line → **Mute player** (uses `table_mutes`) or
  **Report** (opens the existing report modal prefilled with "Abusive chat" and the line).
- **Settings → Table**: "Show chat bubbles" and "Show reactions" toggles.
- **Spectators** can read chat. Whether they can *write* waits for capture C0. Until then
  the DanGG default is **read-only**, which is safer, and Spectator mode's "observer-chat
  rules" gap stays open.
- **Updates must not disturb play.** Incoming chat or reactions must not reset a prepared
  bet amount, steal input focus, close the Enter-to-bet confirm dialog or remount win
  animations. Codex found and fixed each of these (C `:195–199`, `:310`).

### Reference evidence

- **Native table chat is unobserved.** `N: observed-chat.png` is the AskGG assistant
  (lobby), not table chat. Capture C0 is a hard prerequisite for any claim of native
  layout parity.
- C `FEATURES.md:171–199` describes the Codex implementation:
  - 280-character limit, latest 50 kept, text-only DOM, history persisted;
  - per-sender 1 s limit that doesn't reset other senders (`:175`);
  - three **shipped static emoticons from the installed client** (angry, listening,
    laughing) as reactions, allowlisted by integer ID 1–3 (`:181`, `:193`);
  - artwork beside the sender's seat for 4 s (`:185`);
  - bet-draft, confirm-dialog and felt-stability fixes (`:195–199`).
  Reaction artwork: `home-art/reaction-1.png … reaction-3.png`.
- C `FEATURES.md:8`: "native chat/reaction parity" is listed as missing even in Codex.
- D:
  - server: `server/index.js:2520–2532` (chat), `:2534–2545` (emote, no allowlist);
  - client: `src/pages/TablePage.tsx:69–76` (state), `:433–443` (events), `:781` (10
    emoji), `:804–815` (buttons/tray), `:1001–1005` (seat bubbles), `:1053–1066` (panel);
  - schema: `chat_messages` in `server/db.js:218` (used only for the lobby channel today).

### Implementation slices

| # | Slice | Files | Tests |
|---|---|---|---|
| C0 | **Capture** native table chat. Open a play-money cash table as an observer, then seated after a fold with no bet. Capture: chat collapsed and expanded, a received message, the reaction picker, a reaction on a seat, dealer log (if any), and whether observers can type. Inventory the reaction artwork in the installed client (count, names, sizes). | `docs/designs/evidence/chat/` | — |
| C1 | **Server chat module** `server/chat.js`. `validateChat(text)` trims, keeps 1–280 chars and strips control characters. `validateReaction(id)` accepts only integers in the allowlist and rejects numeric strings, null, arrays, objects and fractions (Codex lesson). Add a per-table ring buffer (50 lines) persisted to `chat_messages` with `channel = 'table:<id>'`, and a per-sender limiter that doesn't reset other senders. `join_table` (seat **and** observe paths) sends a `chat_history` frame. Observers are read-only until C0 says otherwise; the server rejects their `chat`/`emote`. `index.js` handlers become 3-line delegates. | new `server/chat.js`, `server/index.js:2520–2545`, `:2350–2356` (observe join) | new `server/chat.test.js` (validation table, ring buffer, limiter independence). WS cases in `server/spectator.test.js`: history reaches a late joiner, an observer's send is rejected, a muted user's send is dropped, literal `<img src=x>` is stored and echoed verbatim |
| C2 | **Reaction artwork pipeline.** `tools/setup_assets.sh` extracts the client's reaction emoticons into `app/public/assets/reactions/<id>.png`, not committed (asset policy). Add `reactions.json` (id → label) generated alongside. Fallback when assets are absent: a labelled CSS chip, not emoji. Wire format: `{type:'reaction', id}`. Keep accepting the legacy `emote` frame for one release, mapped to a reaction ID where one exists and otherwise dropped. | `tools/setup_assets.sh`, `tools/build_assets.py`, `server/chat.js` (allowlist from `reactions.json`, defaulting to IDs 1–3) | `chat.test.js`: unknown ID rejected, legacy emote mapped |
| C3 | **Client extraction + new UI.** Move chat out of `TablePage.tsx` (1405 lines, over the 800-line ceiling): `TableChat.tsx` (panel, history, unread badge, counter, Chat/Dealer toggle, per-line mute/report), `ReactionPicker.tsx` and `SeatReaction.tsx` (4 s artwork). Chat state lives in a `useTableChat(ws)` hook, so chat updates don't re-render the action bar (keeps bet drafts and the confirm dialog stable). Add the settings toggles to `tablePrefs.ts`. | new `src/components/table/TableChat.tsx`, `ReactionPicker.tsx`, `SeatReaction.tsx`, `src/lib/useTableChat.ts`; `TablePage.tsx` (−150 lines), `src/lib/tablePrefs.ts`, `src/index.css` | `client-logic.test.js`: `chatReducer` (append, cap 50, history merge dedupes by id, unread count resets on open) |
| C4 | **Dealer log**, only if C0 shows one or David approves it as an extra. The server emits system lines from existing hand events (`hand_start`, result) into the same buffer with `kind:'dealer'`. | `server/chat.js`, `server/index.js` (hand save hook near `:340`) | `chat.test.js`: dealer lines never count against a sender limit |

### Acceptance

Screenshots (native ↔ DanGG, 1200 × 957, 6-max Hold'em):
1. `chat-collapsed`: unread badge after 2 incoming lines.
2. `chat-open-history`: a late joiner sees 3 earlier lines.
3. `reaction-picker-open`.
4. `reaction-on-seat`: an opponent's reaction beside their seat.
5. `chat-bubble-on-seat`.
6. `observer-chat`: the observer's input is disabled or enabled to match C0.

Checks:
- [ ] Two browsers: B sends `<img src=x onerror=alert(1)>`. A shows that literal text and
      the DOM has no `img` inside `.chat-log`.
- [ ] Reaction IDs `"1"`, `1.5`, `null`, `[1]`, `{}` and an unknown integer are all
      rejected with table state unchanged (version/handNo identical).
- [ ] While A has a non-default bet amount typed and the confirm dialog open, B chats and
      reacts. A's amount, focus and dialog are unchanged and no bet is sent.
- [ ] A reaction during the pot-award animation doesn't remount the win overlay (same DOM
      node before and after).
- [ ] Account mute (`chat_muted`) and table mute (`table_mutes`) block both chat and
      reactions.
- [ ] `TablePage.tsx` ends below its starting line count.
- [ ] The gap row and the Spectator P1 row ("observer-chat rules") are updated from C0.

---

## 3. Tournament remainder

The MTT row is mostly shipped. Three follow-ups remain (gap analysis "Follow-ups").

### Target UX/UI

- **Seated at the scheduled start.** At start time every registrant is seated, whether
  online or not. An absent player is dealt in and auto-folds or auto-checks (blinded out)
  under the normal disconnect rules. A registered player who opens the app after the start
  gets a toast or SSE notification, "Your tournament started — **Go to table**", that
  opens their real flight, not flight 1.
- **Payout table.** The tournament detail **Prizes** tab lists every paid place. The
  winner presentation and the finish toast show the real place and amount for any paid
  place. A bubble line ("Bubble: 7th") shows during play.
- **Robustness.** A multi-hour bot soak exercises real breaks.

### Reference evidence

- D: `server/tournament-room.js` (seating, places, payouts at 50/30/20),
  `server/tournament.js` (flights, balance, break), the 15 s start scheduler
  (`parity-backlog.md` "Tournament lifecycle"), `ARCHITECTURE.md` "Multi-table
  tournaments". Tests: `tournament-room.test.js`, `tournament-flight.test.js`,
  `tournament-live.test.js`.
- N: **the native payout table is not captured.** `observed-satellite.png` covers
  satellites only. A capture is required before choosing percentages (T0).
- C: `FEATURES.md:61–69`, `:205` (finishing order for simultaneous eliminations: larger
  initial stack ranks higher, then clockwise from the button), `:209–215`.

### Implementation slices

| # | Slice | Files | Tests |
|---|---|---|---|
| T0 | **Capture** the native tournament detail **Prize** tab for three play-money events of different field sizes (≈20, ≈100, ≈500 entrants), plus one running event's "places paid". | `docs/designs/evidence/tournament/` | — |
| T1 | **Seat all registrants at start.** The scheduler that flips `registering → running` calls `room.seatRegistrants(regs)`, which allocates every `tourney_regs` row through `nextFlightIndex` with a `sittingOut/away` flag. On reconnect, `/api/tournaments/:id/play` returns the existing seat. Add an SSE `tournament_started {id, tableId}` to each registrant. | `server/tournament-room.js`, `server/index.js` (scheduler + `/play`), `src/lib/store.tsx` (toast/deep link) | `tournament-room.test.js`: 14 registrants and 0 online → all seated across 3 flights at start; an absent player blinds down and is eliminated in the correct place. `tournament-live.test.js`: a late opener lands on their real flight |
| T2 | **Payout table.** Add a pure `payoutTable(entrants, prizePool)` in `server/tournament.js` from T0 data (bands by field size, integer amounts summing exactly to the pool, remainder to 1st). Until T0 lands, keep 50/30/20 behind the same function, labelled DanGG. Room settlement and the detail endpoint use it. Add a Prizes tab and bubble line in `Tournaments.tsx`/`TablePage.tsx`. | `server/tournament.js`, `server/tournament-room.js`, `server/index.js` (detail API), `src/pages/Tournaments.tsx` | `tournament.test.js`: the sum equals the pool for 2…1000 entrants, monotonic non-increasing, satellites still pay tickets. Room test: 20 entrants → every paid place credited once in the ledger |
| T3 | **Soak test.** A `tools/soak-tournament.mjs` script (not part of `npm test`): 60 bot entrants, fast blinds, run to completion. Assert chip conservation each sweep, no player on two tables, and every table break completes. Add an opt-in CI job, `SOAK=1`. | new `tools/soak-tournament.mjs`, `docs/CI.md` | the script exits non-zero on any invariant breach |

### Acceptance

- Screenshots: `tournament-prizes-tab` (native ↔ DanGG, same field size),
  `tournament-started-toast` (DanGG only), `winner-presentation-4th-place` (DanGG).
- [ ] T1 and T2 tests are green. The T3 soak passes 3 consecutive runs locally and its log
      is attached to the PR.
- [ ] The ledger sum of tournament payouts equals the prize pool for every soak run.
- [ ] Gap row: "Remaining:" cleared, or it names any part of the native payout bands not
      observed.

---

## 4. Rush depth

### Target UX/UI

- **Rush tab = pool list, not table list.** One row per *pool* (game + stakes), with the
  native columns: Promotion badge · Games chip (green **Hold'em** / blue **PLO**) ·
  Stakes · Buy-in · Players pill · Pros · Hands/hr · **Join**. The highest-stakes row
  uses the native red highlight. **All / Hold'em / PLO** pills (from F1).
- **Stake ladder**:
  - Hold'em: 50/100, 100/200, 250/500, 500/1000, 1000/2000;
  - PLO: 100/200, 500/1000.
  Play-money values are DanGG choices that mirror the native ladder's shape
  ($0.25/$0.50 → $1/$2).
- **Right panel**: Rush leaderboard (Flag · Player · Chips won today, play money) and a
  **Rush & Cash Information** link that opens a rules sheet (quick fold, new table each
  hand, Cash Drop).
- **Join** opens the buy-in sheet, then drops the player straight into the pool. Quick
  fold moves them to a new table immediately (already shipped).
- **Cash Drop**: when a drop hits, a full-width gold "CASH DROP" banner shows on the felt
  with the amount and the recipient seat highlighted, plus the native cash-drop sound
  (already wired). The lobby hero shows "Cash Drop chance" from the real configured rate,
  not marketing copy.

### Reference evidence

- N: `home-art/observed-rush.png` (1200 × 720): pills, columns, alternating Hold'em/PLO
  rows across $0.25–$2 stakes, player counts 38–166, leaderboard panel, "Rush & Cash
  Information" link, "$40,000 Daily" ribbon. C: `home-art/rea/rush-graphic-regions.json`
  (banner/tab/ribbon regions with digests).
- C `FEATURES.md:12`, `:227–245` (pools, queues, quick fold, PLO pool). Cash Drop
  mechanics are **not observed** in either replica. The official page only says Cash
  Drops exist.
- D:
  - `server/db.js:415` (single stake);
  - `server/index.js:361–368` (invented 12% / 50%-of-pot drop);
  - `:468–531` (`RUSH_WAITING`, queue flush, `rush_move`);
  - `src/pages/Lobby.tsx:332–345` (Rush hero).

### Implementation slices

| # | Slice | Files | Tests |
|---|---|---|---|
| R0 | **Capture** a native play-money Rush pool (observe or fold only): table chrome, fold → new table timing, and any Cash Drop overlay if one occurs within a 30-minute session. If none occurs, record "Cash Drop not observed". | `docs/designs/evidence/rush/` | — |
| R1 | **Extract the Rush pool module.** Move `RUSH_WAITING`, the flush/transfer logic and the Cash Drop roll out of `index.js` (2640 lines) into `server/rush-pool.js`, keyed by `poolKey = game+sb+bb`. No behaviour change. | new `server/rush-pool.js`, `server/index.js` | the existing Rush tests pass unchanged. New `server/rush-pool.test.js`: transfers stay within a pool and never cross stakes |
| R2 | **Stake ladder + PLO Rush.** Seed the pools above. Add `rushplo` as a game id (Omaha rules via `table.js` `omaha` flag, Rush flag on) with a migration that inserts only missing rows. Elo maps `rushplo` → `rush`. | `server/db.js` (seed + migration), `server/table.js` (`rush` flag for `rushplo`), `server/index.js` (`eloGame`) | `engine-rules.test.js`: Rush PLO deals 4, pot-limit cap, quick fold. DB migration is idempotent across 2 boots |
| R3 | **Pool lobby.** `GET /api/lobby` returns `rushPools[]` (players summed across pool tables, hands/hr, pros = 0 until defined). The Rush tab renders native pool rows, pills and the leaderboard (from `transactions` category `cashdrop` + Rush hand wins today). | `server/index.js` (`lobbyTables` → `lobbyRushPools`), `src/pages/Lobby.tsx`, new `src/components/RushPoolRow.tsx` | `http.test.js`: pool aggregation. `client-logic.test.js`: pool sort order (stakes desc) |
| R4 | **Cash Drop rule, documented.** Move the rate and amount to `settings` (`rush_cashdrop_rate`, default 0.12; `rush_cashdrop_amount_bb`, a flat BB multiple per stake, not a fraction of the pot). Admin-editable. The lobby hero reads the real rate. Use a crypto RNG. Add the felt banner component. Label it "DanGG rule" until R0 provides native evidence. | `server/rush-pool.js`, `server/index.js` (admin settings API), `src/pages/Admin.tsx`, new `src/components/table/CashDropBanner.tsx` | `rush-pool.test.js`: a seeded RNG hits at the configured rate (±1% over 100k), amount = bb × multiple, one ledger row per drop, idempotent on hand-save retry |
| R5 | **Queue fairness.** A global FIFO per pool by `since`. A waiting player is offered the next free seat in *any* table of the pool before a newer arrival. Starvation bound: no player waits more than 2 flushes while a seat opens. | `server/rush-pool.js` | `rush-pool.test.js`: 20 queued and seats opening randomly → service order equals arrival order |

### Acceptance

- Screenshots (native ↔ DanGG 1200 × 957): `rush-pool-list-all`, `rush-pool-list-plo`,
  `rush-information-sheet`, `rush-cashdrop-banner` (DanGG; native only if R0 caught one).
- [ ] At least 7 pools listed across 2 games. Join → seated in the pool. Quick fold
      transfers within the same pool in < 1 s locally.
- [ ] The Cash Drop rate and amount come from `settings` and the lobby shows the same
      rate. No `Math.random()` remains in the drop path.
- [ ] The gap row lists Cash Drop as "DanGG rule" unless R0 produced native evidence.

---

## 5. Spin & Gold gameplay

### Target UX/UI

- **Spin lobby** (Spin & Gold tab):
  - **3-Max / 6-Max** toggle;
  - buy-in tiles for the **evidenced play-money stakes only** (5,000 and 10,000);
  - number-of-games stepper (native cap from capture);
  - **Play Now**;
  - Info / Blind Structure / Payout dialogs;
  - insurance help.
  Insurance purchase stays disabled with "Not available in DanGG" until settlement is
  evidenced.
- **Match flow**:
  1. Play Now → "Finding players…" queue with a cancel button.
  2. When the seats fill (bots after a 5 s wait, DanGG choice), a **multiplier wheel**
     spins over the felt, lands on the prize multiplier and shows the prize pool.
  3. The hand starts.
  4. The blinds clock follows the evidenced structure.
  5. The finish screen shows place and prize per the payout table for that multiplier.
- Simultaneous eliminations are ordered by initial hand stack, then clockwise from the
  button.

### Reference evidence

- N, the native play-money lobby and dialogs (all hashes in
  `home-art/rea/spin-rule-evidence.json`):
  - `observed-spin2.png`, `observed-spin-playmoney*.png`;
  - `observed-spin-playmoney-payout-5000.png` / `-10000.png`;
  - `observed-spin-blinds-*.png`, `observed-spin-timebank.png`,
    `observed-spin-insurance.png`, `observed-spin-game-count-cap.png`.
- C `FEATURES.md:336`: play-money 5000/10000 share an **eight-row distribution with a
  20,000× jackpot**, distinct from real-money. `engine/spin.mjs` models only those stakes:
  exact weighted outcomes totalling 100M tickets, finishing prizes, time-based levels for
  ×2–×5, hand-count levels for ×10+ and a 26-level cap (`spinSmallBlinds`). Its tests
  are in `spin-test.mjs`. `:203`, `:205`, `:207`: simultaneous-elimination order;
  prize-frequency tables are **not** in the installed JSON (only wheel motion/artwork
  metadata).
- **Still unresolved** (`spin-rule-evidence.json` → `unresolved`): starting chips and
  initial time-bank cards per multiplier, native wheel/reveal sequence, play-money
  insurance settlement.
- D: `server/table.js:71–104`, `:241–242` (uniform invented multiplier).
  `server/db.js:345`, `:422` (3-max at 15,000 and 6-max at 30,000 buy-ins, neither
  evidenced).

### Implementation slices

| # | Slice | Files | Tests |
|---|---|---|---|
| S1 | **Correctness first: remove the invented distribution.** Port the verified play-money outcome table, payouts and blind levels from Codex `engine/spin.mjs` into `server/spin.js`. This is a port with attribution in the file header, the same pattern as the PR #30–#33 ports. `table.js` asks `spinOutcome(buyIn, rng)` and `spinBlindLevel(...)`. Re-seed Spin tables to the 5,000/10,000 stakes only and disable the 15,000/30,000 rows (migration sets `enabled = 0`). Use a crypto RNG. | new `server/spin.js`, `server/table.js:100–104`, `:241`, `server/db.js` | new `server/spin.test.js`, ported from `spin-test.mjs`: every outcome boundary, ticket total = 100M, both stakes' payouts are integers summing to the pool, minute/hand level transitions, 26-level cap, an unknown multiplier throws |
| S0 | **Capture** the remaining unknowns: starting chips and time-bank per multiplier band (Info dialog after a spin, or the official rules page if readable without workarounds), and the wheel sequence (record a native spin only if David approves a play-money entry). | `docs/designs/evidence/spin/` | — |
| S2 | **Starting stack and time bank.** If S0 resolves them, implement as captured. If not, ship a single labelled DanGG default (500 chips, standard time bank) and keep the gap row open with "starting stack unevidenced". | `server/spin.js`, `server/table.js` | `spin.test.js` cases per band |
| S3 | **Spin lobby + match queue.** Add `POST /api/spin/play {stake, format, games}` → queue. The server pairs players and fills with bots after 5 s, then creates a short-lived `spin-<uuid>` table (like `CUSTOM_CFG` tournament tables), not the seeded rows. Debit the buy-in through the ledger, and refund if cancelled before seating. | `server/index.js` (route) + `server/spin.js` (queue), `src/pages/Lobby.tsx` (Spin tab), new `src/pages/SpinLobby.tsx` + `src/components/spin/*` | `http.test.js`: queue → seated → 1 ledger debit; cancel → refund; the games cap is enforced. `ledger.test.js`: a Spin prize is minted once |
| S4 | **Multiplier wheel.** A client component driven by the server-chosen multiplier (the server reveals it at table start, the client only animates). Timing comes from the installed wheel-motion JSON via `setup_assets.sh` when present, with a CSS fallback. Skip-on-reconnect, same as squeeze. | new `src/components/spin/SpinWheel.tsx`, `tools/setup_assets.sh` | `client-logic.test.js`: `wheelStopAngle(multiplier, segments)` lands on the right segment |

### Acceptance

- Screenshots (native ↔ DanGG): `spin-lobby-3max-5000`, `spin-info`,
  `spin-blind-structure`, `spin-payout-5000`, `spin-payout-10000` (the dialogs must match
  the captured rows exactly); `spin-wheel-landed` (DanGG; native if S0 is approved).
- [ ] No multiplier, weight or stake in DanGG lacks a source line in
      `spin-rule-evidence.json` or a "DanGG default" label in code and the gap row.
- [ ] The S1 test table matches Codex `spin-test.mjs` expectations 1:1.
- [ ] Gap row: "multiplier mapping" is resolved for the play-money stakes. Starting stack,
      time bank and insurance are each marked resolved or "not observable".

---

## 6. Battle Royale

Last in the build order. The rules are only partly observed.

### Target UX/UI

**Phase 1 (ship now): an honest lobby.**
- The Mystery Battle Royale tab reproduces the native lobby *structure* with DanGG copy:
  - left rail: Game Lobby / Game List / Action Race Leaderboard;
  - centre: a stage map with a **Rush Stage** card ("9 of 18 survive · all-in shootout
    after 10 minutes") and a **Final Table Stage** card ("Final 3 players in the money"),
    plus buy-in tier tiles with "up to" bounty and a players count;
  - **Join Now**;
  - right panel: a recent big-bounty feed.
- **Join Now is disabled** with "Coming to DanGG — rules being verified". The seeded
  `br-*` tables are removed from every cash list, so nobody plays plain Hold'em under a
  Battle Royale label.

**Phase 2 (after B1):** an 18-player event built from existing parts:
- the Rush pool engine for the Rush Stage;
- the tournament room for survival tracking and the final table;
- a timed all-in shootout;
- mystery bounties, only if a distribution is evidenced. Otherwise flat bounties
  labelled DanGG.

### Reference evidence

- N: `home-art/observed-battle.png` (1200 × 720) shows:
  - left rail: Game Lobby / Game List / Action Race Leaderboard;
  - Rush Stage: "9 out of 18 survive", "All-in shootout after 10 minutes";
  - Final Table Stage: "Final 3 players In the Money", "Mystery Jackpot Bounty up to
    $10,000";
  - buy-in tiers $0.25 / $1 / $3 / $10 / $25 → up to $5,000 / $10,000 / $30,000 /
    $100,000 / $250,000, with player counts 1,070 / 443 / 520 / 241 / 174;
  - **Join Now**, a "Mystery Battle Royale details…" link (not opened), an "Epic Mystery
    Jackpot Bounties" feed and a "$10,000 Daily" ribbon.
- C `FEATURES.md:14`: "Reference label observed. Missing: game rules and format".
- **Unobserved**: the details dialog, blind/stack structure, the shootout mechanics, the
  bounty distribution, how bounties are won, Action Race scoring and play-money
  availability.
- D: `server/db.js:424–426` (4 × `br-*` playable as plain Hold'em), `Lobby.tsx:17`
  (`battle: ['battleroyale']`), `Tournaments.tsx:20` (discover art).

### Implementation slices

| # | Slice | Files | Tests |
|---|---|---|---|
| B0 | **Stop mislabelled play.** A migration sets `enabled = 0` for `game = 'battleroyale'`, and `join_table` refuses `battleroyale`. The Battle tab renders a new `BattleRoyaleLobby.tsx` (structure above, DanGG artwork/copy, disabled Join Now with a reason). | `server/db.js`, `server/index.js` (join guard), new `src/pages/BattleRoyaleLobby.tsx`, `src/pages/Lobby.tsx` | `api.test.js`: joining `br-1` → error. `http.test.js`: `/api/lobby` lists no `battleroyale` rows |
| B1 | **Capture** the details dialog and the Game List and Action Race Leaderboard views (navigation only). If play-money Battle Royale exists, capture one event's structure, observed only. | `docs/designs/evidence/battle-royale/` | — |
| B2 | **Format spec.** Write `docs/designs/battle-royale-spec.md` from B1. Each rule cites a capture, and every unknown gets a stated DanGG default for David to approve. No code before approval. | doc only | — |
| B3 | **Event engine (after B2 approval).** Compose `rush-pool.js` (R1) and `tournament-room.js`: 18 entrants, survival counter, shootout timer, 9-player final table, top-3 payouts via `payoutTable`, bounties per spec. | new `server/battle-royale.js`, tests `server/battle-royale.test.js` | 18 bots to completion: exactly 9 reach the final table, chips conserved, 3 paid |

### Acceptance

- Screenshots: `battle-lobby` (native ↔ DanGG, layout structure; copy and artwork differ
  by design), `battle-join-disabled` (DanGG).
- [ ] B0: no route lets a user sit at a `battleroyale` table.
- [ ] B2 is approved by David before any B3 code. Each rule in the spec cites evidence or
      is labelled a DanGG default.
- [ ] Gap row: "Rules unobserved" is replaced with the observed headline facts and an
      explicit list of what's still unknown.

---

## 7. Sequencing and ownership

| Order | Slice(s) | Model (design-goal roles) | Why this order |
|---|---|---|---|
| 1 | W0, C0 captures | Fable (screenshot critique) | They unblock both design-visible gaps. Navigation only, no gameplay risk |
| 2 | W1–W4 | Opus (server/lifecycle), Fable (UI) | Most visible lobby gap. The server model is pure and testable |
| 3 | F1–F3 | Fable | Pure helpers + UI. They also shrink `Lobby.tsx` |
| 4 | C1–C3 (C4 if evidenced) | Opus (validation/WS), Fable (panel, artwork) | Chat security hardening (allowlist) ships in C1 |
| 5 | **S1**, **B0** | Opus | Correctness fixes: remove the invented Spin weights and mislabelled Battle Royale play. Small and urgent, so they can run in parallel with 2–4 |
| 6 | T1, T2 (after T0), T3 | Opus | Finishes the shipped MTT row |
| 7 | R0–R5 | Opus, Fable for R3/R4 UI | R1 extraction first. B3 depends on it |
| 8 | S0, S2–S4 | Opus, Fable (wheel) | Gated on evidence |
| 9 | B1–B3 | Opus | Last, as the build order says. B3 is gated on David's approval of B2 |

Every PR:
- updates `CHANGELOG.md` and its gap row in `replica-gap-analysis.md`;
- passes `pnpm test`, typecheck and lint (CI green);
- attaches its acceptance screenshots under `docs/designs/evidence/<gap>/`.

Also, at the next touch, correct the stale `parity-backlog.md` items noted in the gap
analysis (SSE, per-variant Elo, hotkeys, backgrounds).
