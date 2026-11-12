import { useCallback, useEffect, useState } from 'react';
import { api, AdminSnapshotList, RESTORE_CONFIRM_WORD } from '../lib/api';
import { useApp } from '../lib/store';

const kib = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB`;
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * Owner-console snapshots: create a bounded server-side copy, download or delete one by id, or queue
 * a restore from one. A restore is applied on the next server restart, like an uploaded restore.
 */
export function AdminSnapshots() {
  const { toast } = useApp();
  const [list, setList] = useState<AdminSnapshotList | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  const load = useCallback(async () => {
    try { setList(await api.admin.snapshots()); }
    catch (e: unknown) { toast({ kind: 'error', title: 'Snapshots', body: errorText(e, 'Failed to load') }); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const act = async (title: string, work: () => Promise<void>) => {
    setBusy(true);
    try { await work(); }
    catch (e: unknown) { toast({ kind: 'error', title, body: errorText(e, 'Unexpected error') }); }
    finally { setBusy(false); }
  };

  const create = () => act('Snapshot failed', async () => {
    const r = await api.admin.createSnapshot();
    const pruned = r.pruned.length ? ` · removed ${r.pruned.length} older` : '';
    toast({ kind: 'success', title: 'Snapshot saved', body: `${r.snapshot.id} · integrity ${r.snapshot.integrity}${pruned}` });
    await load();
  });

  const download = (id: string) => act('Download failed', () => api.admin.downloadSnapshot(id));

  const remove = (id: string) => {
    if (!window.confirm(`Delete snapshot ${id}?`)) return;
    act('Delete failed', async () => {
      await api.admin.deleteSnapshot(id);
      toast({ kind: 'success', title: 'Snapshot deleted', body: id });
      await load();
    });
  };

  const restore = (id: string) => act('Restore failed', async () => {
    await api.admin.restoreSnapshot(id, typed);
    toast({ kind: 'success', title: 'Restore queued — restart the server to apply', body: id });
    setRestoring(null);
    setTyped('');
  });

  const startRestore = (id: string) => { setRestoring(id); setTyped(''); };
  const cancelRestore = () => { setRestoring(null); setTyped(''); };

  return (
    <>
      <div className="between" style={{ marginBottom: 10 }}>
        <h2 className="admin-title" style={{ margin: 0 }}>Snapshots</h2>
        <button className="btn btn-red btn-sm" disabled={busy} onClick={create}>{busy ? 'Working…' : 'Create snapshot'}</button>
      </div>
      <p className="muted small">
        Private copies kept on the server. The newest {list?.retention ?? '—'} are kept; creating a snapshot removes older ones.
        Restoring queues the chosen snapshot for the next restart, and the current database is kept as a rescue copy.
      </p>
      <div className="admin-card" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead><tr><th>Snapshot</th><th>Size</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {list?.snapshots.map((s) => (
              <tr key={s.id}>
                <td className="muted">{s.id}</td>
                <td>{kib(s.size)}</td>
                <td>{new Date(s.createdAt).toLocaleString()}</td>
                <td>
                  {restoring === s.id ? (
                    <div className="row" style={{ gap: 3 }}>
                      <input
                        className="admin-input"
                        style={{ width: 120 }}
                        placeholder={`Type ${RESTORE_CONFIRM_WORD}`}
                        aria-label={`Type ${RESTORE_CONFIRM_WORD} to confirm the restore of ${s.id}`}
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                      />
                      <button className="btn btn-sm" disabled={busy || typed !== RESTORE_CONFIRM_WORD} onClick={() => restore(s.id)}>Queue restore</button>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={cancelRestore}>Cancel</button>
                    </div>
                  ) : (
                    <div className="row" style={{ gap: 3 }}>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => download(s.id)}>Download</button>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => startRestore(s.id)}>Restore…</button>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove(s.id)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list && !list.snapshots.length && <div className="muted small" style={{ padding: 12 }}>No snapshots yet.</div>}
      </div>
    </>
  );
}
