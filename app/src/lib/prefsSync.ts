// Live preference propagation. Other windows (multi-table) learn about a change through the
// browser `storage` event; the window that wrote the value gets a same-window custom event,
// because `storage` never fires in the window that made the change.

const LOCAL_EVENT = 'ggpoker:prefs';

type PrefsDetail = { keys: readonly string[] };

/** Tell this window that `keys` changed in localStorage. Other windows hear it via `storage`. */
export function notifyPrefsChanged(keys: readonly string[]): void {
  if (!keys.length || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PrefsDetail>(LOCAL_EVENT, { detail: { keys } }));
}

/** Calls `onChange` whenever any of `keys` changes in this or another window. Returns the unsubscribe. */
export function subscribePrefs(keys: readonly string[], onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const watched = new Set(keys);
  const onStorage = (e: StorageEvent) => {
    // A null key means localStorage.clear(): every preference may have changed.
    if (e.key == null || watched.has(e.key)) onChange();
  };
  const onLocal = (e: Event) => {
    const changed = (e as CustomEvent<PrefsDetail>).detail?.keys || [];
    if (changed.some((k) => watched.has(k))) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(LOCAL_EVENT, onLocal);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(LOCAL_EVENT, onLocal);
  };
}
