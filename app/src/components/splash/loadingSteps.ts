// Status lines under the loading bar. Free of React so Node can test it.

export const LOADING_STEPS: readonly string[] = Object.freeze([
  'Shuffling the deck…',
  'Stacking your chips…',
  'Finding you a seat…',
]);

/** How long each status line shows, in ms. */
export const LOADING_STEP_MS = 700;

/** The status line for `elapsedMs` since the screen appeared; holds the last line on a slow load. */
export function loadingStep(elapsedMs: number): string {
  const index = Math.min(Math.max(0, Math.floor(elapsedMs / LOADING_STEP_MS)), LOADING_STEPS.length - 1);
  return LOADING_STEPS[index];
}
