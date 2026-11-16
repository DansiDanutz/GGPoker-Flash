import { FormEvent, useEffect, useRef, useState } from 'react';
import { marketplaceApi, type PublisherAccount } from '../lib/marketplace-api';
import '../management-plugins.css';

const dollars = (cents: number) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'USD' }).format(cents / 100);
const statusLabels = { pending: 'Cont în evaluare', approved: 'Editor aprobat', suspended: 'Vânzări suspendate', rejected: 'Cont respins' };

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
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Nu am putut încărca profilul comercial.'); })
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
      setNotice('Profilul tău comercial a fost înregistrat pentru evaluare.');
      const refreshed = await marketplaceApi.publisher();
      if (currentUser.current === submittedBy) setAccount(refreshed);
    } catch (failure: unknown) {
      if (currentUser.current === submittedBy) setError(failure instanceof Error ? failure.message : 'Profilul nu a putut fi înregistrat.');
    } finally { if (currentUser.current === submittedBy) { busyRef.current = false; setBusy(false); } }
  };

  return <section className="mg-publisher" aria-labelledby="marketplace-publisher-title">
    <div className="mg-publisher-copy"><span className="mg-eyebrow">CONSTRUIEȘTE PENTRU COMUNITATE</span><h2 id="marketplace-publisher-title">Devino editor de pluginuri.</h2><p>Persoanele și companiile își pot înregistra un profil comercial cu un cont NervixPay. Urmărești aprobarea și creditele de comision în propriul cont.</p><ol><li><b>01</b><span>Înregistrezi profilul și contul comerciantului.</span></li><li><b>02</b><span>Echipa verifică editorul și oferta.</span></li><li><b>03</b><span>Creditele acoperă comisionul de 20% pentru comenzile eligibile.</span></li></ol><p className="mg-publisher-limit">Încărcarea și evaluarea automată a pluginurilor sunt în pregătire. Înregistrarea unui profil nu publică o extensie și nu garantează aprobarea.</p></div>
    <div className="mg-publisher-account">
      {!userId ? <><h3>Profilul tău de editor</h3><p>Intră în cont pentru a înregistra un profil individual sau de companie. Contribuțiile la codul OpenPoker nu necesită un cont comercial.</p><button type="button" className="mp-button mp-button-primary" onClick={onLogin}>Intră în cont</button></> : <>
        <div className="mg-heading"><h3>{account?.publisher ? 'Contul meu comercial' : 'Înregistrează profilul'}</h3><button type="button" className="mg-link" disabled={loading || busy} onClick={() => setRetry((value) => value + 1)}>Actualizează</button></div>
        {error && <p className="mg-error" role="alert">{error}</p>}
        {notice && <p className="mg-publisher-notice" role="status">{notice}</p>}
        {loading ? <p role="status">Se încarcă profilul…</p> : account?.publisher ? <>
          <span className="mg-status">{statusLabels[account.publisher.status]}</span><h4>{account.publisher.display_name}</h4><p>{account.publisher.kind === 'company' ? 'Companie' : 'Persoană'} · NervixPay</p><p className="mg-publisher-merchant">Merchant ID <code>{account.publisher.nervixpay_merchant_id}</code></p>
          {account.balance ? <dl className="mg-publisher-balance"><div><dt>Credite disponibile</dt><dd>{dollars(account.balance.available_cents)}</dd></div><div><dt>Rezervate pentru comenzi</dt><dd>{dollars(account.balance.reserved_cents)}</dd></div><div><dt>Sold înregistrat</dt><dd>{dollars(account.balance.posted_cents)}</dd></div></dl> : <p>Soldul poate fi consultat după actualizarea profilului.</p>}
          {account.publisher.review_reason && <p className="mg-publisher-review"><strong>Răspunsul echipei</strong>{account.publisher.review_reason}</p>}
          <p className="mg-publisher-limit">Alimentările se înregistrează după verificare de către operator. Creditele sunt pentru comisionul platformei; nu sunt jetoane de joc și nu reprezintă un sold de retragere.</p>
        </> : account && <form onSubmit={submit}>
          <fieldset disabled={busy} className="mg-publisher-fields">
            <label><span>Numele editorului</span><input required minLength={2} maxLength={120} autoComplete="organization" value={form.displayName} onChange={(event) => setForm((value) => ({ ...value, displayName: event.target.value }))} /></label>
            <label><span>Tipul profilului</span><select value={form.kind} onChange={(event) => setForm((value) => ({ ...value, kind: event.target.value as 'individual' | 'company' }))}><option value="individual">Persoană</option><option value="company">Companie</option></select></label>
            <label><span>Merchant ID NervixPay</span><input required maxLength={160} autoComplete="off" value={form.nervixpayMerchantId} onChange={(event) => setForm((value) => ({ ...value, nervixpayMerchantId: event.target.value }))} /><small>Introdu identificatorul comerciantului. Nu introduce parole, chei API sau chei private.</small></label>
            <button type="submit" className="mp-button mp-button-primary">{busy ? 'Se înregistrează…' : 'Înregistrează profilul'}</button>
          </fieldset>
        </form>}
      </>}
    </div>
  </section>;
}
