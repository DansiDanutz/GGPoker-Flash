import React, { useEffect, useRef, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell } from '../components/PageShell';

const METHODS = ['Instant bank transfer', 'Visa •••• 4242', 'Mastercard •••• 8811', 'Skrill', 'Crypto (USDT)'];
const DEPOSIT_PRESETS = [1000, 5000, 10000, 50000];
type DepositLimits = { max: number; dailyMax: number; today: number };

export function Cashier() {
  const { user, refreshUser, toast, navigate } = useApp();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState('deposit');
  const [amount, setAmount] = useState(5000);
  const [method, setMethod] = useState(METHODS[0]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const requestKey = useRef<string | null>(null);
  // Server-side play-money caps (deposit_max / deposit_daily_max); the server enforces them.
  const limits: DepositLimits | null = data?.depositLimits || null;
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

  const [txQuery, setTxQuery] = useState('');
  const [txType, setTxType] = useState('all');
  const tx = data?.transactions || [];
  const txFiltered = tx.filter((t: any) => {
    const kind = String(t.kind || '');
    if (txType === 'deposits' && kind !== 'deposit') return false;
    if (txType === 'withdrawals' && kind !== 'withdraw' && kind !== 'withdrawal') return false;
    if (txType === 'bonuses' && !kind.includes('bonus') && kind !== 'welcome' && kind !== 'reload' && kind !== 'daily') return false;
    if (txType === 'poker' && !['session_open', 'session_close', 'cashdrop', 'rake', 'rakeback', 'tourney_buyin', 'tourney_payout', 'tourney_refund'].includes(kind)) return false;
    if (txType === 'rewards' && !['mission', 'daily', 'spin', 'wheel', 'bounty', 'mystery_bounty', 'satellite_win', 'ocean', 'propbet'].includes(kind)) return false;
    if (txQuery && !`${kind} ${t.memo || ''} ${t.currency || ''}`.toLowerCase().includes(txQuery.toLowerCase())) return false;
    return true;
  });
  const exportCsv = () => {
    const rows: any[][] = [['id', 'kind', 'currency', 'amount', 'balance_after', 'memo', 'created_at'], ...txFiltered.map((t: any) => [t.id, t.kind, t.currency, t.amount, t.balance_after, t.memo, t.created_at])];
    const csv = rows.map((r: any[]) => r.map((v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'dangro-transactions.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const depositStep = tab === 'deposit';
  return (
    <PageShell activeTop="poker">
      <div className="cashier-page">
        <div className="cashier-win">
          <div className="cashier-top">
            <div className="cashier-brand"><b>DanGG</b><span>Cashier</span></div>
            <div className="cashier-balances">
              {[
                ['Balance', money(user?.balance ?? 0)],
                ['P$', `P$${(user?.play_chips ?? 0).toLocaleString()}`],
                ['T$', `T$${(user?.tickets ?? 0).toLocaleString()}`],
                ['Ticket', String(user?.tickets ?? 0)],
              ].map(([l, v]) => (
                <div key={l}><span>{l}</span><b>{v}</b></div>
              ))}
            </div>
          </div>

          <div className="cashier-tabs" role="tablist" aria-label="Cashier">
            {([['deposit', 'Deposit'], ['withdraw', 'Withdraw'], ['history', 'Transaction History']] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => { setTab(key); if (key === 'deposit') setMode('deposit'); }}>{label}</button>
            ))}
          </div>

          <div className="cashier-body">
            {depositStep && (
              <>
                <section className="cashier-card">
                  <header><b>Card</b><span aria-hidden="true">⌃</span></header>
                  <div className="cashier-methods">
                    {[
                      { id: 'Bank Card', label: 'Bank Card', marks: 'VISA  ●●  Mastercard' },
                      { id: 'Apple Pay', label: 'Apple Pay', marks: 'Pay' },
                      { id: 'Google Pay', label: 'Google Pay', marks: 'G Pay' },
                    ].map((m) => (
                      <label key={m.id} className="cashier-radio">
                        <input type="radio" name="pm" checked={method === m.id} onChange={() => setMethod(m.id)} />
                        <span className="cashier-dot" />
                        <span className="cashier-pm-label">{m.label}</span>
                        <span className="cashier-marks">{m.marks}</span>
                      </label>
                    ))}
                  </div>
                  <button type="button" className="cashier-next" onClick={() => { setMode('deposit'); setTab('amount'); }}>Next</button>
                </section>

                <section className="cashier-card collapsed">
                  <header><b>E-Wallet</b><span aria-hidden="true">⌄</span></header>
                  <div className="cashier-ewallet">aircash</div>
                </section>

                <p className="cashier-note">DanGG is play money only — “deposit” credits practice chips to this account and has no cash value.</p>
              </>
            )}

            {tab === 'amount' && (
              <section className="cashier-card">
                <header><b>Amount</b><span aria-hidden="true">⌃</span></header>
                <div className="cashier-amounts">
                  {DEPOSIT_PRESETS.map((v) => (
                    <button key={v} type="button" className={amount === v ? 'on' : ''} onClick={() => setAmount(v)}>{money(v)}</button>
                  ))}
                </div>
                <label className="cashier-field">
                  <span>Custom amount (USD)</span>
                  <input type="number" min={100} max={limits?.max ?? 1000000} step={100} value={amount / 100} onChange={(e) => setAmount(Math.round(Number(e.target.value) * 100))} />
                </label>
                {limits && <p className="cashier-limit">Limit {money(limits.max)} per deposit · {money(Math.max(0, limits.dailyMax - limits.today))} left today</p>}
                <div className="cashier-row">
                  <button type="button" className="cashier-back" onClick={() => setTab('deposit')}>Back</button>
                  <button type="button" className="cashier-next" disabled={busy || amount < 100} onClick={submit}>{busy ? 'Processing…' : `Add ${money(amount)}`}</button>
                </div>
              </section>
            )}

            {tab === 'withdraw' && (
              <section className="cashier-card">
                <header><b>Withdraw</b><span aria-hidden="true">⌃</span></header>
                <p className="cashier-withdraw-note">Withdrawals are unavailable while DanGG is a play-money room. Your balance has no cash value and cannot be cashed out.</p>
                <div className="cashier-row">
                  <button type="button" className="cashier-next" disabled>Withdraw</button>
                </div>
              </section>
            )}

            {tab === 'history' && (
              <section className="cashier-card">
                <header><b>Transaction History</b><button type="button" className="cashier-export" onClick={exportCsv}>Export CSV</button></header>
                <div className="cashier-history">
                  {[...(data?.transactions || [])]
                    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
                    .slice(0, 20)
                    .map((t: any) => {
                      const cur = String(t.currency || 'USD').toUpperCase();
                      const abs = Math.abs(t.amount);
                      const fmt = cur === 'USD' ? money(abs) : cur === 'PLAY' ? `P$${(abs / 100).toFixed(2)}` : cur === 'TICKET' ? `T$${abs}` : `${abs} GEM`;
                      return (
                        <div key={t.id} className="cashier-hist-row">
                          <span className="cashier-hist-date">{String(t.created_at).slice(0, 16).replace('T', ' ')}</span>
                          <span className="cashier-hist-desc">{t.memo || String(t.kind).replace(/_/g, ' ')}</span>
                          <span className={'cashier-hist-amt ' + (t.amount >= 0 ? 'up' : 'down')}>{t.amount >= 0 ? '+' : '-'}{fmt}</span>
                        </div>
                      );
                    })}
                  {!(data?.transactions || []).length && <p className="cashier-empty">No transactions yet.</p>}
                </div>
              </section>
            )}
          </div>

          <div className="cashier-foot">
            DanGG is a play-money practice room. No real-money deposits, withdrawals or cash value. © 2026 DanGG.
          </div>
        </div>
      </div>
    </PageShell>
  );
}
