import React, { useEffect, useMemo, useState } from 'react';
import { api, money, User } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell } from '../components/PageShell';
import { Avatar } from '../components/Avatar';

const SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'users', label: 'Users', icon: '👥' },
  { key: 'tables', label: 'Cash tables', icon: '🃏' },
  { key: 'tournaments', label: 'Tournaments', icon: '🏆' },
  { key: 'banners', label: 'Promotions', icon: '🎁' },
  { key: 'branding', label: 'Branding', icon: '🎨' },
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
  const { user, toast, meta, brand, refreshBrand } = useApp();
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
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [local, setLocal] = useState<any>({});
  const [notice, setNotice] = useState('');

  const isAdmin = !!user?.is_admin;

  const loadAll = async () => {
    if (!isAdmin) return;
    try {
      const [s, u, t, tt, b, m, st, tx, au] = await Promise.all([
        api.admin.stats(), api.admin.users(), api.admin.tables(), api.admin.tournaments(),
        api.admin.banners(), api.admin.missions(), api.admin.settings(), api.admin.transactions(), api.admin.audit(),
      ]);
      setStats(s); setUsers(u.users); setTables(t.tables); setTourneys(tt.tournaments);
      setBanners(b.banners); setMissions(m.missions); setSettings(st.settings);
      setTransactions(tx.transactions); setAudit(au.log);
    } catch (e: any) { toast({ kind: 'error', title: 'Admin', body: e.message }); }
  };

  useEffect(() => { loadAll(); }, [isAdmin]);

  const filteredUsers = useMemo(() => users.filter((u) => !q || u.login.toLowerCase().includes(q.toLowerCase()) || u.nick.toLowerCase().includes(q.toLowerCase())), [users, q]);

  const userAction = async (id: number, body: any) => {
    try {
      await api.admin.userAction(id, body);
      sound.play('click');
      await loadAll();
      toast({ kind: 'success', title: 'User updated' });
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
  const saveSettings = async () => {
    try { await api.admin.saveSettings(settings); await loadAll(); toast({ kind: 'success', title: 'Settings saved' }); }
    catch (e: any) { toast({ kind: 'error', title: 'Failed', body: e.message }); }
  };

  const quickCredit = (u: User, amount: number) => userAction(u.id, { action: 'credit', amount });

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
                        <td>{u.banned ? <span className="tag red">Banned</span> : <span className="tag live">Active</span>}</td>
                        <td>
                          <div className="row" style={{ gap: 3 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => quickCredit(u, 100000)}>+$1k</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => quickCredit(u, -100000)}>-$1k</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ kind: 'user', data: u })}>Edit</button>
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
                <button className="btn btn-red btn-sm" onClick={() => { setEditing({ kind: 'tourney' }); setLocal({ name: 'New Tournament', buyin: 1000, fee: 100, gtd: 10000, starting_stack: 10000, blind_speed: 8, entrants: 0, status: 'registering', format: 'NLH', start_at: new Date(Date.now() + 3600000).toISOString().slice(0, 16) }); }}>+ New tournament</button>
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
                            <button className="btn btn-ghost btn-sm" onClick={async () => { await api.admin.saveMission({ ...m, progress: 0, claimed: false }); loadAll(); }}>Reset</button>
                          </div>
                        </td>
                      </tr>
                    ))}
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
                  {Object.entries(settings).map(([k, v]) => (
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
                  {['buyin', 'fee', 'gtd', 'entrants', 'starting_stack', 'blind_speed'].map((f) => (
                    <Field key={f} label={f}><input className="admin-input" type="number" value={local[f] ?? 0} onChange={(e) => setLocal({ ...local, [f]: Number(e.target.value) })} /></Field>
                  ))}
                  <Field label="Start (local time)"><input className="admin-input" type="datetime-local" value={local.start_at ?? ''} onChange={(e) => setLocal({ ...local, start_at: e.target.value })} /></Field>
                  <Field label="Status"><select className="admin-select" value={local.status} onChange={(e) => setLocal({ ...local, status: e.target.value })}><option>registering</option><option>running</option><option>completed</option></select></Field>
                  <Field label="Format"><select className="admin-select" value={local.format} onChange={(e) => setLocal({ ...local, format: e.target.value })}><option>NLH</option><option>PLO</option><option>Short Deck</option></select></Field>
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
