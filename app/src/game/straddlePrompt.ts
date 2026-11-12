// Native StraddleDecideView model (REA straddle-sitout.json).
export type StraddleAsk = { amount: number; allInTo: number; canStraddle: boolean; endsAt: number };
export type StraddlePromptModel = { amount: number; allInTo: number; showStraddle: boolean; secondsLeft: number };

export function straddlePrompt(ask: StraddleAsk | null | undefined, nowMs: number): StraddlePromptModel | null {
  if (!ask) return null;
  return {
    amount: ask.amount,
    allInTo: ask.allInTo,
    showStraddle: ask.canStraddle,
    secondsLeft: Math.max(0, Math.ceil((ask.endsAt - nowMs) / 1000)),
  };
}

/** Native SitOutView countdown text (mm:ss), or null when there is no deadline. */
export function sitOutClock(endsAt: number | null | undefined, nowMs: number): string | null {
  if (!endsAt) return null;
  const total = Math.max(0, Math.ceil((endsAt - nowMs) / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
