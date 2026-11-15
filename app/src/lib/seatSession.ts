// Per-tab memory that this tab held a seat at a table. It survives a page reload (so a reload
// after a cash-out watches instead of buying in again) but not leaving the table or a new tab.
const key = (tableId: string) => `ggpoker.seated.${tableId}`;

export function wasSeatedHere(tableId: string): boolean {
  try { return sessionStorage.getItem(key(tableId)) === '1'; } catch { return false; }
}

export function markSeatedHere(tableId: string): void {
  try { sessionStorage.setItem(key(tableId), '1'); } catch { /* storage blocked: reload buys in as before */ }
}

export function clearSeatedHere(tableId: string): void {
  try { sessionStorage.removeItem(key(tableId)); } catch { /* nothing stored */ }
}
