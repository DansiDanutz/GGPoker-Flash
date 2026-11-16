import React, { useEffect, useState } from 'react';
import { api, money } from '../../lib/api';

export function CashInsurancePanel({ tableId, offer, revision, ruleRevision, userId }: { tableId: string; offer: any; revision: number; ruleRevision: number; userId: number }) {
  const [coverage, setCoverage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (offer?.coverageMax) setCoverage(offer.coverageMax); setError(''); }, [offer?.handId, offer?.coverageMax]);
  if (!offer || offer.underdogId !== userId) return null;

  const command = async (fn: () => Promise<any>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await fn(); } catch (reason: any) { setError(reason.message || 'Insurance command failed'); } finally { setBusy(false); }
  };
  const quote = () => command(() => api.cashInsuranceQuote(tableId, { handId: offer.handId, expectedRevision: revision, ruleRevision, operationId: crypto.randomUUID(), coverage }));
  const decide = (decision: 'accept' | 'decline') => command(() => api.cashInsuranceDecision(tableId, { handId: offer.handId, quoteId: offer.quoteId, expectedRevision: offer.revision, operationId: crypto.randomUUID(), decision }));

  return (
    <section className="cash-insurance-panel" aria-labelledby="cash-insurance-title">
      <h3 id="cash-insurance-title">All-in insurance</h3>
      {offer.status === 'awaiting-quote' && <>
        <p>Exact runout equity is used for your underdog quote. Coverage cannot exceed {money(offer.coverageMax)}.</p>
        <div className="cash-insurance-quote-row">
          <label>Coverage <input type="number" min={1} max={offer.coverageMax} step={1} value={coverage} onChange={(event) => setCoverage(Number(event.target.value))} /></label>
          <button type="button" disabled={busy || coverage < 1 || coverage > offer.coverageMax} onClick={quote}>{busy ? 'Quoting…' : 'Get quote'}</button>
        </div>
      </>}
      {offer.status === 'open' && <>
        <p><b>{money(offer.premium)}</b> premium for <b>{money(offer.payout)}</b> coverage · {(offer.winProbabilityNumerator / 10000).toFixed(2)}% win probability · quote expires {new Date(offer.expiresAt).toLocaleTimeString()}</p>
        <div className="cash-insurance-quote-row">
          <button type="button" disabled={busy} onClick={() => decide('accept')}>Accept insurance</button>
          <button type="button" disabled={busy} onClick={() => decide('decline')}>Decline</button>
        </div>
      </>}
      {offer.status === 'accepted' && <p role="status">Insurance active. {money(offer.payout)} is reserved for this runout.</p>}
      {offer.status === 'declined' && <p role="status">Insurance declined. Ordinary runout continues.</p>}
      {offer.status === 'expired' && <p role="status">Quote expired. Ordinary runout continues.</p>}
      {offer.status === 'settled' && <p role="status">{offer.insuredWon ? `You won or tied. The ${money(offer.payout)} hold was released.` : `${money(offer.payout)} insurance was paid.`}</p>}
      {error && <p className="cash-insurance-error" role="alert">{error}</p>}
    </section>
  );
}
