import React, { useEffect, useMemo, useState } from 'react';
import { api, money, TournamentDetail } from '../lib/api';
import { bubbleLabel, ordinal, placesPaidLabel, prizeText } from '../lib/tournamentPrizes';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { Countdown, PageShell } from '../components/PageShell';
import { MobileEvents } from '../components/mobile/MobileEvents';
import { MobileShell } from '../components/mobile/MobileShell';
import { useIsPhone } from '../lib/useIsPhone';
import { TournamentCategoryRail, TournamentFilterBar } from '../components/TournamentFilterBar';
import {
  emptyTournamentMessage, filterTournaments, phaseOf, PHASE_LABEL, readTournamentFilters, resetTournamentFilters,
  TournamentFilters, tournamentFilterCount, withTournamentFilters, writeTournamentFilters,
} from '../lib/tournamentFilters';

const SERIES_ART: Record<string, string> = {
  wsop: '/assets/ui/discover/Bg_Discover_WSOPExpress_Promo1_EN.png',
  mystery: '/assets/ui/discover/Bg_Discover_MysteryBattleRoyal.png',
  spin: '/assets/ui/discover/Bg_Discover_SpinNGold.png',
};

export function Tournaments() {
  const { user, refreshUser, toast, navigate, brand } = useApp();
  const isPhone = useIsPhone();
  const [data, setData] = useState<any>(null);
  const [filters, setFilters] = useState<TournamentFilters>(() => readTournamentFilters());
  const [detail, setDetail] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'structure' | 'prizes'>('overview');
  const [prizes, setPrizes] = useState<TournamentDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try { setData(await api.tournaments()); } catch (e: any) { toast({ kind: 'error', title: 'Tournaments', body: e.message }); }
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
    if (!id) return;
    api.tournament(id).then((r) => setDetail(r.tournament)).catch((e) => toast({ kind: 'error', title: 'Tournament', body: e.message }));
  }, []);

  const registered: string[] = data?.registered || [];
  const list = useMemo(
    () => (data ? filterTournaments(data.tournaments, { ...filters, registered: data.registered || [], nowMs: Date.now() }) : []),
    [data, filters],
  );

  const updateFilters = (patch: Partial<TournamentFilters>) => {
    setFilters((prev) => {
      const next = withTournamentFilters(prev, patch);
      writeTournamentFilters(next);
      return next;
    });
  };
  const resetFilters = () => {
    const next = resetTournamentFilters();
    writeTournamentFilters(next);
    setFilters(next);
  };

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

  // Watch the busiest live flight; an event only has tables once it is running.
  const watchLive = async (t: any) => {
    setBusy(t.id);
    try {
      const token = localStorage.getItem('ggpoker.token');
      const r = await fetch(`/api/tournaments/${t.id}/watch`, { headers: { authorization: `Bearer ${token}` } }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      navigate(`/table/${r.tableId}?observe=1`);
    } catch (e: any) {
      toast({ kind: 'error', title: 'Nothing to watch yet', body: e.message });
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

  const featured = list.length ? list.reduce((a: any, b: any) => (b.gtd > a.gtd ? b : a), list[0]) : data?.tournaments?.[0];

  // The payout table comes from the server (DanGG rule) so the Prizes tab shows
  // exactly what settlement will credit.
  const detailId = detail?.id;
  useEffect(() => {
    setPrizes(null);
    if (!detailId) return;
    let cancelled = false;
    api.tournament(detailId)
      .then((r) => { if (!cancelled) setPrizes(r); })
      .catch((e) => { if (!cancelled) toast({ kind: 'error', title: 'Prizes', body: e.message }); });
    return () => { cancelled = true; };
  }, [detailId]);
  const bubble = prizes && detail?.status === 'running' ? bubbleLabel(prizes.payouts, prizes.playersLeft) : null;

  const openDetail = (t: any) => { setDetail(t); setDetailTab('overview'); };

  return (
    <>
    {isPhone ? (
      <MobileShell showBrand><MobileEvents
        list={list}
        featured={featured || null}
        heroArt={SERIES_ART[filters.category]}
        filters={filters}
        onFilters={updateFilters}
        onReset={resetFilters}
        onOpen={openDetail}
        emptyText={data ? emptyTournamentMessage(filters) : 'Loading events…'}
      /></MobileShell>
    ) : (
    <PageShell activeTop="tournaments">
      <div className="page">
        <div className="tourney-hero">
          <div className="th-bg" style={SERIES_ART[filters.category] ? { backgroundImage: `url(${SERIES_ART[filters.category]})` } : undefined} />
          <div className="th-content">
            <div className="th-kicker">TOURNAMENT SERIES</div>
            <h1>{featured?.name || 'Daily Chip Flipout'}</h1>
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

        <TournamentCategoryRail active={filters.category} onChange={(category) => updateFilters({ category })} />

        <div className="tourney-toolbar">
          <div className="panel-title" style={{ margin: 0 }}>Upcoming tournaments <small>{list.length} events</small></div>
          <div className="row">
            <span className="muted small">Balance</span>
            <b className="gold">{money(user?.balance ?? 0)}</b>
          </div>
        </div>

        <TournamentFilterBar filters={filters} onChange={updateFilters} onReset={resetFilters} />

        <div className="tourney-list">
          <div className="tourney-row head">
            <div>Start</div><div>Tournament</div><div>Buy-in</div><div>GTD</div><div>Entrants</div><div>Status</div><div />
          </div>
          {list.map((t: any) => {
            const isReg = registered.includes(t.id);
            return (
              <div key={t.id} className="tourney-row" onClick={() => { setDetail(t); setDetailTab('overview'); }}>
                <div className={'t-time phase-' + phaseOf(t, Date.now())}>
                  {new Date(t.start_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  <small>{new Date(t.start_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</small>
                </div>
                <div className={'t-name fmt-' + String(t.format || 'nlh').toLowerCase() + ' mode-' + String(t.mode || 'standard').toLowerCase().replace(/[^a-z]+/g, '-')}>
                  <span className={'chip-dot ' + (t.buyin >= 10000 ? 'diamond' : t.buyin >= 3000 ? 'platinum' : 'gold')} />
                  <div>
                    <b>{t.name}</b>
                    <small>{t.mode && t.mode !== 'STANDARD' ? `${t.mode} · ` : ''}{t.format} · {t.starting_stack.toLocaleString()} chips · {t.blind_speed} min blinds</small>
                  </div>
                </div>
                <div className="t-buyin">{t.buyin === 0 ? 'Freeroll' : money(t.buyin + t.fee)}</div>
                <div className="t-gtd">{money(t.gtd, true)}</div>
                <div className="t-entrants">{(t.entrants || 0).toLocaleString()}</div>
                <div><span className={'tag ' + (t.status === 'running' ? 'live' : 'reg')}>{PHASE_LABEL[phaseOf(t, Date.now())]}</span></div>
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
          {data && !list.length && (
            <div className="empty-state">
              <div>
                <p>{emptyTournamentMessage(filters)}</p>
                {tournamentFilterCount(filters) > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>Reset filters</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
    )}

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
                    <div className="kv"><span>Late registration</span><b>{new Date(new Date(detail.start_at).getTime() + (detail.late_reg || 0) * 60000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b></div>
                    {detail.mode && detail.mode !== 'STANDARD' && <div className="kv"><span>Format</span><b>{detail.mode}</b></div>}
                    {detail.mode === 'BOUNTY' && <div className="kv"><span>Bounty</span><b className="gold">{money(detail.bounty || 0)}</b></div>}
                    {detail.mode === 'MYSTERY' && <div className="kv"><span>Mystery bounty</span><b className="gold">up to {money((detail.bounty || 0) * 10)}</b></div>}
                    {detail.mode === 'SATELLITE' && <div className="kv"><span>Ticket</span><b>{detail.ticket || 'Target event'}</b></div>}
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
                prizes ? (
                  <>
                    <div className="grid g2" style={{ marginBottom: 12 }}>
                      <div className="kv"><span>Prize pool</span><b className="gold">{money(prizes.prizePool)}</b></div>
                      <div className="kv"><span>Places paid</span><b>{placesPaidLabel(prizes.payouts)}</b></div>
                      {prizes.playersLeft != null && <div className="kv"><span>Players left</span><b>{prizes.playersLeft.toLocaleString()}</b></div>}
                      {bubble && <div className="kv"><span>Bubble</span><b className="gold">{bubble}</b></div>}
                    </div>
                    <table className="admin-table">
                      <thead><tr><th>Place</th><th>Prize</th></tr></thead>
                      <tbody>
                        {prizes.payouts.map((p) => (
                          <tr key={p.place}><td>{ordinal(p.place)}</td><td className="gold">{prizeText(p, (n) => money(n))}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : <p className="muted small">Loading prizes…</p>
              )}
            </div>
            <div className="modal-foot">
              <span className="muted small" style={{ marginRight: 'auto' }}>Balance: {money(user?.balance ?? 0)}</span>
              {detail.status === 'running' && (
                <button className="btn btn-ghost" disabled={busy === detail.id} onClick={() => watchLive(detail)}>Watch live</button>
              )}
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
    </>
  );
}
