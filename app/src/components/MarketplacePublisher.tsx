import { FormEvent, useEffect, useRef, useState } from 'react';
import { marketplaceApi, type PublisherAccount } from '../lib/marketplace-api';
import '../management-plugins.css';

const dollars = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const statusLabels = { pending: 'Account under review', approved: 'Approved publisher', suspended: 'Sales suspended', rejected: 'Account rejected' };

export function MarketplacePublisher({ userId, onLogin }: { userId?: number; onLogin: () => void }) {
  const [account, setAccount] = useState<PublisherAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const [form, setForm] = useState({ displayName: '', kind: 'individual' as 'individual' | 'company', nervixpayMerchantId: '' });

  useEffect(() => {
    let cancelled = false;
    setAccount(null); setError(''); setNotice(''); setBusy(false); busyRef.current = false;
    setForm({ displayName: '', kind: 'individual', nervixpayMerchantId: '' });
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    marketplaceApi.publisher().then((value) => { if (!cancelled) setAccount(value); })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'The publisher profile could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, retry]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId || busyRef.current) return;
    const submittedBy = userId;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await marketplaceApi.registerPublisher({ ...form, displayName: form.displayName.trim(), nervixpayMerchantId: form.nervixpayMerchantId.trim() });
      if (currentUser.current !== submittedBy) return;
      setAccount({ publisher: result.publisher, balance: null, submission_enabled: false, checkout_enabled: false });
      setForm({ displayName: '', kind: 'individual', nervixpayMerchantId: '' });
      setNotice('Your publisher profile was registered for review.');
      const refreshed = await marketplaceApi.publisher();
      if (currentUser.current === submittedBy) setAccount(refreshed);
    } catch (failure: unknown) {
      if (currentUser.current === submittedBy) setError(failure instanceof Error ? failure.message : 'The profile could not be registered.');
    } finally { if (currentUser.current === submittedBy) { busyRef.current = false; setBusy(false); } }
  };

  return <section className="mg-publisher" aria-labelledby="marketplace-publisher-title">
    <div className="mg-publisher-copy"><span className="mg-eyebrow">BUILD FOR THE COMMUNITY</span><h2 id="marketplace-publisher-title">Become a plugin publisher.</h2><p>Individuals and companies can register a publisher profile with a NervixPay merchant account, then track review status and commission credits here.</p><ol><li><b>01</b><span>Register your publisher profile and merchant account.</span></li><li><b>02</b><span>The team reviews the publisher and the offer.</span></li><li><b>03</b><span>Credits cover the 20% platform commission on eligible orders.</span></li></ol><p className="mg-publisher-limit">Build and test free in Play Money, then submit the verified PR from Contributor. Registration does not publish a plugin or guarantee approval or earnings. New listings use quote and manual access until a paid offer and settlement are configured.</p></div>
    <div className="mg-publisher-account">
      {!userId ? <><h3>Your publisher profile</h3><p>Sign in to register an individual or company profile. Contributing code to OpenPoker does not require a publisher account.</p><button type="button" className="mp-button mp-button-primary" onClick={onLogin}>Sign in</button></> : <>
        <div className="mg-heading"><h3>{account?.publisher ? 'My publisher account' : 'Register a publisher profile'}</h3><button type="button" className="mg-link" disabled={loading || busy} onClick={() => setRetry((value) => value + 1)}>Refresh</button></div>
        {error && <p className="mg-error" role="alert">{error}</p>}
        {notice && <p className="mg-publisher-notice" role="status">{notice}</p>}
        {loading ? <p role="status">Loading profile…</p> : account?.publisher ? <>
          <span className="mg-status">{statusLabels[account.publisher.status]}</span><h4>{account.publisher.display_name}</h4><p>{account.publisher.kind === 'company' ? 'Company' : 'Individual'} · NervixPay</p><p className="mg-publisher-merchant">Merchant ID <code>{account.publisher.nervixpay_merchant_id}</code></p>
          {account.balance ? <dl className="mg-publisher-balance"><div><dt>Available credits</dt><dd>{dollars(account.balance.available_cents)}</dd></div><div><dt>Reserved for orders</dt><dd>{dollars(account.balance.reserved_cents)}</dd></div><div><dt>Posted balance</dt><dd>{dollars(account.balance.posted_cents)}</dd></div></dl> : <p>The balance is available after the profile refreshes.</p>}
          {account.publisher.review_reason && <p className="mg-publisher-review"><strong>Team response</strong>{account.publisher.review_reason}</p>}
          <p className="mg-publisher-limit">Top-ups are posted after operator verification. Credits cover platform commission; they are not game chips or a withdrawable balance.</p>
        </> : account && <form onSubmit={submit}>
          <fieldset disabled={busy} className="mg-publisher-fields">
            <label><span>Publisher name</span><input required minLength={2} maxLength={120} autoComplete="organization" value={form.displayName} onChange={(event) => setForm((value) => ({ ...value, displayName: event.target.value }))} /></label>
            <label><span>Profile type</span><select value={form.kind} onChange={(event) => setForm((value) => ({ ...value, kind: event.target.value as 'individual' | 'company' }))}><option value="individual">Individual</option><option value="company">Company</option></select></label>
            <label><span>NervixPay merchant ID</span><input required maxLength={160} autoComplete="off" value={form.nervixpayMerchantId} onChange={(event) => setForm((value) => ({ ...value, nervixpayMerchantId: event.target.value }))} /><small>Enter the merchant identifier. Never enter passwords, API keys, or private keys.</small></label>
            <button type="submit" className="mp-button mp-button-primary">{busy ? 'Registering…' : 'Register profile'}</button>
          </fieldset>
        </form>}
      </>}
    </div>
  </section>;
}
