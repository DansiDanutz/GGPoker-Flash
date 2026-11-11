# Parity backlog and implementation ledger

Audit date: 2026-11-11

## Verification

- `server/features.test.js` covers private table create/list/mute/delete, private tournament create/detail/delete, cashier bonus idempotency and direct messages; the suite is now 45 tests, including host-table bomb flags, notification read state, report evidence, hand-evidence snapshots and ELO.

## Sources

- This app (`GGPoker-flash`, React + Node/SQLite, server-authoritative).
- Codex's independent local clone at `/Users/davidai/Documents/ChatGPT/REA/GGPoker`
  (`FEATURES.md`, `GOAL.md`, tests and `home-art/rea` evidence).
- Installed GGPoker client assets and REA 6.8.0 inventory
  (`/Applications/GGPoker.app`, `/Applications/GGPoker-PlayMoney.app`).

KKPoker was not exposed as a running automation target during this audit; it
must not be treated as observed parity. The Codex clone is a feature reference,
not a source to copy blindly.

## Implemented in this pass

- Validated 256×256 PNG avatar storage:
  - server-side PNG signature/IHDR/CRC/inflate validation;
  - ancillary chunks stripped before storage;
  - 530 kB encoded / 384 kB decoded limits.
- Profile avatar workflow:
  - generated 256×256 preset avatars;
  - local PNG/JPEG/WebP upload with centre crop;
  - reset to generated avatar;
  - selected-state UI and immediate header refresh.
- Settings:
  - independent sound channels (SFX, voices, alerts, lobby music, ambience);
  - betting shortcuts: four pre-flop BB values and four post-flop percentages,
    persisted and previewed;
  - nine native 122×162 card-back images plus official card-face sprites;
  - seven room backgrounds, including official 6-ring, 5-ring, Envelope, SuperCircuit and Mystery Envelope artwork plus dark room and stone floor;
  - stack display in chips, big blinds, or both (click a stack to cycle);
  - buy-in default as a percentage of table maximum;
  - auto top-up with trigger/target percentages;
  - show-hand-strength toggle;
  - enable-hotkeys and show-hints toggles;
  - dealer animation speed;
  - configurable time bank (5–60 seconds, server-clamped);
  - real password change and revoke-other-sessions;
  - email is read-only because no account-email mutation API exists.
- Bomb-pot cash tables:
  - private host option; every seated player antes one big blind;
  - action starts directly on the flop;
  - table badge and server-authoritative `bomb_pot` config;
  - no preflop betting round.
- Private home tables:
  - player-created table with name, game, seats, blinds and buy-in range;
  - owner visibility in the lobby, public isolation from `/api/tables`;
  - private-table rows carry `owner_id` and `private` in SQLite;
  - creation is audited and capped at eight tables per owner;
  - owner table list, copy-invite link and delete action in the host modal;
  - per-table owner chat moderation for seated players, with persistent mute rows;
  - auto buy-in from the lobby Join action.
- Tournament lifecycle:
  - blinds advance on a real clock (`blind_speed` minutes), not hand count;
  - tournament header shows the next-level countdown;
  - a 15-second scheduler moves registering events with at least two entrants to running after their start time;
  - late-registration checks remain enforced by the registration endpoint.
- Private tournaments:
  - owner-created freezeouts with format, mode, buy-in, fee, stack, blind speed, late registration, bounty, ticket and start time;
  - owner-only lobby visibility, direct `?id=` invite links, registration, play and deletion;
  - private tournament rows carry `owner_id` and `private`.
- Rush lobby hero:
  - live player/pool counts;
  - Cash Drop chance;
  - Rush transfers choose the least-occupied matching pool.
  - quick-fold explanation replacing the generic promo carousel on the Rush tab.
- Rush Cash Drop:
  - 12% chance after a Rush hand;
  - awards a random human at the table with a play-money drop;
  - ledger transaction, table overlay and native cash-drop sound.
- Table:
  - eight-reaction emote tray with server broadcast and table/account mute enforcement;
  - card-back skin from settings;
  - four configurable quick-bet buttons with pre/post-flop labels;
  - show-hand and hotkey-hint preferences;
  - animation speed applied through `--deal-speed`;
  - existing three action layouts retained.

- Native hotkey remapping:
  - Fold, Check/Call, Raise and All-in bindings are captured from the keyboard;
  - bindings persist locally and table hints use the selected keys;
  - inputs/textareas are excluded from table hotkeys.
- Multi-table windows: Settings can open joined tables in new Electron windows, and the buy-in modal exposes **New window**; auto buy-in respects the same setting.
- Tournament search now filters by event name or format.
- ELO rating:
  - persisted per-user rating with win/loss settlement on completed cash hands;
  - opponent-weighted Elo (K=24, ±30 cap) with separate Hold'em, PLO, Short Deck and Rush & Cash ladders;
  - divisions, current rank and recent history;
  - ELO Challenge creates a private heads-up table with an invitable link;
  - only players dealt into the hand are rated.
- Player reporting:
  - report from the table profile with reason and details;
  - persisted reports with optional hand ID, audit entries and admin resolve/dismiss workflow;
  - admin **Hand** evidence viewer with animated board reveal, hole cards, stacks, bets, wins and action timeline.
- Table player profiles:
  - click a seat to see public avatar, VIP, country, hands/wins/biggest pot and presence;
  - add friend or open a direct message from the profile;
  - self hides friend/message and links to My Page.
- Notification center:
  - unread DMs, pending friend requests, registered tournaments and daily bonus;
  - per-item read state persisted in `notification_reads`;
  - global badge uses the derived notification count;
  - each item deep-links to Cashier, My Page, Tournaments or Rewards.
- Friend requests:
  - request instead of instant follow;
  - incoming Accept/Decline panel;
  - outgoing pending state;
  - reciprocal request auto-accepts;
  - table-profile Add friend shows Requested.
- Direct messages between local accounts:
  - Server-Sent Events push for new DMs and friend requests, with 15-second polling fallback;
  - live DM thread refresh when the conversation is open;
  - global unread badge;
  - inbox threads with unread counts;
  - message history and send endpoint;
  - friend **Message** opens the conversation;
  - account-wide chat mute applies to direct messages.
- Crash casino game:
  - server-generated crash point, hidden until the round ends;
  - live multiplier, cash-out endpoint with ledger settlement;
  - recent-round history and mobile layout;
  - API integration test covering start, status and cashout.
- Cashier transactions:
  - searchable history with category filters;
  - client-side CSV export of the filtered set.
- Cashier bonuses are real, not toast-only:
  - welcome once per account, reload once per ISO week, daily once per UTC day;
  - persistent `bonus_claims` rows, idempotent ledger references and audit entries;
  - the bonus cards show Claimed/Claim from the API.

## Still missing or partial

- True multi-table tournament flights, balancing and table breaks; cash multi-tabling works through separate Electron windows.
- KKPoker-specific surfaces and verification; KKPoker is not installed or exposed to automation on this machine.
- Push-based DMs/notifications; current implementation polls every 15 seconds.
- Full native table-background catalogue beyond the five room choices.
- Native hotkey remapping; F1–F4 are fixed with an enable toggle.
- Elo is one ladder rather than separate ladders per game variant.
- Exact native card geometry/anti-aliasing differences from the six official sprites.
