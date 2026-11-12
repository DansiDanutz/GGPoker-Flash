import { useCallback, useEffect, useState } from 'react';
import { api, AdminWaitlists as AdminWaitlistsData, AdminWaitlistQueue } from '../lib/api';
import { useApp } from '../lib/store';

const SECOND_MS = 1000;

/** `42s`, `3m 05s`, `1h 12m` — compact wait time for the admin table. */
function formatWait(ms: number): string {
  const total = Math.floor(ms / SECOND_MS);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

const targetOf = (q: AdminWaitlistQueue) => (q.kind === 'table' ? { tableId: q.tableId } : { groupKey: q.groupKey });

/** Admin console "Wait lists" section: live queues, held seats and a per-queue clear. */
export function AdminWaitlists() {
  const { toast } = useApp();
  const [data, setData] = useState<AdminWaitlistsData | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api.admin.waitlists()); }
    catch (e: unknown) { toast({ kind: 'error', title: 'Wait lists', body: e instanceof Error ? e.message : 'Failed to load' }); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const clear = async (q: AdminWaitlistQueue) => {
    const what = `${q.length} waiting${q.held.length ? ` and ${q.held.length} held seat${q.held.length > 1 ? 's' : ''}` : ''}`;
    if (!confirm(`Clear the wait list for ${q.name}? This removes ${what}; players are notified.`)) return;
    setBusyKey(q.queueKey);
    try {
      const res = await api.admin.clearWaitlist(targetOf(q));
      toast({ kind: 'success', title: 'Wait list cleared', body: `${q.name} · ${res.removed} removed · ${res.released} seats released` });
    } catch (e: unknown) {
      toast({ kind: 'error', title: 'Clear failed', body: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setBusyKey(null);
      await load();
    }
  };

  const queues = data?.queues ?? [];
  return (
    <>
      <div className="between">
        <h2 className="admin-title" style={{ margin: 0 }}>Wait lists</h2>
        <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
      </div>
      <div className="stat-grid">
        <div className="stat"><span>Queues</span><b>{data?.totals.queues ?? '—'}</b></div>
        <div className="stat"><span>Waiting players</span><b>{data?.totals.waiting ?? '—'}</b></div>
        <div className="stat"><span>Held seats</span><b>{data?.totals.held ?? '—'}</b></div>
      </div>
      <div className="admin-card" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead><tr><th>Queue</th><th>Type</th><th>Waiting</th><th>Players (position)</th><th>Held seats</th><th>Oldest wait</th><th>Actions</th></tr></thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.queueKey}>
                <td><b>{q.name}</b><div className="muted small">{q.queueKey}</div></td>
                <td><span className="tag">{q.kind}</span></td>
                <td>{q.length}</td>
                <td className="muted">{q.positions.length ? q.positions.map((p) => `#${p.position} ${p.nick}`).join(', ') : '—'}</td>
                <td className="muted">{q.held.length ? q.held.map((h) => `${h.nick} · ${h.tableName} seat ${h.seat + 1} (${formatWait(h.remainingMs)} left)`).join(', ') : '—'}</td>
                <td>{q.length ? formatWait(q.oldestWaitMs) : '—'}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" disabled={busyKey === q.queueKey} onClick={() => clear(q)}>
                    {busyKey === q.queueKey ? 'Clearing…' : 'Clear queue'}
                  </button>
                </td>
              </tr>
            ))}
            {data && !queues.length && <tr><td colSpan={7}><div className="empty-state">No players are waiting for a seat.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
