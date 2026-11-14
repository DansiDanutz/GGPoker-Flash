import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, money, type PropBet as Bet, type PropBetBoard, type PropBetDraft, type PropBetType } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell } from '../components/PageShell';
import { PropBetCard, durationLabel } from '../components/propbet/PropBetCard';
import { PropBetWizard } from '../components/propbet/PropBetWizard';
import { PROP_TYPES, propLabel } from '../components/propbet/PropBetBadge';

const REFRESH_MS = 15_000;
type Filter = 'all' | PropBetType;

function InfoWindow({ id, onClose }: { id: number; onClose: () => void }) {
  const [bet, setBet] = useState<Bet | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.propBet(id).then((r) => setBet(r.bet)).catch((e) => setError(e.message || 'Could not load this prop bet'));
  }, [id]);
  const title = bet ? (bet.type === 'last_longer' ? bet.tournamentName : `${propLabel(bet.type)} · ${bet.creatorNick}`) : '';
  return (
    <div className="modal-backdrop pb-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pb-info" role="dialog" aria-modal="true" aria-label={`${bet ? propLabel(bet.type) : 'Prop bet'} information`}>
        <header><span>{bet ? propLabel(bet.type) : 'Prop bet'} Information</span><button type="button" aria-label="Close" onClick={onClose}>✕</button></header>
        {error && <p className="pb-warn">{error}</p>}
        {!bet && !error && <p className="pb-hint">Loading…</p>}
        {bet && (
          <>
            <h3>{title}</h3>
            <dl className="pb-kv">
              <div><dt>Start Time</dt><dd>{new Date(bet.startAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
              {bet.endAt && <div><dt>End Time</dt><dd>{new Date(bet.endAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {durationLabel(bet)}</dd></div>}
              <div><dt>{bet.type === 'last_longer' ? 'Total Prize' : 'Escrowed'}</dt><dd className="gold">{money(bet.pot)}</dd></div>
              <div><dt>Bet Amount</dt><dd className="gold">{money(bet.amount)}</dd></div>
              {bet.type !== 'last_longer' && <div><dt>Goal</dt><dd>{bet.type === 'elo' ? `+${bet.goal} ELO${bet.target ? ` (reach ${bet.target})` : ''}` : `+${money(bet.goal ?? 0)}`}</dd></div>}
              {bet.progress != null && <div><dt>Progress</dt><dd>{bet.type === 'bankroll' ? money(bet.progress) : bet.progress}</dd></div>}
              <div><dt>Status</dt><dd>{bet.status === 'settled' ? (bet.winnerNick ? `Won by ${bet.winnerNick}` : 'Settled') : bet.status[0].toUpperCase() + bet.status.slice(1)}</dd></div>
            </dl>
            <table className="pb-rank">
              <thead><tr><th>{bet.type === 'last_longer' ? 'Rank' : 'Side'}</th><th>Players</th><th>Stake</th></tr></thead>
              <tbody>
                {(bet.entries || []).map((e, i) => (
                  <tr key={e.userId} className={bet.winnerId === e.userId ? 'win' : ''}>
                    <td>{bet.type === 'last_longer' ? (bet.winnerId === e.userId ? '👑' : i + 1) : e.side === 'creator' ? 'Challenger' : 'Against'}</td>
                    <td>{e.nick}{e.out ? <small> · out</small> : null}</td>
                    <td className="gold">{money(e.stake)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

export function PropBetPage() {
  const { user, navigate, toast, refreshUser } = useApp();
  const [board, setBoard] = useState<PropBetBoard | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  // The tournament lobby links here with ?create=last_longer&tournament=<id>.
  const [preset] = useState(() => {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    return q.get('create') === 'last_longer' ? q.get('tournament') || '' : '';
  });
  const [creating, setCreating] = useState(!!preset);
  const [joining, setJoining] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setBoard(await api.propBets()); setError(''); }
    catch (e: any) { setError(e.message || 'Could not load prop bets'); }
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (board?.bets || []).filter((b) => (filter === 'all' || b.type === filter)
      && (!q || b.creatorNick.toLowerCase().includes(q) || (b.tournamentName || '').toLowerCase().includes(q)));
  }, [board, filter, query]);

  const join = async (bet: Bet) => {
    if (!user) { navigate('/login'); return; }
    setJoining(bet.id);
    try {
      await api.joinPropBet(bet.id);
      sound.play('coin');
      toast({ kind: 'reward', title: 'You are in', body: `${propLabel(bet.type)} · ${money(bet.amount)} staked` });
      await Promise.all([load(), refreshUser()]);
    } catch (e: any) { toast({ kind: 'error', title: 'Prop bet', body: e.message }); }
    finally { setJoining(null); }
  };

  const create = async (draft: PropBetDraft) => {
    try {
      await api.createPropBet(draft);
      sound.play('coin');
      toast({ kind: 'reward', title: 'Prop bet created', body: propLabel(draft.type) });
      setCreating(false);
      await Promise.all([load(), refreshUser()]);
    } catch (e: any) { toast({ kind: 'error', title: 'Prop bet', body: e.message }); }
  };

  return (
    <PageShell activeTop="poker">
      <div className="mp pb-window">
        <div className="mp-wintabs" role="tablist" aria-label="Account windows">
          <button type="button" role="tab" onClick={() => navigate('/my-page')}>My Page</button>
          <button type="button" role="tab" aria-selected="true" className="on">Prop Bet</button>
          <button type="button" role="tab" onClick={() => navigate('/ocean')}>Ocean Rewards</button>
          <button type="button" role="tab" onClick={() => navigate('/promotions')}>My Promo</button>
          <button type="button" role="tab" onClick={() => navigate('/settings')}>Game Settings</button>
          <button type="button" className="mp-close" aria-label="Close Prop Bet" onClick={() => navigate('/')}>✕</button>
        </div>
        <div className="pb-body">
          <div className="pb-toolbar">
            <input className="pb-search" type="search" placeholder="Search host or tournament" aria-label="Search prop bets" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button type="button" className="pb-icon" aria-label="Refresh" onClick={load}>⟳</button>
          </div>
          <div className="pb-filters">
            <div role="tablist" aria-label="Prop bet type">
              {[{ key: 'all' as Filter, label: 'All' }, ...PROP_TYPES.map((t) => ({ key: t.key as Filter, label: t.label }))].map((f) => (
                <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>{f.label}</button>
              ))}
            </div>
            <button type="button" className="pb-create" onClick={() => (user ? setCreating(true) : navigate('/login'))}><span aria-hidden="true">＋</span> Create</button>
          </div>
          {error && <p className="pb-warn">{error}</p>}
          {board && !shown.length && (
            <div className="pb-empty">
              <b>No open prop bets{filter !== 'all' ? ` for ${propLabel(filter)}` : ''}.</b>
              <p>Create one — register for a tournament for a Last Longer, or challenge your bankroll or ELO.</p>
            </div>
          )}
          <div className="pb-grid">
            {shown.map((b) => (
              <PropBetCard key={b.id} bet={b} mine={b.creatorId === user?.id} busy={joining === b.id} onJoin={() => join(b)} onOpen={() => setOpenId(b.id)} />
            ))}
          </div>
        </div>
      </div>
      {creating && board && user && <PropBetWizard board={board} tournamentId={preset} onClose={() => setCreating(false)} onCreate={create} />}
      {openId != null && <InfoWindow id={openId} onClose={() => setOpenId(null)} />}
    </PageShell>
  );
}
