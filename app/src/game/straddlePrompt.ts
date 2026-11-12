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
