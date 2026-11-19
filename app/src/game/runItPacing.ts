// Run it 2-3 times, dealt like a live dealer: board 1 comes out first (flop, turn, river, each on
// its own beat), then board 2, then board 3. When every board is out the table waits, then names the
// winner of each board in turn. Times are milliseconds from the win event.
// The server holds the next hand long enough for all of it (server/handPacing.js runPresentationMs,
// checked in server/run-it-pacing.test.js).

export const RUN_START_MS = 600;
export const RUN_STEP_MS = 1000;
export const RUN_GAP_MS = 2000;
export const RUN_FLOP_STAGGER_MS = 120;
export const RUN_RESULT_PAUSE_MS = 1200;
export const RUN_RESULT_STEP_MS = 1600;
export const RUN_RESULT_HOLD_MS = 1200;
export const RUN_RESULT_EXTRA_MS = 5000;
export const RUN_TURN_EXTRA_MS = 1000;
export const RUN_RIVER_EXTRA_MS = 2000;

export type RunSchedule = {
  /** Per board, per card: when it lands, or null for a card that was already on the table. */
  delays: (number | null)[][];
  /** When the winner of each board is named. */
  resultAt: number[];
  /** When the chips may move: every board and every result has been shown. */
  done: number;
};

/** How many cards every board shares: the ones dealt before the players chose to run it. */
export function sharedCount(boards: string[][]): number {
  const first = boards[0] ?? [];
  let n = 0;
  while (n < first.length && boards.every((b) => b[n] === first[n])) n++;
  return n;
}

/** Beats per board: the flop lands as one, the turn and the river each on their own. */
export function runSteps(shared: number): number {
  return shared === 0 ? 3 : Math.max(0, 5 - shared);
}

function stepOf(index: number, shared: number): number {
  if (shared === 0) return index < 3 ? 0 : index - 2;
  return index - shared;
}

export function runSchedule(boards: string[][]): RunSchedule {
  const shared = sharedCount(boards);
  const steps = runSteps(shared);
  const extra = (shared <= 3 ? RUN_TURN_EXTRA_MS : 0) + (shared <= 4 ? RUN_RIVER_EXTRA_MS : 0);
  const boardStart = (b: number) => RUN_START_MS + b * (steps * RUN_STEP_MS + RUN_GAP_MS + extra);
  const delays = boards.map((board, b) => board.map((_, i) => {
    if (i < shared) return null;
    const stagger = shared === 0 && i < 3 ? i * RUN_FLOP_STAGGER_MS : 0;
    return boardStart(b) + stepOf(i, shared) * RUN_STEP_MS + stagger
      + (i >= 3 && shared <= 3 ? RUN_TURN_EXTRA_MS : 0)
      + (i >= 4 && shared <= 4 ? RUN_RIVER_EXTRA_MS : 0);
  }));
  const landed = delays.flat().filter((d): d is number => d !== null);
  const lastCard = landed.length ? Math.max(...landed) : 0;
  const resultAt = boards.map((_, b) => lastCard + RUN_RESULT_PAUSE_MS + b * RUN_RESULT_STEP_MS + Math.round(b * RUN_RESULT_EXTRA_MS / boards.length));
  const done = (resultAt.length ? resultAt[resultAt.length - 1] : lastCard) + RUN_RESULT_HOLD_MS + (boards.length > 1 ? RUN_RESULT_EXTRA_MS - Math.round((boards.length - 1) * RUN_RESULT_EXTRA_MS / boards.length) : 0);
  return { delays, resultAt, done };
}
