import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/store';
import { BattleRules } from './BattleRules';
import { BattleRoom } from './BattleRoom';

export function BattleEvent({ eventId }: { eventId: string }) {
  const { user, navigate, toast, refreshUser } = useApp();
  const [state, setState] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const result = await api.battleState(eventId);
      setState(result.state);
      setError('');
    } catch (reason: any) { setError(reason.message || 'Could not load event'); }
  }, [eventId]);
  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (!document.hidden) load(); }, 750);
    return () => window.clearInterval(timer);
  }, [load]);

  const command = async (kind: 'register' | 'cancel' | 'reopen') => {
    if (!user) { navigate('/login'); return; }
    if (!state || busy) return;
    setBusy(true);
    setError('');
    try {
      const fn = kind === 'register' ? api.battleRegister : kind === 'cancel' ? api.battleCancel : api.battleReopen;
      await fn(eventId, state.revision, crypto.randomUUID());
      await load();
      await refreshUser();
      toast({ kind: 'success', title: kind === 'register' ? 'Registration confirmed' : kind === 'cancel' ? 'Registration cancelled' : 'Event reopened', body: kind === 'reopen' ? 'No entry was charged.' : undefined });
    } catch (reason: any) {
      setError(reason.message || 'Command failed');
      await load();
    } finally { setBusy(false); }
  };

  const play = async (room: any, action: string, amount = 0) => {
    if (!user || busy) { if (!user) navigate('/login'); return; }
    setBusy(true);
    setError('');
    try {
      await api.battleAction(eventId, { eventId, stage: room.stage, roomId: room.roomId, handId: room.table.handId, expectedRevision: room.revision, operationId: crypto.randomUUID(), action, amount });
      await load();
    } catch (reason: any) {
      setError(reason.message || 'Action failed. Your view has been refreshed.');
      await load();
    } finally { setBusy(false); }
  };

  if (error && !state) return <section className="battle-event" role="alert"><h1>Battle Royale</h1><p>{error}</p><button className="btn btn-red" onClick={load}>Retry</button></section>;
  if (!state) return <section className="battle-event" role="status"><h1>Battle Royale</h1><p>Loading event…</p></section>;
  const mine = state.myRegistration;
  const stageText: Record<string, string> = {
    rush: 'Rush is active. Active hands settle before qualification.',
    draining: 'Rush is closed. Waiting for active hands to finish.',
    shootout: 'All-in shootout for the last final-table seat.',
    final: 'The final table is active.',
    finished: 'Event finished. Final prizes and bounties are shown below.',
  };
  return (
    <section className="battle-event" aria-labelledby="battle-event-title">
      <div className="battle-event-heading">
        <div><small>MYSTERY BATTLE ROYALE</small><h1 id="battle-event-title">{state.name}</h1></div>
        <span className={`battle-stage battle-stage-${state.status}`}>{state.status}</span>
      </div>
      <p>{state.registeredCount}/{state.config.capacity} entries · {state.playersRemaining} remaining{mine ? ` · your stack ${mine.stack.toLocaleString()} chips` : ''}</p>
      {error && <p className="battle-error" role="alert">{error}</p>}
      <div className="battle-actions">
        {state.status === 'registering' && !mine && <button className="btn btn-red" disabled={busy} onClick={() => command('register')}>{busy ? 'Processing…' : `Register · ${state.config.entry}`}</button>}
        {state.status === 'registering' && mine?.status === 'active' && <button className="btn btn-ghost" disabled={busy} onClick={() => command('cancel')}>Cancel registration</button>}
        {mine && mine.status !== 'cancelled' && state.status !== 'aborted' && <button className="btn btn-ghost" disabled={busy} onClick={() => command('reopen')}>{busy ? 'Processing…' : 'Refresh entry · no new charge'}</button>}
      </div>
      {stageText[state.status] && <p className="battle-stage-description" role="status">{stageText[state.status]}</p>}
      <div className="battle-rooms">
        {(state.rooms || []).map((room: any) => <BattleRoom key={room.roomId} room={room} userId={user?.id ?? null} busy={busy} onAction={play} />)}
      </div>
      {state.status === 'finished' && <section className="battle-results" aria-labelledby="battle-results-title">
        <h2 id="battle-results-title">Final results</h2>
        <ol>{(state.prizes || []).map((prize: any) => <li key={prize.accountId}><span>#{prize.place} · Player {prize.accountId}</span><strong>{prize.amount.toLocaleString()} chips</strong></li>)}</ol>
      </section>}
      <details className="battle-bounty-archive">
        <summary>Bounty archive · {(state.bounty?.awards || []).length} awarded · {(state.bounty?.remainingCount || 0).toLocaleString()} remaining</summary>
        {(state.bounty?.awards || []).length ? <ul>{state.bounty.awards.map((award: any) => <li key={award.awardId}>
          <span>Hand {award.handNo} · Player {award.victimId} knocked out</span>
          <strong>{award.amount.toLocaleString()} chips</strong>
          <small>{award.hunters.map((hunter: any) => `Player ${hunter.accountId}: ${hunter.amount.toLocaleString()}`).join(' · ')}</small>
        </li>)}</ul> : <p>No bounties have been awarded yet.</p>}
      </details>
      {state.status === 'aborted' && <p role="status">Event aborted before the first deal. Entries were refunded.</p>}
      <BattleRules config={state.config} />
    </section>
  );
}
