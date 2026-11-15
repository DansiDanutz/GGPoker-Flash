// How long the table stays on a finished hand before the next deal, so the client's end-of-hand
// show is over and the table is clear first (checked against the client in hand-clear.test.js):
// showdown = card reveal (src/game/showdown.ts, 2.7 s) + WIN banner (2.6 s); fold win = the pot
// slide (src/game/payoutMotion.ts, 2 s), or the WIN banner when a player wins it.
export const CLEAR_MARGIN_MS = 500;
export const SHOWDOWN_CLEAR_MS = 5800;
export const FOLD_WIN_BOT_MS = 2500;
export const FOLD_WIN_MS = 3100;

// Run it 2-3 times: the client deals each board on its own, waits, then names each board's winner
// (src/game/runItPacing.ts runSchedule; the same beats). The next hand waits for all of it on top of
// the usual showdown clear (checked in run-it-pacing.test.js).
const RUN_START_MS = 600;
const RUN_STEP_MS = 1000;
const RUN_GAP_MS = 1000;
const RUN_RESULT_PAUSE_MS = 1200;
const RUN_RESULT_STEP_MS = 1600;
const RUN_RESULT_HOLD_MS = 1200;

/** When each board's winner is named, from the win event, for `runs` boards sharing `shared` cards. */
export function runResultAt(runs, shared) {
  if (runs <= 1) return [];
  const steps = shared === 0 ? 3 : Math.max(0, 5 - shared);
  const lastCard = RUN_START_MS + (runs - 1) * (steps * RUN_STEP_MS + RUN_GAP_MS) + Math.max(0, steps - 1) * RUN_STEP_MS;
  return Array.from({ length: runs }, (_, b) => lastCard + RUN_RESULT_PAUSE_MS + b * RUN_RESULT_STEP_MS);
}

/** How long the client needs to show `runs` boards that share `shared` cards and their winners. */
export function runPresentationMs(runs, shared) {
  const at = runResultAt(runs, shared);
  return at.length ? at[at.length - 1] + RUN_RESULT_HOLD_MS : 0;
}
