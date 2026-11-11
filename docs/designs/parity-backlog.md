# Parity backlog and implementation ledger

Audit date: 2026-11-11

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
  - six card-back skins;
  - show-hand-strength toggle;
  - enable-hotkeys and show-hints toggles;
  - dealer animation speed;
  - real password change and revoke-other-sessions;
  - email is read-only because no account-email mutation API exists.
- Table:
  - card-back skin from settings;
  - four configurable quick-bet buttons with pre/post-flop labels;
  - show-hand and hotkey-hint preferences;
  - animation speed applied through `--deal-speed`;
  - existing three action layouts retained.

## Still missing or partial

- Buy-in defaults, auto top-up and auto buy-in (Codex has these).
- Six native card-front layouts; this app has two/four-colour only.
- Native table background catalogue and per-table appearance overrides.
- Native hotkey remapping; this app has fixed F1–F4 with an enable toggle.
- Codex's owner-hosted room/tournament console, chat moderation and invitation
  flows are a different architecture; this app has an admin console and local
  tournaments but not the same owner workflow.
- Multi-table play, Rush queue parity and KKPoker-specific surfaces remain open.
- Timer seconds are fixed at 10 in the engine; the old dead slider was removed
  from the UI rather than pretending it worked.
