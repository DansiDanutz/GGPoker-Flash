import { useCallback, useEffect, useRef, useState } from 'react';
import { fundingCheckout, organizerFundingApi, sessionCreditApi, type SessionCredit, type FundingRequest } from '../lib/organizer-funding-api';
import { cashChips } from '../lib/organizer-chips-api';

const status = { requested: 'Awaiting organizer', offered: 'Awaiting payment', credited: 'Chips transferred', paid: 'Paid · chips delivered', rejected: 'Declined' };
const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export function OrganizerFunding({ userId, organizerId, active = true, canRequest = true, onChange }: { userId: number; organizerId?: number; active?: boolean; canRequest?: boolean; onChange?: () => Promise<void> }) {
  const [sessions, setSessions] = useState<SessionCredit[]>([]);
  const [rows, setRows] = useState<FundingRequest[]>([]), [enabled, setEnabled] = useState(false);
  const [amount, setAmount] = useState('20000'), [prices, setPrices] = useState<Record<string, string>>({}), [receipts, setReceipts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const inFlight = useRef(false), keys = useRef(new Map<string, string>());
  const load = useCallback(async () => {
    const [data, credit] = await Promise.all([organizerFundingApi.list(), sessionCreditApi.list()]); setRows(data.requests); setSessions(credit.sessions); setEnabled(data.enabled && credit.enabled);
  }, []);
  useEffect(() => { if (active) void load().catch(e => setError(e.message)); }, [active, load]);
  const run = async (work: () => Promise<unknown>, message: string) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try { if (await work() === false) return; await load(); await onChange?.(); setNotice(message); }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
      // A provider timeout can happen after chips were reserved; show the recoverable state.
      try { await load(); await onChange?.(); } catch { /* Preserve the original action error. */ }
    }
    finally { inFlight.current = false; setBusy(false); }
  };
  const send = () => run(async () => {
    const quantity = Number(amount);
    if (!organizerId || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Enter a positive whole number of Cash Chips.');
    const identity = `${organizerId}:${quantity}`;
    const key = keys.current.get(identity) || crypto.randomUUID(); keys.current.set(identity, key);
    await organizerFundingApi.create(organizerId, quantity, key); keys.current.delete(identity);
  }, 'Request sent. Your organizer can transfer chips or offer a payment link.');
  const offer = (row: FundingRequest, session = false) => run(async () => {
    const value = prices[row.id] ?? (row.feeCents == null ? '' : (row.feeCents / 100).toFixed(2));
    if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter a USD price with up to two decimal places.');
    const feeCents = Math.round(Number(value) * 100);
    if (feeCents < 1 || feeCents > 100000) throw new Error('Price must be between $0.01 and $1,000.');
    if (session) {
      if (!window.confirm(`Offer ${cashChips(row.amount)} as session credit, with a maximum repayment of ${usd(feeCents)}? The player must accept before chips move. Only net used/lost chips are charged proportionally, rounded up to a cent.`)) return false;
      await sessionCreditApi.propose(row.id, feeCents); return;
    }
    if (!window.confirm(`Reserve ${cashChips(row.amount)} from your stack and offer them for ${usd(feeCents)}? The price is fixed once offered.`)) return false;
    await organizerFundingApi.act(row.id, 'offer', { feeCents });
  }, session ? 'Session terms sent. Waiting for player acceptance.' : 'Payment offer ready. Chips remain reserved until payment is verified.');
  const visible = organizerId ? rows.filter(row => row.organizerId === organizerId) : rows.filter(row => row.organizerId === userId);
  return <section className="mp-account-panel funding-panel" aria-label="Cash Chip requests">
    <div className="mp-section-heading"><div><span className="mp-eyebrow">PLAY WITH YOUR ORGANIZER</span><h3>{organizerId ? 'Request Cash Chips' : 'Player chip requests'}</h3></div><button type="button" className="mp-button mp-button-secondary" disabled={busy} onClick={() => void run(load, 'Requests refreshed.')}>Refresh requests</button></div>
    <p>{organizerId ? 'Ask for the chips you want to play with. Your organizer can approve a transfer from their own stack offer agreed session credit, or send a priced NervixPay checkout.' : 'Review player requests. Transfer chips from your stack, offer session credit, or choose a USD price and prepare a NervixPay payment link.'}</p>
    <p>Chips work only in this organizer’s games. A direct approval is a chip transfer; it does not create a loan or automatic charge.</p>
    {!enabled && <p>Cash Chip requests are unavailable on this installation.</p>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {organizerId && organizerId !== userId && canRequest && <form onSubmit={e => { e.preventDefault(); void send(); }}>
      <label>Cash Chips requested<input className="admin-input" type="number" min="1" max="9000000000" step="1" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <button className="mp-button mp-button-primary" disabled={!enabled || busy}>Send chip request</button>
    </form>}
    {!visible.length ? <p>No requests yet.</p> : <ul className="mp-account-list">{visible.map(row => {
      const owner = row.organizerId === userId, checkout = fundingCheckout(row);
      const proposed = sessions.some(session => session.fundingRequestId === row.id && session.state !== 'declined');
      return <li key={row.id}>
        <div className="mp-account-row"><strong>{cashChips(row.amount)}</strong><span>{row.state === 'offered' && row.checkoutDisabled ? 'Checkout disabled · chips reserved' : row.state === 'offered' && !checkout ? 'Payment link pending' : status[row.state]}</span></div>
        <p>{owner ? `Player: ${row.userName || `#${row.userId}`}` : `Organizer: ${row.organizerName || `#${row.organizerId}`}`} · {row.feeCents != null ? usd(row.feeCents) : 'No payment price set'}</p>
        {owner && row.state === 'requested' && !proposed && <div className="ow-actions">
          <button className="mp-button mp-button-primary" disabled={!enabled || busy} onClick={() => { if (window.confirm(`Transfer ${cashChips(row.amount)} from your stack to player #${row.userId}? No payment will be collected.`)) void run(() => organizerFundingApi.act(row.id, 'credit'), 'Chips transferred once.'); }}>Credit from my stack</button>
          <button className="mp-button mp-button-secondary" disabled={!enabled || busy} onClick={() => void run(() => organizerFundingApi.act(row.id, 'reject'), 'Request declined.')}>Decline</button>
        </div>}
        {owner && !proposed && (row.state === 'requested' || (row.state === 'offered' && !checkout && !row.checkoutDisabled)) && <form onSubmit={e => { e.preventDefault(); void offer(row); }}>
          <label>Price in USD (full requested amount)<input className="admin-input" type="text" inputMode="decimal" required readOnly={row.feeCents != null} value={prices[row.id] ?? (row.feeCents == null ? '' : (row.feeCents / 100).toFixed(2))} onChange={e => setPrices({ ...prices, [row.id]: e.target.value })} /></label>
          <p>Uses your connected merchant. The checkout displays the payment QR code. Your chips stay reserved for the buyer until payment is verified.</p>
          <button className="mp-button mp-button-secondary" disabled={!enabled || busy}>{row.state === 'offered' ? 'Retry payment link' : 'Create payment link'}</button>
        {row.state === 'requested' && !sessions.some(session => session.fundingRequestId === row.id) && <button type="button" className="mp-button mp-button-secondary" disabled={!enabled || busy} onClick={() => void offer(row, true)}>Offer session credit</button>}
        </form>}
        {owner && row.state === 'offered' && !proposed && <div><p>{row.checkoutDisabled ? 'An earlier payment may still arrive. Check again to see whether it settled.' : 'Closing checkout permanently stops new orders. If nobody started an order, your chips return to your stack. Otherwise they stay reserved until payment is verified.'}</p><button className="mp-button mp-button-secondary" disabled={!enabled || busy} onClick={() => void run(() => organizerFundingApi.act(row.id, 'cancel'), 'Request updated.')}>{row.checkoutDisabled ? 'Check payment status' : 'Close checkout'}</button></div>}
        {row.state === 'offered' && checkout && <>
          {!row.checkoutDisabled && <><a className="mp-button mp-button-primary" href={checkout} target="_blank" rel="noopener noreferrer">Open NervixPay QR checkout</a>
          <p>Pay the exact asset and amount shown at checkout. Returning here does not confirm payment. Chips are released only once after verification.</p></>}
          <form onSubmit={e => { e.preventDefault(); void run(() => organizerFundingApi.act(row.id, 'verify', { paymentId: receipts[row.id]?.trim() }), 'Payment verified; chips delivered once.'); }}>
            <label>NervixPay payment ID<input className="admin-input" required value={receipts[row.id] || ''} onChange={e => setReceipts({ ...receipts, [row.id]: e.target.value })} placeholder="Payment UUID from your receipt" /></label>
            <button className="mp-button mp-button-secondary" disabled={!enabled || busy}>Verify payment &amp; release chips</button>
          </form>
        </>}
      </li>;
    })}</ul>}
    <section className="session-credit-panel" aria-label="Session credit">
      <h3>Session credit · pay only for chips used</h3>
      <p>Accept the price before play. Begin with no Cash Chips or chips committed elsewhere with this organizer. During the session, chips may only enter and leave cash tables; transfers, cash-outs and tickets are locked.</p>
      <p>Leave every table before ending the session. Unused chips return to the organizer, winnings above the loan stay yours. The payment is the agreed full price × chips used/lost ÷ chips lent, rounded up to the next cent. No loss means no payment.</p>
      <ul className="mp-account-list">{sessions.filter(row => organizerId ? row.organizerId === organizerId : row.organizerId === userId).map(row => {
        const player = row.userId === userId, checkout = fundingCheckout(row);
        const labels = { proposed: 'Awaiting player acceptance', active: 'Session active', awaiting_payment: 'Session ended · payment due', paid: 'Session settled', declined: 'Session offer declined' };
        return <li key={row.id}>
          <strong>{cashChips(row.amount)} · {labels[row.state]}</strong>
          <p>{player ? `Organizer #${row.organizerId}` : `Player #${row.userId}`} · Maximum payment {usd(row.feeCents)}</p>
          {row.state === 'proposed' && <div className="ow-actions">
            {player && <button className="mp-button mp-button-primary" disabled={!enabled || busy} onClick={() => { if (window.confirm(`Accept ${cashChips(row.amount)} session credit? You owe only net used/lost chips at ${usd(row.feeCents)} for the full amount, rounded up to cents. Transfers, cash-outs and tickets are locked until the session ends.`)) void run(() => sessionCreditApi.act(row.id, 'accept'), 'Session credit accepted; chips transferred once.'); }}>Accept session terms</button>}
            <button className="mp-button mp-button-secondary" disabled={!enabled || busy} onClick={() => void run(() => sessionCreditApi.act(row.id, 'decline'), 'Session offer declined.')}>Decline session offer</button>
          </div>}
          {row.state === 'active' && <button className="mp-button mp-button-primary" disabled={!enabled || busy} onClick={() => { if (window.confirm('End this session and return unused chips? All cash table seats must be closed first. The agreed payment will be calculated once.')) void run(() => sessionCreditApi.act(row.id, 'finish'), 'Session ended. Unused chips returned and payment calculated.'); }}>End session &amp; return unused chips</button>}
          {row.usedChips != null && <p>Returned: {cashChips(row.returnedChips || 0)} · Used/lost: {cashChips(row.usedChips)} · Payment: {usd(row.dueCents || 0)}</p>}
          {row.state === 'awaiting_payment' && <>
            {!checkout ? <button className="mp-button mp-button-primary" disabled={!enabled || busy} onClick={() => void run(() => sessionCreditApi.act(row.id, 'link'), 'Session payment link prepared.')}>Prepare session payment link</button> : <>
              <a className="mp-button mp-button-primary" href={checkout} target="_blank" rel="noopener noreferrer">Pay session settlement</a>
              <p>This pays the existing session balance. It does not buy or grant more chips.</p>
              <form onSubmit={e => { e.preventDefault(); void run(() => sessionCreditApi.act(row.id, 'verify', { paymentId: receipts[row.id]?.trim() }), 'Session payment verified once.'); }}>
                <label>NervixPay payment ID<input className="admin-input" required value={receipts[row.id] || ''} onChange={e => setReceipts({ ...receipts, [row.id]: e.target.value })} /></label>
                <button className="mp-button mp-button-secondary" disabled={!enabled || busy}>Verify session payment</button>
              </form>
            </>}
          </>}
        </li>;
      })}</ul>
    </section>
  </section>;
}
