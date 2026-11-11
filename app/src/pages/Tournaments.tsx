import React, { useEffect, useMemo, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { Countdown, PageShell, SubNav } from '../components/PageShell';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'registering', label: 'Register now' },
  { key: 'running', label: 'Running' },
  { key: 'holdem', label: 'Hold’em' },
  { key: 'plo', label: 'PLO' },
  { key: 'freeroll', label: 'Freeroll' },
];

export function Tournaments() {
  const { user, refreshUser, toast, navigate, brand } = useApp();
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState('all');
  const [detail, setDetail] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'structure' | 'prizes'>('overview');
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try { setData(await api.tournaments()); } catch (e: any) { toast({ kind: 'error', title: 'Tournaments', body: e.message }); }
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const list = useMemo(() => {
    if (!data) return [];
    let l = data.tournaments;
    if (filter === 'registering') l = l.filter((t: any) => t.status === 'registering');
    else if (filter === 'running') l = l.filter((t: any) => t.status === 'running');
    else if (filter === 'freeroll') l = l.filter((t: any) => t.buyin === 0);
    else if (filter === 'plo') l = l.filter((t: any) => t.format === 'PLO');
    else if (filter === 'holdem') l = l.filter((t: any) => t.format === 'NLH');
    return l;
  }, [data, filter]);

  const registered: string[] = data?.registered || [];

  const register = async (t: any) => {
    if (!user) { navigate('/login'); return; }
    setBusy(t.id);
    try {
      await api.registerTourney(t.id);
      sound.play('coin');
      toast({ kind: 'success', title: 'Registered', body: `${t.name} · ${money(t.buyin + t.fee)}` });
      await load();
      await refreshUser();
    } catch (e: any) {
      toast({ kind: 'error', title: 'Registration failed', body: e.message });
    } finally { setBusy(null); }
  };

  const play = async (t: any) => {
    if (!user) { navigate('/login'); return; }
    setBusy(t.id);
    try {
      const token = localStorage.getItem('ggpoker.token');
      const r = await fetch(`/api/tournaments/${t.id}/play`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      sound.play('coin');
      navigate(`/table/${r.tableId}?buyin=${t.starting_stack}`);
    } catch (e: any) {
      toast({ kind: 'error', title: 'Cannot start', body: e.message });
    } finally { setBusy(null); }
  };

  const unregister = async (t: any) => {
    setBusy(t.id);
    try {
      await api.unregisterTourney(t.id);
      toast({ kind: 'info', title: 'Unregistered', body: t.name });
      await load(); await refreshUser();
    } catch (e: any) {
      toast({ kind: 'error', title: 'Failed', body: e.message });
    } finally { setBusy(null); }
  };

  const featured = data?.tournaments.find((t: any) => t.gtd >= 100000) || data?.tournaments[0];

  const prizeRows = (t: any) => {
    if (!t) return [];
    const pool = Math.max(t.gtd, t.entrants * (t.buyin + t.fee));
    const places = Math.min(36, Math.max(9, Math.round(t.entrants / 12)));
    const weights: number[] = [];
    for (let i = 1; i <= places; i++) weights.push(1 / Math.pow(i, 1.25));
    const tot = weights.reduce((a, b) => a + b, 0);
    return weights.map((w, i) => ({ place: i + 1, amount: Math.round((pool * w) / tot) }));
  };

  return (
    <PageShell activeTop="tournaments" subnav={<SubNav items={FILTERS} active={filter} onChange={setFilter} />}>
      <div className="page">
        <div className="tourney-hero">
          <div className="th-bg" style={{ backgroundImage: `url(${brand.promo})` }} />
          <div className="th-content">
            <div className="th-kicker">TOURNAMENT SERIES</div>
            <h1>{featured?.name || 'Daily $100,000 Flipout'}</h1>
            <div className="th-meta">
              <div><span>Guaranteed</span><b>{money(featured?.gtd || 10000000, true)}</b></div>
              <div><span>Buy-in</span><b>{featured ? money(featured.buyin + featured.fee) : '$27.50'}</b></div>
              <div><span>Entrants</span><b>{(featured?.entrants || 0).toLocaleString()}</b></div>
              <div><span>Starts in</span><b>{featured ? <Countdown to={featured.start_at} /> : '—'}</b></div>
            </div>
            {featured && (
              <button className="btn btn-gold" onClick={() => setDetail(featured)} style={{ marginTop: 12 }}>
                View tournament
              </button>
            )}
          </div>
        </div>

        <div className="tourney-toolbar">
          <div className="panel-title" style={{ margin: 0 }}>Upcoming tournaments <small>{list.length} events</small></div>
          <div className="row">
            <span className="muted small">Balance</span>
            <b className="gold">{money(user?.balance ?? 0)}</b>
          </div>
        </div>

        <div className="tourney-list">
          <div className="tourney-row head">
            <div>Start</div><div>Tournament</div><div>Buy-in</div><div>GTD</div><div>Entrants</div><div>Status</div><div />
          </div>
          {list.map((t: any) => {
            const isReg = registered.includes(t.id);
            return (
              <div key={t.id} className="tourney-row" onClick={() => { setDetail(t); setDetailTab('overview'); }}>
                <div className="t-time">
                  {new Date(t.start_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  <small>{new Date(t.start_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</small>
                </div>
                <div className="t-name">
                  <span className={'chip-dot ' + (t.buyin >= 10000 ? 'diamond' : t.buyin >= 3000 ? 'platinum' : 'gold')} />
                  <div>
                    <b>{t.name}</b>
                    <small>{t.format} · {t.starting_stack.toLocaleString()} chips · {t.blind_speed} min blinds</small>
                  </div>
                </div>
                <div className="t-buyin">{t.buyin === 0 ? 'Freeroll' : money(t.buyin + t.fee)}</div>
                <div className="t-gtd">{money(t.gtd, true)}</div>
                <div>{(t.entrants || 0).toLocaleString()}</div>
                <div><span className={'tag ' + (t.status === 'running' ? 'live' : 'reg')}>{t.status === 'running' ? 'Running' : 'Registering'}</span></div>
                <div style={{ textAlign: 'right' }}>
                  {isReg ? (
                    <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                      <button className="btn btn-gold btn-sm" disabled={busy === t.id} onClick={(e) => { e.stopPropagation(); play(t); }}>Play</button>
                      <button className="btn btn-ghost btn-sm" disabled={busy === t.id} onClick={(e) => { e.stopPropagation(); unregister(t); }}>Unreg</button>
                    </div>
                  ) : (
                    <button className="btn btn-red btn-sm" disabled={busy === t.id} onClick={(e) => { e.stopPropagation(); register(t); }}>Register</button>
                  )}
                </div>
              </div>
            );
          })}
          {!list.length && <div className="empty-state">No tournaments match this filter.</div>}
        </div>
      </div>

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{detail.name}</h3>
              <button className="title-icon" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="tabs-line" style={{ margin: '0 16px' }}>
              {(['overview', 'structure', 'prizes'] as const).map((k) => (
                <button key={k} className={detailTab === k ? 'on' : ''} onClick={() => setDetailTab(k)}>
                  {k === 'overview' ? 'Overview' : k === 'structure' ? 'Blind structure' : 'Prizes'}
                </button>
              ))}
            </div>
            <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
              {detailTab === 'overview' && (
                <>
                  <div className="grid g2">
                    <div className="kv"><span>Buy-in</span><b>{detail.buyin === 0 ? 'Freeroll' : money(detail.buyin + detail.fee)}</b></div>
                    <div className="kv"><span>Guarantee</span><b className="gold">{money(detail.gtd, true)}</b></div>
                    <div className="kv"><span>Starting stack</span><b>{detail.starting_stack.toLocaleString()}</b></div>
                    <div className="kv"><span>Blind levels</span><b>{detail.blind_speed} min</b></div>
                    <div className="kv"><span>Entrants</span><b>{detail.entrants.toLocaleString()}</b></div>
                    <div className="kv"><span>Game</span><b>{detail.format}</b></div>
                    <div className="kv"><span>Start</span><b>{new Date(detail.start_at).toLocaleString('en-GB')}</b></div>
                    <div className="kv"><span>Late registration</span><b>Until level 12</b></div>
                  </div>
                  <p className="muted small" style={{ marginTop: 14 }}>
                    Play-money tournament. Prizes are credited to your play balance. Blind levels increase every {detail.blind_speed} minutes;
                    late registration closes at the start of level 12.
                  </p>
                </>
              )}
              {detailTab === 'structure' && (
                <table className="admin-table">
                  <thead><tr><th>Level</th><th>Blinds</th><th>Ante</th><th>Duration</th></tr></thead>
                  <tbody>
                    {Array.from({ length: 16 }).map((_, i) => {
                      const bb = Math.round(detail.starting_stack / 100 * Math.pow(1.35, i));
                      return (
                        <tr key={i}>
                          <td>{i + 1}</td><td>{Math.round(bb / 2).toLocaleString()} / {bb.toLocaleString()}</td>
                          <td>{i > 3 ? Math.round(bb / 10).toLocaleString() : '—'}</td><td>{detail.blind_speed} min</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {detailTab === 'prizes' && (
                <table className="admin-table">
                  <thead><tr><th>Place</th><th>Prize</th></tr></thead>
                  <tbody>
                    {prizeRows(detail).map((p) => <tr key={p.place}><td>{p.place}</td><td className="gold">{money(p.amount)}</td></tr>)}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-foot">
              <span className="muted small" style={{ marginRight: 'auto' }}>Balance: {money(user?.balance ?? 0)}</span>
              {registered.includes(detail.id) ? (
                <>
                  <button className="btn btn-ghost" onClick={() => unregister(detail)}>Unregister</button>
                  <button className="btn btn-gold" onClick={() => play(detail)}>Play now</button>
                </>
              ) : (
                <button className="btn btn-red" disabled={busy === detail.id} onClick={() => register(detail)}>
                  Register · {detail.buyin === 0 ? 'Free' : money(detail.buyin + detail.fee)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
