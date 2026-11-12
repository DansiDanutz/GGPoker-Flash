import React, { useState } from 'react';
import { api, LobbyTable } from '../lib/api';
import { useApp } from '../lib/store';
import { waitCount, waitlistActionFor } from '../lib/waitlist';

type Props = {
  table: LobbyTable | null;
  onJoin: (table: LobbyTable) => void;
  onWatch: (table: LobbyTable) => void;
  /** Called after the queue changed so the lobby can refresh counts and positions. */
  onChanged: () => void;
};

const FULL_REASON_ID = 'waitlist-full-reason';
const FULL_REASON = 'Waiting list is currently full.';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

/** Side-panel stack (Table View): wait-list line, queue position, primary action, Watch. */
export function WaitlistSideActions({ table, onJoin, onWatch, onChanged }: Props) {
  const { user, navigate, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const action = waitlistActionFor(table);
  const count = waitCount(table);
  const position = table?.myWait ?? 0;

  const joinWait = async (t: LobbyTable) => {
    if (!user) { navigate('/login'); return; }
    setBusy(true);
    try {
      const r = await api.joinTableWaitlist(t.id);
      if (r.status === 'seat') { onJoin(t); return; }
      toast({ kind: 'success', title: 'Joined waiting list', body: `You are #${r.position} for ${t.name}.` });
      onChanged();
    } catch (e) {
      const full = (e as { status?: number }).status === 409 && /full/i.test(errorMessage(e));
      toast({ kind: 'error', title: 'You cannot join waiting list', body: full ? FULL_REASON : errorMessage(e) });
      onChanged();
    } finally { setBusy(false); }
  };

  const leaveWait = async (t: LobbyTable) => {
    setBusy(true);
    try {
      await api.leaveTableWaitlist(t.id);
      toast({ kind: 'info', title: 'Left waiting list', body: t.name });
      onChanged();
    } catch (e) {
      toast({ kind: 'error', title: 'Could not leave waiting list', body: errorMessage(e) });
    } finally { setBusy(false); }
  };

  const primary = () => {
    if (!table) return null;
    if (action === 'queued') {
      return <button className="btn btn-dark btn-block" disabled={busy} onClick={() => leaveWait(table)}>Leave Wait List</button>;
    }
    if (action === 'full') {
      return (
        <>
          <button className="btn btn-dark btn-block waitlist-full" disabled aria-describedby={FULL_REASON_ID} title={FULL_REASON}>Join Wait List</button>
          <span id={FULL_REASON_ID} className="sr-only">{FULL_REASON}</span>
        </>
      );
    }
    if (action === 'joinWait') {
      return <button className="btn btn-red btn-block" disabled={busy} onClick={() => joinWait(table)}>Join Wait List</button>;
    }
    return <button className="btn btn-red btn-block" onClick={() => onJoin(table)}>Join</button>;
  };

  return (
    <div className="mini-actions">
      {count > 0 && <div className="waitlist-line"><b>{count}</b> Players on Waiting List</div>}
      {position > 0 && <div className="waitlist-position">You are #{position}</div>}
      {primary()}
      <button className="btn btn-dark btn-block waitlist-watch" onClick={() => { if (table) onWatch(table); }}>Watch</button>
    </div>
  );
}
