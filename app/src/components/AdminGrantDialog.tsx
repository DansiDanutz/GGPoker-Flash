import { useState } from 'react';
import { api, money, type User } from '../lib/api';
import { GRANT_REASON_MAX, grantReasonError, normalizeGrantReason } from '../lib/grantReason';

interface AdminGrantDialogProps {
  user: User;
  amount: number;
  onDone: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

/**
 * Owner credit/debit with a required reason. The idempotency key is made once when the
 * dialog opens, so a retried or double-clicked submit can never apply the grant twice.
 */
export function AdminGrantDialog({ user, amount, onDone, onCancel, onError }: AdminGrantDialogProps) {
  const [reference] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const error = grantReasonError(reason);

  const submit = async () => {
    setTouched(true);
    if (error || busy) return;
    setBusy(true);
    try {
      await api.admin.userAction(user.id, { action: 'credit', amount, reason: normalizeGrantReason(reason), reference });
      onDone();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Grant failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{amount > 0 ? 'Credit' : 'Debit'} {money(Math.abs(amount))} · {user.nick}</h3></div>
        <div className="modal-body">
          <label className="muted small" htmlFor="grant-reason">Reason (required, recorded in the ledger and audit log)</label>
          <textarea id="grant-reason" className="admin-input" rows={3} maxLength={GRANT_REASON_MAX + 20}
            style={{ width: '100%', marginTop: 6 }} value={reason} autoFocus
            onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} />
          <div className="between small" style={{ marginTop: 4 }}>
            <span style={{ color: '#e08a8a' }} role="alert">{touched && error ? error : ''}</span>
            <span className="muted">{normalizeGrantReason(reason).length}/{GRANT_REASON_MAX}</span>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-dark" onClick={onCancel}>Cancel</button>
          <button className="btn btn-red" disabled={busy || (touched && !!error)} onClick={submit}>{busy ? 'Saving…' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}
