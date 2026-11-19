import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrganizerFunding } from '../components/OrganizerFunding';
import { OrganizerCashOut } from '../components/OrganizerCashOut';
import { Avatar } from '../components/Avatar';
import { PageShell } from '../components/PageShell';
import { useApp } from '../lib/store';
import { organizersApi, type ClubOrder, type ClubRequest, type OrganizerClub } from '../lib/organizers-api';
import '../organizers.css';

const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request failed.';

function RankArt({ rank }: { rank: number }) {
  return <svg className="org-card-art" viewBox="0 0 420 170" aria-hidden="true"><path d="M-20 144C90 58 170 176 440 46" /><circle cx="320" cy="65" r="78" /><circle cx="320" cy="65" r="52" /><path d="m320 17 13 35 38 2-30 23 10 37-31-21-31 21 10-37-30-23 38-2 13-35Z" /><text x="28" y="118">{String(rank).padStart(2, '0')}</text></svg>;
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return <div className="org-metric"><strong>{value}</strong><span>{label}</span></div>;
}

export function Organizers() {
  const { user, navigate, route } = useApp();
  const [chipRefresh, setChipRefresh] = useState(0);
  const refreshChipBalance = useCallback(async () => { setChipRefresh(value => value + 1); }, []);
  const [clubs, setClubs] = useState<OrganizerClub[]>([]), [selected, setSelected] = useState<OrganizerClub | null>(null);
  const [search, setSearch] = useState(''), [sort, setSort] = useState<'rank' | 'newest'>('rank');
  const [offset, setOffset] = useState(0), [total, setTotal] = useState(0);
  const pageSize = 20;
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState('');
  const [knockMessage, setKnockMessage] = useState(''), [requests, setRequests] = useState<ClubRequest[]>([]), [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '', entryFeeCents: 100 });
  const [order, setOrder] = useState<ClubOrder | null>(null), [paymentOrigin, setPaymentOrigin] = useState(''), [receiptId, setReceiptId] = useState('');

  const generation = useRef(0);
  const load = useCallback(async (quiet = false) => {
    const current = ++generation.current;
    if (!quiet) { setLoading(true); setError(''); }
    try {
      const data = await organizersApi.list(search, sort, offset, pageSize);
      if (generation.current === current) { setClubs(data.clubs); setTotal(data.total); }
    } catch (failure) {
      if (!quiet && generation.current === current) setError(errorText(failure));
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [search, sort, offset]);
  useEffect(() => { setOffset(0); }, [search, sort]);
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 180);
    const refresh = () => { if (!document.hidden) void load(true); };
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      ++generation.current;
      window.clearTimeout(first); window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  const openClub = async (club: OrganizerClub) => {
    setBusy('profile'); setError(''); setNotice(''); setOrder(null);
    try {
      const profile = await organizersApi.profile(club.ownerId); setSelected(profile);
      if (profile.ownerId === user?.id) {
        setDraft({ name: profile.name, description: profile.description, entryFeeCents: profile.entryFeeCents });
        setRequests((await organizersApi.requests()).requests);
      }
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(''); }
  };
  const requestedClub = new URLSearchParams(route.split('?')[1]).get('club');
  useEffect(() => {
    if (!requestedClub || !/^\d+$/.test(requestedClub)) return;
    let cancelled = false;
    setError('');
    void organizersApi.profile(Number(requestedClub)).then(async profile => {
      if (cancelled) return;
      setSelected(profile);
      if (profile.ownerId === user?.id) {
        setDraft({ name: profile.name, description: profile.description, entryFeeCents: profile.entryFeeCents });
        const result = await organizersApi.requests();
        if (!cancelled) setRequests(result.requests);
      }
    }).catch(failure => { if (!cancelled) setError(errorText(failure)); });
    return () => { cancelled = true; };
  }, [requestedClub, user?.id]);
  const refreshSelected = async () => { if (selected) setSelected(await organizersApi.profile(selected.ownerId)); await load(); };
  const act = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key); setError(''); setNotice('');
    try { await action(); setNotice(success); await refreshSelected(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(''); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy('save'); setError('');
    try { const profile = await organizersApi.saveProfile(draft); setSelected(profile); setEditing(false); setNotice('Club profile saved.'); await load(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(''); }
  };
  const startEntry = async () => {
    if (!selected) return;
    setBusy('entry'); setError('');
    try {
      const result = await organizersApi.entry(selected.ownerId);
      if (!result.paymentReady || !result.order.checkoutUrl) { setNotice('Paid club entry is not available yet. No payment or membership was created.'); return; }
      const origin = new URL(result.order.checkoutUrl).origin;
      setPaymentOrigin(origin); setOrder(result.order);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(''); }
  };
  useEffect(() => {
    if (!order?.checkoutUrl || !paymentOrigin) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== paymentOrigin || typeof event.data !== 'object' || event.data === null || event.data.type !== 'nervixpay:paid' || typeof event.data.orderId !== 'string' || event.source !== document.querySelector<HTMLIFrameElement>('.org-payment iframe')?.contentWindow) return;
      setReceiptId(event.data.orderId);
      void verifyPayment(event.data.orderId);
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [order?.id, order?.checkoutUrl, paymentOrigin]);

  const verifyPayment = async (paymentId: string) => {
    if (!order) return;
    await act('verify', async () => { await organizersApi.verify(order.id, paymentId); setReceiptId(''); setOrder(null); }, 'Payment verified by the server. Club access is now active.');
  };

  const ranked = useMemo(() => new Map(clubs.map((club, index) => [club.ownerId, index + 1])), [clubs]);
  return <PageShell activeTop="organizers">
    <main className="org-page">
      <section className="org-hero">
        <div><span className="org-kicker">DANGG CLUB NETWORK</span><h1>Find your table.<br /><em>Meet your organizer.</em></h1><p>Explore active organizer clubs, compare transparent activity metrics, and request entry without confusing game chips with real money.</p></div>
        <aside><strong>How ranking works</strong><p>Standings refresh every 30 seconds. Only clubs with an active organizer subscription appear here. Clubs with verified plugin use in the last 30 days rank ahead of membership-only clubs. Within each group: 1 point for the subscription and each approved member, 10 per distinct plugin used, 5 per cash table played or completed tournament, 1 per tournament entry and per player in the largest field, 0.01 per hand and 0.001 per Cash Chip of rake. Member reputation adds the average rating (up to 5 points). Rake measures game activity, not USD income.</p></aside>
      </section>
      <section className="org-toolbar" aria-label="Organizer directory controls"><label><span>Search clubs</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Club, organizer, or country" /></label><div role="group" aria-label="Sort organizers"><button className={sort === 'rank' ? 'on' : ''} onClick={() => setSort('rank')}>Top ranked</button><button className={sort === 'newest' ? 'on' : ''} onClick={() => setSort('newest')}>Newest</button></div></section>
      {error && <div className="org-alert org-error" role="alert">{error}</div>}{notice && <div className="org-alert" role="status">{notice}</div>}
      {loading ? <div className="org-grid" aria-busy="true">{[1, 2, 3].map((item) => <div className="org-skeleton" key={item} />)}</div> : clubs.length ? <><div className="org-grid">{clubs.map((club, index) => <article className="org-card" key={club.ownerId}><div className="org-cover"><RankArt rank={offset + index + 1} /><span className="org-rank">{club.pluginsUsed} plugins used · {club.score.toFixed(1)} pts</span><span className="org-entry">{club.entryFeeCents ? `${usd(club.entryFeeCents)} entry` : 'Free entry'}</span></div><div className="org-card-body"><div className="org-identity"><Avatar name={club.nick} src={club.avatar} size={52} /><div><h2>{club.name}</h2><p>Hosted by {club.nick} · {club.country || 'Global'}</p></div></div><p>{club.reputation.votes ? `★ ${club.reputation.stars}/5 · ${club.reputation.votes} votes` : 'No member ratings yet'}</p><p className="org-description">{club.description || 'An active DanGG organizer club.'}</p><div className="org-metrics"><Metric value={club.memberCount} label="members" /><Metric value={club.hands30d} label="hands · 30d" /><Metric value={club.maxTournamentEntrants} label="largest field" /></div><button className="org-primary" disabled={!club.membershipActive} onClick={() => void openClub(club)}>{club.membershipActive ? 'View club' : 'Subscription inactive'}</button></div></article>)}</div><nav className="org-toolbar" aria-label="Organizer pages"><button disabled={!offset || loading} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</button><span>Showing {offset + 1}–{Math.min(offset + clubs.length, total)} of {total}</span><button disabled={offset + clubs.length >= total || loading} onClick={() => setOffset(offset + pageSize)}>Next</button></nav></> : <div className="org-empty">No active organizer clubs match this search.</div>}
    </main>
    {selected && <div className="org-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="org-modal" role="dialog" aria-modal="true" aria-labelledby="org-profile-title"><button className="org-close" aria-label="Close club profile" onClick={() => setSelected(null)}>×</button><div className="org-profile-head"><Avatar name={selected.nick} src={selected.avatar} size={72} /><div><span className="org-kicker">#{ranked.get(selected.ownerId) || '—'} ACTIVE ORGANIZER · Rating {selected.score.toFixed(1)}</span><h2 id="org-profile-title">{selected.name}</h2><p>{selected.nick} · {selected.country || 'Global'}</p></div></div><p className="org-profile-copy">{selected.description || 'This organizer has not added a club description yet.'}</p><div className="org-profile-metrics"><Metric value={selected.memberCount} label="accepted members" /><Metric value={selected.hands30d} label="commercial hands · 30d" /><Metric value={selected.tournamentEntrants30d} label="tournament entries · 30d" /><Metric value={selected.maxTournamentEntrants} label="largest tournament" /><Metric value={selected.cashChipRake30d.toLocaleString()} label="Cash Chip rake burned · 30d" /></div>
      {user && !user.is_guest && <OrganizerFunding key={selected.ownerId} userId={user.id} organizerId={selected.ownerId} canRequest={selected.membershipStatus === 'approved'} onChange={refreshChipBalance} />}
      {user && !user.is_guest && selected.ownerId !== user.id && <OrganizerCashOut key={`cashout:${selected.ownerId}`} userId={user.id} organizerId={selected.ownerId} refreshKey={chipRefresh} />}
      {selected.tables?.length ? <section className="org-tables"><h3>Club tables</h3>{selected.tables.map((table) => <article key={table.id}><strong>{table.name}</strong><span>{table.game} · {table.seats} seats</span><button onClick={() => navigate(`/table/${encodeURIComponent(table.id)}`)}>Open table</button></article>)}</section> : null}
      {selected.ownerId === user?.id ? <section className="org-owner"><div className="org-owner-actions"><button onClick={() => setEditing(!editing)}>{editing ? 'Cancel editing' : 'Edit public profile'}</button><button onClick={() => navigate('/organiser')}>Open organizer dashboard</button></div>{editing && <form onSubmit={save}><label>Club name<input maxLength={120} required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><label>Description<textarea maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label><label>Entry fee (USD)<input type="number" min="0" max="1000" step="0.01" required value={draft.entryFeeCents / 100} onChange={(e) => setDraft({ ...draft, entryFeeCents: Math.round(Number(e.target.value) * 100) })} /></label><p>Set $0 for free Knock Knock approval. The default is $1; paid entry is activated only after server-side payment verification. No browser message can grant access.</p><button className="org-primary" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save profile'}</button></form>}<div className="org-requests"><h3>Knock Knock requests</h3>{requests.filter((request) => request.status === 'pending').map((request) => <article key={request.userId}><Avatar name={request.nick} src={request.avatar} size={38} /><div><strong>{request.nick}</strong><p>{request.message || 'No message included.'}</p></div><button disabled={Boolean(busy)} onClick={() => void act(`approve:${request.userId}`, () => organizersApi.respond(request.userId, 'approved'), 'Member approved.').then(async () => setRequests((await organizersApi.requests()).requests))}>Approve</button><button disabled={Boolean(busy)} onClick={() => void act(`reject:${request.userId}`, () => organizersApi.respond(request.userId, 'rejected'), 'Request rejected.').then(async () => setRequests((await organizersApi.requests()).requests))}>Reject</button></article>)}{!requests.some((request) => request.status === 'pending') && <p>No pending requests.</p>}</div></section>
      : <section className="org-join"><h3>{selected.entryFeeCents ? `Club entry · ${usd(selected.entryFeeCents)}` : 'Knock Knock'}</h3>{!user || user.is_guest ? <><p>Sign in to request club entry and track your membership.</p><button className="org-primary" onClick={() => navigate('/login?returnTo=organizers')}>Sign in</button></> : selected.membershipStatus === 'approved' ? <><fieldset><legend>Your club reputation vote</legend>{[1,2,3,4,5].map(stars => <button key={stars} disabled={!!busy} aria-label={`Rate ${stars} out of 5`} onClick={() => void act('vote', () => organizersApi.vote(selected.ownerId,stars), 'Your rating was saved.')}>{stars} ★</button>)}</fieldset><p>You are an approved member of this club.</p><button onClick={() => void act('leave', () => organizersApi.leave(selected.ownerId), 'You left the club.')}>Leave club</button></> : selected.membershipStatus === 'pending' ? <p>Your Knock Knock request is waiting for the owner.</p> : selected.entryFeeCents === 0 ? <form onSubmit={(event) => { event.preventDefault(); void act('knock', () => organizersApi.knock(selected.ownerId, knockMessage), 'Knock Knock request sent.'); }}><label>Message to the organizer<textarea maxLength={500} value={knockMessage} onChange={(e) => setKnockMessage(e.target.value)} placeholder="Introduce yourself (optional)" /></label><button className="org-primary" disabled={busy === 'knock'}>Send Knock Knock</button></form> : <><p>This club uses verified paid entry. Browser redirects or payment messages never activate membership by themselves.</p><div className="org-economics"><strong>Club Entry terms</strong><span>Organizer receives 6,400 non-redeemable bonus Cash Chips per $1 entry.</span><span>Creator allocation: 20¢ gross minus 20% platform commission = 16¢ net.</span><span>Platform receives 20¢ in royalties (16¢ organizer + 4¢ creator) before payment-provider fees. Organizers receive no USD withdrawals.</span></div><button className="org-primary" disabled={busy === 'entry'} onClick={() => void startEntry()}>{busy === 'entry' ? 'Checking availability…' : `Continue to verified ${usd(selected.entryFeeCents)} entry`}</button></>}</section>}
    </section></div>}
    {order?.checkoutUrl && <div className="org-payment" role="dialog" aria-modal="true" aria-label="Verified club entry checkout"><button onClick={() => setOrder(null)}>Close checkout</button>{receiptId && <button disabled={busy === 'verify'} onClick={() => void verifyPayment(receiptId)}>{busy === 'verify' ? 'Retrying verification…' : 'Retry verification'}</button>}<iframe title="Club entry checkout" src={order.checkoutUrl} sandbox="allow-forms allow-scripts allow-same-origin allow-popups" /></div>}
  </PageShell>;
}
