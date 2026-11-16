import React, { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';

export function AdminPushSeatGrant() {
  const { toast } = useApp();
  const [roomId, setRoomId] = useState('nlh-silver-07');
  const [accountId, setAccountId] = useState('');
  const [uses, setUses] = useState(1);
  const [state, setState] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadGeneration = useRef(0);
  const saveOperation = useRef<{ key: string; operationId: string } | null>(null);

  const load = async () => {
    const generation = ++loadGeneration.current;
    const selectedRoom = roomId.trim();
    const selectedAccount = Number(accountId);
    setBusy(true);
    setError('');
    try {
      const result = await api.admin.pushSeatGrant(selectedRoom, selectedAccount);
      if (generation !== loadGeneration.current || selectedRoom !== roomId.trim() || selectedAccount !== Number(accountId)) return;
      setState({ ...result.state, loadedRoomId: selectedRoom, loadedAccountId: selectedAccount });
      setUses(Math.max(1, result.state.remaining));
    } catch (reason: any) {
      if (generation !== loadGeneration.current) return;
      setState(null);
      setError(reason.message || 'Could not load the Push Seat grant');
    } finally {
      if (generation === loadGeneration.current) setBusy(false);
    }
  };
  const save = async () => {
    if (!state || busy) return;
    if (state.loadedRoomId !== roomId.trim() || state.loadedAccountId !== Number(accountId)) {
      setError('Room or account changed. Load the current grant before saving.');
      setState(null);
      return;
    }
    setBusy(true);
    setError('');
    const operationKey = `${state.loadedRoomId}:${state.loadedAccountId}:${state.grantRevision}:${uses}`;
    if (saveOperation.current?.key !== operationKey) saveOperation.current = { key: operationKey, operationId: crypto.randomUUID() };
    try {
      const result = await api.admin.savePushSeatGrant(roomId.trim(), { accountId: Number(accountId), uses, expectedRevision: state.grantRevision, operationId: saveOperation.current.operationId });
      setState({ ...result.state, loadedRoomId: roomId.trim(), loadedAccountId: Number(accountId) });
      saveOperation.current = null;
      toast({ kind: 'success', title: 'Push Seat grant saved', body: `${result.state.remaining} uses remain for account ${accountId}.` });
    } catch (reason: any) {
      setError(reason.message || 'The Push Seat grant was not saved');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="admin-card" aria-labelledby="push-seat-grant-title">
      <h3 id="push-seat-grant-title" style={{ marginTop: 0 }}>Push Seat grants</h3>
      <p className="muted small">Replace one seated account’s grant with 1–3 uses. Reservation is free; a use is spent only after a completed between-hand move.</p>
      <div className="admin-form">
        <div><label className="admin-label" htmlFor="push-room-id">Room ID</label><input id="push-room-id" className="admin-input" style={{ width: '100%' }} value={roomId} disabled={busy} onChange={(event) => { loadGeneration.current++; setRoomId(event.target.value); setState(null); }} /></div>
        <div><label className="admin-label" htmlFor="push-account-id">Account ID</label><input id="push-account-id" className="admin-input" style={{ width: '100%' }} type="number" min="1" step="1" required value={accountId} disabled={busy} onChange={(event) => { loadGeneration.current++; setAccountId(event.target.value); setState(null); }} /></div>
        <div><label className="admin-label" htmlFor="push-uses">Replacement uses</label><select id="push-uses" className="admin-input" style={{ width: '100%' }} value={uses} onChange={(event) => setUses(Number(event.target.value))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="btn btn-ghost" type="button" disabled={busy || !roomId.trim() || !Number.isSafeInteger(Number(accountId)) || Number(accountId) < 1} onClick={load}>Load current grant</button>
        <button className="btn btn-red" type="button" disabled={busy || !state} onClick={save}>{busy ? 'Working…' : 'Save replacement grant'}</button>
      </div>
      {state && <p className="muted small" role="status">Current: {state.remaining} remaining · grant revision {state.grantRevision}{state.reservation ? ' · one active reservation' : ''}</p>}
      {error && <p role="alert" className="spin-command-error">{error}</p>}
    </section>
  );
}
