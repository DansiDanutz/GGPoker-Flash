import React, { useEffect, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell, SubNav } from '../components/PageShell';
import { Avatar } from '../components/Avatar';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'promo', label: 'My Promo' },
  { key: 'missions', label: 'Weekly Mission' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'messages', label: 'Messages' },
  { key: 'leaders', label: 'Leaderboard' },
  { key: 'verify', label: 'Verify ID' },
  { key: 'security', label: 'Security' },
];

const PROMOS = [
  ['Daily $100,000 Flipout', '#ThanksGG', '/assets/chrome/promo.png'],
  ['Fish Buffet', 'Spin the wheel', '/assets/ui/discover/Bg_Discover_Fishbuffet.png'],
  ['GG Care', 'Bad beat protection', '/assets/ui/discover/Bg_Discover_GGcare.png'],
  ['Honeymoon Bonus', 'New player package', '/assets/ui/discover/Bg_Discover_Honeymoon.png'],
];

export function MyPage() {
  const { user, refreshUser, toast, navigate } = useApp();
  const [tab, setTab] = useState('overview');
  const [missions, setMissions] = useState<any[]>([]);
  const [tx, setTx] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    api.missions().then((r) => setMissions(r.missions)).catch(() => {});
    api.cashier().then((r) => setTx(r.transactions)).catch(() => {});
    api.leaderboard().then((r) => setLeaders(r.leaders)).catch(() => {});
    fetch('/api/chat').then((r) => r.json()).then((d) => setMessages((d.messages || []).slice(-20))).catch(() => {});
  }, []);

  const claim = async (m: any) => {
    try {
      await api.claimMission(m.id);
      sound.play('mission');
      toast({ kind: 'reward', title: 'Claimed', body: m.title });
      const r = await api.missions(); setMissions(r.missions);
      await refreshUser();
    } catch (e: any) { toast({ kind: 'error', title: 'Cannot claim', body: e.message }); }
  };

  const xp = user?.xp ?? 0;
  const level = user?.vip_level ?? 1;
  const levelXp = level * level * 1200;
  const pct = Math.min(100, Math.round(((xp % levelXp) / levelXp) * 100));

  return (
    <PageShell activeTop="poker" subnav={<SubNav items={TABS} active={tab} onChange={setTab} />}>
      <div className="page">
        {tab === 'overview' && (
          <>
            <div className="profile-head">
              <div className="avatar-ring" style={{ width: 80, height: 80 }}>
                <div className="inner"><Avatar name={user?.nick || '?'} src={user?.avatar} size={74} /></div>
                <span className="vip-badge" style={{ width: 24, height: 24, fontSize: 11 }}>{level}</span>
              </div>
              <div style={{ flex: 1 }}>
                <h1 className="page-title" style={{ marginBottom: 2 }}>My Page</h1>
                <div className="muted small">{user?.nick} · ID {user?.login} · {user?.country}</div>
                <div className="progress" style={{ marginTop: 10, maxWidth: 380 }}><i style={{ width: `${pct}%` }} /></div>
                <div className="muted small" style={{ marginTop: 4 }}>VIP {level} · {(xp % levelXp).toLocaleString()} / {levelXp.toLocaleString()} XP</div>
              </div>
              <div className="row">
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/settings')}>Settings</button>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/profile')}>Public profile</button>
              </div>
            </div>
            <div className="grid g4" style={{ marginTop: 16 }}>
              {[
                ['USD balance', money(user?.balance ?? 0)], ['Play chips', `P$ ${(user?.play_chips ?? 0).toLocaleString()}`],
                ['Tickets', `T$ ${user?.tickets ?? 0}`], ['Gems', (user?.gems ?? 0).toLocaleString()],
              ].map(([l, v]) => (
                <div key={l} className="card"><div className="muted small">{l}</div><div className="stat-big">{v}</div></div>
              ))}
            </div>
            <div className="grid g3" style={{ marginTop: 16 }}>
              <div className="card" onClick={() => setTab('missions')} style={{ cursor: 'pointer' }}>
                <div className="panel-title">Weekly missions</div>
                {missions.slice(0, 3).map((m) => (
                  <div key={m.id} className="kv"><span>{m.title}</span><b>{m.progress}/{m.goal}</b></div>
                ))}
              </div>
              <div className="card" onClick={() => navigate('/rewards')} style={{ cursor: 'pointer' }}>
                <div className="panel-title">GGPass</div>
                <div className="kv"><span>Level</span><b>{level}</b></div>
                <div className="kv"><span>VIP points</span><b>{(user?.vip_points ?? 0).toLocaleString()}</b></div>
                <div className="kv"><span>Next reward</span><b className="gold">T$5 ticket</b></div>
              </div>
              <div className="card" onClick={() => navigate('/hand-history')} style={{ cursor: 'pointer' }}>
                <div className="panel-title">Hand history</div>
                <div className="kv"><span>Stored hands</span><b>local</b></div>
                <div className="kv"><span>Replay</span><b>available</b></div>
                <div className="kv"><span>Export</span><b>copy board</b></div>
              </div>
            </div>
          </>
        )}

        {tab === 'promo' && (
          <div className="promo-grid">
            {PROMOS.map(([title, sub, img]) => (
              <div key={title} className="promo-card" onClick={() => navigate('/promotions')}>
                <img src={img} alt="" onError={(e) => { (e.target as HTMLImageElement).src = '/assets/chrome/promo.png'; }} />
                <div className="overlay"><h3>{title}</h3><p>{sub}</p></div>
              </div>
            ))}
          </div>
        )}

        {tab === 'missions' && (
          <div className="grid g2">
            {missions.map((m) => (
              <div key={m.id} className="card">
                <div className="between"><b style={{ color: '#f0f0f0' }}>{m.title}</b><span className="gold small">{money(m.reward)}</span></div>
                <div className="muted small" style={{ margin: '4px 0 10px' }}>{m.description}</div>
                <div className="progress"><i style={{ width: `${Math.min(100, (m.progress / m.goal) * 100)}%` }} /></div>
                <div className="between" style={{ marginTop: 6 }}>
                  <span className="muted small">{m.progress}/{m.goal}</span>
                  <button className={'btn btn-sm ' + (m.claimed ? 'btn-ghost' : 'btn-gold')} disabled={m.claimed || m.progress < m.goal} onClick={() => claim(m)}>
                    {m.claimed ? 'Claimed' : 'Claim'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'transactions' && (
          <div className="card" style={{ padding: 0 }}>
            <table className="admin-table">
              <thead><tr><th>#</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Memo</th><th>Date</th></tr></thead>
              <tbody>
                {tx.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td><td style={{ textTransform: 'capitalize' }}>{t.kind.replace(/_/g, ' ')}</td>
                    <td style={{ color: t.amount >= 0 ? '#7fe0a0' : '#ff9a9a' }}>{t.amount >= 0 ? '+' : ''}{money(t.amount)}</td>
                    <td>{money(t.balance_after)}</td><td className="muted">{t.memo}</td><td className="muted">{t.created_at}</td>
                  </tr>
                ))}
                {!tx.length && <tr><td colSpan={6} className="empty-state">No transactions yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'tickets' && (
          <div className="grid g3">
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 34 }}>🎟️</div>
              <div className="stat-big">T$ {user?.tickets ?? 0}</div>
              <div className="muted small">Tournament tickets available</div>
              <button className="btn btn-gold btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/tournaments')}>Use a ticket</button>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 34 }}>🎫</div>
              <div className="stat-big">1</div>
              <div className="muted small">Expiring this week</div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/tournaments')}>Find a tournament</button>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 34 }}>💎</div>
              <div className="stat-big">{(user?.gems ?? 0).toLocaleString()}</div>
              <div className="muted small">Ocean gems</div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/ocean')}>Open gem store</button>
            </div>
          </div>
        )}

        {tab === 'messages' && (
          <div className="card" style={{ padding: 0 }}>
            {[
              ['🎁', 'Daily freebie is ready', 'Open My Rewards to claim it.'],
              ['🏆', 'Tournament reminder', 'Your registered event starts soon.'],
              ['🐟', 'Fish Buffet spin available', 'Spin for up to 100,000x.'],
              ...messages.map((m: any) => ['💬', `${m.nick} in lobby chat`, m.message]),
            ].map(([i, t, b], idx) => (
              <div key={idx} className="list-row" style={{ borderRadius: 0 }}>
                <span style={{ fontSize: 20 }}>{i}</span>
                <div style={{ flex: 1 }}><b style={{ fontSize: 13, color: '#eee' }}>{t}</b><div className="muted small">{b}</div></div>
              </div>
            ))}
          </div>
        )}

        {tab === 'leaders' && (
          <div className="card" style={{ padding: 0 }}>
            <table className="admin-table">
              <thead><tr><th>#</th><th>Player</th><th>VIP</th><th>Points</th></tr></thead>
              <tbody>
                {leaders.slice(0, 20).map((l) => (
                  <tr key={l.rank} style={l.nick === user?.nick ? { background: '#2a2311' } : undefined}>
                    <td>{l.rank}</td><td><div className="row"><Avatar name={l.nick} src={l.avatar} size={22} />{l.nick}</div></td>
                    <td>VIP {l.vip_level}</td><td className="gold">{l.vip_points.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(tab === 'verify' || tab === 'security') && (
          <div className="grid g2">
            <div className="card">
              <div className="panel-title">{tab === 'verify' ? 'Identity verification' : 'Account security'}</div>
              {tab === 'verify' ? (
                <>
                  <div className="field"><label>Full name</label><input defaultValue="" placeholder="As on your ID" /></div>
                  <div className="field"><label>Date of birth</label><input type="date" /></div>
                  <div className="field"><label>Document number</label><input placeholder="Passport / ID" /></div>
                  <button className="btn btn-red btn-sm" onClick={() => toast({ kind: 'success', title: 'Verification submitted', body: 'This is a local demo — no documents are uploaded.' })}>Submit</button>
                </>
              ) : (
                <>
                  <div className="field"><label>Current password</label><input type="password" /></div>
                  <div className="field"><label>New password</label><input type="password" /></div>
                  <button className="btn btn-red btn-sm" onClick={() => toast({ kind: 'success', title: 'Password updated' })}>Change password</button>
                  <div className="panel-title" style={{ marginTop: 18 }}>Two-factor authentication</div>
                  <div className="kv"><span>Status</span><b>Off</b></div>
                  <button className="btn btn-ghost btn-sm" onClick={() => toast({ kind: 'info', title: '2FA', body: 'Local demo does not require 2FA.' })}>Enable</button>
                </>
              )}
            </div>
            <div className="card">
              <div className="panel-title">Sessions</div>
              <div className="kv"><span>This device</span><b>macOS · active</b></div>
              <div className="kv"><span>Other sessions</span><b>none</b></div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/settings')}>Account settings</button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
