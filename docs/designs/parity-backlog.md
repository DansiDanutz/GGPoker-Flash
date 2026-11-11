# Parity backlog and implementation ledger

Audit date: 2026-11-11

## Verification

- `server/features.test.js` covers private table create/list/mute/delete, private tournament create/detail/delete, cashier bonus idempotency and direct messages; the suite is now 44 tests.

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
  - five room backgrounds, including official 6-ring, 5-ring and Envelope table artwork plus dark room and stone floor;
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

- Multi-table windows: Settings can open joined tables in new Electron windows, and the buy-in modal exposes **New window**; auto buy-in respects the same setting.
- Tournament search now filters by event name or format.
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
  - global unread polling and title-bar badge;
  - inbox threads with unread counts;
  - message history and send endpoint;
  - friend **Message** opens the conversation;
  - account-wide chat mute applies to direct messages.
- Cashier bonuses are real, not toast-only:
  - welcome once per account, reload once per ISO week, daily once per UTC day;
  - persistent `bonus_claims` rows, idempotent ledger references and audit entries;
  - the bonus cards show Claimed/Claim from the API.

## Still missing or partial

- Auto buy-in from the lobby (Codex has this); the default percentage and
  auto top-up exist, but seating still asks for an explicit buy-in.
- Native six-front artwork; this app has four CSS front styles.
- Native full table background catalogue and per-table appearance overrides; this
  app exposes three official room backdrops globally.
- Native hotkey remapping; this app has fixed F1–F4 with an enable toggle.
- Codex's owner-hosted room/tournament console, chat moderation and invitation
  flows are a different architecture; this app has an admin console and local
  tournaments but not the same owner workflow.
- Multi-table play, Rush queue parity and KKPoker-specific surfaces remain open.
- Timer seconds are fixed at 10 in the engine; the old dead slider was removed
  from the UI rather than pretending it worked.
