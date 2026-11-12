import { useState } from 'react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/store';

export const REPORT_REASONS = ['Abusive chat', 'Collusion', 'Slow play', 'Chip dumping', 'Offensive nickname', 'Other'] as const;

type Props = {
  target: { id: number; nick: string };
  handId?: string | null;
  initialReason?: string;
  /** Prefilled details, e.g. the reported chat line. */
  initialDetail?: string;
  onClose: () => void;
};

/** Report a player from their profile or from a chat line (opens prefilled with the line). */
export function ReportPlayerModal({ target, handId, initialReason = 'Abusive chat', initialDetail = '', onClose }: Props) {
  const { toast } = useApp();
  const [reason, setReason] = useState(initialReason);
  const [detail, setDetail] = useState(initialDetail);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.reportPlayer(target.id, reason, detail, handId || undefined);
      toast({ kind: 'success', title: 'Report submitted', body: `Reported ${target.nick}` });
      onClose();
    } catch (e: any) {
      toast({ kind: 'error', title: 'Could not report', body: e?.message || 'Try again' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Report ${target.nick}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Report {target.nick}</h3></div>
        <div className="modal-body">
          <label className="admin-label">Reason</label>
          <select className="admin-select" style={{ width: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)}>
            {REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
          <label className="admin-label" style={{ marginTop: 10 }}>Details</label>
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={4} maxLength={500} placeholder="What happened?"
            style={{ width: '100%', background: '#121212', border: '1px solid #343434', borderRadius: 5, color: '#eee', padding: 10, fontFamily: 'inherit' }} />
          <p className="muted small">Reports are reviewed by the local administrator. False reports may be actioned.</p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-dark" onClick={onClose}>Cancel</button>
          <button className="btn btn-red" disabled={busy} onClick={submit}>Submit report</button>
        </div>
      </div>
    </div>
  );
}
