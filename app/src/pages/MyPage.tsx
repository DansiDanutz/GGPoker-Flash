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
  { key: 'notes', label: 'Player notes' },
  { key: 'friends', label: 'Friends' },
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
  const [notes, setNotes] = useState<any[]>([]);
  const [noteEdit, setNoteEdit] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [friendNick, setFriendNick] = useState('');

  useEffect(() => {
    api.missions().then((r) => setMissions(r.missions)).catch(() => {});
    api.cashier().then((r) => setTx(r.transactions)).catch(() => {});
    api.leaderboard().then((r) => setLeaders(r.leaders)).catch(() => {});
    fetch('/api/chat').then((r) => r.json()).then((d) => setMessages((d.messages || []).slice(-20))).catch(() => {});
    fetch('/api/notes', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((r) => r.json()).then((d) => setNotes(d.notes || [])).catch(() => {});
    fetch('/api/friends', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((r) => r.json()).then((d) => setFriends(d.friends || [])).catch(() => {});
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

        {tab === 'friends' && (
          <>
            <div className="between" style={{ marginBottom: 10 }}>
              <p className="muted small" style={{ margin: 0 }}>Players you follow. Add someone by nickname to see when they are at a table.</p>
              <div className="row">
                <input className="admin-input" placeholder="Nickname" value={friendNick} onChange={(e) => setFriendNick(e.target.value)} style={{ width: 170 }} />
                <button className="btn btn-red btn-sm" disabled={!friendNick.trim()} onClick={async () => {
                  try {
                    await fetch('/api/friends', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` }, body: JSON.stringify({ nick: friendNick }) });
                    const r = await fetch('/api/friends', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((x) => x.json());
                    setFriends(r.friends || []); setFriendNick('');
                  } catch { /* ignore */ }
                }}>Add friend</button>
              </div>
            </div>
            <div className="grid g3">
              {friends.map((f) => (
                <div key={f.id} className="card">
                  <div className="row">
                    <Avatar name={f.nick} src={f.avatar} size={40} />
                    <div>
                      <div className="row"><b style={{ color: '#eee' }}>{f.nick}</b><span style={{ width: 7, height: 7, borderRadius: '50%', background: f.online ? '#48d17a' : '#555', display: 'inline-block' }} /></div>
                      <div className="muted small">VIP {f.vip_level} · {f.online ? 'At a table' : 'Offline'}</div>
                    </div>
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setTab('messages')}>Message</button>
                    <button className="btn btn-ghost btn-sm" onClick={async () => {
                      await fetch(`/api/friends/${f.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } });
                      setFriends((prev) => prev.filter((x) => x.id !== f.id));
                    }}>Remove</button>
                  </div>
                </div>
              ))}
              {!friends.length && <div className="empty-state" style={{ gridColumn: 'span 3' }}>No friends yet. Add a player by nickname.</div>}
            </div>
          </>
        )}

        {tab === 'notes' && (
          <>
            <div className="between" style={{ marginBottom: 10 }}>
              <p className="muted small" style={{ margin: 0 }}>Private notes you have written on other players. Only you can see them.</p>
              <button className="btn btn-ghost btn-sm" onClick={() => setNoteEdit({ target: '', note: '', color: 'yellow', isNew: true })}>+ New note</button>
            </div>
            <div className="grid g2">
              {notes.map((n) => (
                <div key={n.target} className="card">
                  <div className="between">
                    <div className="row"><span style={{ width: 10, height: 10, borderRadius: '50%', background: n.color === 'green' ? '#45c777' : n.color === 'red' ? '#d0455a' : n.color === 'blue' ? '#3f9ad0' : '#e0b34b', display: 'inline-block' }} /><b style={{ color: '#eee' }}>{n.target}</b></div>
                    <span className="muted small">{n.updated_at?.slice(0, 16)}</span>
                  </div>
                  <div style={{ color: '#cfcfcf', fontSize: 12.5, margin: '8px 0', whiteSpace: 'pre-wrap' }}>{n.note}</div>
                  <div className="row">
                    <button className="btn btn-ghost btn-sm" onClick={() => setNoteEdit({ ...n })}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={async () => {
                      await fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` }, body: JSON.stringify({ target: n.target, note: '' }) });
                      setNotes((prev) => prev.filter((x) => x.target !== n.target));
                    }}>Delete</button>
                  </div>
                </div>
              ))}
              {!notes.length && <div className="empty-state" style={{ gridColumn: 'span 2' }}>No player notes yet. Click a player at the table to add one.</div>}
            </div>
            {noteEdit && (
              <div className="modal-backdrop" onClick={() => setNoteEdit(null)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-head"><h3>{noteEdit.isNew ? 'New player note' : `Note · ${noteEdit.target}`}</h3></div>
                  <div className="modal-body">
                    {noteEdit.isNew && (
                      <div className="field"><label>Player nickname</label><input value={noteEdit.target} onChange={(e) => setNoteEdit({ ...noteEdit, target: e.target.value })} placeholder="Nickname" /></div>
                    )}
                    <div className="field"><label>Note</label><textarea rows={4} value={noteEdit.note} onChange={(e) => setNoteEdit({ ...noteEdit, note: e.target.value })} style={{ width: '100%', background: '#121212', border: '1px solid #343434', borderRadius: 5, color: '#eee', padding: 10, fontFamily: 'inherit' }} /></div>
                    <div className="row">
                      {['yellow', 'green', 'red', 'blue'].map((c) => (
                        <button key={c} onClick={() => setNoteEdit({ ...noteEdit, color: c })} style={{ width: 26, height: 26, borderRadius: '50%', background: c === 'yellow' ? '#e0b34b' : c === 'green' ? '#45c777' : c === 'red' ? '#d0455a' : '#3f9ad0', border: noteEdit.color === c ? '2px solid #fff' : '2px solid transparent' }} />
                      ))}
                    </div>
                  </div>
                  <div className="modal-foot">
                    <button className="btn btn-dark" onClick={() => setNoteEdit(null)}>Cancel</button>
                    <button className="btn btn-red" disabled={!noteEdit.target?.trim() || !noteEdit.note?.trim()} onClick={async () => {
                      await fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` }, body: JSON.stringify({ target: noteEdit.target, note: noteEdit.note, color: noteEdit.color }) });
                      const r = await fetch('/api/notes', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((x) => x.json());
                      setNotes(r.notes || []); setNoteEdit(null);
                    }}>Save</button>
                  </div>
                </div>
              </div>
            )}
          </>
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
