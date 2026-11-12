import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, money, User } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell } from '../components/PageShell';
import { Avatar } from '../components/Avatar';
import { PlayingCard } from '../components/Card';
import { AdminWaitlists } from '../components/AdminWaitlists';
import {
  CASHDROP_AMOUNT_BB_KEY, CASHDROP_DEFAULT_AMOUNT_BB, CASHDROP_DEFAULT_RATE, CASHDROP_KEYS, CASHDROP_RATE_KEY,
  CASHDROP_RULE_LABEL, cashDropFieldErrors, cashDropRateLabel,
} from '../lib/cashDrop';

const SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'users', label: 'Users', icon: '👥' },
  { key: 'tables', label: 'Cash tables', icon: '🃏' },
  { key: 'tournaments', label: 'Tournaments', icon: '🏆' },
  { key: 'waitlists', label: 'Wait lists', icon: '⏳' },
  { key: 'banners', label: 'Promotions', icon: '🎁' },
  { key: 'branding', label: 'Branding', icon: '🎨' },
  { key: 'verifications', label: 'Verifications', icon: '🪪' },
  { key: 'reports', label: 'Player reports', icon: '🚩' },
  { key: 'missions', label: 'Missions', icon: '📋' },
  { key: 'settings', label: 'Game settings', icon: '⚙️' },
  { key: 'transactions', label: 'Transactions', icon: '💳' },
  { key: 'audit', label: 'Audit log', icon: '📜' },
  { key: 'chat', label: 'Announcements', icon: '📣' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="admin-label">{label}</label>{children}</div>;
}

export function Admin() {
  const { user, toast, meta, brand, refreshBrand, refreshUser } = useApp();
  const [section, setSection] = useState('dashboard');
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [tourneys, setTourneys] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [missions, setMissions] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [transactions, setTransactions] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [handView, setHandView] = useState<any>(null);
  const [handReplay, setHandReplay] = useState(0);
  const [handPlaying, setHandPlaying] = useState(false);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [local, setLocal] = useState<any>({});
  const [notice, setNotice] = useState('');

  const isAdmin = !!user?.is_admin;

  const loadAll = async () => {
    if (!isAdmin) return;
    try {
      const [s, u, t, tt, b, m, st, tx, au, v, rp] = await Promise.all([
        api.admin.stats(), api.admin.users(), api.admin.tables(), api.admin.tournaments(),
        api.admin.banners(), api.admin.missions(), api.admin.settings(), api.admin.transactions(), api.admin.audit(), api.admin.verifications(), api.admin.reports(),
      ]);
      setStats(s); setUsers(u.users); setTables(t.tables); setTourneys(tt.tournaments);
      setBanners(b.banners); setMissions(m.missions); setSettings(st.settings);
      setTransactions(tx.transactions); setAudit(au.log); setVerifications(v.verifications || []); setReports(rp.reports || []);
    } catch (e: any) { toast({ kind: 'error', title: 'Admin', body: e.message }); }
  };

  useEffect(() => { loadAll(); }, [isAdmin]);

  useEffect(() => {
    if (!handView) return;
    setHandReplay(0);
    setHandPlaying(true);
  }, [handView]);

  useEffect(() => {
    if (!handView || !handPlaying) return;
    const timer = window.setInterval(() => setHandReplay((n) => (n >= 5 ? 5 : n + 1)), 650);
    return () => window.clearInterval(timer);
  }, [handView, handPlaying]);

  const filteredUsers = useMemo(() => users.filter((u) => !q || u.login.toLowerCase().includes(q.toLowerCase()) || u.nick.toLowerCase().includes(q.toLowerCase())), [users, q]);

  const exportReports = () => {
    const rows: any[][] = [['id', 'reporter', 'target', 'reason', 'detail', 'hand_id', 'status', 'created_at', 'resolved_at'], ...reports.map((r) => [r.id, r.reporter_nick, r.target_nick, r.reason, r.detail, r.hand_id, r.status, r.created_at, r.resolved_at])];
    const csv = rows.map((row: any[]) => row.map((v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'dangro-player-reports.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const userAction = async (id: number, body: any) => {
    try {
      await api.admin.userAction(id, body);
      sound.play('click');
      await loadAll();
      toast({ kind: 'success', title: 'User updated' });
    } catch (e: any) { toast({ kind: 'error', title: 'Failed', body: e.message }); }
  };

  // Mirrors the server's last-admin guard (active = admin and not banned) so the button is never offered.
  const activeAdminCount = useMemo(() => users.filter((u) => u.is_admin && !u.banned).length, [users]);
  const isLastAdmin = (u: User) => u.is_admin && !u.banned && activeAdminCount <= 1;

  const toggleAdmin = async (u: User) => {
    const grant = !u.is_admin;
    const self = u.id === user?.id;
    const prompt = grant
      ? `Make ${u.nick} (${u.login}) an admin? They will get full access to this console.`
      : `Revoke admin from ${u.nick} (${u.login})?${self ? ' You will lose access to this console.' : ''}`;
    if (!confirm(prompt)) return;
    try {
      await api.admin.userAction(u.id, { action: 'set_admin', admin: grant });
      sound.play('click');
      toast({ kind: 'success', title: grant ? 'Admin granted' : 'Admin revoked', body: u.nick });
      if (self && !grant) { await refreshUser(); return; }
      await loadAll();
    } catch (e: any) { toast({ kind: 'error', title: 'Failed', body: e.message }); }
  };

  const saveTable = async () => {
    try { await api.admin.saveTable(local); setEditing(null); setLocal({}); await loadAll(); toast({ kind: 'success', title: 'Table saved' }); }
    catch (e: any) { toast({ kind: 'error', title: 'Failed', body: e.message }); }
  };
  const saveTourney = async () => {
    try { await api.admin.saveTournament(local); setEditing(null); setLocal({}); await loadAll(); toast({ kind: 'success', title: 'Tournament saved' }); }
    catch (e: any) { toast({ kind: 'error', title: 'Failed', body: e.message }); }
  };
  const saveBanner = async () => {
    try { await api.admin.saveBanner(local); setEditing(null); setLocal({}); await loadAll(); toast({ kind: 'success', title: 'Promotion saved' }); }
    catch (e: any) { toast({ kind: 'error', title: 'Failed', body: e.message }); }
  };
  const saveMission = async () => {
    try { await api.admin.saveMission(local); setEditing(null); setLocal({}); await loadAll(); toast({ kind: 'success', title: 'Mission saved' }); }
    catch (e: any) { toast({ kind: 'error', title: 'Failed', body: e.message }); }
  };
  const cashDropErrors = cashDropFieldErrors(settings);
  const saveSettings = async () => {
    const invalid = Object.values(cashDropErrors);
    if (invalid.length) { toast({ kind: 'error', title: 'Invalid settings', body: invalid.join(' ') }); return; }
    try { await api.admin.saveSettings(settings); await loadAll(); toast({ kind: 'success', title: 'Settings saved' }); }
    catch (e: any) { toast({ kind: 'error', title: 'Failed', body: e.message }); }
  };

  const creditBusy = useRef(new Set<string>());
  const quickCredit = (u: User, amount: number) => {
    const key = `${u.id}:${amount}`;
    if (creditBusy.current.has(key)) return;
    creditBusy.current.add(key);
    userAction(u.id, { action: 'credit', amount, reference: crypto.randomUUID() }).finally(() => creditBusy.current.delete(key));
  };

  if (!isAdmin) {
    return (
      <PageShell activeTop="poker">
        <div className="page">
          <h1 className="page-title">Admin Console</h1>
          <p className="page-sub">Restricted area — administrator account required.</p>
          <div className="card" style={{ maxWidth: 560 }}>
            <p style={{ color: '#ddd' }}>Log in with the local administrator account to manage the entire clone:</p>
            <div className="kv"><span>Account</span><b>admin</b></div>
            <div className="kv"><span>Password</span><b>admin123</b></div>
            <button className="btn btn-red" style={{ marginTop: 12 }} onClick={() => { localStorage.removeItem('ggpoker.token'); location.hash = '/login'; location.reload(); }}>Go to login</button>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell activeTop="poker">
      <div className="admin-shell">
        <nav className="admin-nav">
          <div className="brand">DANGG.RO<small>LOCAL ADMIN</small></div>
          {SECTIONS.map((s) => (
            <button key={s.key} className={section === s.key ? 'on' : ''} onClick={() => { setSection(s.key); setEditing(null); setLocal({}); }}>
              <span style={{ marginRight: 8 }}>{s.icon}</span>{s.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ padding: '10px 12px', fontSize: 11, color: '#6f7484' }}>v1.0 · local instance<br />{meta.online.toLocaleString()} online</div>
        </nav>
        <div className="admin-main">
          {section === 'dashboard' && (
            <>
              <div className="between">
                <h2 className="admin-title" style={{ margin: 0 }}>Dashboard</h2>
                <div className="row">
                  {['users', 'transactions', 'hands', 'tournaments'].map((k) => (
                    <button key={k} className="btn btn-ghost btn-sm" onClick={async () => { try { await api.admin.exportCsv(k); toast({ kind: 'success', title: 'Export ready', body: `${k}.csv` }); } catch (e: any) { toast({ kind: 'error', title: 'Export failed', body: e.message }); } }}>⤓ {k}</button>
                  ))}
                </div>
              </div>
              <div className="stat-grid">
                <div className="stat"><span>Users</span><b>{stats?.users ?? '—'}</b></div>
                <div className="stat"><span>Hands played</span><b>{stats?.hands ?? '—'}</b></div>
                <div className="stat"><span>Cash tables</span><b>{stats?.tables ?? '—'}</b></div>
                <div className="stat"><span>Tournaments</span><b>{stats?.tourneys ?? '—'}</b></div>
                <div className="stat"><span>Bot mint</span><b>{money(stats?.mint_bot || 0)}</b></div>
                <div className="stat"><span>Spin mint</span><b>{money(stats?.mint_spin || 0)}</b></div>
              </div>
              <div className="grid g2">
                <div className="admin-card">
                  <div className="panel-title">Live tables <small>{stats?.live?.length ?? 0} running</small></div>
                  {(stats?.live || []).map((l: any) => (
                    <div key={l.id} className="between" style={{ padding: '6px 0', borderBottom: '1px solid #23252b' }}>
                      <div>
                        <b style={{ color: '#e8e8ee' }}>{l.name}</b>
                        <div className="muted small">{l.players} seated · hand #{l.hand} · {l.street}</div>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={async () => {
                        try { await fetch(`/api/admin/live/${l.id}/close`, { method: 'POST', headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }); await loadAll(); toast({ kind: 'info', title: 'Table closed', body: l.name }); }
                        catch (e: any) { toast({ kind: 'error', title: 'Failed', body: e.message }); }
                      }}>Close</button>
                    </div>
                  ))}
                  {!stats?.live?.length && <div className="muted small">No live tables right now. Join one from the lobby.</div>}
                </div>
                <div className="admin-card">
                  <div className="panel-title">House status</div>
                  <div className="kv"><span>Bad beat jackpot</span><b className="gold">{money(stats?.jackpot || 0)}</b></div>
                  <div className="kv"><span>Total turnover</span><b>{money(stats?.turnover || 0)}</b></div>
                  <div className="kv"><span>Online players</span><b>{stats?.online?.toLocaleString()}</b></div>
                  <div className="kv"><span>Server</span><b>local · healthy</b></div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={loadAll}>Refresh</button>
                </div>
              </div>
              <div className="admin-card" style={{ marginTop: 12, padding: 0 }}>
                <div style={{ padding: '10px 14px' }} className="panel-title">Recent transactions</div>
                <table className="admin-table">
                  <thead><tr><th>#</th><th>Player</th><th>Type</th><th>Amount</th><th>When</th></tr></thead>
                  <tbody>
                    {transactions.slice(0, 8).map((t: any) => (
                      <tr key={t.id}><td>{t.id}</td><td>{t.nick || t.login || t.user_id}</td><td style={{ textTransform: 'capitalize' }}>{t.kind.replace(/_/g, ' ')}</td>
                        <td style={{ color: t.amount >= 0 ? '#7fe0a0' : '#ff9a9a' }}>{money(t.amount)}</td><td className="muted">{t.created_at}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {section === 'users' && (
            <>
              <div className="between" style={{ marginBottom: 10 }}>
                <h2 className="admin-title" style={{ margin: 0 }}>Users</h2>
                <div className="row">
                  <button className="btn btn-ghost btn-sm" onClick={() => api.admin.exportCsv('users')}>⤓ CSV</button>
                  <input className="admin-input" placeholder="Search login or nickname…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
              </div>
              <div className="admin-card" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>ID</th><th>Player</th><th>Login</th><th>Balance</th><th>Play chips</th><th>Tickets</th><th>VIP</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id}>
                        <td>{u.id}</td>
                        <td><div className="row"><Avatar name={u.nick} src={u.avatar} size={22} />{u.nick}</div></td>
                        <td className="muted">{u.login}</td>
                        <td className="gold">{money(u.balance)}</td>
                        <td>{(u.play_chips).toLocaleString()}</td>
                        <td>T${u.tickets}</td>
                        <td>VIP {u.vip_level}</td>
                        <td><div className="row" style={{ gap: 3 }}>{u.banned ? <span className="tag red">Banned</span> : u.chat_muted ? <span className="tag red">Chat muted</span> : <span className="tag live">Active</span>}{u.is_admin && <span className="tag gtd">Admin</span>}</div></td>
                        <td>
                          <div className="row" style={{ gap: 3 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => quickCredit(u, 100000)}>+$1k</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => quickCredit(u, -100000)}>-$1k</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ kind: 'user', data: u })}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={async () => { await api.admin.userAction(u.id, { action: u.chat_muted ? 'unmute' : 'mute' }); loadAll(); toast({ kind: 'success', title: u.chat_muted ? 'Chat unmuted' : 'Chat muted', body: u.nick }); }}>{u.chat_muted ? 'Unmute' : 'Mute'}</button>
                            {!isLastAdmin(u) && <button className="btn btn-ghost btn-sm" onClick={() => toggleAdmin(u)}>{u.is_admin ? 'Revoke admin' : 'Make admin'}</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {section === 'tables' && (
            <>
              <div className="between" style={{ marginBottom: 10 }}>
                <h2 className="admin-title" style={{ margin: 0 }}>Cash tables</h2>
                <button className="btn btn-red btn-sm" onClick={() => { setEditing({ kind: 'table' }); setLocal({ name: 'New Table', game: 'holdem', category: 'Gold', sb: 500, bb: 1000, ante: 0, min_buyin: 20000, max_buyin: 100000, seats: 6, speed: 'Normal', enabled: true }); }}>+ New table</button>
              </div>
              <div className="admin-card" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>ID</th><th>Name</th><th>Game</th><th>Stakes</th><th>Seats</th><th>Featured</th><th>Enabled</th><th>Actions</th></tr></thead>
                  <tbody>
                    {tables.map((t) => (
                      <tr key={t.id}>
                        <td className="muted">{t.id}</td>
                        <td>{t.name}</td>
                        <td style={{ textTransform: 'capitalize' }}>{t.game}</td>
                        <td>{money(t.sb)} / {money(t.bb)}</td>
                        <td>{t.seats}</td>
                        <td>{t.featured ? '★' : '—'}</td>
                        <td>{t.enabled ? <span className="tag live">On</span> : <span className="tag red">Off</span>}</td>
                        <td>
                          <div className="row" style={{ gap: 3 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditing({ kind: 'table' }); setLocal({ ...t, enabled: !!t.enabled, featured: !!t.featured }); }}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={async () => { await api.admin.saveTable({ ...t, enabled: !t.enabled }); loadAll(); }}>{t.enabled ? 'Disable' : 'Enable'}</button>
                            <button className="btn btn-ghost btn-sm" onClick={async () => { if (confirm('Delete table ' + t.name + '?')) { await api.admin.saveTable({ delete: true, id: t.id }); loadAll(); } }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {section === 'tournaments' && (
            <>
              <div className="between" style={{ marginBottom: 10 }}>
                <h2 className="admin-title" style={{ margin: 0 }}>Tournaments</h2>
                <button className="btn btn-red btn-sm" onClick={() => { setEditing({ kind: 'tourney' }); setLocal({ name: 'New Tournament', game: 'holdem', buyin: 1000, fee: 100, gtd: 10000, starting_stack: 10000, blind_speed: 8, late_reg: 90, mode: 'STANDARD', bounty: 0, ticket: '', entrants: 0, status: 'registering', format: 'NLH', start_at: new Date(Date.now() + 3600000).toISOString().slice(0, 16) }); }}>+ New tournament</button>
              </div>
              <div className="admin-card" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>Name</th><th>Buy-in</th><th>GTD</th><th>Entrants</th><th>Start</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {tourneys.map((t) => (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td className="gold">{money(t.buyin + t.fee)}</td>
                        <td>{money(t.gtd, true)}</td>
                        <td>{t.entrants}</td>
                        <td className="muted">{new Date(t.start_at).toLocaleString('en-GB')}</td>
                        <td><span className={'tag ' + (t.status === 'running' ? 'live' : 'reg')}>{t.status}</span></td>
                        <td>
                          <div className="row" style={{ gap: 3 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditing({ kind: 'tourney' }); setLocal({ ...t, start_at: new Date(t.start_at).toISOString().slice(0, 16) }); }}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={async () => { if (confirm('Delete ' + t.name + '?')) { await api.admin.saveTournament({ delete: true, id: t.id }); loadAll(); } }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {section === 'waitlists' && <AdminWaitlists />}

          {section === 'banners' && (
            <>
              <div className="between" style={{ marginBottom: 10 }}>
                <h2 className="admin-title" style={{ margin: 0 }}>Promotions & banners</h2>
                <button className="btn btn-red btn-sm" onClick={() => { setEditing({ kind: 'banner' }); setLocal({ slot: 'home', title: 'New promotion', subtitle: '', image: '/assets/chrome/promo.png', link: '/promotions', enabled: true, sort: 0 }); }}>+ New banner</button>
              </div>
              <div className="admin-card" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>Slot</th><th>Title</th><th>Subtitle</th><th>Image</th><th>Link</th><th>Enabled</th><th>Actions</th></tr></thead>
                  <tbody>
                    {banners.map((b) => (
                      <tr key={b.id}>
                        <td>{b.slot}</td><td>{b.title}</td><td className="muted">{b.subtitle}</td>
                        <td className="muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.image}</td>
                        <td className="muted">{b.link}</td>
                        <td>{b.enabled ? <span className="tag live">On</span> : <span className="tag red">Off</span>}</td>
                        <td>
                          <div className="row" style={{ gap: 3 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditing({ kind: 'banner' }); setLocal({ ...b, enabled: !!b.enabled }); }}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={async () => { await api.admin.saveBanner({ ...b, enabled: !b.enabled }); loadAll(); }}>Toggle</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {section === 'missions' && (
            <>
              <div className="between" style={{ marginBottom: 10 }}>
                <h2 className="admin-title" style={{ margin: 0 }}>Missions</h2>
                <button className="btn btn-red btn-sm" onClick={() => { setEditing({ kind: 'mission' }); setLocal({ title: 'New mission', description: '', goal: 5, progress: 0, reward: 1000, reward_kind: 'USD', active: true, sort: 10 }); }}>+ New mission</button>
              </div>
              <div className="admin-card" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>ID</th><th>Title</th><th>Goal</th><th>Progress</th><th>Reward</th><th>Claimed</th><th>Active</th><th>Actions</th></tr></thead>
                  <tbody>
                    {missions.map((m) => (
                      <tr key={m.id}>
                        <td className="muted">{m.id}</td><td>{m.title}</td><td>{m.goal}</td><td>{m.progress}</td>
                        <td className="gold">{m.reward_kind === 'USD' ? money(m.reward) : `${m.reward_kind} ${m.reward}`}</td>
                        <td>{m.claimed ? 'Yes' : 'No'}</td>
                        <td>{m.active ? <span className="tag live">On</span> : <span className="tag red">Off</span>}</td>
                        <td>
                          <div className="row" style={{ gap: 3 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditing({ kind: 'mission' }); setLocal({ ...m, active: !!m.active }); }}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={async () => { await api.admin.saveMission({ id: m.id, reset: true }); loadAll(); }}>Reset</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {section === 'verifications' && (
            <>
              <div className="between">
                <h2 className="admin-title" style={{ margin: 0 }}>Identity verifications</h2>
                <button className="btn btn-ghost btn-sm" onClick={async () => { try { const d = await api.admin.verifications(); setVerifications(d.verifications || []); } catch { /* ignore */ } }}>Refresh</button>
              </div>
              <div className="admin-card" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>#</th><th>Player</th><th>Name</th><th>Country</th><th>Document</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead>
                  <tbody>
                    {verifications.map((v) => (
                      <tr key={v.id}>
                        <td>{v.id}</td>
                        <td><b>{v.nick}</b><div className="muted small">{v.login}</div></td>
                        <td>{v.full_name}</td>
                        <td>{v.country}</td>
                        <td>{v.doc_type}</td>
                        <td><span className={'tag ' + (v.status === 'approved' ? 'live' : v.status === 'rejected' ? 'red' : '')}>{v.status}</span></td>
                        <td className="muted">{v.created_at?.slice(0, 16)}</td>
                        <td>
                          <div className="row" style={{ gap: 3 }}>
                            <button className="btn btn-ghost btn-sm" onClick={async () => {
                              try { const url = await api.admin.verificationDoc(v.id); const w = window.open('', '_blank'); if (w) { w.document.write(`<title>ID · ${v.nick}</title><body style="background:#111;margin:0;display:grid;place-items:center"><img src="${url}" style="max-width:100%;max-height:100vh"/></body>`); w.document.close(); } }
                              catch (e: any) { toast({ kind: 'error', title: 'Document', body: e.message }); }
                            }}>View ID</button>
                            <button className="btn btn-ghost btn-sm" onClick={async () => {
                              try { await api.admin.reviewVerification(v.id, 'approve', 'Approved'); setVerifications((prev) => prev.map((x) => x.id === v.id ? { ...x, status: 'approved' } : x)); toast({ kind: 'success', title: 'Verified', body: v.nick }); }
                              catch (e: any) { toast({ kind: 'error', title: 'Review failed', body: e.message }); }
                            }}>Approve</button>
                            <button className="btn btn-ghost btn-sm" onClick={async () => {
                              const note = window.prompt('Reason for rejection', 'Document unreadable');
                              if (note == null) return;
                              try { await api.admin.reviewVerification(v.id, 'reject', note); setVerifications((prev) => prev.map((x) => x.id === v.id ? { ...x, status: 'rejected', note } : x)); toast({ kind: 'info', title: 'Rejected', body: v.nick }); }
                              catch (e: any) { toast({ kind: 'error', title: 'Review failed', body: e.message }); }
                            }}>Reject</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!verifications.length && <tr><td colSpan={8} className="empty-state">No verification requests yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {section === 'branding' && (
            <>
              <h2 className="admin-title">Branding</h2>
              <p className="muted small" style={{ marginTop: -6, marginBottom: 14 }}>
                Upload a replacement wordmark and lobby banner. Images are stored locally in the database and served
                immediately to every window — no rebuild required.
              </p>
              <div className="grid g2">
                {[
                  { slot: 'logo', title: 'Wordmark / logo', hint: 'Transparent PNG recommended (about 216×48, white artwork).', url: brand.logo, bg: '#141414' },
                  { slot: 'promo', title: 'Lobby banner', hint: 'Wide image, ideally 845×143. It is cropped to fit.', url: brand.promo, bg: '#2a1a0e' },
                ].map((item) => (
                  <div key={item.slot} className="admin-card">
                    <div className="panel-title">{item.title}</div>
                    <div style={{ height: item.slot === 'logo' ? 90 : 120, background: item.bg, borderRadius: 6, display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid #2a2c35' }}>
                      <img src={item.url} alt="" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
                    </div>
                    <div className="muted small" style={{ margin: '8px 0' }}>{item.hint}</div>
                    <div className="row">
                      <label className="btn btn-red btn-sm" style={{ cursor: 'pointer' }}>
                        Upload image
                        <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (f.size > 3 * 1024 * 1024) { toast({ kind: 'error', title: 'Image too large', body: '3 MB maximum' }); return; }
                          const reader = new FileReader();
                          reader.onload = async () => {
                            try {
                              await api.admin.saveBrand(item.slot, String(reader.result));
                              await refreshBrand();
                              toast({ kind: 'success', title: 'Branding updated', body: item.title });
                            } catch (err: any) { toast({ kind: 'error', title: 'Upload failed', body: err.message }); }
                          };
                          reader.readAsDataURL(f);
                          e.currentTarget.value = '';
                        }} />
                      </label>
                      <button className="btn btn-ghost btn-sm" onClick={async () => {
                        try { await api.admin.resetBrand(item.slot); await refreshBrand(); toast({ kind: 'info', title: 'Reset to default', body: item.title }); }
                        catch (err: any) { toast({ kind: 'error', title: 'Reset failed', body: err.message }); }
                      }}>Reset to default</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {section === 'settings' && (
            <>
              <h2 className="admin-title">Game settings</h2>
              <div className="admin-card">
                <div className="admin-form">
                  {Object.entries(settings).filter(([k]) => !CASHDROP_KEYS.includes(k)).map(([k, v]) => (
                    <Field key={k} label={k}>
                      <input
                        className="admin-input" style={{ width: '100%' }}
                        value={typeof v === 'object' ? JSON.stringify(v) : String(v)}
                        onChange={(e) => {
                          let val: any = e.target.value;
                          if (val === 'true') val = true; else if (val === 'false') val = false;
                          else if (!isNaN(Number(val)) && val.trim() !== '') val = Number(val);
                          setSettings({ ...settings, [k]: val });
                        }}
                      />
                    </Field>
                  ))}
                </div>
                <button className="btn btn-red" style={{ marginTop: 14 }} onClick={saveSettings}>Save settings</button>
              </div>
              <h3 className="admin-title" style={{ fontSize: 16, marginTop: 18 }}>
                Rush &amp; Cash Drop <span className="pill" title="Not yet confirmed by a native capture">{CASHDROP_RULE_LABEL}</span>
              </h3>
              <div className="admin-card">
                <div className="admin-form">
                  <Field label={`Drop chance per Rush hand (0–1) · now ${cashDropRateLabel(settings[CASHDROP_RATE_KEY] ?? CASHDROP_DEFAULT_RATE)}`}>
                    <input
                      className="admin-input" style={{ width: '100%' }} type="number" min={0} max={1} step={0.01}
                      aria-invalid={!!cashDropErrors[CASHDROP_RATE_KEY]}
                      value={settings[CASHDROP_RATE_KEY] ?? CASHDROP_DEFAULT_RATE}
                      onChange={(e) => setSettings({ ...settings, [CASHDROP_RATE_KEY]: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                    {cashDropErrors[CASHDROP_RATE_KEY] && <small style={{ color: '#ff8a80' }}>{cashDropErrors[CASHDROP_RATE_KEY]}</small>}
                  </Field>
                  <Field label="Drop amount (big blinds, flat per stake)">
                    <input
                      className="admin-input" style={{ width: '100%' }} type="number" min={0} max={1000} step={1}
                      aria-invalid={!!cashDropErrors[CASHDROP_AMOUNT_BB_KEY]}
                      value={settings[CASHDROP_AMOUNT_BB_KEY] ?? CASHDROP_DEFAULT_AMOUNT_BB}
                      onChange={(e) => setSettings({ ...settings, [CASHDROP_AMOUNT_BB_KEY]: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                    {cashDropErrors[CASHDROP_AMOUNT_BB_KEY] && <small style={{ color: '#ff8a80' }}>{cashDropErrors[CASHDROP_AMOUNT_BB_KEY]}</small>}
                  </Field>
                </div>
                <p style={{ color: '#9a9a9a', fontSize: 12, marginTop: 10 }}>
                  {CASHDROP_RULE_LABEL}: a drop pays one human player at the table big blind × this multiple, never a share of the pot. Saved with “Save settings”.
                </p>
              </div>
            </>
          )}

          {section === 'transactions' && (
            <>
              <div className="between">
                <h2 className="admin-title" style={{ margin: 0 }}>Transactions</h2>
                <button className="btn btn-ghost btn-sm" onClick={() => api.admin.exportCsv('transactions')}>⤓ Export CSV</button>
              </div>
              <div className="admin-card" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>#</th><th>User</th><th>Type</th><th>Currency</th><th>Amount</th><th>Balance</th><th>Memo</th><th>Date</th></tr></thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id}>
                        <td>{t.id}</td><td>{t.nick || t.login || t.user_id}</td><td style={{ textTransform: 'capitalize' }}>{t.kind.replace(/_/g, ' ')}</td>
                        <td>{t.currency}</td><td style={{ color: t.amount >= 0 ? '#7fe0a0' : '#ff9a9a' }}>{money(t.amount)}</td>
                        <td>{money(t.balance_after)}</td><td className="muted">{t.memo}</td><td className="muted">{t.created_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {section === 'reports' && (
            <>
              <div className="between">
                <h2 className="admin-title" style={{ margin: 0 }}>Player reports</h2>
                <div className="row">
                  <button className="btn btn-ghost btn-sm" onClick={exportReports} disabled={!reports.length}>Export CSV</button>
                  <button className="btn btn-ghost btn-sm" onClick={async () => { try { const d = await api.admin.reports(); setReports(d.reports || []); } catch { /* ignore */ } }}>Refresh</button>
                </div>
              </div>
              <div className="admin-card" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>#</th><th>Reporter</th><th>Target</th><th>Reason</th><th>Details</th><th>Hand</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id}>
                        <td>{r.id}</td><td>{r.reporter_nick}</td><td><b>{r.target_nick}</b></td><td>{r.reason}</td>
                        <td className="muted" style={{ maxWidth: 260 }}>{r.detail}</td>
                        <td className="muted small">{r.hand_id || '—'}</td>
                        <td><span className={'tag ' + (r.status === 'open' ? 'red' : r.status === 'resolved' ? 'live' : '')}>{r.status}</span></td>
                        <td className="muted">{r.created_at?.slice(0, 16)}</td>
                        <td><div className="row" style={{ gap: 3 }}>
                          {r.hand_id && <button className="btn btn-ghost btn-sm" onClick={async () => { try { const d = await api.admin.hand(r.hand_id); setHandView(d.hand); } catch (e: any) { toast({ kind: 'error', title: 'Hand unavailable', body: e.message }); } }}>Hand</button>}
                          {r.status === 'open' && <button className="btn btn-gold btn-sm" onClick={async () => { await api.admin.reportAction(r.id, 'resolve'); const d = await api.admin.reports(); setReports(d.reports || []); toast({ kind: 'success', title: 'Report resolved' }); }}>Resolve</button>}
                          {r.status === 'open' && <button className="btn btn-ghost btn-sm" onClick={async () => { await api.admin.reportAction(r.id, 'dismiss'); const d = await api.admin.reports(); setReports(d.reports || []); }}>Dismiss</button>}
                        </div></td>
                      </tr>
                    ))}
                    {!reports.length && <tr><td colSpan={9}><div className="empty-state">No reports.</div></td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {section === 'audit' && (
            <>
              <h2 className="admin-title">Audit log</h2>
              <div className="admin-card" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>#</th><th>Actor</th><th>Action</th><th>Detail</th><th>Date</th></tr></thead>
                  <tbody>
                    {audit.map((a) => <tr key={a.id}><td>{a.id}</td><td>{a.actor}</td><td>{a.action}</td><td className="muted">{a.detail}</td><td className="muted">{a.created_at}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {section === 'chat' && (
            <>
              <h2 className="admin-title">Announcements</h2>
              <div className="admin-card">
                <p className="muted small">Send a message to the lobby chat or the table chat of a running table.</p>
                <div className="row">
                  <input className="admin-input" style={{ flex: 1 }} placeholder="Announcement text…" value={notice} onChange={(e) => setNotice(e.target.value)} />
                  <button className="btn btn-red" onClick={async () => { if (!notice.trim()) return; await api.admin.chat(notice); setNotice(''); toast({ kind: 'success', title: 'Announcement sent' }); }}>Send</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {handView && (
        <div className="modal-backdrop" onClick={() => setHandView(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>Hand evidence · {handView.hand_id}</h3><button className="title-icon" onClick={() => setHandView(null)}>✕</button></div>
            <div className="modal-body">
              <div className="muted small" style={{ marginBottom: 8 }}>{handView.table_name} · {handView.game} · pot {money(handView.pot)}</div>
              <div className="row" style={{ gap: 4, marginBottom: 12 }}>
                {(handView.board || '').split(' ').filter(Boolean).map((c: string, i: number) => <PlayingCard key={`${c}-${i}`} card={i < handReplay ? c : '??'} size="mini" />)}
                {!(handView.board || '').trim() && <span className="muted small">No board</span>}
              </div>
              <div className="row" style={{ marginBottom: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setHandReplay(0); setHandPlaying(true); }}>Replay</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setHandPlaying((v) => !v)}>{handPlaying ? 'Pause' : 'Play'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setHandReplay(5)}>Show all</button>
                <span className="muted small">Board {handReplay}/5</span>
              </div>
              <table className="admin-table">
                <thead><tr><th>Player</th><th>Cards</th><th>Stack</th><th>Bet</th><th>Win</th></tr></thead>
                <tbody>
                  {(handView.players || []).map((p: any, i: number) => (
                    <tr key={i}>
                      <td>{p.nick}{p.folded ? ' (folded)' : ''}</td>
                      <td className="muted">{(p.cards || []).join(' ') || '—'}</td>
                      <td>{money(p.stack || 0)}</td><td>{money(p.totalBet || 0)}</td><td className="gold">{p.win ? money(p.win) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!!(handView.actions || []).length && (
                <>
                  <div className="panel-title" style={{ marginTop: 16 }}>Action</div>
                  <div className="hh-actions">
                    {(handView.actions || []).map((a: any, i: number) => {
                      const streetCount = a.street === 'preflop' ? 0 : a.street === 'flop' ? 3 : a.street === 'turn' ? 4 : 5;
                      return (
                        <div key={i} className={'hh-action' + (streetCount <= handReplay ? ' on' : '')}>
                          <span className="hh-street">{a.street || 'preflop'}</span>
                          <b>{a.nick}</b>
                          <span>{a.action}{a.amount ? ` · ${money(a.amount)}` : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <p className="muted small" style={{ marginTop: 10 }}>{(handView.actions || []).length} logged actions · {(handView.result?.reason || 'showdown')}</p>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>Edit {editing.kind}</h3><button className="title-icon" onClick={() => setEditing(null)}>✕</button></div>
            <div className="modal-body">
              {editing.kind === 'user' && (
                <div className="admin-form">
                  <Field label="Nickname"><input className="admin-input" value={local.data?.nick || ''} onChange={(e) => setLocal({ ...local, data: { ...local.data, nick: e.target.value } })} /></Field>
                  <Field label="Balance (cents)"><input className="admin-input" type="number" value={local.data?.balance ?? 0} onChange={(e) => setLocal({ ...local, data: { ...local.data, balance: Number(e.target.value) } })} /></Field>
                  <Field label="Play chips"><input className="admin-input" type="number" value={local.data?.play_chips ?? 0} onChange={(e) => setLocal({ ...local, data: { ...local.data, play_chips: Number(e.target.value) } })} /></Field>
                  <Field label="Tickets"><input className="admin-input" type="number" value={local.data?.tickets ?? 0} onChange={(e) => setLocal({ ...local, data: { ...local.data, tickets: Number(e.target.value) } })} /></Field>
                  <Field label="VIP level"><input className="admin-input" type="number" value={local.data?.vip_level ?? 1} onChange={(e) => setLocal({ ...local, data: { ...local.data, vip_level: Number(e.target.value) } })} /></Field>
                  <Field label="New password"><input className="admin-input" placeholder="leave blank to keep" onChange={(e) => setLocal({ ...local, password: e.target.value })} /></Field>
                </div>
              )}
              {editing.kind === 'table' && (
                <div className="admin-form">
                  {['name', 'game', 'category', 'speed'].map((f) => (
                    <Field key={f} label={f}><input className="admin-input" value={local[f] ?? ''} onChange={(e) => setLocal({ ...local, [f]: e.target.value })} /></Field>
                  ))}
                  {['sb', 'bb', 'ante', 'min_buyin', 'max_buyin', 'seats'].map((f) => (
                    <Field key={f} label={`${f} (cents where money)`}><input className="admin-input" type="number" value={local[f] ?? 0} onChange={(e) => setLocal({ ...local, [f]: Number(e.target.value) })} /></Field>
                  ))}
                  <Field label="Featured"><input type="checkbox" checked={!!local.featured} onChange={(e) => setLocal({ ...local, featured: e.target.checked })} /></Field>
                  <Field label="Enabled"><input type="checkbox" checked={local.enabled !== false} onChange={(e) => setLocal({ ...local, enabled: e.target.checked })} /></Field>
                </div>
              )}
              {editing.kind === 'tourney' && (
                <div className="admin-form">
                  <Field label="Name"><input className="admin-input" value={local.name ?? ''} onChange={(e) => setLocal({ ...local, name: e.target.value })} /></Field>
                  {['buyin', 'fee', 'gtd', 'entrants', 'starting_stack', 'blind_speed', 'late_reg', 'bounty'].map((f) => (
                    <Field key={f} label={f.replace(/_/g, ' ')}><input className="admin-input" type="number" value={local[f] ?? 0} onChange={(e) => setLocal({ ...local, [f]: Number(e.target.value) })} /></Field>
                  ))}
                  <Field label="Start (local time)"><input className="admin-input" type="datetime-local" value={local.start_at ?? ''} onChange={(e) => setLocal({ ...local, start_at: e.target.value })} /></Field>
                  <Field label="Status"><select className="admin-select" value={local.status} onChange={(e) => setLocal({ ...local, status: e.target.value })}><option>registering</option><option>running</option><option>completed</option></select></Field>
                  <Field label="Format"><select className="admin-select" value={local.format} onChange={(e) => setLocal({ ...local, format: e.target.value })}><option>NLH</option><option>PLO</option><option>Short Deck</option></select></Field>
                  <Field label="Game"><select className="admin-select" value={local.game || 'holdem'} onChange={(e) => setLocal({ ...local, game: e.target.value })}><option value="holdem">Hold'em</option><option value="omaha">PLO</option><option value="shortdeck">Short Deck</option></select></Field>
                  <Field label="Mode"><select className="admin-select" value={local.mode || 'STANDARD'} onChange={(e) => setLocal({ ...local, mode: e.target.value })}><option>STANDARD</option><option>BOUNTY</option><option>MYSTERY</option><option>SATELLITE</option><option>FLIP</option></select></Field>
                  <Field label="Ticket / target"><input className="admin-input" value={local.ticket ?? ''} onChange={(e) => setLocal({ ...local, ticket: e.target.value })} placeholder="Satellite target" /></Field>
                </div>
              )}
              {editing.kind === 'banner' && (
                <div className="admin-form">
                  <Field label="Slot"><select className="admin-select" value={local.slot} onChange={(e) => setLocal({ ...local, slot: e.target.value })}><option>home</option><option>tournaments</option><option>slots</option><option>casino</option><option>cashier</option></select></Field>
                  <Field label="Title"><input className="admin-input" value={local.title ?? ''} onChange={(e) => setLocal({ ...local, title: e.target.value })} /></Field>
                  <Field label="Subtitle"><input className="admin-input" value={local.subtitle ?? ''} onChange={(e) => setLocal({ ...local, subtitle: e.target.value })} /></Field>
                  <Field label="Image path"><input className="admin-input" value={local.image ?? ''} onChange={(e) => setLocal({ ...local, image: e.target.value })} /></Field>
                  <Field label="Link"><input className="admin-input" value={local.link ?? ''} onChange={(e) => setLocal({ ...local, link: e.target.value })} /></Field>
                  <Field label="Enabled"><input type="checkbox" checked={local.enabled !== false} onChange={(e) => setLocal({ ...local, enabled: e.target.checked })} /></Field>
                </div>
              )}
              {editing.kind === 'mission' && (
                <div className="admin-form">
                  <Field label="Title"><input className="admin-input" value={local.title ?? ''} onChange={(e) => setLocal({ ...local, title: e.target.value })} /></Field>
                  <Field label="Description"><input className="admin-input" value={local.description ?? ''} onChange={(e) => setLocal({ ...local, description: e.target.value })} /></Field>
                  <Field label="Goal"><input className="admin-input" type="number" value={local.goal ?? 1} onChange={(e) => setLocal({ ...local, goal: Number(e.target.value) })} /></Field>
                  <Field label="Reward"><input className="admin-input" type="number" value={local.reward ?? 100} onChange={(e) => setLocal({ ...local, reward: Number(e.target.value) })} /></Field>
                  <Field label="Reward kind"><select className="admin-select" value={local.reward_kind} onChange={(e) => setLocal({ ...local, reward_kind: e.target.value })}><option>USD</option><option>PLAY</option><option>TICKET</option><option>GEM</option></select></Field>
                  <Field label="Active"><input type="checkbox" checked={local.active !== false} onChange={(e) => setLocal({ ...local, active: e.target.checked })} /></Field>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-dark" onClick={() => setEditing(null)}>Cancel</button>
              <button
                className="btn btn-red"
                onClick={() => {
                  if (editing.kind === 'user') {
                    userAction(local.data.id, { action: 'set', balance: local.data.balance, play_chips: local.data.play_chips, tickets: local.data.tickets, vip_level: local.data.vip_level })
                      .then(() => { if (local.password) return api.admin.userAction(local.data.id, { action: 'resetpw', password: local.password }); })
                      .then(() => { setEditing(null); setLocal({}); });
                  } else if (editing.kind === 'table') saveTable();
                  else if (editing.kind === 'tourney') saveTourney();
                  else if (editing.kind === 'banner') saveBanner();
                  else if (editing.kind === 'mission') saveMission();
                }}
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
