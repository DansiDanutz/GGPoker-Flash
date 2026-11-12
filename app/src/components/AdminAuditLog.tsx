import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, AdminAuditFilters, AdminAuditRow } from '../lib/api';
import { useApp } from '../lib/store';

const LIMIT_OPTIONS = [50, 200, 500, 1000] as const;
const DEFAULT_FILTERS: AdminAuditFilters = Object.freeze({ actor: '', action: '', q: '', limit: 200 });

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Admin console "Audit log" section: filter by actor, action and detail text, export as CSV. */
export function AdminAuditLog() {
  const { toast } = useApp();
  const [draft, setDraft] = useState<AdminAuditFilters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<AdminAuditFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<AdminAuditRow[] | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const load = useCallback(async (filters: AdminAuditFilters) => {
    try { setRows((await api.admin.audit(filters)).log); }
    catch (e: unknown) { toast({ kind: 'error', title: 'Audit log', body: errorText(e, 'Failed to load') }); }
  }, [toast]);

  useEffect(() => { load(applied); }, [load, applied]);

  const edit = (key: keyof AdminAuditFilters, value: string | number) => setDraft((d) => ({ ...d, [key]: value }));
  const apply = (e: FormEvent) => { e.preventDefault(); setApplied({ ...draft }); };
  const reset = () => { setDraft(DEFAULT_FILTERS); setApplied({ ...DEFAULT_FILTERS }); };

  const exportCsv = async () => {
    setIsExporting(true);
    try {
      await api.admin.auditCsv(applied);
      toast({ kind: 'success', title: 'Export ready', body: 'audit.csv' });
    } catch (e: unknown) {
      toast({ kind: 'error', title: 'Export failed', body: errorText(e, 'Unknown error') });
    } finally {
      setIsExporting(false);
    }
  };

  const isFiltered = applied.actor !== '' || applied.action !== '' || applied.q !== '';
  return (
    <>
      <h2 className="admin-title">Audit log</h2>
      <form className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }} onSubmit={apply}>
        <input className="admin-input" aria-label="Actor" placeholder="Actor (login)" value={draft.actor} onChange={(e) => edit('actor', e.target.value)} />
        <input className="admin-input" aria-label="Action" placeholder="Action" value={draft.action} onChange={(e) => edit('action', e.target.value)} />
        <input className="admin-input" aria-label="Search detail" placeholder="Search detail" value={draft.q} onChange={(e) => edit('q', e.target.value)} />
        <select className="admin-input" aria-label="Limit" value={draft.limit} onChange={(e) => edit('limit', Number(e.target.value))}>
          {LIMIT_OPTIONS.map((n) => <option key={n} value={n}>Last {n}</option>)}
        </select>
        <button type="submit" className="btn btn-gold btn-sm">Apply</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Reset</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={isExporting}>⤓ Export CSV</button>
      </form>
      <div className="admin-card" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead><tr><th>#</th><th>Actor</th><th>Action</th><th>Detail</th><th>Date</th></tr></thead>
          <tbody>
            {(rows ?? []).map((a) => <tr key={a.id}><td>{a.id}</td><td>{a.actor}</td><td>{a.action}</td><td className="muted">{a.detail}</td><td className="muted">{a.created_at}</td></tr>)}
            {rows && !rows.length && (
              <tr><td colSpan={5}><div className="empty-state">{isFiltered ? 'No audit entries match these filters.' : 'No audit entries yet.'}</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
