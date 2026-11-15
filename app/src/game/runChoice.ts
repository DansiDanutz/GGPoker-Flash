// The all-in "run it" choice panel model (server PokerTable.runAskFor). Free of React so Node can test it.
export type RunAsk = { endsAt: number; maxRuns: number; chosen: number | null };
export type RunChoiceModel = { secondsLeft: number; options: number[]; chosen: number | null };

export function runChoice(ask: RunAsk | null | undefined, nowMs: number): RunChoiceModel | null {
  if (!ask) return null;
  return {
    secondsLeft: Math.max(0, Math.ceil((ask.endsAt - nowMs) / 1000)),
    options: Array.from({ length: Math.max(1, ask.maxRuns) }, (_, i) => i + 1),
    chosen: ask.chosen,
  };
}

const LABELS = ['Run it once', 'Run it twice', 'Run it three times'];

export function runsLabel(runs: number): string {
  return LABELS[runs - 1] ?? `Run it ${runs} times`;
}
