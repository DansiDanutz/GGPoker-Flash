import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, money, AdminTransactionFilters, AdminTransactionRow } from '../lib/api';
import { useApp } from '../lib/store';

const LIMIT_OPTIONS = [50, 100, 300, 500, 1000] as const;
const DEFAULT_FILTERS: AdminTransactionFilters = Object.freeze({ q: '', kind: '', limit: 300 });
const COLUMN_COUNT = 8;

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const kindLabel = (kind: string) => kind.replace(/_/g, ' ');

/** Admin console "Transactions" section: search login/nick/memo, filter by kind, export as CSV. */
export function AdminTransactions() {
  const { toast } = useApp();
  const [draft, setDraft] = useState<AdminTransactionFilters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<AdminTransactionFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<AdminTransactionRow[] | null>(null);
  const [serverKinds, setServerKinds] = useState<string[] | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const load = useCallback(async (filters: AdminTransactionFilters) => {
    try { setRows((await api.admin.transactions(filters)).transactions); }
    catch (e: unknown) { toast({ kind: 'error', title: 'Transactions', body: errorText(e, 'Failed to load') }); }
  }, [toast]);

  useEffect(() => { load(applied); }, [load, applied]);
  useEffect(() => {
    // The kinds list is a convenience; on failure the dropdown falls back to the loaded rows.
    api.admin.transactionKinds().then((r) => setServerKinds(r.kinds), () => setServerKinds(null));
  }, []);

  const kinds = useMemo(() => {
    const base = serverKinds ?? [...new Set((rows ?? []).map((r) => r.kind))].sort();
    return draft.kind && !base.includes(draft.kind) ? [...base, draft.kind] : base;
  }, [serverKinds, rows, draft.kind]);

  const edit = (key: keyof AdminTransactionFilters, value: string | number) => setDraft((d) => ({ ...d, [key]: value }));
  const apply = (e: FormEvent) => { e.preventDefault(); setApplied({ ...draft }); };
  const reset = () => { setDraft(DEFAULT_FILTERS); setApplied({ ...DEFAULT_FILTERS }); };

  const exportCsv = async () => {
    setIsExporting(true);
    try {
      await api.admin.transactionsCsv(applied);
      toast({ kind: 'success', title: 'Export ready', body: 'transactions.csv' });
    } catch (e: unknown) {
      toast({ kind: 'error', title: 'Export failed', body: errorText(e, 'Unknown error') });
    } finally {
      setIsExporting(false);
    }
  };

  const isFiltered = applied.q !== '' || applied.kind !== '';
  return (
    <>
      <h2 className="admin-title">Transactions</h2>
      <form className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }} onSubmit={apply}>
        <input className="admin-input" aria-label="Search login, nick or memo" placeholder="Search login, nick or memo" value={draft.q} onChange={(e) => edit('q', e.target.value)} />
        <select className="admin-input" aria-label="Kind" value={draft.kind} onChange={(e) => edit('kind', e.target.value)}>
          <option value="">All kinds</option>
          {kinds.map((k) => <option key={k} value={k} style={{ textTransform: 'capitalize' }}>{kindLabel(k)}</option>)}
        </select>
        <select className="admin-input" aria-label="Limit" value={draft.limit} onChange={(e) => edit('limit', Number(e.target.value))}>
          {LIMIT_OPTIONS.map((n) => <option key={n} value={n}>Last {n}</option>)}
        </select>
        <button type="submit" className="btn btn-gold btn-sm">Apply</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Reset</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={isExporting}>⤓ Export CSV</button>
      </form>
      <div className="admin-card" style={{ padding: 0 }}>
        <table className="admin-table admin-transactions-table">
          <thead><tr><th>#</th><th>User</th><th>Type</th><th>Currency</th><th>Amount</th><th>Balance</th><th>Memo</th><th>Date</th></tr></thead>
          <tbody>
            {(rows ?? []).map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td><td>{t.nick || t.login || t.user_id}</td><td style={{ textTransform: 'capitalize' }}>{kindLabel(t.kind)}</td>
                <td>{t.currency}</td><td style={{ color: t.amount >= 0 ? '#7fe0a0' : '#ff9a9a' }}>{money(t.amount)}</td>
                <td>{money(t.balance_after)}</td><td className="muted">{t.memo}</td><td className="muted">{t.created_at}</td>
              </tr>
            ))}
            {rows && !rows.length && (
              <tr><td colSpan={COLUMN_COUNT}><div className="empty-state">{isFiltered ? 'No transactions match these filters.' : 'No transactions yet.'}</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
