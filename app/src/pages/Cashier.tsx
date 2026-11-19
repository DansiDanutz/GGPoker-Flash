import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell } from '../components/PageShell';
import { loadDiamondAccount, type DiamondAccount } from '../components/Diamonds';
import { NervixPayConnection } from '../components/NervixPayConnection';
import { organizerChipsApi, type ChipBalance } from '../lib/organizer-chips-api';

const PRESETS = [1000, 5000, 10000, 50000];
type Limits = { max: number; dailyMax: number; today: number };
type Tab = 'play' | 'nervixpay' | 'history';
const playMoney = (value: number) => `${(Math.max(0, value || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Play Money`;
const ledgerCurrency = (currency?: string) => currency === 'USD' ? 'Play Money' : currency || 'units';
const ledgerMemo = (entry: any) => entry.kind === 'withdraw' ? 'Legacy simulated withdrawal — no money sent' : entry.kind === 'deposit' ? 'Free Play Money top-up' : entry.memo || String(entry.kind).replace(/_/g, ' ');
const ledgerValue = (value: number, currency?: string) => currency === 'TICKET' || currency === 'GEM' ? value : value / 100;
const ledgerAmount = (value: number, currency?: string) => `${Math.abs(ledgerValue(value, currency)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ledgerCurrency(currency)}`;

export function Cashier() {
  const { user, refreshUser, toast, navigate } = useApp();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('play');
  const [amount, setAmount] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [cashierError, setCashierError] = useState('');
  const [cashChips, setCashChips] = useState<ChipBalance[] | null>(null);
  const [cashChipsError, setCashChipsError] = useState('');
  const [diamonds, setDiamonds] = useState<DiamondAccount | null>(null);
  const [diamondError, setDiamondError] = useState('');
  const requestKey = useRef<string | null>(null);
  const inFlight = useRef(false);
  const limits: Limits | null = data?.depositLimits || null;
  const remaining = limits ? Math.max(0, limits.dailyMax - limits.today) : 0;
  const valid = !!limits && Number.isSafeInteger(amount) && amount >= 1 && amount <= limits.max && amount <= remaining;

  const load = async () => {
    if (!user) return;
    setCashierError('');
    try { setData(await api.cashier()); } catch (error: any) { setData(null); setCashierError(error.message); toast({ kind: 'error', title: 'Cashier', body: error.message }); }
  };
  useEffect(() => {
    void load();
    if (!user) return;
    setCashChipsError('');
    setDiamondError('');
    if (!user.is_guest) void loadDiamondAccount().then(setDiamonds).catch(error => { setDiamonds(null); setDiamondError(error.message); });
    void organizerChipsApi.mine().then(account => setCashChips(account.balances)).catch(error => { setCashChips(null); setCashChipsError(error instanceof Error ? error.message : 'Cash Chip balances could not be loaded.'); });
  }, [user]);
  useEffect(() => { requestKey.current = null; }, [amount]);

  const addPlayMoney = async () => {
    if (!user) { navigate('/login'); return; }
    if (inFlight.current || !valid) return;
    inFlight.current = true; setBusy(true);
    try {
      if (!requestKey.current) requestKey.current = crypto.randomUUID();
      await api.deposit(amount, 'free-play-money', requestKey.current);
      sound.play('coin'); toast({ kind: 'success', title: 'Play Money added', body: playMoney(amount) });
      await load(); await refreshUser(); requestKey.current = null;
    } catch (error: any) { toast({ kind: 'error', title: 'Could not add Play Money', body: error.message }); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const transactions = [...(data?.transactions || [])].sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 100);
  const exportCsv = () => {
    const rows = [['id', 'kind', 'currency', 'amount', 'balance_after', 'memo', 'created_at'], ...transactions.map((t: any) => [t.id, t.kind, ledgerCurrency(t.currency), ledgerValue(t.amount, t.currency), t.balance_after == null ? '' : ledgerValue(t.balance_after, t.currency), ledgerMemo(t), t.created_at])];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'dangg-play-money-history.csv'; link.click(); URL.revokeObjectURL(url);
  };

  return <PageShell activeTop="poker"><main className="cashier-page"><div className="cashier-win">
    <header className="cashier-top"><div className="cashier-brand"><b>DanGG</b><span>Player Cashier</span></div><div className="cashier-balance"><span>Available for public fun games</span><strong>{playMoney(user?.balance ?? 0)}</strong><small>Free Play Money · no cash value</small></div></header>
    <nav className="cashier-tabs" role="tablist" aria-label="Player Cashier">{([['play', 'Add Play Money'], ['nervixpay', 'NervixPay'], ['history', 'History']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>{label}</button>)}</nav>
    <div className="cashier-body"><section className="cashier-ledgers" aria-label="Your separate balances"><article><span>Play Money</span><strong>{playMoney(user?.balance ?? 0)}</strong><small>Free · public fun games</small></article><article><span>Organizer Cash Chips</span>{cashChipsError ? <strong className="cashier-ledger-error">Could not load</strong> : cashChips === null ? <strong>Loading…</strong> : cashChips.length ? <ul>{cashChips.map(row => <li key={row.organizer_id}><span>Organizer #{row.organizer_id}</span><b>{row.balance.toLocaleString()} Cash Chips</b></li>)}</ul> : <strong>No organizer balances</strong>}<small>Separate balance in each organizer economy</small></article><article><span>Diamonds</span><strong>{user?.is_guest ? "Sign in to view" : diamondError ? "Could not load" : diamonds ? `${diamonds.balances.reduce((sum, row) => sum + row.balance, 0).toLocaleString()} Diamonds` : "Loading…"}</strong>{diamonds?.balances.map(row => <small key={row.organizerId}>{row.organizerName}: {row.balance.toLocaleString()}</small>)}<small>Total held across issuers; not a shared spendable balance. Tournaments and redemption are not yet available</small><a href="#/marketplace">View Diamond requests</a></article></section>
      {tab === 'play' && <section className="cashier-card" aria-labelledby="play-money-title"><header><div><p className="cashier-kicker">FREE PRACTICE BALANCE</p><h1 id="play-money-title">Add Play Money</h1></div><span className="cashier-free">Free</span></header><p className="cashier-lead">Choose Play Money for public fun tables. No card, bank account, crypto wallet, or real-money payment is used.</p>{cashierError && <p className="cashier-error" role="alert">Limits could not be loaded. <button type="button" onClick={() => void load()}>Retry</button></p>}<div className="cashier-amounts" aria-label="Play Money amounts">{PRESETS.map((value) => <button key={value} type="button" className={amount === value ? 'on' : ''} onClick={() => setAmount(value)}>{playMoney(value)}</button>)}</div><label className="cashier-field"><span>Custom Play Money</span><input aria-describedby="cashier-limit" type="number" inputMode="decimal" min={0.01} max={limits ? Math.min(limits.max, remaining) / 100 : undefined} step={0.01} value={amount / 100} onChange={(event) => setAmount(Math.round(Number(event.target.value) * 100))} /></label>{limits && <p id="cashier-limit" className="cashier-limit">Up to {playMoney(limits.max)} per top-up · {playMoney(remaining)} left today</p>}{limits && remaining > 0 && !valid && <p className="cashier-error" role="alert">Choose an amount from 0.01 to {playMoney(Math.min(limits.max, remaining))}.</p>}{limits && remaining === 0 && <p className="cashier-error" role="status">Today’s free Play Money limit has been reached.</p>}<button type="button" className="cashier-next" disabled={busy || !valid} onClick={() => void addPlayMoney()}>{busy ? 'Adding Play Money…' : `Add ${playMoney(amount)}`}</button><aside className="cashier-separation"><strong>Balances stay separate</strong><p>This does not add organizer Cash Chips or account service credits. Play Money cannot be withdrawn, sold, or exchanged for cash.</p></aside></section>}
      {tab === 'nervixpay' && <div id="cashier-nervixpay"><NervixPayConnection /></div>}
      {tab === 'history' && <section className="cashier-card" aria-labelledby="history-title"><header><h1 id="history-title">Account history</h1><button type="button" className="cashier-export" onClick={exportCsv}>Export CSV</button></header><div className="cashier-history">{transactions.map((transaction: any) => <div key={transaction.id} className="cashier-hist-row"><span className="cashier-hist-date">{String(transaction.created_at).slice(0, 16).replace('T', ' ')}</span><span className="cashier-hist-desc">{ledgerMemo(transaction)}</span><span className={'cashier-hist-amt ' + (transaction.amount >= 0 ? 'up' : 'down')}>{transaction.amount >= 0 ? '+' : '-'}{ledgerAmount(transaction.amount, transaction.currency)}</span></div>)}{!transactions.length && <p className="cashier-empty">No account activity yet.</p>}</div></section>}
    </div>
    <footer className="cashier-foot">Play Money is free entertainment credit with no cash value. Organizer Cash Chips and service credits use separate ledgers.</footer>
  </div></main></PageShell>;
}
