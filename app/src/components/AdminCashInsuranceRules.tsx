import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';

export function AdminCashInsuranceRules() {
  const { toast } = useApp();
  const [fee, setFee] = useState(0);
  const [revision, setRevision] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const result = await api.admin.cashInsuranceRules();
      setFee(result.state.insuranceFeeBasisPoints);
      setRevision(result.state.ruleRevision);
      setError('');
    } catch (reason: any) { setError(reason.message); }
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.admin.saveCashInsuranceRules({ insuranceFeeBasisPoints: fee, expectedRevision: revision, operationId: crypto.randomUUID() });
      setRevision(result.state.ruleRevision);
      toast({ kind: 'success', title: 'Cash-insurance rules saved', body: `Revision ${result.state.ruleRevision} applies to new quotes.` });
    } catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  };
  return (
    <section className="admin-card" aria-labelledby="cash-insurance-rules-title">
      <h3 id="cash-insurance-rules-title">Cash all-in insurance</h3>
      <p className="muted small">Exact underdog equity determines the base premium. The fee is added to that base; no fee is charged by default.</p>
      <div className="admin-form">
        <div>
          <label className="admin-label" htmlFor="cash-insurance-fee">Insurance fee in basis points (0–10,000)</label>
          <input id="cash-insurance-fee" className="admin-input" type="number" min={0} max={10000} step={1} value={fee} onChange={(event) => setFee(Number(event.target.value))} />
        </div>
      </div>
      <p className="muted small">Rule revision {revision}. Existing immutable quotes keep their original terms.</p>
      {error && <p role="alert" style={{ color: '#ff9a9a' }}>{error}</p>}
      <button className="btn btn-red" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save insurance rules'}</button>
    </section>
  );
}
