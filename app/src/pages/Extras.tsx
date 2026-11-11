import React, { useEffect, useMemo, useState } from 'react';
import { api, getToken, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell, SubNav } from '../components/PageShell';
import { Avatar } from '../components/Avatar';
import { PlayingCard } from '../components/Card';

export function Profile() {
  const { user, refreshUser, logout, toast, navigate } = useApp();
  const [nick, setNick] = useState(user?.nick || '');
  const [stats, setStats] = useState({ hands: 0, won: 0, biggest: 0 });

  useEffect(() => {
    api.hands().then((r) => {
      const hands = r.hands || [];
      const won = hands.filter((h) => h.result?.winners?.some((w: any) => w.id === user?.id)).length;
      const biggest = Math.max(0, ...hands.map((h) => h.result?.winners?.find((w: any) => w.id === user?.id)?.amount || 0));
      setStats({ hands: hands.length, won, biggest });
    }).catch(() => {});
  }, [user?.id]);

  const save = async () => {
    try { await api.setNick(nick); await refreshUser(); toast({ kind: 'success', title: 'Saved', body: 'Nickname updated.' }); }
    catch (e: any) { toast({ kind: 'error', title: 'Error', body: e.message }); }
  };

  return (
    <PageShell activeTop="poker">
      <div className="page">
        <div className="profile-head">
          <div className="avatar-ring" style={{ width: 92, height: 92 }}>
            <div className="inner"><Avatar name={user?.nick || '?'} src={user?.avatar} size={86} /></div>
            <span className="vip-badge" style={{ width: 26, height: 26, fontSize: 12 }}>{user?.vip_level ?? 1}</span>
          </div>
          <div style={{ flex: 1 }}>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{user?.nick}</h1>
            <div className="muted small">ID {user?.login} · Member since {user?.created_at?.slice(0, 10)}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="tag gtd">VIP {user?.vip_level}</span>
              <span className="tag reg">{user?.country}</span>
              <span className="tag live">Verified</span>
            </div>
          </div>
          <div className="row">
            <button className="btn btn-ghost" onClick={() => navigate('/settings')}>Settings</button>
            <button className="btn btn-dark" onClick={logout}>Log out</button>
          </div>
        </div>

        <div className="grid g4" style={{ marginTop: 18 }}>
          <div className="card"><div className="muted small">Balance</div><div className="stat-big">{money(user?.balance ?? 0)}</div></div>
          <div className="card"><div className="muted small">Hands recorded</div><div className="stat-big">{stats.hands}</div></div>
          <div className="card"><div className="muted small">Hands won</div><div className="stat-big">{stats.won}</div></div>
          <div className="card"><div className="muted small">Biggest pot won</div><div className="stat-big gold">{money(stats.biggest)}</div></div>
        </div>

        <div className="grid g2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="panel-title">Edit profile</div>
            <label className="admin-label">Nickname</label>
            <div className="row"><input className="admin-input" style={{ flex: 1 }} value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} /><button className="btn btn-red btn-sm" onClick={save}>Save</button></div>
            <label className="admin-label">Avatar</label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {['DansiDanutz', 'Shark', 'Lion', 'Ninja', 'Robot', 'Queen', 'Ace', 'Wolf'].map((n) => (
                <button key={n} style={{ borderRadius: '50%', border: '2px solid transparent' }} onClick={() => api.setAvatar('').then(refreshUser)}>
                  <Avatar name={n} size={40} />
                </button>
              ))}
            </div>
            <p className="muted small">Avatars are generated locally. Your original avatar is never uploaded.</p>
          </div>
          <div className="card">
            <div className="panel-title">VIP progress</div>
            <div className="kv"><span>VIP level</span><b>{user?.vip_level}</b></div>
            <div className="kv"><span>XP</span><b>{(user?.xp ?? 0).toLocaleString()}</b></div>
            <div className="kv"><span>VIP points</span><b>{(user?.vip_points ?? 0).toLocaleString()}</b></div>
            <div className="progress" style={{ marginTop: 10 }}><i style={{ width: `${Math.min(100, ((user?.xp ?? 0) % 6000) / 60)}%` }} /></div>
            <p className="muted small">Earn XP by playing raked hands. Every 1,000 XP unlocks new GGPass rewards.</p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export function HandHistory() {
  const { user } = useApp();
  const [hands, setHands] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [replay, setReplay] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [q, setQ] = useState('');
  const [resFilter, setResFilter] = useState('all');
  const [gameFilter, setGameFilter] = useState('all');

  useEffect(() => { api.hands().then((r) => setHands(r.hands)).catch(() => {}); }, []);

  useEffect(() => {
    if (!detail || !playing) return;
    setReplay((r) => (r >= 5 ? r : r));
    const t = setInterval(() => setReplay((r) => (r >= 5 ? 5 : r + 1)), 700);
    return () => clearInterval(t);
  }, [detail, playing]);

  useEffect(() => { if (detail) { setReplay(0); setPlaying(true); } }, [detail]);

  const filtered = hands.filter((h) => {
    if (q && !(`${h.tableName} ${h.game}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (gameFilter !== 'all' && h.game !== gameFilter) return false;
    if (resFilter !== 'all') {
      const won = h.result?.winners?.some((w: any) => w.id === user?.id);
      if (resFilter === 'won' && !won) return false;
      if (resFilter === 'lost' && won) return false;
    }
    return true;
  });

  return (
    <PageShell activeTop="poker">
      <div className="page">
        <h1 className="page-title">Hand History</h1>
        <p className="page-sub">Every hand you played is stored locally and can be replayed</p>
        <div className="row" style={{ marginBottom: 10 }}>
          <input className="admin-input" style={{ width: 260 }} placeholder="Search table or game…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="admin-select" value={resFilter} onChange={(e) => setResFilter(e.target.value)}>
            <option value="all">All results</option><option value="won">Won</option><option value="lost">Lost</option>
          </select>
          <select className="admin-select" value={gameFilter} onChange={(e) => setGameFilter(e.target.value)}>
            <option value="all">All games</option><option value="holdem">Hold’em</option><option value="omaha">PLO</option><option value="shortdeck">Short Deck</option><option value="rush">Rush & Cash</option>
          </select>
          <span className="muted small">{filtered.length} hands</span>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <table className="admin-table">
            <thead><tr><th>#</th><th>Table</th><th>Game</th><th>Board</th><th>Pot</th><th>Result</th><th>Date</th></tr></thead>
            <tbody>
              {filtered.map((h) => {
                const won = h.result?.winners?.some((w: any) => w.id === user?.id);
                return (
                  <tr key={h.id} onClick={() => setDetail(h)} style={{ cursor: 'pointer' }}>
                    <td>{h.handNo}</td>
                    <td>{h.tableName}</td>
                    <td style={{ textTransform: 'capitalize' }}>{h.game}</td>
                    <td>
                      <div className="row" style={{ gap: 2 }}>
                        {h.board ? h.board.split(' ').map((c: string, i: number) => <span key={i} className="mini-card-txt">{c}</span>) : '—'}
                      </div>
                    </td>
                    <td className="gold">{money(h.pot)}</td>
                    <td style={{ color: won ? '#7fe0a0' : '#c98a8a' }}>{won ? 'Won' : 'Lost'}</td>
                    <td className="muted">{h.created_at?.slice(0, 16)}</td>
                  </tr>
                );
              })}
              {!hands.length && <tr><td colSpan={7} className="empty-state">No hands yet — join a table and play a hand.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>{detail.tableName} · hand #{detail.handNo}</h3><button className="title-icon" onClick={() => setDetail(null)}>✕</button></div>
            <div className="modal-body">
              <div className="between" style={{ marginBottom: 12 }}>
                <span className="muted">Pot</span><b className="gold">{money(detail.pot)}</b>
              </div>
              <div className="board" style={{ marginBottom: 14 }}>
                {(detail.board || '').split(' ').filter(Boolean).map((c: string, i: number) => (
                  <PlayingCard key={i} card={i < replay ? c : '??'} />
                ))}
              </div>
              <table className="admin-table">
                <thead><tr><th>Player</th><th>Cards</th><th>Stack</th><th>Won</th></tr></thead>
                <tbody>
                  {(detail.players || []).map((p: any, i: number) => (
                    <tr key={i} style={p.id === user?.id ? { background: '#2a2311' } : undefined}>
                      <td>{p.nick}{p.id === user?.id ? ' (you)' : ''}</td>
                      <td>{p.cards?.join(' ')}</td>
                      <td>{money(p.stack)}</td>
                      <td className="gold">{p.win ? money(p.win) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setReplay(0); setPlaying(true); }}>Replay</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setPlaying((v) => !v)}>{playing ? 'Pause' : 'Play'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setReplay(5)}>Show all</button>
                <span className="muted small">Board revealed {replay}/5</span>
              </div>
              {!!detail.actions?.length && (
                <>
                  <div className="panel-title" style={{ marginTop: 16 }}>Action</div>
                  <div className="hh-actions">
                    {detail.actions.map((a: any, i: number) => {
                      const streetCount = a.street === 'preflop' ? 0 : a.street === 'flop' ? 3 : a.street === 'turn' ? 4 : 5;
                      return (
                        <div key={i} className={'hh-action' + (streetCount <= replay ? ' on' : '')}>
                          <span className="hh-street">{a.street || 'preflop'}</span>
                          <b>{a.nick}</b>
                          <span>{a.action}{a.amount ? ` · ${money(a.amount)}` : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

const MARKETS = [
  { key: 'coinflip', label: 'Coin flip', desc: 'Heads or tails', mult: '1.96x' },
  { key: 'next_hand_red', label: 'Next hand: red card on flop', desc: 'Any red card appears on the flop', mult: '1.9x' },
  { key: 'river_ace', label: 'An ace on the river', desc: 'Next hand you play', mult: '4.2x' },
  { key: 'any_flush', label: 'Flush on the board', desc: 'Five suited community cards', mult: '5.1x' },
  { key: 'player_wins', label: 'You win the next hand', desc: 'Any table you are seated at', mult: '2.0x' },
];

export function PropBet() {
  const { user, refreshUser, toast, navigate } = useApp();
  const [stake, setStake] = useState(500);
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const bet = async (market: string) => {
    if (!user) { navigate('/login'); return; }
    setBusy(market);
    try {
      const res = await fetch('/api/games/propbet', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ stake, market }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setHistory((h) => [{ market, won: res.won, payout: res.payout, at: Date.now() }, ...h].slice(0, 8));
      if (res.won) { sound.play('win'); toast({ kind: 'reward', title: 'Bet won', body: money(res.payout) }); }
      else { sound.play('fold', { volume: .5 }); toast({ kind: 'info', title: 'Bet lost', body: money(stake) }); }
      await refreshUser();
    } catch (e: any) { toast({ kind: 'error', title: 'Prop bet', body: e.message }); }
    finally { setBusy(null); }
  };

  return (
    <PageShell activeTop="poker">
      <div className="page">
        <h1 className="page-title">Prop Bet</h1>
        <p className="page-sub">Bet on what happens next at the tables</p>
        <div className="row" style={{ marginBottom: 14 }}>
          <span className="muted small">Stake</span>
          {[100, 500, 1000, 5000].map((s) => <button key={s} className={'btn btn-sm ' + (stake === s ? 'btn-gold' : 'btn-ghost')} onClick={() => setStake(s)}>{money(s)}</button>)}
          <div style={{ flex: 1 }} />
          <span className="muted small">Balance</span><b className="gold">{money(user?.balance ?? 0)}</b>
        </div>
        <div className="grid g2">
          {MARKETS.map((m) => (
            <div key={m.key} className="card">
              <div className="between">
                <div>
                  <b style={{ color: '#fff', fontSize: 14 }}>{m.label}</b>
                  <div className="muted small">{m.desc}</div>
                </div>
                <span className="tag gtd">{m.mult}</span>
              </div>
              <button className="btn btn-red btn-block btn-sm" style={{ marginTop: 12 }} disabled={busy === m.key} onClick={() => bet(m.key)}>
                {busy === m.key ? 'Placing…' : `Bet ${money(stake)}`}
              </button>
            </div>
          ))}
        </div>
        {!!history.length && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="panel-title">Recent prop bets</div>
            {history.map((h, i) => (
              <div key={i} className="kv"><span>{MARKETS.find((m) => m.key === h.market)?.label}</span><b style={{ color: h.won ? '#7fe0a0' : '#c98a8a' }}>{h.won ? `Won ${money(h.payout)}` : 'Lost'}</b></div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

export function Support() {
  const { toast } = useApp();
  const [open, setOpen] = useState(0);
  const faq = [
    ['Is this the real GGPoker?', 'No. This is a local, offline play-money clone built for demonstration. No real money, deposits or cash value are involved.'],
    ['How do I get chips?', 'Open the Cashier and deposit play money instantly, or claim your daily missions in My Rewards.'],
    ['Where are my hand histories?', 'Every hand you play is stored locally and can be replayed from Hand History.'],
    ['Can I play with friends?', 'Yes — open the same table in two browser windows or on two devices on your local network. Bots fill empty seats.'],
    ['How do I become an admin?', 'Log in with the admin account (admin / admin123) and open the Admin Console from Settings or by visiting #/admin.'],
  ];
  return (
    <PageShell activeTop="poker">
      <div className="page">
        <h1 className="page-title">Help & Support</h1>
        <p className="page-sub">Answers, contact and responsible gaming</p>
        <div className="grid g2">
          <div className="card">
            <div className="panel-title">FAQ</div>
            {faq.map(([q, a], i) => (
              <div key={q} className="faq-item" onClick={() => setOpen(i)}>
                <div className="faq-q">{q}<span>{open === i ? '−' : '+'}</span></div>
                {open === i && <div className="faq-a">{a}</div>}
              </div>
            ))}
          </div>
          <div className="card">
            <div className="panel-title">Contact support</div>
            <div className="field"><label>Subject</label><input placeholder="How can we help?" /></div>
            <div className="field"><label>Message</label><textarea rows={5} placeholder="Describe the issue…" style={{ width: '100%', background: '#121212', border: '1px solid #343434', borderRadius: 5, color: '#eee', padding: 10 }} /></div>
            <button className="btn btn-red" onClick={() => toast({ kind: 'success', title: 'Message sent', body: 'Support usually replies within 24h.' })}>Send message</button>
            <div className="panel-title" style={{ marginTop: 18 }}>Responsible gaming</div>
            <p className="muted small">Play money only. Set session reminders and limits in Settings → Responsible gaming.</p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
