// Run it 1-3 times: pure helpers for the all-in run choice. Free of table state so Node can test them.

/** How long the all-in players have to choose before the hand runs once. */
export const RUN_ASK_MS = 8000;
export const MAX_RUNS = 3;

/** The number of runs every chooser agreed to: the smallest choice wins, and no choice means once. */
export function agreedRuns(choices) {
  if (!choices.length) return 1;
  return Math.max(1, Math.min(MAX_RUNS, ...choices));
}

/** One board per run. Every run keeps the cards already dealt and completes from a copy of the deck. */
export function boardsFor(board, deck, runs) {
  const rest = [...deck];
  const boards = Array.from({ length: runs }, () => {
    const run = [...board];
    while (run.length < 5) run.push(rest.pop());
    return run;
  });
  return { boards, deck: rest };
}

/** Split a pot across runs; odd chips go to the earlier runs. */
export function splitAmount(amount, runs) {
  const share = Math.floor(amount / runs);
  const extra = amount - share * runs;
  return Array.from({ length: runs }, (_, i) => share + (i < extra ? 1 : 0));
}
