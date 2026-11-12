import React, { useState } from 'react';
import { api, LobbyTable } from '../lib/api';
import { useApp } from '../lib/store';
import { groupActionFor, groupKeyOf } from '../lib/waitlist';
import { useWaitlist } from '../lib/waitlistState';

type Props = {
  table: LobbyTable;
  /** Every lobby table, so the group is judged on all its tables, not just the filtered ones. */
  allTables: readonly LobbyTable[];
  onJoin: (table: LobbyTable) => void;
  /** Called after the queue changed so the lobby can refresh counts. */
  onChanged: () => void;
};

const FULL_REASON = 'Waiting list is currently full.';
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

/**
 * Group View card button (P0 slice W4b): **Join** while any table in the group has a free
 * seat, **Join Wait List** for a full group, and an outline "#n · Leave" once queued.
 */
export function GroupCardAction({ table, allTables, onJoin, onChanged }: Props) {
  const { user, navigate, toast } = useApp();
  const { groupPosition, queues, leaveQueue, refresh } = useWaitlist();
  const [isBusy, setIsBusy] = useState(false);
  const key = groupKeyOf(table);
  const groupTables = allTables.filter((t) => !t.private && groupKeyOf(t) === key);
  const position = groupPosition(key);
  const action = groupActionFor(groupTables.length ? groupTables : [table], position);

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
        onJoin(allTables.find((t) => t.id === r.tableId) || table);
        return;
      }
      toast({ kind: 'success', title: 'Joined waiting list', body: `You are #${r.position} for ${fmtGroup(table)}.` });
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
      toast({ kind: 'info', title: 'Left waiting list', body: fmtGroup(table) });
      onChanged();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not leave waiting list', body: errorMessage(err) });
    }
  });

  if (action === 'queued') {
    return (
      <button type="button" className="btn btn-sm wl-queued" disabled={isBusy} onClick={leave}
        aria-label={`You are #${position} on the waiting list for ${fmtGroup(table)}. Leave`}>
        #{position} · Leave
      </button>
    );
  }
  if (action === 'joinWait') {
    return <button type="button" className="btn btn-red btn-sm" disabled={isBusy} onClick={joinWait}>Join Wait List</button>;
  }
  return (
    <button type="button" className="btn btn-red btn-sm" onClick={(e) => { e.stopPropagation(); onJoin(table); }}>Join</button>
  );
}

function fmtGroup(t: LobbyTable): string {
  return `${t.sb}/${t.bb} · ${t.seats}-Max`;
}
