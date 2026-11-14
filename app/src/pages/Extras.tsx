import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell, SubNav } from '../components/PageShell';
import { Avatar } from '../components/Avatar';
import { HandDetailModal } from '../components/HandDetailModal';
import { avatarChoices, fileToAvatar } from '../lib/avatar';

export function Profile() {
  const { user, refreshUser, logout, toast, navigate } = useApp();
  const [nick, setNick] = useState(user?.nick || '');
  const [stats, setStats] = useState({ hands: 0, won: 0, biggest: 0 });
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarFile = useRef<HTMLInputElement>(null);
  const presetChoices = useMemo(() => avatarChoices(), []);
  const applyAvatar = async (src: string) => {
    setAvatarBusy(true);
    try {
      await api.setAvatar(src);
      await refreshUser();
      sound.play('click', { volume: .5 });
      toast({ kind: 'success', title: 'Avatar updated', body: src ? 'Your new avatar is live.' : 'Reset to the generated avatar.' });
    } catch (e: any) {
      toast({ kind: 'error', title: 'Avatar not saved', body: e.message });
    } finally { setAvatarBusy(false); }
  };
  const pickAvatar = async (file?: File) => {
    if (!file) return;
    try { await applyAvatar(await fileToAvatar(file)); }
    catch (e: any) { toast({ kind: 'error', title: 'Avatar not accepted', body: e.message }); }
    finally { if (avatarFile.current) avatarFile.current.value = ''; }
  };

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
            <div className="avatar-current">
              <div className="avatar-ring" style={{ width: 64, height: 64 }}>
                <div className="inner"><Avatar name={user?.nick || '?'} src={user?.avatar} size={58} /></div>
              </div>
              <div>
                <b style={{ color: '#f2eee3' }}>{user?.avatar ? 'Custom avatar' : 'Generated avatar'}</b>
                <div className="muted small">PNG, JPEG or WebP · centre-cropped to 256×256</div>
              </div>
              <button className="btn btn-dark btn-sm" disabled={avatarBusy} onClick={() => avatarFile.current?.click()}>Upload</button>
              <input ref={avatarFile} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickAvatar(e.target.files?.[0])} />
              <button className="btn btn-ghost btn-sm" disabled={avatarBusy || !user?.avatar} onClick={() => applyAvatar('')}>Reset</button>
            </div>
            <div className="avatar-picker">
              {presetChoices.map((choice) => (
                <button
                  key={choice.name}
                  className={'avatar-choice' + (user?.avatar === choice.src ? ' on' : '')}
                  onClick={() => applyAvatar(choice.src)}
                  disabled={avatarBusy}
                  title={choice.name}
                  aria-label={`Use ${choice.name} avatar`}
                  aria-pressed={user?.avatar === choice.src}
                >
                  <img src={choice.src} alt="" />
                </button>
              ))}
            </div>
            <p className="muted small">Avatars are generated or processed locally. Nothing is uploaded to a third party.</p>
          </div>
          <div className="card">
            <div className="panel-title">VIP progress</div>
            <div className="kv"><span>VIP level</span><b>{user?.vip_level}</b></div>
            <div className="kv"><span>XP</span><b>{(user?.xp ?? 0).toLocaleString()}</b></div>
            <div className="kv"><span>VIP points</span><b>{(user?.vip_points ?? 0).toLocaleString()}</b></div>
            <div className="progress" style={{ marginTop: 10 }}><i style={{ width: `${Math.min(100, ((user?.xp ?? 0) % 6000) / 60)}%` }} /></div>
            <p className="muted small">Earn XP by playing raked hands. Every 1,000 XP unlocks new DanGG Pass rewards.</p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export function HandHistory() {
  const { user, toast } = useApp();
  const [hands, setHands] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [q, setQ] = useState('');
  const [resFilter, setResFilter] = useState('all');
  const [gameFilter, setGameFilter] = useState('all');
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => { api.hands().then((r) => setHands(r.hands)).catch(() => {}); }, []);

  const setHidden = async (id: number, hidden: boolean) => {
    try {
      await api.setHandHidden(id, hidden);
      setHands((list) => list.map((h) => (h.id === id ? { ...h, hidden } : h)));
      setDetail((d: any) => (d?.id === id ? { ...d, hidden } : d));
    } catch (e: any) {
      toast({ kind: 'error', title: hidden ? 'Hand not hidden' : 'Hand not restored', body: e.message });
    }
  };
  const hiddenCount = hands.filter((h) => h.hidden).length;

  const filtered = hands.filter((h) => {
    if (h.hidden && !showHidden) return false;
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
        <div className="row hist-filters" style={{ marginBottom: 10 }}>
          <input className="admin-input" style={{ width: 260 }} placeholder="Search table or game…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="admin-select" value={resFilter} onChange={(e) => setResFilter(e.target.value)}>
            <option value="all">All results</option><option value="won">Won</option><option value="lost">Lost</option>
          </select>
          <select className="admin-select" value={gameFilter} onChange={(e) => setGameFilter(e.target.value)}>
            <option value="all">All games</option><option value="holdem">Hold’em</option><option value="omaha">PLO</option><option value="shortdeck">Short Deck</option><option value="rush">Fast Fold</option>
          </select>
          <label className="row small" style={{ gap: 4 }}>
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />Show hidden ({hiddenCount})
          </label>
          <span className="muted small">{filtered.length} hands</span>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>#</th><th>Table</th><th>Game</th><th>Board</th><th>Pot</th><th>Result</th><th>Date</th><th /></tr></thead>
            <tbody>
              {filtered.map((h) => {
                const won = h.result?.winners?.some((w: any) => w.id === user?.id);
                return (
                  <tr key={h.id} onClick={() => setDetail(h)} style={{ cursor: 'pointer', opacity: h.hidden ? 0.55 : 1 }}>
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
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setHidden(h.id, !h.hidden); }}>
                        {h.hidden ? 'Unhide' : 'Hide'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!hands.length && <tr><td colSpan={8} className="empty-state">No hands yet — join a table and play a hand.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {detail && <HandDetailModal key={detail.id} hand={detail} userId={user?.id} onClose={() => setDetail(null)}
        onSetHidden={(hidden) => setHidden(detail.id, hidden)} />}
    </PageShell>
  );
}

export function Support() {
  const { toast } = useApp();
  const [open, setOpen] = useState(0);
  const faq = [
    ['Is this real money?', 'No. DanGG is a play-money poker site built for demonstration. No real money, deposits or cash value are involved.'],
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
