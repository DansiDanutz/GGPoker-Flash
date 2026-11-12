import type { SeatedPreview } from './api';

export type PreviewSeat = { seat: number; name: string; stack: number; empty?: boolean };

/**
 * Lobby mini-table chairs from the live table's real seated players, in seat order.
 * Extra players beyond the preview's chairs are not drawn; empty chairs stay empty.
 */
export function previewSeats(seated: readonly SeatedPreview[] | undefined, slots: number): PreviewSeat[] {
  const ordered = [...(seated || [])].sort((a, b) => a.seat - b.seat).slice(0, slots);
  return Array.from({ length: slots }, (_, i) => {
    const p = ordered[i];
    return p ? { seat: i, name: p.nick, stack: p.stack } : { seat: i, name: '', stack: 0, empty: true };
  });
}
