import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/store';

const PAGE = 8;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const fmtDate = (iso?: string) => {
  if (!iso) return 'Today';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Today';
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
};

/** Message centre (reference 043): an inbox of notices with mark-all-read and paging. */
export function MessagesPane() {
  const { navigate, toast } = useApp();
  const [items, setItems] = useState<any[] | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await api.notifications(true);
      setItems(r.items || []);
    } catch (e: any) {
      setItems([]);
      toast({ kind: 'error', title: 'Messages', body: e.message });
    }
  };
  useEffect(() => { load(); }, []);

  const sorted = useMemo(() => [...(items || [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))), [items]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const current = Math.min(page, pages);
  const slice = sorted.slice((current - 1) * PAGE, current * PAGE);
  const unread = sorted.filter((i) => !i.read).length;

  const markAll = async () => {
    const keys = sorted.filter((i) => !i.read).map((i) => i.key);
    if (!keys.length) return;
    setBusy(true);
    try {
      await api.markNotificationsRead(keys);
      setItems((prev) => (prev || []).map((i) => ({ ...i, read: true })));
      toast({ kind: 'success', title: 'All messages marked as read' });
    } catch (e: any) {
      toast({ kind: 'error', title: 'Could not mark as read', body: e.message });
    } finally { setBusy(false); }
  };

  const open = (item: any) => {
    if (item.link) navigate(item.link);
  };

  return (
    <div className="msgs">
      <div className="msgs-head">
        <button type="button" className="msgs-mark" onClick={markAll} disabled={busy || unread === 0}>
          <span aria-hidden="true">✉</span> Mark All as Read
        </button>
        <div className="msgs-range">
          <span>{sorted.length ? `${(current - 1) * PAGE + 1}-${Math.min(current * PAGE, sorted.length)} of ${sorted.length}` : '0 of 0'}</span>
          <button type="button" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)}>‹</button>
          <button type="button" aria-label="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)}>›</button>
        </div>
      </div>

      <div className="msgs-list">
        {slice.map((item) => (
          <button key={item.key} type="button" className={'msgs-row' + (item.read ? ' read' : '')} onClick={() => open(item)} title={item.body}>
            <span className="msgs-ico" aria-hidden="true">{item.icon || '✉'}</span>
            <span className="msgs-title">{item.title}</span>
            <span className="msgs-date">{fmtDate(item.created_at)}</span>
          </button>
        ))}
        {items && !slice.length && <div className="msgs-empty">No messages.</div>}
        {!items && <div className="msgs-empty">Loading messages…</div>}
      </div>

      <div className="msgs-note">If there are more than 200 messages or if messages are older than 6 months, the oldest messages will be deleted.</div>
    </div>
  );
}
