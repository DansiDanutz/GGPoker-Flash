import React, { useEffect, useState } from 'react';
import { DEFAULT_NOTE_COLOR, noteColorHex, noteColorTitle, normalizeLabels } from '../lib/noteColors';
import { NoteColorPicker } from '../components/NoteColorPicker';
import { NoteLabelEditor } from '../components/NoteLabelEditor';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell } from '../components/PageShell';
import { ProfilePane } from '../components/mypage/ProfilePane';
import { WalletPane } from '../components/mypage/WalletPane';
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
  ['Daily Chip Flipout', '#ThanksDanGG', '/assets/chrome/promo.png'],
  ['Prize Wheel', 'Spin the wheel', '/assets/ui/discover/Bg_Discover_Fishbuffet.png'],
  ['Player Care', 'Bad beat protection', '/assets/ui/discover/Bg_Discover_GGcare.png'],
  ['Welcome Bonus', 'New player package', '/assets/ui/discover/Bg_Discover_Honeymoon.png'],
];

export function MyPage() {
  const { user, refreshUser, toast, navigate, logout } = useApp();
  const [tab, setTab] = useState('overview');
  const [missions, setMissions] = useState<any[]>([]);
  const [tx, setTx] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [dms, setDms] = useState<any[]>([]);
  const [dmPeer, setDmPeer] = useState<any>(null);
  const [dmThread, setDmThread] = useState<any[]>([]);
  const [dmText, setDmText] = useState('');
  const [dmBusy, setDmBusy] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteEdit, setNoteEdit] = useState<any>(null);
  const [noteLabels, setNoteLabels] = useState<string[]>(() => normalizeLabels(null));
  const [friends, setFriends] = useState<any[]>([]);
  const [friendReqs, setFriendReqs] = useState<any>({ incoming: [], outgoing: [] });
  const [friendNick, setFriendNick] = useState('');
  const [verify, setVerify] = useState<any>(null);
  const [vName, setVName] = useState('');
  const [vDob, setVDob] = useState('');
  const [vCountry, setVCountry] = useState('Romania');
  const [vDocType, setVDocType] = useState('Passport');
  const [vDoc, setVDoc] = useState<string | null>(null);
  const [vBusy, setVBusy] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [pwdCur, setPwdCur] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const loadDms = async () => { try { const r = await api.messages(); setDms(r.threads || []); } catch { /* ignore */ } };
  const openDm = async (peer: any) => {
    setDmPeer(peer);
    try { const r = await api.messageThread(peer.peer_id || peer.id); setDmThread(r.messages || []); await loadDms(); } catch { setDmThread([]); }
  };
  const sendDm = async () => {
    if (!dmPeer || !dmText.trim() || dmBusy) return;
    setDmBusy(true);
    try { await api.sendMessage(dmPeer.peer_id || dmPeer.id, dmText.trim()); setDmText(''); const r = await api.messageThread(dmPeer.peer_id || dmPeer.id); setDmThread(r.messages || []); await loadDms(); }
    catch (e: any) { toast({ kind: 'error', title: 'Message not sent', body: e.message }); }
    finally { setDmBusy(false); }
  };

  useEffect(() => {
    const onNotify = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;
      if (detail.type === 'dm' && dmPeer && Number(detail.from_id) === Number(dmPeer.peer_id)) {
        api.messageThread(dmPeer.peer_id).then((r) => setDmThread(r.messages || [])).catch(() => {});
        loadDms();
      }
      if (detail.type === 'friend' || detail.type === 'friend_accept') loadFriendReqs();
    };
    window.addEventListener('gg:notify', onNotify);
    return () => window.removeEventListener('gg:notify', onNotify);
  }, [dmPeer?.peer_id]);

  useEffect(() => {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const wanted = params.get('tab');
    if (wanted && ['overview', 'promo', 'missions', 'transactions', 'tickets', 'messages', 'notes', 'friends', 'leaderboard', 'verify', 'security'].includes(wanted)) setTab(wanted);
    const id = Number(params.get('dm') || 0);
    if (!id) return;
    api.userProfile(id).then((r) => openDm({ peer_id: r.user.id, nick: r.user.nick })).catch(() => {});
  }, []);

  const loadFriendReqs = async () => { try { setFriendReqs(await api.friendRequests()); } catch { /* ignore */ } };

  useEffect(() => {
    api.missions().then((r) => setMissions(r.missions)).catch(() => {});
    api.cashier().then((r) => setTx(r.transactions)).catch(() => {});
    api.leaderboard().then((r) => setLeaders(r.leaders)).catch(() => {});
    fetch('/api/chat').then((r) => r.json()).then((d) => setMessages((d.messages || []).slice(-20))).catch(() => {});
    loadDms();
    fetch('/api/notes', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((r) => r.json()).then((d) => { setNotes(d.notes || []); setNoteLabels(normalizeLabels(d.labels)); }).catch(() => {});
    fetch('/api/friends', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((r) => r.json()).then((d) => setFriends(d.friends || [])).catch(() => {});
    loadFriendReqs();
    fetch('/api/sessions', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((r) => r.json()).then((d) => setSessions(d.sessions || [])).catch(() => {});
    fetch('/api/verify', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((r) => r.json()).then((d) => { setVerify(d.verification); if (d.verification) { setVName(d.verification.full_name || ''); setVDob(d.verification.dob || ''); setVCountry(d.verification.country || 'Romania'); setVDocType(d.verification.doc_type || 'Passport'); } }).catch(() => {});
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
    <PageShell activeTop="poker">
      <div className="mp">
        <div className="mp-wintabs" role="tablist" aria-label="Account windows">
          <button type="button" role="tab" aria-selected="true" className="on">My Page</button>
          <button type="button" role="tab" onClick={() => navigate('/propbet')}>Prop Bet</button>
          <button type="button" role="tab" onClick={() => navigate('/ocean')}>Ocean Rewards</button>
          <button type="button" role="tab" onClick={() => navigate('/promotions')}>My Promo</button>
          <button type="button" role="tab" onClick={() => navigate('/settings')}>Game Settings</button>
          <button type="button" className="mp-close" aria-label="Close My Page" onClick={() => navigate('/')}>✕</button>
        </div>
        <div className="mp-body">
          <aside className="mp-menu" aria-label="Account menu">
            {[
              { key: 'rewards', label: 'GGPass Account', go: () => navigate('/rewards'), ext: true },
              { key: 'voice', label: 'My Action Voice', go: () => navigate('/settings'), ext: true },
              { key: 'overview', label: 'My Game Profile', go: () => setTab('overview') },
              { key: 'wallet', label: 'My Wallet', go: () => setTab('wallet') },
              { key: 'verify', label: 'Verify ID', go: () => setTab('verify') },
              { key: 'transactions', label: 'Transaction History', go: () => setTab('transactions') },
              { key: 'messages', label: 'Message', go: () => setTab('messages') },
              { key: 'coupons', label: 'Redeem Coupons', go: () => navigate('/promotions'), ext: true },
              { key: 'stakers', label: 'Current Stakers', go: () => setTab('stakers') },
              { key: 'sellers', label: 'Sellers you follow', go: () => setTab('sellers') },
              { key: 'pokercraft', label: 'PokerCraft', go: () => navigate('/hand-history'), ext: true },
              { key: 'security', label: 'Responsible Gaming', go: () => setTab('security') },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className={'mp-menu-item' + (tab === item.key ? ' on' : '')}
                aria-current={tab === item.key ? 'page' : undefined}
                onClick={item.go}
              >
                {item.label}
                {item.ext && <span className="mp-ext" aria-hidden="true">↗</span>}
              </button>
            ))}
            <button type="button" className="mp-menu-signout" onClick={async () => { await logout(); navigate('/login'); }}>Sign out</button>
            <div className="mp-menu-tiles">
              <button type="button" onClick={() => navigate('/hand-history')}><i aria-hidden="true">📊</i>PokerCraft</button>
              <button type="button" onClick={() => setTab('messages')}><i aria-hidden="true">✉️</i>Message</button>
            </div>
          </aside>
          <div className="mp-pane">
        {tab === 'overview' && <ProfilePane />}
        {tab === 'wallet' && <WalletPane />}

        {(tab === 'stakers' || tab === 'sellers') && (
          <div className="mpp-empty-pane">
            <h3>{tab === 'stakers' ? 'Current Stakers' : 'Sellers you follow'}</h3>
            <p className="muted">Nothing here yet. Staking and seller lists appear once you join a staking offer.</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/leaderboard')}>Browse the leaderboard</button>
          </div>
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
          <div className="grid g2" style={{ alignItems: 'start' }}>
            <div className="card" style={{ padding: 0 }}>
              <div className="panel-title" style={{ padding: '12px 12px 6px' }}>Direct messages</div>
              {dms.map((d) => (
                <div key={d.peer_id} className={'list-row dm-thread' + (dmPeer?.peer_id === d.peer_id ? ' on' : '')} onClick={() => openDm(d)} style={{ cursor: 'pointer' }}>
                  <Avatar name={d.nick} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 12.5, color: '#eee' }}>{d.nick}</b><div className="muted small dm-last">{d.last}</div></div>
                  {d.unread > 0 && <span className="dm-unread">{d.unread}</span>}
                </div>
              ))}
              {!dms.length && <div className="empty-state">No direct messages. Open a friend to start one.</div>}
              <div className="panel-title" style={{ padding: '12px 12px 6px', borderTop: '1px solid #242424' }}>Lobby feed</div>
              {messages.slice(-8).map((m: any) => (
                <div key={m.id} className="list-row" style={{ borderRadius: 0 }}>
                  <span style={{ fontSize: 16 }}>💬</span>
                  <div style={{ flex: 1 }}><b style={{ fontSize: 12, color: '#eee' }}>{m.nick}</b><div className="muted small">{m.message}</div></div>
                </div>
              ))}
            </div>
            <div className="card">
              {dmPeer ? (<>
                <div className="panel-title">Chat with {dmPeer.nick}</div>
                <div className="dm-log">
                  {dmThread.map((m) => (
                    <div key={m.id} className={'dm-bubble' + (m.from_id === user?.id ? ' me' : '')}>
                      <span>{m.body}</span><small>{m.created_at?.slice(11, 16)}</small>
                    </div>
                  ))}
                  {!dmThread.length && <div className="muted small">No messages yet.</div>}
                </div>
                <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); sendDm(); }}>
                  <input className="admin-input" style={{ flex: 1 }} placeholder="Write a message…" value={dmText} onChange={(e) => setDmText(e.target.value)} maxLength={500} />
                  <button className="btn btn-red btn-sm" disabled={dmBusy || !dmText.trim()} type="submit">Send</button>
                </form>
              </>) : (
                <div className="empty-state">Select a conversation or message a friend.</div>
              )}
            </div>
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
                    const result = await api.addFriend(friendNick);
                    const r = await fetch('/api/friends', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((x) => x.json());
                    setFriends(r.friends || []); setFriendNick(''); await loadFriendReqs();
                    toast({ kind: 'success', title: result.accepted ? 'Friend request accepted' : 'Friend request sent', body: result.nick });
                  } catch { /* ignore */ }
                }}>Add friend</button>
              </div>
            </div>
            {friendReqs.incoming?.length > 0 && (
              <div className="card" style={{ marginBottom: 10, borderColor: 'rgba(216,177,95,.35)' }}>
                <div className="panel-title">Friend requests</div>
                {friendReqs.incoming.map((r: any) => (
                  <div key={r.id} className="host-row">
                    <div><b>{r.nick}</b><span>wants to be friends</span></div>
                    <button className="btn btn-gold btn-sm" onClick={async () => { await api.respondFriendRequest(r.id, 'accept'); await loadFriendReqs(); const x = await fetch('/api/friends', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((q) => q.json()); setFriends(x.friends || []); toast({ kind: 'success', title: 'Friend added', body: r.nick }); }}>Accept</button>
                    <button className="btn btn-ghost btn-sm" onClick={async () => { await api.respondFriendRequest(r.id, 'decline'); await loadFriendReqs(); }}>Decline</button>
                  </div>
                ))}
              </div>
            )}
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
                    <button className="btn btn-ghost btn-sm" onClick={() => { setTab('messages'); openDm(f); }}>Message</button>
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
              <button className="btn btn-ghost btn-sm" onClick={() => setNoteEdit({ target: '', note: '', color: DEFAULT_NOTE_COLOR, isNew: true })}>+ New note</button>
            </div>
            <div className="grid g2">
              {notes.map((n) => (
                <div key={n.key ?? n.target} className="card">
                  <div className="between">
                    <div className="row"><span title={noteColorTitle(n.color, noteLabels)} style={{ width: 10, height: 10, borderRadius: '50%', background: noteColorHex(n.color), display: 'inline-block' }} /><b style={{ color: '#eee' }}>{n.target}</b></div>
                    <span className="muted small">{n.updated_at?.slice(0, 16)}</span>
                  </div>
                  <div style={{ color: '#cfcfcf', fontSize: 12.5, margin: '8px 0', whiteSpace: 'pre-wrap' }}>{n.note}</div>
                  <div className="row">
                    <button className="btn btn-ghost btn-sm" onClick={() => setNoteEdit({ ...n })}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={async () => {
                      await fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` }, body: JSON.stringify({ key: n.key, target: n.target, note: '' }) });
                      setNotes((prev) => prev.filter((x) => (x.key ?? x.target) !== (n.key ?? n.target)));
                    }}>Delete</button>
                  </div>
                </div>
              ))}
              {!notes.length && <div className="empty-state" style={{ gridColumn: 'span 2' }}>No player notes yet. Click a player at the table to add one.</div>}
            </div>
            <NoteLabelEditor labels={noteLabels} onSaved={setNoteLabels} />
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
                      <NoteColorPicker value={noteEdit.color} labels={noteLabels} onChange={(color) => setNoteEdit({ ...noteEdit, color })} />
                    </div>
                  </div>
                  <div className="modal-foot">
                    <button className="btn btn-dark" onClick={() => setNoteEdit(null)}>Cancel</button>
                    <button className="btn btn-red" disabled={!noteEdit.target?.trim() || !noteEdit.note?.trim()} onClick={async () => {
                      await fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` }, body: JSON.stringify({ key: noteEdit.key, target: noteEdit.target, note: noteEdit.note, color: noteEdit.color }) });
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
                verify && verify.status !== 'rejected' ? (
                  <>
                    <div className={'tag ' + (verify.status === 'approved' ? 'live' : '')}>{verify.status === 'approved' ? 'Verified' : 'Pending review'}</div>
                    <div className="kv" style={{ marginTop: 10 }}><span>Name</span><b>{verify.full_name}</b></div>
                    <div className="kv"><span>Document</span><b>{verify.doc_type}</b></div>
                    <div className="kv"><span>Submitted</span><b>{verify.created_at?.slice(0, 10)}</b></div>
                    {verify.note && <div className="muted small" style={{ marginTop: 8 }}>Reviewer note: {verify.note}</div>}
                    {verify.status === 'pending' && <p className="muted small" style={{ marginTop: 10 }}>Your documents are queued for review by the admin.</p>}
                  </>
                ) : (
                  <>
                    {verify?.status === 'rejected' && <div className="tag red" style={{ marginBottom: 8 }}>Rejected — resubmit</div>}
                    <div className="field"><label>Full legal name</label><input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="As on your ID" /></div>
                    <div className="field"><label>Date of birth</label><input type="date" value={vDob} onChange={(e) => setVDob(e.target.value)} /></div>
                    <div className="field"><label>Country</label>
                      <select value={vCountry} onChange={(e) => setVCountry(e.target.value)}>
                        {['Romania', 'Germany', 'France', 'Spain', 'United Kingdom', 'United States', 'Canada', 'Brazil', 'Japan', 'Australia'].map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="field"><label>Document type</label>
                      <select value={vDocType} onChange={(e) => setVDocType(e.target.value)}>
                        {['Passport', 'National ID', 'Driving licence'].map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="field"><label>Photo of document</label>
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => {
                        const f = e.target.files?.[0]; if (!f) return;
                        if (f.size > 5 * 1024 * 1024) { toast({ kind: 'error', title: 'File too large', body: '5 MB maximum' }); return; }
                        const r = new FileReader(); r.onload = () => setVDoc(String(r.result)); r.readAsDataURL(f);
                      }} />
                      {vDoc && <div className="muted small" style={{ marginTop: 4 }}>Document attached ✓</div>}
                    </div>
                    <button className="btn btn-red btn-sm" disabled={vBusy || !vName.trim() || !vDob || !vDoc} onClick={async () => {
                      setVBusy(true);
                      try {
                        await fetch('/api/verify', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` }, body: JSON.stringify({ fullName: vName, dob: vDob, country: vCountry, docType: vDocType, dataUrl: vDoc }) });
                        const d = await fetch('/api/verify', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((x) => x.json());
                        setVerify(d.verification);
                        toast({ kind: 'success', title: 'Verification submitted', body: 'An administrator will review your document.' });
                      } catch (err: any) { toast({ kind: 'error', title: 'Submission failed', body: err.message }); }
                      finally { setVBusy(false); }
                    }}>{vBusy ? 'Submitting…' : 'Submit for verification'}</button>
                  </>
                )
              ) : (
                <>
                  <div className="field"><label>Current password</label><input type="password" value={pwdCur} onChange={(e) => setPwdCur(e.target.value)} /></div>
                  <div className="field"><label>New password</label><input type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} /></div>
                  <button className="btn btn-red btn-sm" disabled={pwdBusy || !pwdCur || pwdNew.length < 4} onClick={async () => {
                    setPwdBusy(true);
                    try {
                      await fetch('/api/password', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` }, body: JSON.stringify({ current: pwdCur, next: pwdNew }) });
                      toast({ kind: 'success', title: 'Password updated', body: 'Other sessions were signed out.' });
                      setPwdCur(''); setPwdNew('');
                      const d = await fetch('/api/sessions', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((x) => x.json());
                      setSessions(d.sessions || []);
                    } catch (e: any) { toast({ kind: 'error', title: 'Password change failed', body: e.message }); }
                    finally { setPwdBusy(false); }
                  }}>{pwdBusy ? 'Updating…' : 'Change password'}</button>
                  <div className="panel-title" style={{ marginTop: 18 }}>Two-factor authentication</div>
                  <div className="kv"><span>Status</span><b>Off</b></div>
                  <p className="muted small">Two-factor authentication is not required for this local play-money instance.</p>
                </>
              )}
            </div>
            <div className="card">
              <div className="between"><div className="panel-title">Active sessions</div>
                <button className="btn btn-ghost btn-sm" onClick={async () => {
                  await fetch('/api/sessions', { method: 'DELETE', headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } });
                  const d = await fetch('/api/sessions', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((x) => x.json());
                  setSessions(d.sessions || []);
                  toast({ kind: 'info', title: 'Signed out other devices' });
                }}>Sign out others</button>
              </div>
              {sessions.map((sess) => (
                <div key={sess.token} className="kv" style={{ alignItems: 'center' }}>
                  <span>{sess.current ? 'This device' : (sess.device || 'Unknown device').slice(0, 46)}</span>
                  <span className="row">
                    <b>{sess.current ? 'active' : sess.created_at?.slice(0, 10)}</b>
                    {!sess.current && <button className="btn btn-ghost btn-sm" onClick={async () => {
                      await fetch(`/api/sessions/${sess.token}`, { method: 'DELETE', headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } });
                      setSessions((prev) => prev.filter((x) => x.token !== sess.token));
                    }}>Revoke</button>}
                  </span>
                </div>
              ))}
              {!sessions.length && <div className="muted small">No active sessions.</div>}
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
