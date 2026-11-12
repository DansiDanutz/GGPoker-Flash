import React, { useRef, useState } from 'react';
import { api, RESTORE_CONFIRM_WORD, RESTORE_MAX_BYTES } from '../lib/api';
import { useApp } from '../lib/store';

/**
 * Owner-console restore: pick a `.db` backup, type RESTORE, and queue it.
 * The server only stages the file; it is applied on the next server restart.
 */
export function AdminRestore() {
  const { toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setTyped('');
    if (input.current) input.current.value = '';
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] ?? null;
    if (next && next.size > RESTORE_MAX_BYTES) {
      toast({ kind: 'error', title: 'Restore failed', body: 'Backup larger than 6 MB' });
      reset();
      return;
    }
    setFile(next);
    setTyped('');
  };

  const submit = async () => {
    if (!file || typed !== RESTORE_CONFIRM_WORD) return;
    setBusy(true);
    try {
      await api.admin.restore(file, typed);
      toast({ kind: 'success', title: 'Restore queued — restart the server to apply', body: file.name });
      reset();
    } catch (e: unknown) {
      toast({ kind: 'error', title: 'Restore failed', body: e instanceof Error ? e.message : 'Unexpected error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      <input ref={input} type="file" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3" hidden onChange={pick} />
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => input.current?.click()}>
        ⤒ {file ? file.name : 'Restore backup…'}
      </button>
      {file && (
        <>
          <input
            className="admin-input"
            style={{ width: 150 }}
            placeholder={`Type ${RESTORE_CONFIRM_WORD}`}
            aria-label={`Type ${RESTORE_CONFIRM_WORD} to confirm the restore`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <button className="btn btn-sm" disabled={busy || typed !== RESTORE_CONFIRM_WORD} onClick={submit}>
            {busy ? 'Uploading…' : 'Queue restore'}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={reset}>Cancel</button>
        </>
      )}
    </div>
  );
}
