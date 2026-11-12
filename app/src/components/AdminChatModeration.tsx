import { useCallback, useEffect, useState } from 'react';
import { api, AdminChatFeed, AdminChatLine } from '../lib/api';
import { useApp } from '../lib/store';

const FEED_LIMIT = 100;
const TABLE_PREFIX = 'table:';

/** SQLite `datetime('now')` is UTC without a zone marker. */
function formatTime(createdAt: string): string {
  const at = new Date(`${createdAt.replace(' ', 'T')}Z`);
  return Number.isNaN(at.getTime()) ? createdAt : at.toLocaleString();
}

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Admin console "Chat moderation" section: recent table chat with delete and mute. */
export function AdminChatModeration() {
  const { toast } = useApp();
  const [tableId, setTableId] = useState('');
  const [data, setData] = useState<AdminChatFeed | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { setData(await api.admin.chatFeed(tableId || undefined, FEED_LIMIT)); }
    catch (e: unknown) { toast({ kind: 'error', title: 'Chat moderation', body: errorText(e, 'Failed to load') }); }
  }, [tableId, toast]);

  useEffect(() => { load(); }, [load]);

  const tableName = (channel: string) => {
    const id = channel.startsWith(TABLE_PREFIX) ? channel.slice(TABLE_PREFIX.length) : channel;
    return data?.tables.find((t) => t.tableId === id)?.name ?? id;
  };

  const remove = async (line: AdminChatLine) => {
    if (!confirm(`Delete this message from ${line.nick}?\n\n“${line.text}”`)) return;
    setBusyId(line.id);
    try {
      await api.admin.deleteChatLine(line.id);
      toast({ kind: 'success', title: 'Message deleted', body: line.nick });
    } catch (e: unknown) {
      toast({ kind: 'error', title: 'Delete failed', body: errorText(e, 'Unknown error') });
    } finally {
      setBusyId(null);
      await load();
    }
  };

  const mute = async (line: AdminChatLine) => {
    if (line.user_id === null) return;
    if (!confirm(`Mute ${line.nick}? They will not be able to chat anywhere until unmuted in Users.`)) return;
    setBusyId(line.id);
    try {
      await api.admin.userAction(line.user_id, { action: 'mute' });
      toast({ kind: 'success', title: 'Chat muted', body: line.nick });
    } catch (e: unknown) {
      toast({ kind: 'error', title: 'Mute failed', body: errorText(e, 'Unknown error') });
    } finally {
      setBusyId(null);
    }
  };

  const messages = data?.messages ?? [];
  const tables = data?.tables ?? [];
  return (
    <>
      <div className="between">
        <h2 className="admin-title" style={{ margin: 0 }}>Chat moderation</h2>
        <div className="row">
          <select className="admin-input" aria-label="Table" value={tableId} onChange={(e) => setTableId(e.target.value)}>
            <option value="">All tables</option>
            {tables.map((t) => <option key={t.tableId} value={t.tableId}>{t.name} ({t.count})</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
        </div>
      </div>
      <div className="admin-card" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead><tr><th>Time</th><th>Table</th><th>Player</th><th>Message</th><th>Actions</th></tr></thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id}>
                <td className="muted small">{formatTime(m.created_at)}</td>
                <td className="muted">{tableName(m.channel)}</td>
                <td><b>{m.nick}</b></td>
                <td style={{ wordBreak: 'break-word' }}>{m.text}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" disabled={busyId === m.id} onClick={() => remove(m)}>Delete</button>
                  <button className="btn btn-ghost btn-sm" disabled={busyId === m.id || m.user_id === null} onClick={() => mute(m)}>Mute player</button>
                </td>
              </tr>
            ))}
            {data && !messages.length && <tr><td colSpan={5}><div className="empty-state">No table chat to review.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
