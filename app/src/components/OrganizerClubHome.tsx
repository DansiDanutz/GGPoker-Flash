import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { organizersApi, type OrganizerClub, type ClubRequest } from '../lib/organizers-api';

const message = (error: unknown) => error instanceof Error ? error.message : 'Unable to load your club. Please try again.';
export function OrganizerClubHome({ userId, active, onMembership }: { userId: number; active: boolean; onMembership: () => void }) {
  const [club, setClub] = useState<OrganizerClub | null>(null);
  const [requests, setRequests] = useState<ClubRequest[]>([]);
  const [draft, setDraft] = useState({ name: '', description: '', fee: '0' });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const profile = await organizersApi.profile(userId);
      setClub(profile); setDraft({ name: profile.name, description: profile.description, fee: (profile.entryFeeCents / 100).toFixed(2) });
      setRequests((await organizersApi.requests()).requests);
    } catch (failure) { setError(message(failure)); }
    finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { if (active && !club) void load(); }, [active, club, load]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    const fee = Number(draft.fee);
    if (!draft.name.trim() || !Number.isFinite(fee) || fee < 0 || fee > 1000 || Math.abs(fee * 100 - Math.round(fee * 100)) > .00001) { setError('Enter a club name and an entry fee from $0 to $1,000, with at most two decimal places.'); return; }
    setBusy(true); setError(''); setNotice('');
    try { const saved = await organizersApi.saveProfile({ name: draft.name.trim(), description: draft.description.trim(), entryFeeCents: Math.round(fee * 100) }); setClub(saved); setNotice('Your public club profile has been saved.'); }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  };
  const respond = async (request: ClubRequest, decision: 'approved' | 'rejected') => {
    if (busy || !window.confirm(`${decision === 'approved' ? 'Approve' : 'Reject'} the club entry request from ${request.nick} (#${request.userId})?`)) return;
    setBusy(true); setError(''); setNotice('');
    try { await organizersApi.respond(request.userId, decision); setRequests((await organizersApi.requests()).requests); setNotice(`Entry request ${decision}.`); }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  };
  return <section className="ow-card" aria-label="My Casino club settings">
    <div className="ow-section-top"><div><span className="ow-kicker">YOUR COMMUNITY'S POKER HOME</span><h3>Make your club recognizable</h3></div><button disabled={loading || busy} onClick={() => void load()}>Refresh club</button></div>
    <p>My Casino is your poker club's public identity. Players can discover your games, read your introduction and request entry. This section does not add slots or roulette.</p>
    {error && <div className="mp-notice mp-notice-error" role="alert">{error}</div>}{notice && <div className="mp-notice mp-notice-success" role="status">{notice}</div>}
    {loading ? <p role="status">Loading your club…</p> : !club ? <div><p>An active Organizer membership is required to publish and manage your club profile.</p><button onClick={onMembership}>Check my membership</button></div> : <>
      <form onSubmit={save} className="ow-profile-form"><label>Club name<input required maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /><small>The name players see in the organizer directory.</small></label><label>Welcome message<textarea rows={4} maxLength={1000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /><small>Describe your games, usual schedule and how new players can join. Do not include private payment or account details.</small></label><label>Club entry fee · USD<input required type="number" min="0" max="1000" step="0.01" value={draft.fee} onChange={e => setDraft({ ...draft, fee: e.target.value })} /><small>$0 uses a free request that you approve. A paid entry requires a configured checkout and server-verified payment. This fee is separate from game buy-ins and your Organizer subscription.</small></label><button disabled={busy}>{busy ? 'Saving…' : 'Save public profile'}</button></form>
      <div className="ow-actions"><a href={`#/organizers?club=${userId}`}>Preview my public club →</a><a href="#/my-page?tab=overview">Change my profile &amp; avatar →</a></div>
      <label className="ow-share">Your club link<input readOnly value={`${window.location.origin}/#/organizers?club=${userId}`} onFocus={e => e.currentTarget.select()} /><small>Select and copy this link to invite players. They still need approval or verified paid entry.</small></label>
      <h3>Member requests</h3><p>Review the player and their message before deciding. Approving club entry does not send chips or buy a game ticket.</p>
      {!requests.some(r => r.status === 'pending') && <p className="ow-empty">No requests waiting. Share your club link to welcome your first players.</p>}
      <ul className="ow-members">{requests.map(request => <li key={request.userId}><div><strong>{request.nick}</strong><span>Account #{request.userId} · {request.status}</span>{request.message && <p>{request.message}</p>}</div>{request.status === 'pending' && <div className="ow-actions"><button disabled={busy} onClick={() => void respond(request, 'approved')}>Approve</button><button disabled={busy} onClick={() => void respond(request, 'rejected')}>Reject</button></div>}</li>)}</ul>
    </>}
  </section>;
}
