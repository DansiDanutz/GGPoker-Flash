import React, { useEffect, useMemo, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { PageShell } from '../components/PageShell';
import { Avatar } from '../components/Avatar';

const GAMES = [
  { key: 'all', label: 'All games' },
  { key: 'spin', label: 'Spin & Gold' },
  { key: 'aof', label: 'All-in or Fold' },
  { key: 'rush', label: 'Rush & Cash' },
  { key: 'mystery', label: 'Mystery Battle Royale' },
  { key: 'holdem', label: "Hold'em" },
  { key: 'omaha', label: 'PLO' },
  { key: 'shortdeck', label: 'Short Deck' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayKey = (iso: string) => String(iso || '').slice(0, 10);
const fmtDay = (key: string) => {
  const d = new Date(key + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return key;
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
};

/** PokerCraft: timeline of the player's hands, reference pokercraft__01. */
export function PokerCraft() {
  const { user, navigate } = useApp();
  const [hands, setHands] = useState<any[] | null>(null);
  const [game, setGame] = useState('all');
  const [range, setRange] = useState<'year' | 'all'>('year');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.hands().then((r) => setHands(r.hands || [])).catch(() => setHands([]));
  }, []);

  const filtered = useMemo(() => {
    const since = Date.now() - 365 * 86400000;
    return (hands || [])
      .filter((h) => !h.hidden)
      .filter((h) => (range === 'all' ? true : new Date(h.created_at).getTime() >= since))
      .filter((h) => game === 'all' || String(h.game).toLowerCase().includes(game))
      .filter((h) => !q || `${h.tableName} ${h.game} ${h.board || ''}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [hands, game, range, q]);

  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const h of filtered) {
      const k = dayKey(h.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(h);
    }
    return [...map.entries()];
  }, [filtered]);

  const isMine = (w: any) => (user?.id != null && w.id === user?.id) || (!!user?.nick && w.nick === user.nick);
  const heroOf = (h: any) => (h.players || []).find((p: any) => (user?.id != null && p.id === user?.id) || (!!user?.nick && p.nick === user.nick));
  const wonAmount = (h: any) => (h.result?.winners || []).filter(isMine).reduce((s: number, w: any) => s + (w.amount || 0), 0);
  const lostAmount = (h: any) => { const me = heroOf(h); return me ? (me.totalBet || 0) : 0; };
  const resultOf = (h: any) => wonAmount(h) - lostAmount(h);
  const net = filtered.reduce((n, h) => n + resultOf(h), 0);

  return (
    <PageShell activeTop="poker">
      <div className="pc">
        <aside className="pc-rail">
          <div className="pc-brand"><span className="pc-logo" aria-hidden="true">♠</span>Poker<b>Craft</b></div>
          <div className="pc-me">
            <Avatar name={user?.nick || '?'} src={user?.avatar} size={92} />
            <b>{user?.nick || 'Guest'}</b>
          </div>
          <nav className="pc-nav" aria-label="PokerCraft">
            <button type="button" className={game === 'all' ? 'on' : ''} onClick={() => setGame('all')}><i>⏱</i>Timeline</button>
            <button type="button" onClick={() => navigate('/my-page?tab=notes')}><i>✎</i>Player Notes &amp; Labels</button>
            <button type="button" onClick={() => navigate('/my-page?tab=stakers')}><i>◔</i>Staking Profile</button>
            <span className="pc-sep" />
            {GAMES.slice(1).map((g) => (
              <button key={g.key} type="button" className={game === g.key ? 'on' : ''} onClick={() => setGame(g.key)}><i>◆</i>{g.label}</button>
            ))}
            <span className="pc-sep" />
            <button type="button" onClick={() => navigate('/tournaments')}><i>🏆</i>My Tournaments</button>
            <button type="button" onClick={() => navigate('/my-page?tab=stakers')}><i>◈</i>My Staking</button>
          </nav>
        </aside>

        <section className="pc-main">
          <div className="pc-toolbar">
            <div className="pc-range" role="tablist" aria-label="Date range">
              <button type="button" className={range === 'year' ? 'on' : ''} onClick={() => setRange('year')}>Last 1 Year</button>
              <button type="button" className={range === 'all' ? 'on' : ''} onClick={() => setRange('all')}>All time</button>
            </div>
            <div className="pc-tools">
              <input className="pc-search" placeholder="Search hands" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search hands" />
              <button type="button" aria-label="Refresh" onClick={() => api.hands().then((r) => setHands(r.hands || []))}>↻</button>
            </div>
          </div>

          <div className="pc-summary">
            <span>{filtered.length} hands</span>
            <span className={net >= 0 ? 'up' : 'down'}>Net {net >= 0 ? '+' : '-'}{money(Math.abs(net))}</span>
          </div>

          <div className="pc-timeline">
            {!hands && <p className="pc-empty">Loading timeline…</p>}
            {hands && !groups.length && (
              <div className="pc-empty">
                <b>No hands in this range</b>
                <span>Play a hand and it will appear on your PokerCraft timeline.</span>
                <button type="button" onClick={() => navigate('/')}>Find a table</button>
              </div>
            )}
            {groups.map(([day, list]) => (
              <div key={day} className="pc-day">
                <div className="pc-date"><b>{fmtDay(day)}</b></div>
                <div className="pc-items">
                  {list.map((h) => {
                    const id = String(h.id);
                    const isOpen = open === id;
                    const winner = h.result?.winners?.[0];
                    return (
                      <div key={h.id} className={'pc-item' + (isOpen ? ' open' : '')}>
                        <button type="button" className="pc-item-head" onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen}>
                          <span className="pc-icon" aria-hidden="true">✉</span>
                          <span className="pc-title">{String(h.game || 'Hold’em').replace(/^\w/, (c) => c.toUpperCase())} · {h.tableName} · Hand #{h.handNo}</span>
                          <span className={'pc-amt ' + (wonAmount(h) > 0 ? 'up' : lostAmount(h) > 0 ? 'down' : '')}>{wonAmount(h) > 0 ? `Won +${money(wonAmount(h))}` : lostAmount(h) > 0 ? `Lost -${money(lostAmount(h))}` : 'Folded'}</span>
                          <span className="pc-caret" aria-hidden="true">{isOpen ? '⌃' : '⌄'}</span>
                        </button>
                        {isOpen && (
                          <div className="pc-detail">
                            <div className="pc-board">
                              {(h.board || '').split(' ').filter(Boolean).map((c: string, i: number) => <span key={i} className="pc-card">{c}</span>)}
                              {!h.board && <span className="pc-muted">No board (hand ended pre-flop)</span>}
                            </div>
                            <div className="pc-meta">
                              <span>Pot <b>{money(h.pot)}</b></span>
                              <span>Your result <b className={resultOf(h) >= 0 ? 'pc-up' : 'pc-down'}>{resultOf(h) >= 0 ? '+' : '-'}{money(Math.abs(resultOf(h)))}</b></span>
                              <span>Winner <b>{winner?.nick || '—'}</b></span>
                              <span>Time <b>{String(h.created_at).slice(11, 16)}</b></span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <footer className="pc-foot">
            <span>Times shown in local time.</span>
            <span>© 2026 DanGG PokerCraft</span>
          </footer>
        </section>
      </div>
    </PageShell>
  );
}
