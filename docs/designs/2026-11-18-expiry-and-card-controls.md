# Disposable all-in expiry and mobile table controls

## Financial reproduction

Run `node --test app/server/active-expiry.test.js app/server/organizer-billing.test.js app/server/organizer-chips.test.js`.
All 27 tests pass. In-memory SQLite, synthetic users, fixture service credits and chip
inventory only; no production accounts, network payments or deployment.

The existing normal-showdown case remains. Added deterministic all-in cases cross the
injected billing boundary before completing the hand:

- Heads-up, 5,000 each: aces win 9,700, opponent zero, 300 rake.
- Four players, stacks 1,000 / 2,000 / 3,000 / 3,000 and ordered pocket aces/kings/queens/jacks:
  main pot 4,000 less 300 rake goes to aces; 3,000 first side pot goes to kings;
  2,000 second side pot goes to queens. Final payouts 3,700 / 3,000 / 2,000 / 0.

Settlement replay applies nothing; repeated deal attempts retain the hand identity;
three unfunded start retries fail; exactly one initial hourly charge remains. Cash-out,
escrow reconciliation and minted = circulating + burned all pass. This is disposable
module integration evidence, not a new live or browser financial test. Pricing-tier
transitions and restart recovery remain pending.

## Reference and implementation

Reviewed the supplied 17 November cash/table recordings (20:59:52, 300 seconds;
21:08:58, 11.77 seconds) and accompanying PhoneExplorer artefact. Local frame sheets
remain operator-local. The cash recording shows enlarged face-down cards rising from
below the table, peeling open, waiting Check/Fold controls, and a bottom feature drawer.
No video or third-party frame is added to the repository.

Reuse the existing card squeeze renderer: enabled for fresh deals unless the user saved
an explicit opt-out. Inspect cards can reopen the panel during a hand. Existing Open,
keyboard/drag behavior and preference remain; completion/hand end closes it.
Bet/raise controls continue to render only on the player's turn. Off-turn queued actions
are reduced to the existing Check/Fold behavior, removing queued calls and extra variants.

On portrait phones the upward-drag handle opens only Chat and Emoticons. Tap and keyboard
activation remain available. Existing chat moderation, spectator restrictions and reaction
sending are reused. Reduced-motion removes drawer animation. The dock stays accessible
on the player's turn instead of the previous CSS visibility suppression.

## Validation

TypeScript and whitespace checks pass. The loopback browser smoke uses disposable players,
checks cash/tournament tables at 390x844 and 320x700, and captures card inspection and
emoticon menus. Its extra interaction sequence is performed once before the layout sweep
to avoid exhausting the tournament fixture's normal action timer. Earlier harness timeouts
are retained locally; the revised sweep passed. No production code was changed to extend
action timeouts.

Limit: original iOS/device hardware and exact frame-for-frame animation parity are not
certified. Financial all-in/side-pot coverage is deterministic module integration; browser
smoke covers presentation, not paid settlement. No merge or deployment authorized here.
