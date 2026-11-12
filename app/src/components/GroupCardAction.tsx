import React, { useState } from 'react';
import { api, LobbyTable } from '../lib/api';
import { useApp } from '../lib/store';
import type { TableGroup } from '../lib/lobbyFilters';
import { useWaitlist } from '../lib/waitlistState';

type Props = {
  /** The stake row, built from every public lobby table so filters never hide a free seat. */
  group: TableGroup;
  onJoin: (table: LobbyTable) => void;
  /** Called after the queue changed so the lobby can refresh counts. */
  onChanged: () => void;
};

const FULL_REASON = 'Waiting list is currently full.';
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

/**
 * Group View row button (P0 slices W4b, F2): **Join** takes the first free seat in the
 * group, **Join Wait List** queues on a full group, and an outline "#n · Leave" once queued.
 */
export function GroupCardAction({ group, onJoin, onChanged }: Props) {
  const { user, navigate, toast } = useApp();
  const { groupPosition, queues, leaveQueue, refresh } = useWaitlist();
  const [isBusy, setIsBusy] = useState(false);
  const { key, firstFree } = group;
  const position = groupPosition(key);
  const action = position > 0 ? 'queued' : group.action;

  const run = (fn: () => Promise<void>) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsBusy(true);
    try { await fn(); } finally { setIsBusy(false); }
  };

  const joinWait = run(async () => {
    if (!user) { navigate('/login'); return; }
    try {
      const r = await api.joinGroupWaitlist(key);
      if (r.status === 'seat') {
        const seated = group.tables.find((t) => t.id === r.tableId);
        if (seated) onJoin(seated);
        else onChanged();
        return;
      }
      toast({ kind: 'success', title: 'Joined waiting list', body: `You are #${r.position} for ${fmtGroup(group)}.` });
      await refresh();
      onChanged();
    } catch (err) {
      const isFull = (err as { status?: number }).status === 409 && /full/i.test(errorMessage(err));
      toast({ kind: 'error', title: 'You cannot join waiting list', body: isFull ? FULL_REASON : errorMessage(err) });
    }
  });

  const leave = run(async () => {
    const queue = queues.find((q) => q.kind === 'group' && q.groupKey === key);
    if (!queue) return;
    try {
      await leaveQueue(queue);
      toast({ kind: 'info', title: 'Left waiting list', body: fmtGroup(group) });
      onChanged();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not leave waiting list', body: errorMessage(err) });
    }
  });

  if (action === 'queued') {
    return (
      <button type="button" className="btn btn-sm wl-queued" disabled={isBusy} onClick={leave}
        aria-label={`You are #${position} on the waiting list for ${fmtGroup(group)}. Leave`}>
        #{position} · Leave
      </button>
    );
  }
  if (action === 'joinWait') {
    return <button type="button" className="btn btn-red btn-sm" disabled={isBusy} onClick={joinWait}>Join Wait List</button>;
  }
  return (
    <button type="button" className="btn btn-red btn-sm"
      onClick={(e) => { e.stopPropagation(); if (firstFree) onJoin(firstFree); }}>Join</button>
  );
}

function fmtGroup(t: Pick<TableGroup, 'sb' | 'bb' | 'seats'>): string {
  return `${t.sb}/${t.bb} · ${t.seats}-Max`;
}
