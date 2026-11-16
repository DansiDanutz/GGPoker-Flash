import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { marketplaceCommerceApi, type CommerceAdminData, type CommerceOrder, type PaymentProof, type PublisherStatus } from '../lib/marketplace-commerce-api';
import { MANAGEMENT_PRODUCT_IDS, marketplacePrice, type MarketplaceProduct } from '../lib/marketplace-api';
import { organizerBillingApi } from '../lib/organizer-billing-api';
import '../marketplace-finance.css';

const dollars = (cents: number) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'USD' }).format(cents / 100);
const dates = (value: string) => new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const publisherLabels: Record<PublisherStatus, string> = { pending: 'În evaluare', approved: 'Aprobat', suspended: 'Suspendat', rejected: 'Respins' };
const orderLabels: Record<CommerceOrder['status'], string> = { awaiting_payment: 'Așteaptă plata', paid: 'Plătită', expired: 'Expirată', cancelled: 'Anulată', payment_review: 'Plată în verificare', refunded: 'Rambursată' };
const failureText = (failure: unknown) => failure instanceof Error ? failure.message : 'Operațiunea nu a reușit.';
const emptyProof: PaymentProof = { providerOrderId: '', merchantId: '', network: '', token: '', amountBaseUnits: '' };

function centsFromInput(value: string) {
  const clean = value.trim().replace(',', '.');
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(clean)) throw new Error('Introdu o sumă USD pozitivă, cu maximum două zecimale.');
  const [whole, fraction = ''] = clean.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents <= 0) throw new Error('Suma trebuie să fie mai mare decât zero.');
  return cents;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="mf-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function proofFromOrder(order: CommerceOrder): PaymentProof {
  const binding = order.payment_binding;
  return binding ? { providerOrderId: binding.provider_order_id, merchantId: binding.merchant_id, network: binding.network, token: binding.token, amountBaseUnits: binding.amount_base_units } : { ...emptyProof, merchantId: order.seller_merchant_id };
}

/** Records verified off-platform evidence; no action here sends or refunds funds. */
export function AdminMarketplaceFinance({ products, onDirtyChange, initialOrder }: {
  products: MarketplaceProduct[]; onDirtyChange?: (dirty: boolean) => void; initialOrder?: { buyerUserId: number; productId: string };
}) {
  const [data, setData] = useState<CommerceAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const [step, setStep] = useState<'publishers' | 'offers' | 'orders'>(initialOrder ? 'orders' : 'publishers');
  const [publisherId, setPublisherId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [publisherForm, setPublisherForm] = useState({ ownerUserId: '', displayName: '', kind: 'individual' as 'individual' | 'company', nervixpayMerchantId: '' });
  const [reviewStatus, setReviewStatus] = useState<Exclude<PublisherStatus, 'pending'>>('approved');
  const [reviewReason, setReviewReason] = useState('');
  const [credits, setCredits] = useState({ amount: '', reference: '', kind: 'confirmed_topup' as 'confirmed_topup' | 'adjustment', verified: false });
  const [organizerCredit, setOrganizerCredit] = useState({ userId: '', amount: '', reference: '', verified: false });
  const [offerProduct, setOfferProduct] = useState('');
  const [buyerId, setBuyerId] = useState(initialOrder ? String(initialOrder.buyerUserId) : '');
  const [orderProduct, setOrderProduct] = useState(initialOrder?.productId || '');
  const [orderKey, setOrderKey] = useState(() => crypto.randomUUID());
  const [proof, setProof] = useState<PaymentProof>(emptyProof);
  const [paymentId, setPaymentId] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const [refundReference, setRefundReference] = useState('');
  const [refundVerified, setRefundVerified] = useState(false);
  const publisher = data?.publishers.find((entry) => entry.id === publisherId);
  const selectedOrder = data?.orders.find((entry) => entry.id === orderId);
  const eligibleProducts = products.filter((product) => MANAGEMENT_PRODUCT_IDS.has(product.id) && product.status === 'available' && product.currency === 'USD' && ['one_time', 'monthly', 'yearly'].includes(product.pricing) && product.price_cents !== null && product.price_cents > 0);
  const saleProducts = eligibleProducts.filter((product) => data?.offers.some((offer) => offer.product_id === product.id && data.publishers.some((entry) => entry.id === offer.publisher_id && entry.status === 'approved')));
  const selectedProduct = products.find((product) => product.id === orderProduct);
  const productName = (id: string) => products.find((product) => product.id === id)?.name || id;
  const isDirty = Boolean(publisherForm.ownerUserId || publisherForm.displayName || publisherForm.nervixpayMerchantId || credits.amount || credits.reference || organizerCredit.userId || organizerCredit.amount || organizerCredit.reference || reviewReason || offerProduct || buyerId || paymentId || paidAt || releaseReason || refundReference || (selectedOrder && !selectedOrder.payment_binding && proof.providerOrderId));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await marketplaceCommerceApi.get();
      if (!mounted.current) return;
      setData(next);
      setPublisherId((current) => next.publishers.some((entry) => entry.id === current) ? current : next.publishers[0]?.id || '');
    } finally { if (mounted.current) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load().catch((failure) => { if (mounted.current) setError(failureText(failure)); });
    return () => { mounted.current = false; };
  }, [load]);
  useEffect(() => { onDirtyChange?.(isDirty || Boolean(busy)); return () => onDirtyChange?.(false); }, [isDirty, busy, onDirtyChange]);

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(key); setError(''); setNotice('');
    try {
      await action();
      if (!mounted.current) return;
      setNotice(success);
      try { await load(); }
      catch (failure) {
        if (mounted.current) setError(`Operațiunea a fost înregistrată, dar lista nu s-a actualizat. Apasă „Actualizează” pentru a verifica rezultatul. ${failureText(failure)}`);
      }
    } catch (failure) { if (mounted.current) setError(failureText(failure)); }
    finally { busyRef.current = false; if (mounted.current) setBusy(''); }
  };

  const selectOrder = (order: CommerceOrder) => {
    if (busyRef.current) return;
    if ((paymentId || paidAt || releaseReason || refundReference || (selectedOrder && !selectedOrder.payment_binding && proof.providerOrderId)) && !window.confirm('Renunți la datele de plată nesalvate pentru a deschide altă comandă?')) return;
    setOrderId(order.id); setProof(proofFromOrder(order)); setPaymentId(''); setPaidAt(''); setPaymentVerified(false); setReleaseReason(''); setRefundReference(''); setRefundVerified(false); setError(''); setNotice('');
  };
  const selectPublisher = (id: string) => {
    if (id === publisherId || busyRef.current) return;
    if ((credits.amount || credits.reference || reviewReason) && !window.confirm('Renunți la datele nesalvate pentru editorul selectat?')) return;
    setPublisherId(id); setCredits({ amount: '', reference: '', kind: 'confirmed_topup', verified: false }); setReviewReason(''); setReviewStatus('approved');
  };
  const createPublisher = (event: FormEvent) => {
    event.preventDefault();
    void run('publisher', async () => {
      await marketplaceCommerceApi.createPublisher({ ...publisherForm, ownerUserId: Number(publisherForm.ownerUserId) });
      setPublisherForm({ ownerUserId: '', displayName: '', kind: 'individual', nervixpayMerchantId: '' });
    }, 'Editorul a fost creat. Urmează evaluarea contului și asocierea ofertelor.');
  };
  const reserveOrder = (event: FormEvent) => {
    event.preventDefault();
    void run('order', async () => {
      const result = await marketplaceCommerceApi.reserveOrder({ buyerUserId: Number(buyerId), productId: orderProduct, idempotencyKey: orderKey });
      setOrderId(result.order.id); setProof(proofFromOrder(result.order));
      setPaymentId(''); setPaidAt(''); setPaymentVerified(false); setReleaseReason(''); setRefundReference(''); setRefundVerified(false);
      setBuyerId(''); setOrderProduct(''); setOrderKey(crypto.randomUUID());
    }, 'Comanda a fost rezervată. Comisionul este blocat în credite; plata cumpărătorului trebuie verificată înainte de activare.');
  };

  return <section className="mf-root" aria-label="Finanțe marketplace" aria-busy={Boolean(busy)}><fieldset className="mf-fieldset" disabled={Boolean(busy)}>
    <div className="mf-heading"><div><span className="ma-eyebrow">PLĂȚI ȘI ACTIVĂRI</span><h3>Controlul comercial</h3></div><button type="button" className="ma-button ma-button-secondary" disabled={loading || Boolean(busy)} onClick={() => void load().catch((failure) => setError(failureText(failure)))}>Actualizează</button></div>
    <p className="mf-intro">Înregistrează editorii, creditele de comision și comenzile verificate. În această etapă verifici plățile în NervixPay și înregistrezi rezultatul aici. Aceste operațiuni nu transferă bani și nu trimit rambursări.</p>
    <div className="mf-economics"><div><strong>100%</strong><span>din plata cumpărătorului ajunge direct la editor</span></div><div><strong>20%</strong><span>comision rezervat din creditele editorului</span></div><div><strong>Separat</strong><span>de jetoane, taxe NervixPay și soldurile jucătorilor</span></div></div>
    {error && <div className="ma-notice ma-notice-error" role="alert">{error}</div>}
    {notice && <div className="ma-notice ma-notice-success" role="status">{notice}</div>}
    <details className="mf-panel mf-organizer-credits"><summary>Credite pentru servicii de organizator</summary><p className="mf-help">Înregistrează numai finanțare USD verificată independent. Referința trebuie să fie chitanța unică a furnizorului. Formularul nu transferă bani și nu efectuează rambursări.</p><form onSubmit={(event) => { event.preventDefault(); void run('organizer-credit', async () => { if (!organizerCredit.verified) throw new Error('Confirmă verificarea independentă a finanțării.'); await organizerBillingApi.credit(Number(organizerCredit.userId), centsFromInput(organizerCredit.amount), organizerCredit.reference.trim()); setOrganizerCredit({ userId: '', amount: '', reference: '', verified: false }); }, 'Creditele de servicii ale organizatorului au fost înregistrate.'); }}>
      <div className="mf-form-grid"><Field label="ID utilizator"><input type="number" min={1} step={1} required value={organizerCredit.userId} onChange={(event) => setOrganizerCredit((value) => ({ ...value, userId: event.target.value, verified: false }))} /></Field><Field label="Suma verificată în USD"><input required inputMode="decimal" placeholder="100.00" value={organizerCredit.amount} onChange={(event) => setOrganizerCredit((value) => ({ ...value, amount: event.target.value, verified: false }))} /></Field></div>
      <Field label="Referința unică a chitanței furnizorului"><input required maxLength={160} value={organizerCredit.reference} onChange={(event) => setOrganizerCredit((value) => ({ ...value, reference: event.target.value, verified: false }))} /></Field>
      <label className="mf-check"><input type="checkbox" required checked={organizerCredit.verified} onChange={(event) => setOrganizerCredit((value) => ({ ...value, verified: event.target.checked }))} /><span>Am verificat independent finanțarea USD, utilizatorul, suma și chitanța furnizorului.</span></label><button className="ma-button ma-button-primary" disabled={Boolean(busy)}>{busy === 'organizer-credit' ? 'Se înregistrează…' : 'Înregistrează creditele organizatorului'}</button>
    </form></details>
    {!data ? <p role="status">{loading ? 'Se încarcă registrele comerciale…' : 'Datele financiare nu sunt disponibile. Reîncearcă încărcarea.'}</p> : <>
      <div className="mf-steps" aria-label="Etapele administrării comerciale">{([['publishers', '1', 'Editori și credite'], ['offers', '2', 'Oferte'], ['orders', '3', 'Comenzi și activări']] as const).map(([id, number, title]) => <button type="button" key={id} disabled={Boolean(busy)} aria-pressed={step === id} className={step === id ? 'is-active' : ''} onClick={() => setStep(id)}><b>{number}</b>{title}</button>)}</div>

      {step === 'publishers' && <div className="mf-layout">
        <aside className="mf-side"><h4>Editorii înregistrați</h4>{!data.publishers.length ? <p>Niciun editor. Creează primul cont comercial.</p> : data.publishers.map((entry) => <button key={entry.id} type="button" className={`mf-list-item${publisherId === entry.id ? ' is-selected' : ''}`} disabled={Boolean(busy)} onClick={() => selectPublisher(entry.id)}><strong>{entry.display_name}</strong><span>{publisherLabels[entry.status]} · {entry.kind === 'company' ? 'Companie' : 'Persoană'}</span><small>{entry.balance ? `${dollars(entry.balance.available_cents)} disponibile` : 'Sold indisponibil'}</small></button>)}</aside>
        <div className="mf-main">
          <details className="mf-panel" open={!data.publishers.length}><summary>Înregistrează un editor</summary><form onSubmit={createPublisher}>
            <div className="mf-form-grid"><Field label="ID-ul utilizatorului proprietar"><input type="number" min={1} step={1} required value={publisherForm.ownerUserId} onChange={(event) => setPublisherForm((value) => ({ ...value, ownerUserId: event.target.value }))} /></Field><Field label="Tipul editorului"><select value={publisherForm.kind} onChange={(event) => setPublisherForm((value) => ({ ...value, kind: event.target.value as 'individual' | 'company' }))}><option value="individual">Persoană</option><option value="company">Companie</option></select></Field><Field label="Numele public"><input required maxLength={120} value={publisherForm.displayName} onChange={(event) => setPublisherForm((value) => ({ ...value, displayName: event.target.value }))} /></Field><Field label="Merchant ID NervixPay" hint="Identificatorul comerciantului verificat. Nu introduce chei secrete."><input required maxLength={160} value={publisherForm.nervixpayMerchantId} onChange={(event) => setPublisherForm((value) => ({ ...value, nervixpayMerchantId: event.target.value }))} /></Field></div>
            <button className="ma-button ma-button-primary" disabled={Boolean(busy)}>{busy === 'publisher' ? 'Se creează…' : 'Creează editorul'}</button>
          </form></details>
          {publisher && <>
            <section className="mf-panel"><div className="mf-panel-title"><h4>{publisher.display_name}</h4><span className="mf-status">{publisherLabels[publisher.status]}</span></div><p className="mf-meta">Utilizator #{publisher.owner_user_id} · Merchant ID <code>{publisher.nervixpay_merchant_id}</code></p>
              <div className="mf-balances"><div><span>Sold înregistrat</span><strong>{dollars(publisher.balance?.posted_cents || 0)}</strong></div><div><span>Rezervat</span><strong>{dollars(publisher.balance?.reserved_cents || 0)}</strong></div><div><span>Disponibil</span><strong>{dollars(publisher.balance?.available_cents || 0)}</strong></div></div>
              <form onSubmit={(event) => { event.preventDefault(); void run('review', async () => { await marketplaceCommerceApi.reviewPublisher(publisher.id, { status: reviewStatus, reason: reviewReason }); setReviewReason(''); }, 'Starea editorului a fost actualizată.'); }}><div className="mf-form-grid"><Field label="Decizia evaluării"><select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as Exclude<PublisherStatus, 'pending'>)}><option value="approved">Aprobă</option><option value="suspended">Suspendă vânzările</option><option value="rejected">Respinge</option></select></Field><Field label="Motivul deciziei"><input required minLength={3} maxLength={1000} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></Field></div><button className="ma-button ma-button-secondary" disabled={Boolean(busy)}>Înregistrează decizia</button></form>
              <p className="mf-help">Aprobarea editorului nu aprobă automat un plugin. Suspendarea vânzărilor nu anulează comenzile deja plătite.</p>
            </section>
            <section className="mf-panel"><h4>Înregistrează credite de comision</h4><p className="mf-help">Confirmă mai întâi încasarea alimentării. O referință unică protejează împotriva înregistrării repetate.</p><form onSubmit={(event) => { event.preventDefault(); void run('credit', async () => { if (!credits.verified) throw new Error('Confirmă verificarea alimentării sau ajustării.'); await marketplaceCommerceApi.creditPublisher(publisher.id, { amountCents: centsFromInput(credits.amount), reference: credits.reference, kind: credits.kind }); setCredits({ amount: '', reference: '', kind: 'confirmed_topup', verified: false }); }, 'Creditele au fost înregistrate în registrul editorului.'); }}>
              <div className="mf-form-grid"><Field label="Suma în USD"><input required inputMode="decimal" placeholder="100.00" value={credits.amount} onChange={(event) => setCredits((value) => ({ ...value, amount: event.target.value, verified: false }))} /></Field><Field label="Tipul înregistrării"><select value={credits.kind} onChange={(event) => setCredits((value) => ({ ...value, kind: event.target.value as 'confirmed_topup' | 'adjustment', verified: false }))}><option value="confirmed_topup">Alimentare confirmată</option><option value="adjustment">Ajustare justificată</option></select></Field></div>
              <Field label="Referința unică a încasării sau ajustării"><input required maxLength={160} value={credits.reference} onChange={(event) => setCredits((value) => ({ ...value, reference: event.target.value, verified: false }))} /></Field>
              <label className="mf-check"><input type="checkbox" required checked={credits.verified} onChange={(event) => setCredits((value) => ({ ...value, verified: event.target.checked }))} /><span>Am verificat dovada încasării sau justificarea ajustării. Această înregistrare nu reprezintă o cerere de plată.</span></label><button className="ma-button ma-button-primary" disabled={Boolean(busy)}>Înregistrează creditele</button>
            </form></section>
          </>}
        </div>
      </div>}

      {step === 'offers' && <div className="mf-layout"><aside className="mf-side"><h4>Oferte asociate</h4>{!data.offers.length ? <p>Nicio ofertă comercială asociată.</p> : data.offers.map((offer) => <div key={offer.product_id} className="mf-list-item"><strong>{productName(offer.product_id)}</strong><span>{data.publishers.find((entry) => entry.id === offer.publisher_id)?.display_name || offer.publisher_id}</span></div>)}</aside><div className="mf-main"><section className="mf-panel"><h4>Asociază produsul cu editorul</h4><p className="mf-help">Configurează în fila Catalog un produs disponibil, cu un preț fix în USD. Prețul rămâne separat de orice miză sau buy-in din joc.</p><form onSubmit={(event) => { event.preventDefault(); void run('offer', async () => { await marketplaceCommerceApi.bindOffer({ productId: offerProduct, publisherId }); setOfferProduct(''); }, 'Oferta a fost asociată editorului.'); }}><Field label="Produsul"><select required value={offerProduct} onChange={(event) => setOfferProduct(event.target.value)}><option value="">Alege o ofertă eligibilă</option>{eligibleProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {marketplacePrice(product)}</option>)}</select></Field><Field label="Editorul aprobat"><select required value={publisherId} onChange={(event) => selectPublisher(event.target.value)}><option value="">Alege editorul</option>{data.publishers.filter((entry) => entry.status === 'approved').map((entry) => <option key={entry.id} value={entry.id}>{entry.display_name}</option>)}</select></Field><button className="ma-button ma-button-primary" disabled={Boolean(busy) || !eligibleProducts.length || publisher?.status !== 'approved'}>Asociază oferta</button></form>{!eligibleProducts.length && <p className="mf-help">Nu există încă produse eligibile. Stabilește prețurile în Catalog înainte de a crea comenzi.</p>}</section></div></div>}

      {step === 'orders' && <div className="mf-layout"><aside className="mf-side"><h4>Comenzi</h4>{!data.orders.length ? <p>Nu au fost rezervate comenzi.</p> : data.orders.map((order) => <button type="button" key={order.id} className={`mf-list-item${order.id === orderId ? ' is-selected' : ''}`} disabled={Boolean(busy)} onClick={() => selectOrder(order)}><strong>{productName(order.product_id)}</strong><span>Utilizator #{order.buyer_user_id} · {dollars(order.price_cents)}</span><small>{orderLabels[order.status]}</small></button>)}</aside><div className="mf-main">
        <section className="mf-panel"><h4>Rezervă o comandă</h4><p className="mf-help">Rezervă comisionul înainte ca organizatorul să plătească. Serverul verifică prețul ofertei și creditele editorului.</p><form onSubmit={reserveOrder}><div className="mf-form-grid"><Field label="ID-ul utilizatorului cumpărător"><input type="number" min={1} step={1} required value={buyerId} onChange={(event) => { setBuyerId(event.target.value); setOrderKey(crypto.randomUUID()); }} /></Field><Field label="Produsul"><select required value={orderProduct} onChange={(event) => { setOrderProduct(event.target.value); setOrderKey(crypto.randomUUID()); }}><option value="">Alege produsul</option>{saleProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {marketplacePrice(product)}</option>)}</select></Field></div>{selectedProduct?.price_cents && <p className="mf-quote">Plata către editor: <strong>{dollars(selectedProduct.price_cents)}</strong> · Credite rezervate: <strong>{dollars(Math.ceil(selectedProduct.price_cents / 5))}</strong></p>}<button className="ma-button ma-button-primary" disabled={Boolean(busy) || !saleProducts.length}>Rezervă comisionul și comanda</button></form></section>
        {selectedOrder && <section className="mf-panel"><div className="mf-panel-title"><h4>{productName(selectedOrder.product_id)}</h4><span className="mf-status">{orderLabels[selectedOrder.status]}</span></div><p className="mf-meta">Comandă <code>{selectedOrder.id}</code><br />Cumpărător #{selectedOrder.buyer_user_id} · {dollars(selectedOrder.price_cents)} · Comision {dollars(selectedOrder.commission_cents)}<br />Rezervarea expiră la {dates(selectedOrder.expires_at)}.</p>
          {(selectedOrder.status === 'awaiting_payment' || selectedOrder.status === 'cancelled' || selectedOrder.status === 'expired') && <>
            <h5>1. Comanda NervixPay</h5><p className="mf-help">Copiază oferta de plată creată pentru această comandă și comerciant. Suma în unități de token trebuie preluată exact din NervixPay.</p>
            <form onSubmit={(event) => { event.preventDefault(); void run('binding', () => marketplaceCommerceApi.bindPayment(selectedOrder.id, proof), 'Comanda NervixPay a fost asociată. Confirmă numai după verificarea plății finale.'); }}><div className="mf-form-grid">
              <Field label="Order ID NervixPay"><input required readOnly={Boolean(selectedOrder.payment_binding)} value={proof.providerOrderId} onChange={(event) => setProof((value) => ({ ...value, providerOrderId: event.target.value }))} /></Field><Field label="Merchant ID destinatar"><input required readOnly value={proof.merchantId} /></Field><Field label="Rețea"><input required readOnly={Boolean(selectedOrder.payment_binding)} value={proof.network} placeholder="Valoarea exactă din NervixPay" onChange={(event) => setProof((value) => ({ ...value, network: event.target.value }))} /></Field><Field label="Token"><input required readOnly={Boolean(selectedOrder.payment_binding)} value={proof.token} placeholder="Valoarea exactă din NervixPay" onChange={(event) => setProof((value) => ({ ...value, token: event.target.value }))} /></Field>
            </div><Field label="Suma tokenului în unități de bază" hint="Număr întreg, fără zecimale. Nu este suma USD și nu se recalculează în acest formular."><input required inputMode="numeric" pattern="[1-9][0-9]*" readOnly={Boolean(selectedOrder.payment_binding)} value={proof.amountBaseUnits} onChange={(event) => setProof((value) => ({ ...value, amountBaseUnits: event.target.value }))} /></Field><button className="ma-button ma-button-secondary" disabled={Boolean(busy) || Boolean(selectedOrder.payment_binding) || selectedOrder.status !== 'awaiting_payment'}>{selectedOrder.payment_binding ? 'Comandă asociată' : 'Asociază dovada comenzii'}</button></form>
            {selectedOrder.payment_binding && <><h5>2. Confirmă plata verificată</h5><form onSubmit={(event) => { event.preventDefault(); void run('payment', async () => { if (!paymentVerified) throw new Error('Verifică plata în NervixPay înainte de confirmare.'); await marketplaceCommerceApi.confirmPayment({ ...proofFromOrder(selectedOrder), paymentId, paidAt: new Date(paidAt).toISOString() }); setPaymentId(''); setPaidAt(''); setPaymentVerified(false); }, 'Plata a fost înregistrată. Verifică starea comenzii pentru rezultatul activării.'); }}><Field label="ID-ul unic al plății / tranzacției"><input required value={paymentId} onChange={(event) => { setPaymentId(event.target.value); setPaymentVerified(false); }} /></Field><Field label="Data și ora plății confirmate" hint="Ora locală; formularul transmite momentul în UTC."><input type="datetime-local" step={1} required value={paidAt} onChange={(event) => { setPaidAt(event.target.value); setPaymentVerified(false); }} /></Field><label className="mf-check"><input type="checkbox" required checked={paymentVerified} onChange={(event) => setPaymentVerified(event.target.checked)} /><span>Am verificat plata finală în NervixPay, destinatarul, rețeaua, tokenul și suma exactă. Confirmarea va înregistra comisionul și accesul plătit eligibil.</span></label><button className="ma-button ma-button-primary" disabled={Boolean(busy)}>Confirmă încasarea verificată</button></form></>}
            {selectedOrder.status === 'awaiting_payment' && <details className="mf-secondary"><summary>Eliberează o rezervare neplătită</summary><form onSubmit={(event) => { event.preventDefault(); void run('release', async () => { await marketplaceCommerceApi.releaseOrder(selectedOrder.id, releaseReason); setReleaseReason(''); }, 'Rezervarea neplătită a fost eliberată.'); }}><Field label="Motivul eliberării"><input required minLength={3} value={releaseReason} onChange={(event) => setReleaseReason(event.target.value)} /></Field><button className="ma-button ma-button-secondary" disabled={Boolean(busy)}>Eliberează creditele rezervate</button></form></details>}
          </>}
          {(selectedOrder.status === 'paid' || selectedOrder.status === 'payment_review') && <>{selectedOrder.status === 'paid' && <p className="mf-paid">Plata este înregistrată. Accesul organizatorului se verifică pe server, conform perioadei cumpărate. Soldul ulterior al editorului nu anulează acest drept.</p>}<details className="mf-secondary"><summary>Înregistrează o rambursare deja efectuată</summary><p className="mf-help">Efectuează și verifică rambursarea prin canalul de plată. Înregistrarea de aici inversează comisionul și revocă accesul legat de această comandă.</p><form onSubmit={(event) => { event.preventDefault(); void run('refund', async () => { if (!refundVerified) throw new Error('Confirmă dovada rambursării.'); await marketplaceCommerceApi.refundOrder(selectedOrder.id, refundReference); setRefundReference(''); setRefundVerified(false); }, 'Rambursarea a fost înregistrată. Comisionul și accesul comenzii au fost ajustate.'); }}><Field label="Referința rambursării"><input required value={refundReference} onChange={(event) => { setRefundReference(event.target.value); setRefundVerified(false); }} /></Field><label className="mf-check"><input type="checkbox" required checked={refundVerified} onChange={(event) => setRefundVerified(event.target.checked)} /><span>Am verificat rambursarea integrală către cumpărător.</span></label><button className="ma-button ma-button-secondary" disabled={Boolean(busy)}>Înregistrează rambursarea</button></form></details></>}
          {selectedOrder.status === 'payment_review' && <p className="mf-help">Plata necesită analiză. Nu încasa din nou și nu crea o activare manuală pentru a ocoli verificarea. Reconciliază comanda și dovada din NervixPay.</p>}
        </section>}
      </div></div>}
    </>}
  </fieldset></section>;
}
