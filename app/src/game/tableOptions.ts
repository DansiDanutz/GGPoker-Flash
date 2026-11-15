/** What the player wants when all-in with cards to come: ask each time, or always 1-3 runs. */
export type RunSetting = 'ask' | 1 | 2 | 3;

export const RUN_SETTINGS: readonly { value: RunSetting; label: string }[] = [
  { value: 'ask', label: 'Ask' },
  { value: 1, label: 'Once' },
  { value: 2, label: 'Twice' },
  { value: 3, label: '3 times' },
];

type RunPrefs = { runItAsk?: boolean; runPref?: number | null };

export function runSetting(me: RunPrefs | undefined): RunSetting {
  if (me?.runItAsk === false) return 1;
  const pref = me?.runPref;
  return pref === 1 || pref === 2 || pref === 3 ? pref : 'ask';
}

/** The option message for a run setting; "once" also turns the offer off. */
export function runSettingMessage(value: RunSetting): { runPref: number | null; runItAsk: boolean } {
  return value === 'ask' ? { runPref: null, runItAsk: true } : { runPref: value, runItAsk: value !== 1 };
}

export function autoPostBlinds(me: { waitForBlinds?: boolean } | undefined): boolean {
  return !me?.waitForBlinds;
}

export function straddleSetting(table: { straddle?: boolean } | undefined, me: { autoStraddle?: boolean } | undefined) {
  const allowed = !!table?.straddle && !!me;
  return { allowed, on: allowed && !!me?.autoStraddle };
}
