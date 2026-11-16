import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';

const initial = { id: '', name: '', capacity: 18, finalSeats: 3, startingChips: 1000, entry: 1000, rushMinutes: 10, tableSize: 6, smallBlind: 10, bigBlind: 20, rushStartLevel: 1, shootoutStartLevel: 1, finalStartLevel: 1, prizeShares: [50, 30, 20], bountyItems: [{ id: 'b1', amount: 500, frequencyUnits: 1 }] };

export function AdminBattleEvents() {
  const { toast } = useApp();
  const [form, setForm] = useState<any>(initial);
  const [events, setEvents] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    try { const result = await api.battleCatalog(); setEvents(result.events); } catch (reason: any) { setError(reason.message); }
  };
  useEffect(() => { load(); }, []);
  const update = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));
  const field = (key: string, label: string, type = 'number') => <label className="admin-label">{label}<input className="admin-input" type={type} value={form[key]} onChange={(event) => update(key, type === 'number' ? Number(event.target.value) : event.target.value)} /></label>;
  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const id = form.id.trim() || `battle-${Date.now().toString(36)}`;
      await api.admin.createBattle({ ...form, id, name: form.name.trim() || 'Practice Battle', prizeShares: form.prizeShares }, crypto.randomUUID());
      setForm(initial);
      await load();
      toast({ kind: 'success', title: 'Battle event created' });
    } catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  };
  const abort = async (event: any) => {
    if (busy) return;
    setBusy(true);
    try { await api.admin.abortBattle(event.eventId, event.revision, crypto.randomUUID()); await load(); toast({ kind: 'success', title: 'Event aborted and entries refunded' }); }
    catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  };
  return (
    <section className="admin-card" aria-labelledby="battle-create-title">
      <h3 id="battle-create-title">Battle Royale events</h3>
      <p className="muted small">Create a validated practice event. Bounty funding is fixed at creation; no player is charged by this form.</p>
      <div className="admin-form">
        {field('id', 'Event ID (optional)', 'text')}
        {field('name', 'Event name (optional)', 'text')}
        {field('capacity', 'Capacity')}
        {field('finalSeats', 'Final seats')}
        {field('startingChips', 'Starting chips')}
        {field('entry', 'Entry credits')}
        {field('rushMinutes', 'Rush minutes')}
        {field('tableSize', 'Table size')}
        {field('smallBlind', 'Small blind')}
        {field('bigBlind', 'Big blind')}
      </div>
      <p className="muted small">Prize shares 50 / 30 / 20. One 500-credit bounty item at frequency 1. Stage levels all start at 1.</p>
      {error && <p role="alert" style={{ color: '#ff9a9a' }}>{error}</p>}
      <button className="btn btn-red" disabled={busy} onClick={create}>{busy ? 'Saving…' : 'Create Battle event'}</button>
      <div style={{ marginTop: 18 }}>
        {events.map((event) => <div className="between" key={event.eventId} style={{ padding: '8px 0', borderBottom: '1px solid #282e38' }}>
          <span>{event.name} · {event.status} · {event.registeredCount}/{event.config.capacity}</span>
          {event.status === 'registering' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => abort(event)}>Abort and refund</button>}
        </div>)}
      </div>
    </section>
  );
}
