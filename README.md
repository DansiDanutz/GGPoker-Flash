# DanGG.ro — local GGPoker desktop clone

A working, offline, **play-money** reconstruction of the GGPoker desktop client (the Adobe AIR client
installed on this Mac), rebuilt as a native desktop app with the original client's artwork, fonts,
sounds and interaction design, plus a full administration console.

> This is a local demonstration clone. It is not affiliated with GGPoker, has no real-money
> deposits/withdrawals, and no cash value. Original artwork/audio remain the property of their owners
> and were extracted from the copy of the client installed on this machine for reverse-engineering
> and interoperability purposes.

---

## Run it

### The desktop app (recommended)

Open **`~/Applications/DanGG.ro.app`** (double-click), or run
**`Launch DanGG.ro.command`** from this folder. The app starts its own local server
(127.0.0.1:5198) and opens a frameless, resizable window (default 1200×961, minimum 360×640) with the client.

If macOS quarantines the unsigned build, run once:

```bash
xattr -dr com.apple.quarantine "$HOME/Applications/DanGG.ro.app"
open "$HOME/Applications/DanGG.ro.app"
```

### Development

```bash
cd app
pnpm install
pnpm dev          # Vite on :5199 + API/WebSocket on :5198
pnpm desktop:dev  # Electron window pointed at Vite
```

Production build + desktop:

```bash
cd app
pnpm build        # writes app/dist
pnpm desktop      # Electron loads http://127.0.0.1:5198
```

### Install on the phone

A new account created on a phone lands on the **Download App** step instead of the
lobby:

- **Android / Chrome** — *Download App* opens Chrome's native install prompt (the
  client is an installable web app). When the prompt is unavailable (another
  browser, or it was dismissed) the same screen shows the manual path:
  **⋮ → Install app / Add to Home screen**.
- **iPhone / iPad** — Safari has no install API, so *Download App* reveals
  **Share → Add to Home Screen** and a confirmation button.
- **Continue in browser** is always available and is remembered; desktop
  sign-ups skip the step, and launching from the home-screen icon skips it too.

The installable shell is `app/public/manifest.webmanifest`, `app/public/sw.js`
and the icons in `app/public/pwa/`. The service worker registers only in
production builds, never caches `/api` or `/ws`, and drops old hashed assets
when it activates so an installed app does not accumulate stale bundles.

### Accounts

| Account | Password | Notes |
|---|---|---|
| `DansiDanutz` | `ggpoker` | demo player, $10,000 play balance, VIP 5 |
| `admin` | `admin123` | full admin console |
| `guest` | `guest` | guest account |

New accounts can be created on the login screen (welcome bonus is credited automatically).
Admin console: log in as `admin`, then `#/admin` (or Settings → Admin).

Table-room layers are generated from the decoded AIR table kit by `tools/make_room.py`.

The client is branded **DanGG.ro**: the wordmark is rebuilt from the original rounded GG glyph and
the Flipout banner uses a personal portrait in place of the GGPoker spokesperson.

---

## Controls

| Key | Action |
|---|---|
| F1 | Fold |
| F2 | Check / Call |
| F3 | Raise (current slider amount) |
| F4 | All-in (pot-sized raise at pot-limit tables) |
| Esc | Close menu / dialog |

While waiting for your turn you can queue **Check / Fold**, **Check** or **Call** (a queued call is
dropped if the price changes). On your turn the bar shows sizing presets (2.5x/3x/4x the big blind for an
unopened pot, 33/50/75/100% of the pot otherwise) and the pot odds of a call.

Table menu: sit out, rebuy, auto-rebuy, rabbit hunt, four-colour deck, animations, hand history, leave.
Click any player's seat to open a private note.

Lobby: click a row to preview, double-click or **Join** to take a seat, **Group View** for card layout,
the mail icon for notifications, the chat icon for lobby chat, and the gear for settings.

## What is implemented

### Lobby (1:1 chrome, real assets)
- Frameless macOS window with the client's title bar, traffic lights, online counter and icon strip.
- Original `PLAY GG.RO` logo, POKER / TOURNAMENTS / SLOTS / CASINO header pills, Bad Beat Jackpot ticker.
- Second row game tabs using the original tab artwork: **Home, All-in or Fold, Rush & Cash,
  Hold'em, PLO/PLO5/PLO6, Short Deck, Spin & Gold, Mystery Battle Royale**.
- Promotional carousel using the client's Flipout banner.
- Cash-game table list with **stake/seat/speed filters, table search, favourites**, sortable columns,
  table selection,
  live preview (animated mini-table with seats, blinds, dealer button), buy-in range and Join/Open.
- **Table View / Group View** toggle, right rail with balances (USD, P$, T$, XP), Cashier,
  Prop Bet, GG Left, My Promo, Missions, Leaders, GGPass.
- Live lobby chat (persisted), notifications badge, guest browsing.

### Poker tables
- Real No-Limit Hold'em engine: blinds, antes, betting rounds, min-raise rules, all-in,
  side pots, showdown, split pots, hand evaluation, dealer button, timers.
- Variants: **Hold'em, PLO/PLO5/PLO6 (2+3 rule), Short Deck (36 cards), All-in or Fold, Rush & Cash,
  Spin & Gold SNG** (3-handed, prize wheel, escalating blinds, winner-takes-all),
  Mystery Battle Royale tables.
- Bot opponents with Monte-Carlo equity decisions fill empty seats; stack persistence.
- Buy-in modal with min/max range, percentage presets and seat selection; cash-out on leave.
- Rake (5%, capped) on cash-game pots; tournament and Spin & Gold pots are rake-free.
- **Spectate a table** (Open), take a seat from the rail, rebuy/add chips between hands and toggle auto-rebuy.
- **Private player notes** (per player, colour-coded; written at the table and managed from My Page, stored locally in SQLite).
- **Friends list**: add players by nickname, see who is currently seated at a table, message or remove them.
- Four-colour deck option and an animation toggle; cards fly from the dealer and chips travel to the pot/winner.
- **All-in flash**, hand-strength indicator (`Two Pair · AK suited`), win overlay, chip animations,
  hotkeys (F1 fold, F2 check/call, F3 raise, F4 all-in),
  per-action sounds (the client's own MP3s), turn timer ring, card-deal animations,
  rabbit hunt, sit-out, table menu, table chat + emotes, hand history link.
- Themes: Green, Black, Red, Navy, Purple, Gray, Brown, Cobalt, Cooper, Choco Brown.
- Multiple human players can join the same table in two windows/devices (WebSocket rooms);
  bots fill the rest.

### Tournaments
- Live tournament list (12 seeded events) with start time, buy-in, guaranteed prize pool,
  entrants, status, filtering.
- Detail view with Overview / Blind structure / Prize table, registration and unregistration
  (debited/refunded from the play balance), featured hero banner and countdown.
- **Playable tournaments**: registered events start a 6-max tournament table with the player's
  starting stack, blind levels that increase every *n* hands, eliminations, top-3 payouts
  (50/30/20 of the prize pool) and a tournament-winner presentation.

### Casino & slots
- **Slots**: 5×3, 10 paylines, weighted symbols, server-authoritative payouts, reel animation and win overlay.
- **Roulette**: single-zero wheel, number/colour/parity/dozen/column bets, animated wheel.
- **Blackjack**: deal/hit/stand, hidden dealer card, 3:2 blackjack, bust handling.
- **Baccarat**, **Dragon Tiger**, **Sic Bo**: playable with real card/dice presentation.
- **Prop Bet** markets with server-side settlement.

### Cashier & rewards
- Cashier with USD / P$ / T$ / Gems balances, deposit, withdraw, payment methods,
  full transaction ledger and bonus offers.
- Daily freebie (once per day), GGPass level + XP bar, 10-step reward track,
  daily missions with progress and claims, Fish Buffet prize wheel (animated),
  leaderboards (top players by VIP points), VIP benefits.
- Hand history for every hand with filters, board/action replay, players, cards, pot and winners.
- **My Page** hub (overview, My Promo, weekly missions, transactions, tickets, messages, leaderboard, verification, security).
- **Ocean Rewards**: gem balance, eight ocean ranks (Clownfish → Whale), gem store with instant redemptions and a gem activity ledger.
- **GG Care**: bad-beat jackpot status, qualifying hand, daily care bonus and how-it-works.
- **Honeymoon**: new-player package with a one-time welcome bonus, daily gift and starter mission path.
- **Fish Buffet ranks** (Plankton → Killer Whale) with multipliers and reward history.
- Pop any table out into its own window for multi-tabling.
- Profile with stats, nickname change, avatar picker.

### Settings
Language (20), sound on/off + volume + channel switches + sound test, animations,
run-it-twice, auto-muck, four-colour deck, time bank, table colour themes, account/security,
responsible-gaming limits and take-a-break screen.

### Admin console (`#/admin`)
- Dashboard: users, hands, tables, tournaments, live tables with force-close, turnover,
  jackpot, online count, recent transactions.
- **Users**: search, edit balances/chips/tickets/VIP, credit/debit, ban/unban, reset password, delete.
- **Cash tables**: create/edit/delete, enable/disable, feature, full stakes/buy-in configuration.
- **Tournaments**: create/edit/delete (buy-in, fee, GTD, start, status, format).
- **Promotions**: banner slots (home/tournaments/slots/casino/cashier), image/link/enable.
- **Missions**: create/edit/delete/reset, reward kinds (USD/P$/ticket/gem).
- **Game settings**: every server-side constant (jackpot, online base, bot speed, rake, welcome bonus,
  default balance, maintenance flag).
- **Account security**: real password change (invalidates other sessions) and active-session management with per-device revoke.
- **Identity verification**: players submit legal name, DOB, country, document type and a photo; admins review/approve/reject with a note.
- **Branding**: upload a replacement wordmark and lobby banner (stored in SQLite, served instantly to every window) or reset to the defaults.
- **CSV exports** for users, transactions, hands and tournaments (BOM-prefixed UTF-8, available from the dashboard).
- **Transactions** ledger, **Audit log**, and lobby **announcements**.

---

## Architecture

```
app/
  src/                 React 19 + TypeScript front-end (Vite)
    pages/             Lobby, Table, Tournaments, Cashier, Rewards, Casino, Settings, Admin …
    components/        TitleBar, AppHeader, GameTabs, PageShell, PlayingCard, Avatar …
    game/eval.ts       client-side hand evaluator (hand-strength label)
    lib/               API client, app store, sound engine
  server/
    index.js           HTTP API + WebSocket + static hosting (node:http, ws)
    db.js              node:sqlite schema, seed, sessions, ledger
    poker.js           deck, shuffle, 5/7-card evaluation, Omaha, Monte-Carlo equity
    table.js           poker table state machine (betting, side pots, showdown, bots)
  electron/
    main.cjs           frameless BrowserWindow + local server supervisor
    preload.cjs        window controls bridge
  public/assets/       extracted original client art, sounds, fonts
~/Applications/DanGG.ro.app   packaged desktop build (Electron runtime, Developer ID signed)
research/              reverse-engineering evidence, decompiled sources, screenshots
tools/                 asset extraction / ATF decoding / UI automation scripts
```

- Persistence: SQLite (`node:sqlite`), stored in `~/Library/Application Support/GGPoker Clone/data`.
- Realtime: a WebSocket per table; every state change is pushed, events drive sounds/animations.
- Ports: API/WebSocket **5198**; Vite dev server **5199**.

---

## Reverse engineering summary

The installed client is an **Adobe AIR/Flash application**:

- `/Applications/GGPoker.app` is a thin NCF launcher (Cocoa + AIR) that downloads an AIR bundle.
- The real client is `~/Library/Application Support/com.nsuslab.ncf.launcher.live.ggpcom/`:
  `Loader/GGPoker.app` (AIR app: `Adobe AIR.framework`, `IronANE.framework`, `LockneANE.framework`)
  and `Game/51/IronDesktop.swf` (41.8 MB, uncompressed SWF, AIR SDK 51).
- `string_table.json` provides 11,632 localised UI keys; `Game/assets/` ships ~1.4 GB of
  PNGs/atlases, MP3s, Spine animations and bitmap fonts.
- The SWF was decompiled with **JPEXS FFDec 26.4** into 8,694 ActionScript classes
  (`research/swf_export/scripts`) — lobby, table, cashier, tournaments, promotions, popups.
- Sprite atlases (`init_lobby/desktop_assets.png`, 4,096², 4,925 frames) were sliced with the
  TexturePacker JSON; the current build uses **3,564** non-empty frames.
- Stage3D **ATF** textures were decoded with a custom DXT5 decoder (`tools/atf_decode.py`)
  to recover card faces (2,048×1,024) and the table asset kit (seat rings, buttons, chips).
- The client's **Roboto / Roboto Condensed** fonts were exported from `font.swf`.
- All 73 table/lobby sounds and the lobby music come from `Game/assets/sounds`.

See [`research/REVERSE_ENGINEERING.md`](research/REVERSE_ENGINEERING.md) for the evidence trail,
file inventory and the exact commands used.

The public repository contains **source code and tooling only**; the extracted GGPoker artwork,
sounds and fonts are intentionally not published. Run `bash tools/setup_assets.sh` locally to
regenerate them from your installed client.

---

## Parity notes

Faithful to the installed client:
- lobby layout, top navigation, game tabs, table list and side rail, built from the client's own artwork;
- the original sound effects, lobby music and many table/notification cues;
- the string table's 30 locales (including RTL Arabic) for the shared UI vocabulary;
- cash-game Hold'em, PLO, PLO5, PLO6, Short Deck, tournament, Spin & Gold and Mystery Battle Royale formats with a server-authoritative engine;
- cashier, rewards, missions, GG Pass, Fish Buffet, Ocean Rewards, GG Care, Honeymoon, Prop Bet, hand history and support.

Deliberate approximations in this local build:
- the 3D Stage3D room is recreated with CSS over the decoded room texture rather than a GPU scene;
- there is no live-dealer video streaming; casino tables are local RNG games;
- some clone-specific labels outside the original string table remain English in non-Romanian locales;
- slot content and the largest tournament series are representative rather than a full content catalogue.

The public repository contains code only. GGPoker artwork, fonts and audio are generated locally from the installed client with `tools/setup_assets.sh` and the asset tools, and are not redistributed.

## Design and review (EGM)

The project uses Google's Elephant-Goldfish Model (EGM) via the `dsh-egm`
plugin. The design-of-record is
[docs/designs/dangro-clone.md](docs/designs/dangro-clone.md); the fresh-context
Goldfish reviews and the consolidated disposition are in
[docs/designs/reviews/](docs/designs/reviews/).

The review changed the code: `addTransaction` is now a single SQLite
transaction, the deck shuffle uses `node:crypto`, the app enforces a single
instance, CDP is gated to dev, request bodies are capped, and 39 committed
`node:test` cases cover the engine and ledger (`cd app && pnpm test`).

### 2026-11-11 full audit

A full audit of the engine, server, desktop shell and table UI is recorded in
[docs/audits/2026-11-11/poker-client-audit.html](docs/audits/2026-11-11/poker-client-audit.html).
It fixed betting-order, all-in, side-pot and leave-table bugs in the engine, several ways to mint
chips, a hand-history privacy leak and the local-server attack surface. The suite is now 67 tests
(`cd app && pnpm test`), including chip-conservation simulations for every game type.

Rules now enforced by the engine: action starts left of the big blind pre-flop; uncalled bets are
returned and hands that end before the flop are not raked; a short all-in does not reopen betting;
Short Deck ranks a flush above a full house and counts A-6-7-8-9 as a straight; PLO is pot-limit and
PLO5 deals five cards; All-in or Fold really is shove-or-fold.

A dropped connection keeps your seat for 60 seconds (`GGPOKER_DISCONNECT_GRACE_MS`); quitting the
app cashes every seat out at its real stack.

## Notes / scope

- This is a faithful **functional** clone: layout, art, audio, tab structure, game flow and
  interactions are reconstructed from the shipped client; some server-driven content (live player
  counts, promotion copy, tournament schedules) is seeded locally and editable in the admin console.
- Bots are intentionally imperfect and play for play chips only.
- No real-money payment processing, KYC, or account connectivity is included.
