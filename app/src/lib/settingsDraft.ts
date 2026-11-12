// Settings draft: edits are staged per localStorage key and only written on Apply/OK.
// Cancel/Escape drops the draft. Pure, so the reducer is tested under node --test.

/** localStorage key → value to write; null means "remove the key" (back to the default). */
export type SettingsValues = Readonly<Record<string, string | null>>;

export type DraftState = Readonly<{ draft: SettingsValues; appliedCount: number }>;

export type DraftAction =
  | { type: 'stage'; key: string; value: string | null }
  | { type: 'apply' }
  | { type: 'cancel' };

export const EMPTY_DRAFT: DraftState = Object.freeze({ draft: Object.freeze({}), appliedCount: 0 });

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'stage':
      return { ...state, draft: Object.freeze({ ...state.draft, [action.key]: action.value }) };
    case 'apply':
      return { draft: EMPTY_DRAFT.draft, appliedCount: state.appliedCount + 1 };
    case 'cancel':
      return { ...state, draft: EMPTY_DRAFT.draft };
    default:
      return state;
  }
}

/**
 * The staged changes that actually differ from what is saved. Applying an edit that was
 * changed back to its saved value writes nothing.
 */
export function pendingWrites(draft: SettingsValues, readSaved: (key: string) => string | null): SettingsValues {
  return Object.freeze(Object.fromEntries(Object.entries(draft).filter(([key, value]) => readSaved(key) !== value)));
}

export function isDirty(draft: SettingsValues, readSaved: (key: string) => string | null): boolean {
  return Object.keys(pendingWrites(draft, readSaved)).length > 0;
}

/** The value a settings control should show: the staged one if any, otherwise the saved one. */
export function draftValue(draft: SettingsValues, key: string, readSaved: (key: string) => string | null): string | null {
  return Object.prototype.hasOwnProperty.call(draft, key) ? draft[key] : readSaved(key);
}
