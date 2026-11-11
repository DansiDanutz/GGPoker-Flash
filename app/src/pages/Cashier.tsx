import React, { useEffect, useRef, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell, SubNav } from '../components/PageShell';

const METHODS = ['Instant bank transfer', 'Visa •••• 4242', 'Mastercard •••• 8811', 'Skrill', 'Crypto (USDT)'];

export function Cashier() {
  const { user, refreshUser, toast, navigate } = useApp();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState('cashier');
  const [amount, setAmount] = useState(5000);
  const [method, setMethod] = useState(METHODS[0]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const requestKey = useRef<string | null>(null);
  const inFlight = useRef(false);

  const load = async () => {
    if (!user) return;
    try { setData(await api.cashier()); } catch (e: any) { toast({ kind: 'error', title: 'Cashier', body: e.message }); }
  };
  useEffect(() => { load(); }, [user]);
  useEffect(() => { requestKey.current = null; }, [amount, method, mode]);

  const submit = async () => {
    if (!user) { navigate('/login'); return; }
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (!requestKey.current) requestKey.current = crypto.randomUUID();
      if (mode === 'deposit') await api.deposit(amount, method, requestKey.current || undefined);
      else await api.withdraw(amount, method, requestKey.current || undefined);
      sound.play('coin');
      toast({ kind: 'success', title: mode === 'deposit' ? 'Deposit complete' : 'Withdrawal requested', body: money(amount) });
      await load();
      await refreshUser();
      requestKey.current = null;
    } catch (e: any) {
      toast({ kind: 'error', title: 'Transaction failed', body: e.message });
    } finally { inFlight.current = false; setBusy(false); }
  };

  const tx = data?.transactions || [];

  return (
    <PageShell activeTop="poker" subnav={<SubNav items={[{ key: 'cashier', label: 'Cashier' }, { key: 'transactions', label: 'Transactions' }, { key: 'bonus', label: 'Bonuses' }]} active={tab} onChange={setTab} />}>
      <div className="page">
        <h1 className="page-title">Cashier</h1>
        <p className="page-sub">Play-money wallet · no real deposits, no cash value</p>

        <div className="grid g4" style={{ marginBottom: 16 }}>
          {[
            ['USD balance', money(user?.balance ?? 0), 'Play money'],
            ['Play chips', `P$ ${(user?.play_chips ?? 0).toLocaleString()}`, 'P$'],
            ['Tickets', `T$ ${(user?.tickets ?? 0).toLocaleString()}`, 'T$'],
            ['Gems', (user?.gems ?? 0).toLocaleString(), 'Ocean rewards'],
          ].map(([label, value, note]) => (
            <div key={label} className="card">
              <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
              <div style={{ fontFamily: 'var(--head-font)', fontSize: 24, fontWeight: 800, color: '#fff', marginTop: 4 }}>{value}</div>
              <div className="muted small">{note}</div>
            </div>
          ))}
        </div>

        {tab === 'cashier' && (
          <div className="grid g2">
            <div className="card">
              <div className="tabs-line" style={{ marginBottom: 12 }}>
                <button className={mode === 'deposit' ? 'on' : ''} onClick={() => setMode('deposit')}>Deposit</button>
                <button className={mode === 'withdraw' ? 'on' : ''} onClick={() => setMode('withdraw')}>Withdraw</button>
              </div>
              <label className="admin-label">Amount (USD)</label>
              <div className="row" style={{ marginBottom: 8 }}>
                <input className="admin-input" style={{ flex: 1, height: 40, fontSize: 18 }} type="number" value={amount / 100} onChange={(e) => setAmount(Math.max(0, Math.round(Number(e.target.value) * 100)))} />
                <span className="muted">.00</span>
              </div>
              <div className="row" style={{ marginBottom: 12 }}>
                {[1000, 5000, 10000, 50000].map((v) => (
                  <button key={v} className="btn btn-ghost btn-sm" onClick={() => setAmount(v)}>{money(v)}</button>
                ))}
              </div>
              <label className="admin-label">Payment method</label>
              <select className="admin-select" style={{ width: '100%' }} value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
              <button className="btn btn-red btn-block" style={{ marginTop: 14, height: 42 }} disabled={busy} onClick={submit}>
                {busy ? 'Processing…' : mode === 'deposit' ? `Deposit ${money(amount)}` : `Withdraw ${money(amount)}`}
              </button>
              <p className="muted small" style={{ marginTop: 10 }}>
                Instant, local demo processing. Funds are credited immediately and stored in your local account.
              </p>
            </div>
            <div className="card">
              <div className="panel-title">Recent activity</div>
              <div className="list">
                {tx.slice(0, 8).map((t: any) => (
                  <div key={t.id} className="list-row">
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 12.5 }}>{t.kind.replace(/_/g, ' ')}</b>
                      <div className="muted small">{new Date(t.created_at).toLocaleString('en-GB')} · {t.memo}</div>
                    </div>
                    <div style={{ color: t.amount >= 0 ? '#7fe0a0' : '#ff9a9a', fontWeight: 700 }}>
                      {t.amount >= 0 ? '+' : ''}{money(t.amount)}
                    </div>
                  </div>
                ))}
                {!tx.length && <div className="empty-state">No transactions yet.</div>}
              </div>
            </div>
          </div>
        )}

        {tab === 'transactions' && (
          <div className="card" style={{ padding: 0 }}>
            <table className="admin-table">
              <thead><tr><th>#</th><th>Type</th><th>Currency</th><th>Amount</th><th>Balance after</th><th>Memo</th><th>Date</th></tr></thead>
              <tbody>
                {tx.map((t: any) => (
                  <tr key={t.id}>
                    <td>{t.id}</td><td style={{ textTransform: 'capitalize' }}>{t.kind.replace(/_/g, ' ')}</td><td>{t.currency}</td>
                    <td style={{ color: t.amount >= 0 ? '#7fe0a0' : '#ff9a9a' }}>{t.amount >= 0 ? '+' : ''}{money(t.amount)}</td>
                    <td>{money(t.balance_after)}</td><td className="muted">{t.memo}</td>
                    <td className="muted">{new Date(t.created_at).toLocaleString('en-GB')}</td>
                  </tr>
                ))}
                {!tx.length && <tr><td colSpan={7} className="empty-state">No transactions.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'bonus' && (
          <div className="grid g3">
            {(data?.bonuses || [
              { id: 'welcome', title: 'Welcome bonus', subtitle: 'One-time welcome credit', amount: 100000, claimed: false },
              { id: 'reload', title: 'Weekly reload', subtitle: 'Once per week', amount: 50000, claimed: false },
              { id: 'daily', title: 'Daily freebie', subtitle: 'Once per day', amount: 1000, claimed: false },
            ]).map((b: any) => (
              <div key={b.id} className="card" style={{ textAlign: 'center', padding: 22 }}>
                <div style={{ fontSize: 34 }}>🎁</div>
                <div style={{ fontWeight: 700, color: '#fff', marginTop: 8 }}>{b.title}</div>
                <div className="gold" style={{ fontSize: 18, fontWeight: 800, margin: '6px 0' }}>{money(b.amount)}</div>
                <div className="muted small">{b.subtitle}</div>
                <button className={'btn btn-sm ' + (b.claimed ? 'btn-ghost' : 'btn-gold')} style={{ marginTop: 12 }} disabled={b.claimed || busy} onClick={async () => {
                  try {
                    const r = await api.claimBonus(b.id);
                    sound.play('coin');
                    toast({ kind: 'reward', title: b.title, body: `+${money(r.amount)} added to your play balance.` });
                    await load(); await refreshUser();
                  } catch (e: any) { toast({ kind: 'error', title: 'Bonus not applied', body: e.message }); }
                }}>{b.claimed ? 'Claimed' : 'Claim'}</button>
              </div>
            ))}
            <p className="muted small" style={{ gridColumn: '1 / -1' }}>Bonuses are local practice credits. Welcome is once per account, reload once per ISO week, daily once per UTC day.</p>
          </div>
        )}
      </div>
    </PageShell>
  );
}
