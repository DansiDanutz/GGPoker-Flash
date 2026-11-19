import { useCallback, useEffect, useRef, useState } from 'react';
import { cashChips, organizerChipsApi, type ChipAccount } from '../lib/organizer-chips-api';

const states = { requested: 'Awaiting organizer payment', reported: 'Organizer reports payment sent', paid: 'Cash-out completed', cancelled: 'Cancelled · chips returned', rejected: 'Declined · chips returned', disputed: 'Under review · chips reserved' };

export function OrganizerCashOut({ userId, organizerId, refreshKey = 0 }: { userId: number; organizerId: number; refreshKey?: number }) {
  const [data, setData] = useState<ChipAccount | null>(null);
  const [amount, setAmount] = useState(''), [usdt, setUsdt] = useState(''), [network, setNetwork] = useState(''), [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const inFlight = useRef(false), keys = useRef(new Map<string, string>());
  const load = useCallback(async () => setData(await organizerChipsApi.mine()), []);
  useEffect(() => { void load().catch(e => setError(e.message)); }, [load, refreshKey]);
  const run = async (action: () => Promise<unknown>, message: string, completed?: () => void) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); completed?.(); setNotice(message); }
    catch (e) { setError(e instanceof Error ? e.message : 'Cash-out request failed.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const balance = data?.balances.find(row => row.organizer_id === organizerId)?.balance || 0;
  const enabled = data?.mode === 'enforce';
  const submit = () => {
    const chips = Number(amount), paymentAmount = usdt.trim(), chain = network.trim(), address = wallet.trim();
    if (!Number.isSafeInteger(chips) || chips < 1 || chips > balance) { setError('Choose a whole number of chips within your available balance.'); return; }
    if (!/^\d+(\.\d{1,6})?$/.test(paymentAmount) || Number(paymentAmount) <= 0 || !chain || !address) { setError('Enter the requested USDT amount, network and receiving wallet.'); return; }
    const paymentDetails = `Network: ${chain}; Wallet: ${address}`;
    if (!window.confirm(`Reserve ${cashChips(chips)} and request ${paymentAmount} USDT on ${chain} to ${address}? The organizer must accept these terms and send the payment.`)) return;
    const signature = JSON.stringify([organizerId, chips, paymentAmount, paymentDetails]);
    const key = keys.current.get(signature) || crypto.randomUUID(); keys.current.set(signature, key);
    void run(() => organizerChipsApi.requestBuyback({ organizerId, amount: chips, paymentAmount, paymentCurrency: 'USDT', paymentDetails, key }), 'Cash-out requested. Your chips are reserved while the organizer reviews it.', () => { keys.current.delete(signature); setAmount(''); });
  };
  const rows = data?.buybacks.filter(row => row.organizer_id === organizerId && row.requester_id === userId && row.payment_currency === 'USDT') || [];
  return <section className="mp-account-panel cashout-panel" aria-label="USDT cash-out requests">
    <div className="mp-section-heading"><div><span className="mp-eyebrow">RETURN CHIPS TO YOUR ORGANIZER</span><h3>Request USDT cash-out</h3></div><button type="button" className="mp-button mp-button-secondary" disabled={busy} onClick={() => void run(load, 'Cash-outs refreshed.')}>Refresh cash-outs</button></div>
    <p><strong>{cashChips(balance)}</strong> available with this organizer. Chips currently at a table, in tickets or already reserved cannot be cashed out here.</p>
    <p>Request a USDT amount under your organizer’s exchange terms. The organizer can pay or decline. This is a request, not an automatic conversion or wallet withdrawal.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <form onSubmit={e => { e.preventDefault(); submit(); }}>
      <label>Cash Chips to return<input className="admin-input" name="chips" type="number" min="1" max={balance || 1} step="1" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label>USDT requested<input className="admin-input" name="usdt" inputMode="decimal" maxLength={30} required value={usdt} onChange={e => setUsdt(e.target.value)} placeholder="Amount agreed with your organizer" /></label>
      <label>USDT network<input className="admin-input" name="network" maxLength={80} required value={network} onChange={e => setNetwork(e.target.value)} placeholder="Network used by your receiving wallet" /></label>
      <label>Receiving wallet address<input className="admin-input" name="wallet" maxLength={256} required value={wallet} onChange={e => setWallet(e.target.value)} autoCapitalize="none" spellCheck={false} /></label>
      <button className="mp-button mp-button-primary" disabled={!enabled || busy || balance < 1}>Request USDT cash-out</button>
    </form>
    {data && !enabled && <p>Cash Chip cash-outs are unavailable on this installation.</p>}
    <ul className="mp-account-list">{rows.map(row => <li key={row.id}>
      <strong>{cashChips(row.chips)} → {row.payment_amount} {row.payment_currency}</strong><p>{row.state === 'requested' && row.processing_at ? 'Organizer accepted · payment in progress' : states[row.state]}</p>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.payment_details}</p>
      {row.state === 'requested' && !row.processing_at && <button className="mp-button mp-button-secondary" disabled={!enabled || busy} onClick={() => void run(() => organizerChipsApi.buyback(row.id, 'cancel'), 'Cash-out cancelled; chips returned.')}>Cancel cash-out</button>}
      {row.state === 'requested' && row.processing_at && <p>The organizer has accepted this cash-out. Cancellation is locked while payment is in progress. Contact your organizer if the details need correcting.</p>}
      {row.state === 'reported' && <>
        <p style={{ overflowWrap: 'anywhere' }}>Reported: {row.report_amount} {row.report_currency} · {row.report_network}<br />Payment reference: {row.receipt}<br />{row.report_details}</p>
        <p>Check that the USDT arrived in your wallet before confirming. Confirmation releases the reserved chips to the organizer.</p>
        <button className="mp-button mp-button-primary" disabled={!enabled || busy} onClick={() => { if (window.confirm(`Have you received ${row.report_amount} ${row.report_currency} on ${row.report_network}? This releases ${cashChips(row.chips)} to the organizer.`)) void run(() => organizerChipsApi.buyback(row.id, 'confirm'), 'USDT receipt confirmed. Cash-out completed.'); }}>Confirm USDT received</button>
        <p>Payment missing or incorrect? <a href="#/support">Contact support</a>. Your chips remain reserved during review.</p>
      </>}
    </li>)}</ul>
  </section>;
}
