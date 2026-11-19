import { useEffect, useRef, useState } from 'react';
import { getToken } from '../lib/api';
import { useApp } from '../lib/store';
import { cashChips } from '../lib/organizer-chips-api';

type Offer = { organizerId: number; organizerName: string; priceCashChips: number };
type Purchase = Offer & { id: string; userId: number; userName: string; quantity: number; totalCashChips: number; state: 'requested' | 'approved' | 'rejected' | 'cancelled' };
export type DiamondAccount = { enabled: boolean; balances: Array<{ organizerId: number; organizerName: string; balance: number }>; requests: Purchase[] };
async function request<T>(path = '', body?: object): Promise<T> {
  const response = await fetch('/api/marketplace/diamonds' + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${getToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The Diamond request could not be completed.');
  return data;
}
export const loadDiamondAccount = () => request<DiamondAccount>('/me');

export function Diamonds({ management = false }: { management?: boolean }) {
  const { user, navigate } = useApp();
  const [catalog, setCatalog] = useState<{ enabled: boolean; issuanceCostCashChips: number; offers: Offer[] } | null>(null);
  const [account, setAccount] = useState<DiamondAccount | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [price, setPrice] = useState('10000'), [quantity, setQuantity] = useState('1'), [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false), pending = useRef<{ payload: string; key: string } | null>(null);
  const load = async () => {
    const [nextCatalog, nextAccount] = await Promise.all([request<NonNullable<typeof catalog>>(), user && !user.is_guest ? loadDiamondAccount() : Promise.resolve(null)]);
    setCatalog(nextCatalog); setAccount(nextAccount);
    const ownOffer = nextCatalog.offers.find(item => item.organizerId === user?.id);
    if (ownOffer) setPrice(String(ownOffer.priceCashChips));
  };
  useEffect(() => { void load().catch(e => setError(e.message)); }, [user?.id]);
  const run = async (work: () => Promise<unknown>, success: string) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); setNotice(success); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { working.current = false; setBusy(false); }
  };
  const offer = catalog?.offers.find(item => String(item.organizerId) === selected);
  const count = Number(quantity), total = count * (offer?.priceCashChips || 0);
  const valid = !!offer && Number.isSafeInteger(count) && count > 0 && count <= 10000 && Number.isSafeInteger(total) && total <= 9_000_000_000;
  const records = account?.requests.filter(item => management ? item.organizerId === user?.id : item.userId === user?.id) || [];
  return <section className="ow-card diamond-workspace" aria-label={management ? 'Diamond management' : 'Diamond Marketplace'}>
    <span className="mp-eyebrow">DIAMONDS · MANUAL ORGANIZER APPROVAL</span><h3>{management ? 'Set your Diamond offer' : 'Request Diamonds from your organizer'}</h3>
    <p>Diamonds are separate from Play Money and Cash Chips. Cross-organizer tournaments, trading and prize redemption are not available yet.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!catalog ? <button className="mp-button mp-button-secondary" disabled={busy} onClick={() => void run(load, '')}>Load Diamonds</button> : !catalog.enabled ? <p>Diamond issuance is not enabled on this installation.</p> : !user || user.is_guest ? <button className="mp-button mp-button-primary" onClick={() => navigate('/login')}>Sign in to manage Diamonds</button> : <>
      {management ? <form onSubmit={e => { e.preventDefault(); void run(() => request('/offers', { priceCashChips: Number(price) }), 'Your Diamond price is saved. Existing requests keep their agreed price.'); }}>
        <p>Each approved Diamond burns {cashChips(catalog.issuanceCostCashChips)} from your own wallet. That is the fixed $1 platform supply cost. You then receive the player’s agreed Cash Chip price. There is no 50/50 revenue split.</p>
        <label>Your player price per Diamond, in Cash Chips<input className="admin-input" type="number" inputMode="numeric" min="1" max="9000000000" step="1" required value={price} onChange={e => setPrice(e.target.value)} /></label>
        <button className="mp-button mp-button-primary" disabled={busy}>Save Diamond price</button>
      </form> : <form onSubmit={e => {
        e.preventDefault(); if (!valid || !offer) return;
        const payload = JSON.stringify({ organizerId: offer.organizerId, quantity: count, priceCashChips: offer.priceCashChips });
        if (pending.current?.payload !== payload) pending.current = { payload, key: crypto.randomUUID() };
        const key = pending.current.key;
        void run(async () => { await request('/requests', { ...JSON.parse(payload), key }); pending.current = null; }, 'Request sent. Your organizer must approve it before chips move.');
      }}>
        <label>Your organizer<select className="admin-input" required value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose an organizer</option>{catalog.offers.filter(item => item.organizerId !== user.id).map(item => <option key={item.organizerId} value={item.organizerId}>{item.organizerName} · {cashChips(item.priceCashChips)} each</option>)}</select></label>
        {!catalog.offers.length && <p>No organizer has published a Diamond price yet.</p>}
        <label>Number of Diamonds<input className="admin-input" type="number" inputMode="numeric" min="1" max="10000" step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
        <p>{valid ? `Total: ${cashChips(total)} in ${offer.organizerName}’s economy.` : 'Choose an organizer and a whole number of Diamonds.'} You must be an approved club member. Chips are checked and transferred only when the organizer approves; keep enough available.</p>
        <button className="mp-button mp-button-primary" disabled={busy || !valid}>Request organizer approval</button>
      </form>}
      <h4>{management ? 'Player purchase requests' : 'Your purchase requests'}</h4>
      {!records.length && <p>No Diamond requests yet.</p>}
      {records.map(item => <article className="diamond-request" key={item.id}>
        <strong>{management ? item.userName : item.organizerName} · {item.quantity} Diamonds</strong><p>{cashChips(item.totalCashChips)} · {item.state}</p>
        {item.state === 'requested' && <div className="ow-actions">{(management ? ['approve', 'reject'] : ['cancel']).map(action => <button className="mp-button mp-button-secondary" key={action} disabled={busy} onClick={() => {
          if (action === 'approve' && !window.confirm(`Issue ${item.quantity} Diamonds to ${item.userName}? Burn ${cashChips(item.quantity * catalog.issuanceCostCashChips)} from your wallet and receive ${cashChips(item.totalCashChips)} from the player.`)) return;
          void run(() => request(`/requests/${encodeURIComponent(item.id)}/${action}`, {}), action === 'approve' ? 'Approved. Diamonds and Cash Chips settled once.' : 'Request updated. No chips moved.');
        }}>{action === 'approve' ? 'Approve & issue' : action === 'reject' ? 'Reject' : 'Cancel request'}</button>)}</div>}
      </article>)}
      <button className="mp-button mp-button-secondary" disabled={busy} onClick={() => void run(load, '')}>Refresh Diamonds</button>
    </>}
  </section>;
}
