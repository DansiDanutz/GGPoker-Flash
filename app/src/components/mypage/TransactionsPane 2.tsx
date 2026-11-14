import React, { useEffect, useMemo, useState } from 'react';
import { api, money } from '../../lib/api';
import { useApp } from '../../lib/store';

const CURRENCIES = [
  { key: 'USD', label: 'Balance' },
  { key: 'PLAY', label: 'P$' },
  { key: 'TICKET', label: 'T$' },
  { key: 'GEM', label: 'Gems' },
] as const;

const CATEGORY: Record<string, string> = {
  cash_out: 'Cash-out', buy_in: 'Buy-in', bonus: 'Bonus', deposit: 'Deposit',
  withdraw: 'Withdrawal', rake: 'Rake', tournament: 'Tournament', shop: 'Shop',
  transfer: 'Transfer', stake: 'Staking', refund: 'Refund',
};

const PAGE = 10;

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Transaction History (reference 042): currency tabs + ledger table + pager. */
export function TransactionsPane() {
  const { toast } = useApp();
  const [rows, setRows] = useState<any[] | null>(null);
  const [currency, setCurrency] = useState<string>('USD');
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.cashier()
      .then((r) => setRows(r.transactions || []))
      .catch((e) => { setRows([]); toast({ kind: 'error', title: 'Transactions', body: e.message }); });
  }, []);

  const filtered = useMemo(() => (rows || [])
    .filter((t) => String(t.currency || 'USD').toUpperCase() === currency)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [rows, currency]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const slice = filtered.slice((current - 1) * PAGE, current * PAGE);

  const format = (t: any, v: number) => {
    if (currency === 'USD') return money(v);
    if (currency === 'TICKET') return `T$${Math.abs(v).toLocaleString()}`;
    if (currency === 'PLAY') return `P$${Math.abs(v).toLocaleString()}`;
    return Math.abs(v).toLocaleString();
  };

  return (
    <div className="txp">
      <div className="txp-tabs" role="tablist" aria-label="Transaction currency">
        {CURRENCIES.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={currency === c.key} className={'txp-tab' + (currency === c.key ? ' on' : '')} onClick={() => { setCurrency(c.key); setPage(1); }}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="txp-table-wrap">
        <table className="txp-table">
          <thead>
            <tr><th>Date &amp; Time</th><th>Description</th><th>Amount</th><th>Available</th><th>Category</th></tr>
          </thead>
          <tbody>
            {slice.map((t) => {
              const positive = t.amount >= 0;
              return (
                <tr key={t.id}>
                  <td className="txp-when">{fmtWhen(t.created_at)}</td>
                  <td className="txp-desc">{t.memo || CATEGORY[t.kind] || t.kind}</td>
                  <td className={'txp-amount ' + (positive ? 'up' : 'down')}>{positive ? '+' : '-'}{format(t, t.amount)}</td>
                  <td className="txp-avail">{format(t, t.balance_after ?? 0)}</td>
                  <td className="txp-cat">{CATEGORY[t.kind] || t.kind}</td>
                </tr>
              );
            })}
            {rows && !slice.length && (
              <tr><td colSpan={5} className="txp-empty">No {CURRENCIES.find((c) => c.key === currency)?.label} transactions yet.</td></tr>
            )}
            {!rows && <tr><td colSpan={5} className="txp-empty">Loading transactions…</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="txp-pager">
        <button type="button" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)}>‹</button>
        <span aria-current="page">{current}</span>
        <button type="button" aria-label="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)}>›</button>
      </div>
    </div>
  );
}
