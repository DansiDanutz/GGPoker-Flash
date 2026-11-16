import React, { useEffect, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { PageShell } from '../components/PageShell';

export function BattleRoyaleLobby() {
  const { navigate } = useApp();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const result = await api.battleCatalog();
      setEvents(result.events);
      setError('');
    } catch (reason: any) { setError(reason.message || 'Could not load events'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  return (
    <PageShell activeTop="poker">
      <div className="page battle-page">
        <div className="battle-page-heading"><div><small>MYSTERY BOUNTY</small><h1 className="page-title">Battle Royale</h1><p className="page-sub">Rush, shootout, and final-table events with durable entries.</p></div></div>
        {loading && <p role="status">Loading events…</p>}
        {error && <div role="alert"><p>{error}</p><button className="btn btn-red" onClick={load}>Retry</button></div>}
        {!loading && !error && !events.length && <div className="empty-state"><h2>No open Battle events</h2><p>Owner-created practice events will appear here.</p></div>}
        <div className="battle-catalog">
          {events.map((event) => <button className="battle-card" key={event.eventId} onClick={() => navigate(`/battle/${event.eventId}`)}>
            <span className={`battle-stage battle-stage-${event.status}`}>{event.status}</span>
            <strong>{event.name}</strong>
            <span>{event.registeredCount}/{event.config.capacity} players · {money(event.config.entry)} entry</span>
            <span>{event.config.startingChips.toLocaleString()} starting chips · {event.config.finalSeats} final seats</span>
            <span className="battle-card-action">View event</span>
          </button>)}
        </div>
      </div>
    </PageShell>
  );
}
