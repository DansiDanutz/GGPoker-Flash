// How long the table stays on a finished hand before the next deal, so the client's end-of-hand
// show is over and the table is clear first (checked against the client in hand-clear.test.js):
// showdown = card reveal (src/game/showdown.ts, 2.7 s) + WIN banner (2.6 s); fold win = the pot
// slide (src/game/payoutMotion.ts, 2 s), or the WIN banner when a player wins it.
export const CLEAR_MARGIN_MS = 500;
export const SHOWDOWN_CLEAR_MS = 5800;
export const FOLD_WIN_BOT_MS = 2500;
export const FOLD_WIN_MS = 3100;
