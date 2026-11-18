import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { usePref } from '../lib/usePref';
import { readSqueeze3D, selectSqueeze3D, squeezePreferenceKey, squeezePluginApi, type SqueezeAccount, type SqueezePlan } from '../lib/squeeze-plugin-api';

export function SqueezePlugin() {
  const { user, navigate } = useApp();
  const [account, setAccount] = useState<SqueezeAccount | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const pendingKey = `openpoker.squeeze3d-purchase:${user?.id ?? 'guest'}`;
  const pending = useRef<{ plan: SqueezePlan; key: string } | null>((() => {
    try { const saved = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
      return saved && ['monthly', 'lifetime'].includes(saved.plan) && typeof saved.key === 'string' ? saved : null;
    } catch { return null; }
  })());
  const inFlight = useRef(false);
  const enabled = usePref(() => readSqueeze3D(user?.id), [squeezePreferenceKey(user?.id)]);
  useEffect(() => {
    let cancelled = false;
    setAccount(null);
    if (user) squeezePluginApi.account().then(data => { if (!cancelled) setAccount(data); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [user?.id, reload]);
  function select(enabled: boolean) {
    try { selectSqueeze3D(user?.id, enabled); setError(''); return true; }
    catch { setError('Your browser could not save the card inspection choice.'); return false; }
  }
  async function purchase(plan: SqueezePlan) {
    if (inFlight.current || !account?.purchases_enabled || !user) return;
    if (pending.current && pending.current.plan !== plan) { setError('Retry the pending purchase first so its result can be reconciled.'); return; }
    const price = plan === 'monthly' ? account.product.prices.monthly_cents : account.product.prices.lifetime_cents;
    if (!window.confirm(pending.current ? 'Check the previous purchase using the same transaction reference? A completed purchase will not be charged again.' : `Spend $${(price / 100).toFixed(2)} in service credits for ${plan === 'monthly' ? 'one calendar month' : 'lifetime access'} to 3D Card Squeeze? No automatic renewal.`)) return;
    pending.current ??= { plan, key: crypto.randomUUID() };
    try { sessionStorage.setItem(pendingKey, JSON.stringify(pending.current)); }
    catch { setError('Enable browser storage before purchasing so retries can be reconciled safely.'); return; }
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const next = await squeezePluginApi.purchase(plan, pending.current.key);
      setAccount(next); pending.current = null;
      try { sessionStorage.removeItem(pendingKey); } catch { /* A retained key safely replays the confirmed purchase. */ }
      const selected = select(true);
      setNotice(selected ? '3D Card Squeeze purchased and selected. You can switch back to the free default at any time.' : '3D Card Squeeze purchased. Select it after enabling browser storage.');
    } catch (e) {
      // Keep the key through auth, policy and network failures after a possibly accepted request.
      if (e && typeof e === 'object' && 'status' in e && [400, 402].includes(Number(e.status))) {
        pending.current = null;
        try { sessionStorage.removeItem(pendingKey); } catch { /* Retrying a rejected operation is safe. */ }
      }
      setError(e instanceof Error ? e.message : 'Purchase failed. Retry to check the same purchase without a second charge.');
    }
    finally { inFlight.current = false; setBusy(false); }
  }
  const lifetime = account?.entitlement.active && account.entitlement.plan === 'lifetime';
  return <section id="squeeze-3d-plugin" className="mp-section mp-container" aria-label="Card inspection plugin">
    <div className="mp-section-heading"><div><span className="mp-eyebrow">INCLUDED OR EXTRA — YOUR CHOICE</span><h2>Card inspection</h2></div><p>Cosmetic only. Your cards, decisions, odds and payouts stay the same.</p></div>
    <div className="mp-account-grid">
      <article><h3>Default card inspection</h3><strong>Always free</strong><p>Reveal and inspect your cards using the standard 2D renderer in cash games and tournaments. No purchase required.</p><button type="button" className="mp-button mp-button-secondary" aria-pressed={!enabled} onClick={() => select(false)}>Use free default</button></article>
      <article><h3>3D Card Squeeze</h3><strong>$1 / month or $10 lifetime</strong><p>Peel two overlapping cards with a curved surface, attached card faces, lighting and shadows. Available for two-card hands in cash games and tournaments. Unsupported devices automatically use the free renderer.</p><p>Free previews in Play Money. Cash Chip tables require active access for your player account. Purchasing is optional and does not grant an advantage.</p>
        {user ? <>
          <p role="status">{account ? account.entitlement.active ? lifetime ? 'Lifetime access active' : `Access active until ${new Date(account.entitlement.expires_at!).toLocaleString()}` : 'No active paid access — Play Money preview available' : 'Loading access…'}</p>
          {account && <p>Service credits: ${(account.service_credit_balance_cents / 100).toFixed(2)}. Cash Chips are never charged.</p>}
          <button type="button" className="mp-button mp-button-secondary" aria-pressed={enabled} onClick={() => select(true)}>{account?.entitlement.active ? 'Use 3D squeeze' : 'Enable free Play Money preview'}</button>{' '}
          <button type="button" className="mp-button mp-button-secondary" onClick={() => { select(true); navigate('/'); }}>Try in Play Money</button>
          {(!lifetime || pending.current) && <p><button type="button" className="mp-button mp-button-primary" disabled={!account?.purchases_enabled || busy || (pending.current !== null && pending.current.plan !== 'monthly')} onClick={() => void purchase('monthly')}>{busy ? 'Processing…' : account?.entitlement.active ? 'Renew one month — $1' : 'Buy one month — $1'}</button>{' '}<button type="button" className="mp-button mp-button-secondary" disabled={!account?.purchases_enabled || busy || (pending.current !== null && pending.current.plan !== 'lifetime')} onClick={() => void purchase('lifetime')}>{pending.current?.plan === 'lifetime' ? 'Confirm lifetime purchase' : 'Buy lifetime — $10'}</button></p>}
          {account && !account.purchases_enabled && <p>Paid purchases are disabled on this installation. Free previews remain available.</p>}
          {pending.current && <p>A purchase needs confirmation. Retry the same plan to reconcile it without another charge.</p>}
          <p>Pay with service credits. Monthly access renews manually; there are no automatic charges. Lifetime access has no scheduled expiry on this installation. Switching to the default does not refund a purchase. Upgrade to lifetime costs $10 with no prorated refund.</p>
        </> : <button className="mp-button mp-button-primary" onClick={() => navigate('/login')}>Sign in to preview or buy</button>}
      </article>
    </div>
    {notice && <p className="mp-notice mp-notice-success" role="status">{notice}</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => { setError(''); setReload(x => x + 1); }}>Refresh access</button></div>}
  </section>;
}
