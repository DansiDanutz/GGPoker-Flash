import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import {
  MANAGEMENT_PRODUCT_IDS, MARKETPLACE_CATEGORY_LABELS, MARKETPLACE_DELIVERY_LABELS, marketplaceApi, marketplacePrice,
  type MarketplaceAdminData, type MarketplaceEntitlement, type MarketplaceProduct,
  type MarketplaceProductInput, type MarketplaceRequest, type MarketplaceSettings,
} from '../lib/marketplace-api';
import '../admin-marketplace.css';
import { ManagementPlugins } from './ManagementPlugins';
import { AdminMarketplaceFinance } from './AdminMarketplaceFinance';

type Tab = 'catalog' | 'requests' | 'access' | 'content' | 'plugins' | 'finance';
type UserChoice = { id: number; nick: string; login?: string };
type AccessSeed = { user: UserChoice; productId: string; requestId: number };

const TABS: { id: Tab; label: string }[] = [
  { id: 'catalog', label: 'Catalog' }, { id: 'requests', label: 'Solicitări' },
  { id: 'access', label: 'Acces' }, { id: 'content', label: 'Conținut' },
  { id: 'plugins', label: 'Pluginuri' },
  { id: 'finance', label: 'Finanțe și activări' },
];
const STATUS_LABELS = { draft: 'Ciornă', coming_soon: 'În pregătire', available: 'Disponibil', archived: 'Arhivat' };
const REQUEST_LABELS = { pending: 'În așteptare', approved: 'Aprobată', declined: 'Refuzată' };
const PRICING_LABELS = { quote: 'Ofertă la cerere', free: 'Gratuit', one_time: 'Plată unică', monthly: 'Lunar', yearly: 'Anual' };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Operațiunea nu a reușit. Încearcă din nou.';
const slugify = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '');
const dateLabel = (value?: string | null) => {
  if (!value) return 'Fără expirare';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? 'Dată indisponibilă' : new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

function Field({ label, children, hint, wide = false }: { label: string; children: ReactNode; hint?: string; wide?: boolean }) {
  return <label className={`ma-field${wide ? ' ma-field-wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="ma-empty"><span className="ma-empty-mark" aria-hidden="true">◇</span><h4>{title}</h4>{children && <p>{children}</p>}</div>;
}

function ErrorNotice({ message }: { message: string }) {
  return message ? <div className="ma-notice ma-notice-error" role="alert">{message}</div> : null;
}

function productInput(product?: MarketplaceProduct): MarketplaceProductInput {
  return product ? {
    slug: product.slug, name: product.name, summary: product.summary, description: product.description,
    category: product.category, delivery: product.delivery, status: product.status, pricing: product.pricing,
    price_cents: product.price_cents, currency: product.currency, features: [...product.features],
    featured: product.featured, sort_order: product.sort_order,
  } : {
    slug: '', name: '', summary: '', description: '', category: 'hosting', delivery: 'hosted_service',
    status: 'draft', pricing: 'quote', price_cents: null, currency: 'EUR', features: [], featured: false, sort_order: 0,
  };
}

function ProductEditor({ product, onClose, onSaved, onDirtyChange }: {
  product?: MarketplaceProduct; onClose: () => void; onSaved: (product: MarketplaceProduct) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const initial = useMemo(() => productInput(product), [product]);
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [featureText, setFeatureText] = useState(initial.features.join('\n'));
  const [price, setPrice] = useState(initial.price_cents === null ? '' : String(initial.price_cents / 100));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || featureText !== saved.features.join('\n') || price !== (saved.price_cents === null ? '' : String(saved.price_cents / 100));
  const priced = ['one_time', 'monthly', 'yearly'].includes(draft.pricing);
  const managementProduct = Boolean(product && MANAGEMENT_PRODUCT_IDS.has(product.id));
  useEffect(() => { nameInput.current?.focus(); }, []);
  // Refresh an untouched editor from the server without rebasing unsaved changes.
  useEffect(() => {
    if (dirty) return;
    setSaved(initial);
    setDraft(initial);
    setFeatureText(initial.features.join('\n'));
    setPrice(initial.price_cents === null ? '' : String(initial.price_cents / 100));
  }, [initial, dirty]);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  const edit = <K extends keyof MarketplaceProductInput>(key: K, value: MarketplaceProductInput[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const amount = Number(price.replace(',', '.'));
    if (priced && (!price.trim() || !Number.isFinite(amount) || amount <= 0)) { setError('Introdu un preț valid, mai mare decât zero. Pentru o ofertă gratuită, selectează tarifarea „Gratuit”.'); return; }
    const features = featureText.split('\n').map((line) => line.trim()).filter(Boolean);
    if (features.length > 12) { setError('Poți adăuga maximum 12 beneficii, fiecare pe un rând separat.'); return; }
    if (features.some((line) => line.length > 160)) { setError('Fiecare beneficiu poate avea maximum 160 de caractere.'); return; }
    if (draft.status === 'archived' && product?.status !== 'archived' && !window.confirm('Arhivezi acest produs? Va dispărea din catalogul public. Solicitările și istoricul accesului se păstrează.')) return;
    setSaving(true);
    try {
      const payload: MarketplaceProductInput = {
        ...draft, name: draft.name.trim(), slug: draft.slug.trim(), summary: draft.summary.trim(),
        description: draft.description.trim(), features, price_cents: priced ? Math.round(amount * 100) : null,
      };
      const result = product ? await marketplaceApi.admin.updateProduct(product.id, payload) : await marketplaceApi.admin.createProduct(payload);
      onDirtyChange(false); onSaved(result.product);
    } catch (failure) { setError(errorText(failure)); }
    finally { setSaving(false); }
  };

  return <section className="ma-panel ma-editor" aria-labelledby="ma-editor-title">
    <div className="ma-panel-heading"><div><span className="ma-eyebrow">{product ? 'EDITEAZĂ PRODUSUL' : 'PRODUS NOU'}</span><h3 id="ma-editor-title">{product?.name || 'Construiește oferta'}</h3></div><button type="button" className="ma-icon-button" aria-label="Închide editorul" onClick={onClose} disabled={saving}>×</button></div>
    <form onSubmit={save} className="ma-form" aria-busy={saving}><fieldset className="ma-fieldset" disabled={saving}>
      <ErrorNotice message={error} />
      <div className="ma-form-grid">
        <Field label="Numele produsului" wide><input ref={nameInput} value={draft.name} required minLength={2} maxLength={120} onChange={(event) => { const name = event.target.value; setDraft((current) => ({ ...current, name, ...(!product && (!current.slug || current.slug === slugify(current.name)) ? { slug: slugify(name) } : {}) })); }} /></Field>
        <Field label="Identificator public" hint="Litere mici, cifre și cratime." wide><input value={draft.slug} required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" onChange={(event) => edit('slug', event.target.value)} /></Field>
        <Field label="Descriere scurtă" wide><textarea rows={2} required maxLength={240} value={draft.summary} onChange={(event) => edit('summary', event.target.value)} /></Field>
        <Field label="Descriere completă" wide><textarea rows={5} maxLength={6000} value={draft.description} onChange={(event) => edit('description', event.target.value)} /></Field>
        <Field label="Categorie"><select value={draft.category} onChange={(event) => edit('category', event.target.value as MarketplaceProductInput['category'])}>{Object.entries(MARKETPLACE_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Tipul produsului"><select value={draft.delivery} onChange={(event) => edit('delivery', event.target.value as MarketplaceProductInput['delivery'])}>{Object.entries(MARKETPLACE_DELIVERY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Vizibilitate"><select value={draft.status} onChange={(event) => edit('status', event.target.value as MarketplaceProductInput['status'])}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Poziție în catalog" hint="Numerele mai mici apar primele."><input type="number" min={-10000} max={10000} step={1} value={draft.sort_order} onChange={(event) => edit('sort_order', Number(event.target.value))} /></Field>
        <Field label="Modalitate de tarifare" hint={managementProduct ? 'Pluginurile de administrare folosesc o ofertă la cerere sau un tarif plătit.' : undefined}><select value={draft.pricing} onChange={(event) => edit('pricing', event.target.value as MarketplaceProductInput['pricing'])}>{Object.entries(PRICING_LABELS).filter(([value]) => !managementProduct || value !== 'free').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Monedă" hint={managementProduct ? 'Comenzile de pluginuri și creditele de comision se înregistrează în USD.' : undefined}><select value={draft.currency} disabled={managementProduct} onChange={(event) => edit('currency', event.target.value as MarketplaceProductInput['currency'])}>{(managementProduct ? ['USD'] : ['EUR', 'RON', 'USD']).map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></Field>
        {priced && <Field label="Preț afișat" hint="Valoarea afișată nu activează încasarea online." wide><input inputMode="decimal" type="number" min="0.01" max={1000000} step="0.01" required value={price} onChange={(event) => setPrice(event.target.value)} /></Field>}
        <Field label="Beneficii incluse" hint="Un beneficiu pe rând, maximum 12." wide><textarea rows={5} maxLength={2000} value={featureText} onChange={(event) => setFeatureText(event.target.value)} /></Field>
      </div>
      <label className="ma-check"><input type="checkbox" checked={draft.featured} onChange={(event) => edit('featured', event.target.checked)} /><span>Evidențiază produsul în catalog</span></label>
      <p className="ma-hint">Ciornele și produsele arhivate sunt vizibile doar în admin. Publică drept „Disponibil” numai o ofertă pe care o poți furniza.</p>
      <div className="ma-form-actions"><button type="button" className="ma-button ma-button-secondary" onClick={onClose} disabled={saving}>Anulează</button><button type="submit" className="ma-button ma-button-primary" disabled={saving || (Boolean(product) && !dirty)}>{saving ? 'Se salvează…' : product ? 'Salvează produsul' : 'Creează produsul'}</button></div>
    </fieldset></form>
  </section>;
}

function RequestsPanel({ requests, products, onRefresh, onGrant, onDirtyChange, onNotice }: {
  requests: MarketplaceRequest[]; products: MarketplaceProduct[]; onRefresh: () => Promise<void>;
  onGrant: (request: MarketplaceRequest) => void; onDirtyChange: (dirty: boolean) => void; onNotice: (message: string) => void;
}) {
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const dirty = requests.some((request) => responses[request.id] !== undefined && responses[request.id] !== request.response);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  const visible = requests.filter((request) => (!filter || request.status === filter) && `${request.user_nick || ''} ${request.product_name} ${request.message} ${request.id}`.toLocaleLowerCase('ro').includes(query.toLocaleLowerCase('ro')));
  const review = async (request: MarketplaceRequest, status: MarketplaceRequest['status']) => {
    const response = (responses[request.id] ?? request.response).trim();
    if (!response) { setError('Scrie un răspuns pentru utilizator înainte de a lua decizia.'); document.getElementById(`ma-response-${request.id}`)?.focus(); return; }
    setBusy(request.id); setError('');
    try {
      await marketplaceApi.admin.reviewRequest(request.id, status, response);
      setResponses((current) => { const next = { ...current }; delete next[request.id]; return next; });
      onNotice('Decizia a fost salvată. Utilizatorul o poate vedea în solicitările sale.');
      await onRefresh();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(null); }
  };
  return <section aria-label="Solicitări marketplace">
    <div className="ma-toolbar"><input aria-label="Caută în solicitări" placeholder="Caută utilizator, produs sau mesaj…" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filtrează starea solicitării" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Toate solicitările</option>{Object.entries(REQUEST_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <p className="ma-hint">Răspunsul este vizibil pentru solicitant. Aprobarea unei cereri nu încasează o plată și nu acordă automat acces la un serviciu.</p>
    <ErrorNotice message={error} />
    {!visible.length ? <Empty title="Nicio solicitare în această listă">Cererile trimise din pagina publică apar aici.</Empty> : <div className="ma-request-list">{visible.map((request) => <article className="ma-panel ma-request" key={request.id}>
      <div className="ma-request-heading"><div><span className="ma-eyebrow">SOLICITAREA #{request.id}</span><h3>{request.product_name}</h3><p>{request.user_nick || `Utilizator #${request.user_id}`} <span>· {dateLabel(request.created_at)}</span></p></div><span className={`ma-badge ma-status-${request.status}`}>{REQUEST_LABELS[request.status]}</span></div>
      <p className="ma-request-message">{request.message || 'Utilizatorul a solicitat informații fără un mesaj suplimentar.'}</p>
      <label className="ma-field"><span>Răspuns pentru utilizator</span><textarea id={`ma-response-${request.id}`} rows={3} maxLength={2000} disabled={busy !== null} value={responses[request.id] ?? request.response} onChange={(event) => setResponses((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Explică disponibilitatea și pașii următori…" /></label>
      <div className="ma-request-actions"><button type="button" className="ma-button ma-button-secondary" disabled={busy !== null} onClick={() => review(request, 'declined')}>{busy === request.id ? 'Se salvează…' : 'Refuză cererea'}</button><button type="button" className="ma-button ma-button-primary" disabled={busy !== null} onClick={() => review(request, 'approved')}>{request.status === 'approved' ? 'Salvează răspunsul' : 'Aprobă cererea'}</button>{request.status === 'approved' && products.some((product) => product.id === request.product_id && product.status === 'available') && <button type="button" className="ma-button ma-button-secondary" disabled={busy !== null} onClick={() => onGrant(request)}>{MANAGEMENT_PRODUCT_IDS.has(request.product_id) ? 'Pregătește comanda ↗' : 'Pregătește accesul ↗'}</button>}</div>
    </article>)}</div>}
  </section>;
}

function AccessPanel({ products, entitlements, seed, onRefresh, onDirtyChange, onNotice }: {
  products: MarketplaceProduct[]; entitlements: MarketplaceEntitlement[]; seed: AccessSeed | null;
  onRefresh: () => Promise<void>; onDirtyChange: (dirty: boolean) => void; onNotice: (message: string) => void;
}) {
  const available = products.filter((product) => product.status === 'available' && !MANAGEMENT_PRODUCT_IDS.has(product.id));
  const [choice, setChoice] = useState<UserChoice | null>(seed?.user || null);
  const [query, setQuery] = useState(seed?.user.nick || '');
  const [matches, setMatches] = useState<UserChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [productId, setProductId] = useState(seed?.productId || '');
  const [expires, setExpires] = useState('');
  const [note, setNote] = useState(seed ? `Solicitarea #${seed.requestId}` : '');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = Boolean(choice || productId || expires || note || query);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    let cancelled = false;
    setSearchError(''); setSearched(false);
    if (choice || query.trim().length < 2) { setMatches([]); setSearching(false); return; }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.admin.users({ q: query.trim(), status: 'active', limit: 10, offset: 0 });
        if (!cancelled) { setMatches(result.users.map((user) => ({ id: user.id, nick: user.nick, login: user.login }))); setSearched(true); }
      } catch (failure) { if (!cancelled) setSearchError(errorText(failure)); }
      finally { if (!cancelled) setSearching(false); }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, choice]);
  const grant = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!choice) { setError('Selectează un utilizator existent din rezultatele căutării.'); return; }
    if (!available.some((product) => product.id === productId)) { setError('Selectează un produs disponibil.'); return; }
    const expiry = expires ? new Date(expires) : null;
    if (expiry && (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now())) { setError('Data expirării trebuie să fie în viitor.'); return; }
    setBusy('grant');
    try {
      await marketplaceApi.admin.grantAccess({ user_id: choice.id, product_id: productId, expires_at: expiry?.toISOString() || null, note: note.trim() });
      setChoice(null); setQuery(''); setProductId(''); setExpires(''); setNote('');
      onNotice('Accesul la serviciu a fost înregistrat. Nicio plată nu a fost încasată.');
      await onRefresh();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(null); }
  };
  const revoke = async (entry: MarketplaceEntitlement) => {
    if (!window.confirm(`Revoci accesul pentru ${entry.user_nick || `utilizatorul #${entry.user_id}`} la „${entry.product_name}”? Înregistrarea rămâne în istoric.`)) return;
    setError(''); setBusy(`revoke-${entry.id}`);
    try { await marketplaceApi.admin.revokeAccess(entry.id); onNotice('Accesul a fost revocat.'); await onRefresh(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(null); }
  };
  const isExpired = (entry: MarketplaceEntitlement) => entry.status === 'active' && Boolean(entry.expires_at) && new Date(entry.expires_at!).getTime() <= Date.now();
  const visible = entitlements.filter((entry) => !filter || (filter === 'expired' ? isExpired(entry) : filter === 'active' ? entry.status === 'active' && !isExpired(entry) : entry.status === 'revoked'));
  return <section className="ma-access-grid" aria-label="Acces la servicii">
    <form className="ma-panel ma-grant" onSubmit={grant} aria-busy={busy === 'grant'}><fieldset className="ma-fieldset" disabled={busy !== null}>
      <div className="ma-panel-heading"><div><span className="ma-eyebrow">ACCES MANUAL</span><h3>Acordă acces la un serviciu</h3></div></div>
      <p className="ma-hint">Înregistrează dreptul de acces pentru o ofertă disponibilă. Furnizarea serviciului se face conform ofertei; această operațiune nu instalează module și nu încasează bani.</p>
      <p className="ma-hint">Pluginurile de administrare se activează printr-o comandă plătită verificată în fila „Finanțe și activări”. Accesul manual nu le deblochează.</p>
      <ErrorNotice message={error} />
      <Field label="Utilizator existent" hint="Caută după nume sau cont, minimum două caractere."><input autoComplete="off" value={query} onChange={(event) => { setChoice(null); setQuery(event.target.value); }} placeholder="Caută un utilizator…" /></Field>
      {choice ? <div className="ma-selected-user"><span><strong>{choice.nick}</strong><small>{choice.login || `ID ${choice.id}`}</small></span><button type="button" className="ma-text-button" onClick={() => { setChoice(null); setQuery(''); }}>Schimbă</button></div> : <div className="ma-user-results" aria-live="polite">{searching && <p>Se caută…</p>}{searchError && <p className="ma-inline-error">{searchError}</p>}{!searching && searched && !matches.length && <p>Niciun utilizator activ găsit.</p>}{matches.map((user) => <button type="button" key={user.id} onClick={() => { setChoice(user); setQuery(user.nick); setMatches([]); }}><strong>{user.nick}</strong><span>{user.login} · #{user.id}</span></button>)}</div>}
      <Field label="Produs disponibil"><select required value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Selectează produsul</option>{available.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
      {!available.length && <p className="ma-hint">Publică mai întâi o ofertă drept „Disponibil”. Produsele în pregătire nu pot primi acces activ.</p>}
      <Field label="Expiră la (ora locală)" hint="Lasă necompletat pentru acces fără termen."><input type="datetime-local" value={expires} onChange={(event) => setExpires(event.target.value)} /></Field>
      <Field label="Notă internă" hint="Vizibilă doar administratorilor."><textarea rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <button className="ma-button ma-button-primary" type="submit" disabled={busy !== null || !available.length}>{busy === 'grant' ? 'Se acordă accesul…' : 'Acordă acces'}</button>
    </fieldset></form>
    <div className="ma-access-list"><div className="ma-toolbar"><h3>Registrul de acces</h3><select aria-label="Filtrează accesul" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Toate înregistrările</option><option value="active">Active</option><option value="expired">Expirate</option><option value="revoked">Revocate</option></select></div>
      {!visible.length ? <Empty title="Nicio înregistrare">Accesul acordat manual va apărea aici, împreună cu starea și termenul său.</Empty> : visible.map((entry) => <article key={entry.id} className="ma-panel ma-access-entry"><div className="ma-request-heading"><div><h3>{entry.product_name}</h3><p>{entry.user_nick || `Utilizator #${entry.user_id}`}</p></div><span className={`ma-badge ma-status-${entry.status === 'revoked' ? 'archived' : isExpired(entry) ? 'declined' : 'available'}`}>{entry.status === 'revoked' ? 'Revocat' : isExpired(entry) ? 'Expirat' : 'Activ'}</span></div><dl><div><dt>Acordat</dt><dd>{dateLabel(entry.created_at)}</dd></div><div><dt>Expirare</dt><dd>{dateLabel(entry.expires_at)}</dd></div></dl>{entry.note && <p className="ma-internal-note">{entry.note}</p>}{entry.status === 'active' && <button type="button" className="ma-button ma-button-danger" disabled={busy !== null} onClick={() => revoke(entry)}>{busy === `revoke-${entry.id}` ? 'Se revocă…' : 'Revocă accesul'}</button>}</article>)}
    </div>
  </section>;
}

function ContentPanel({ settings, onSaved, onDirtyChange }: {
  settings: MarketplaceSettings; onSaved: (settings: MarketplaceSettings) => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (dirty) return;
    setDraft(settings);
    setSaved(settings);
  }, [settings, dirty]);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const result = await marketplaceApi.admin.updateSettings({ ...draft, title: draft.title.trim(), subtitle: draft.subtitle.trim(), contact_note: draft.contact_note.trim() });
      setDraft(result.settings); setSaved(result.settings); onSaved(result.settings);
    } catch (failure) { setError(errorText(failure)); }
    finally { setSaving(false); }
  };
  return <div className="ma-content-grid">
    <form className="ma-panel ma-content-form" onSubmit={save} aria-busy={saving}>
      <fieldset className="ma-fieldset" disabled={saving}>
        <div className="ma-panel-heading"><div><span className="ma-eyebrow">PAGINA PUBLICĂ</span><h3>Mesajul marketplace-ului</h3></div></div>
        <ErrorNotice message={error} />
        <Field label="Titlul paginii"><input required maxLength={140} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></Field>
        <Field label="Introducere"><textarea rows={4} maxLength={1000} value={draft.subtitle} onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))} /></Field>
        <Field label="Instrucțiuni pentru solicitări"><textarea rows={4} maxLength={1000} value={draft.contact_note} onChange={(event) => setDraft((current) => ({ ...current, contact_note: event.target.value }))} /></Field>
        <label className="ma-check ma-requests-switch"><input type="checkbox" checked={draft.requests_enabled} onChange={(event) => setDraft((current) => ({ ...current, requests_enabled: event.target.checked }))} /><span><strong>Primește solicitări noi</strong><small>Poți opri temporar formularul. Catalogul și solicitările existente rămân disponibile.</small></span></label>
        <div className="ma-form-actions"><button type="button" className="ma-button ma-button-secondary" disabled={!dirty || saving} onClick={() => { if (window.confirm('Renunți la modificările nesalvate ale paginii?')) setDraft(saved); }}>Resetează</button><button type="submit" className="ma-button ma-button-primary" disabled={!dirty || saving}>{saving ? 'Se salvează…' : 'Salvează conținutul'}</button></div>
      </fieldset>
    </form>
    <aside className="ma-panel ma-content-help">
      <span className="ma-eyebrow">CUM APARE OFERTA</span><h3>Un catalog clar pentru comunitate</h3>
      <ol>
        <li><strong>Ciornă</strong><span>Pregătești oferta în privat.</span></li>
        <li><strong>În pregătire</strong><span>Oamenii pot vedea direcția și își pot exprima interesul.</span></li>
        <li><strong>Disponibil</strong><span>Poți primi cereri și acorda acces la serviciul oferit.</span></li>
        <li><strong>Arhivat</strong><span>Oferta dispare din catalog; istoricul se păstrează.</span></li>
      </ol>
      <p>Prețurile descriu oferta. Încasarea online nu este activată în această versiune a marketplace-ului.</p>
    </aside>
  </div>;
}

/** Persistent owner controls. All mutations use the existing private /api/admin boundary. */
export function AdminMarketplace({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const [data, setData] = useState<MarketplaceAdminData | null>(null);
  const [tab, setTab] = useState<Tab>('catalog');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirtyState(value);
  }, []);
  const [editor, setEditor] = useState<MarketplaceProduct | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [archiving, setArchiving] = useState<string | null>(null);
  const [seed, setSeed] = useState<AccessSeed | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const refreshed = await marketplaceApi.admin.get();
      setData(refreshed);
      setEditor((current) => {
        if (dirtyRef.current || !current || current === 'new') return current;
        return refreshed.products.find((product) => product.id === current.id) || null;
      });
    }
    catch (failure) { setError(errorText(failure)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [dirty]);
  const canDiscard = () => !dirty || window.confirm('Ai modificări nesalvate. Renunți la ele?');
  const switchTab = (next: Tab) => {
    if (next === tab || !canDiscard()) return;
    setDirty(false); setEditor(null); setSeed(null); setTab(next); setError(''); setNotice('');
  };
  const openEditor = (product: MarketplaceProduct | 'new' | null) => {
    if (!canDiscard()) return;
    setDirty(false); setEditor(product); setError(''); setNotice('');
  };
  const productSaved = (product: MarketplaceProduct) => {
    setDirty(false); setEditor(null); setNotice(`„${product.name}” a fost salvat.`); void load();
  };
  const archive = async (product: MarketplaceProduct) => {
    if (!canDiscard() || !window.confirm(`Arhivezi „${product.name}”? Produsul va fi ascuns publicului; solicitările și accesul acordat se păstrează.`)) return;
    setArchiving(product.id); setError('');
    try { await marketplaceApi.admin.updateProduct(product.id, { status: 'archived' }); setEditor(null); setDirty(false); setNotice('Produsul a fost arhivat.'); await load(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setArchiving(null); }
  };
  const prepareGrant = (request: MarketplaceRequest) => {
    if (!canDiscard()) return;
    setDirty(false); setSeed({ user: { id: request.user_id, nick: request.user_nick || `Utilizator #${request.user_id}` }, productId: request.product_id, requestId: request.id }); setTab(MANAGEMENT_PRODUCT_IDS.has(request.product_id) ? 'finance' : 'access'); setNotice('');
  };
  const products = (data?.products || []).filter((product) => (!status || product.status === status) && `${product.name} ${product.summary} ${product.slug}`.toLocaleLowerCase('ro').includes(query.toLocaleLowerCase('ro')));

  return <div className="market-admin">
    <header className="ma-header"><div><span className="ma-eyebrow">DANGG · CONTROL COMERCIAL</span><h2>Marketplace</h2><p>Organizează ofertele, răspunde comunității și administrează accesul.</p></div><div className="ma-header-actions"><a className="ma-button ma-button-secondary" href="/marketplace" target="_blank" rel="noreferrer">Vezi pagina ↗</a><button type="button" className="ma-button ma-button-secondary" onClick={() => void load()} disabled={loading || dirty} title={dirty ? 'Salvează sau anulează modificările înainte de reîncărcare.' : 'Reîncarcă datele'}>{loading ? 'Se încarcă…' : 'Reîncarcă'}</button></div></header>
    {error && <div className="ma-notice ma-notice-error" role="alert"><strong>Datele nu au putut fi încărcate sau salvate.</strong><span>{error}</span>{!data && <p>Administrarea necesită un cont de administrator și conexiunea privată configurată pentru DanGG.</p>}<button type="button" className="ma-text-button" disabled={loading || dirty} onClick={() => void load()}>Încearcă din nou</button></div>}
    {notice && <div className="ma-notice ma-notice-success" role="status">{notice}<button type="button" aria-label="Închide confirmarea" className="ma-icon-button" onClick={() => setNotice('')}>×</button></div>}
    {!data ? !error && <div className="ma-loading" role="status"><span className="ma-spinner" />Se încarcă administrarea marketplace-ului…</div> : <>
      <div className="ma-stats"><div><span>Produse</span><strong>{data.stats.products}</strong><small>în catalogul de administrare</small></div><div><span>Publicate</span><strong>{data.stats.published}</strong><small>vizibile comunității</small></div><div><span>Solicitări în așteptare</span><strong>{data.stats.pending}</strong><small>necesită un răspuns</small></div><div><span>Acces activ</span><strong>{data.stats.active_access}</strong><small>înregistrări neexpirate</small></div></div>
      <div className="ma-tabs" role="tablist" aria-label="Administrare marketplace">{TABS.map((item, index) => <button key={item.id} id={`ma-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`ma-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => switchTab(item.id)} onKeyDown={(event) => { if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return; event.preventDefault(); const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]; if (next.id === tab || !canDiscard()) return; setDirty(false); setEditor(null); setSeed(null); setTab(next.id); document.getElementById(`ma-tab-${next.id}`)?.focus(); }}>{item.label}{item.id === 'requests' && data.stats.pending > 0 && <span>{data.stats.pending}</span>}</button>)}</div>
      <div role="tabpanel" id={`ma-panel-${tab}`} aria-labelledby={`ma-tab-${tab}`}>
        {tab === 'catalog' && <>
          <div className="ma-toolbar"><input aria-label="Caută în catalog" placeholder="Caută un produs…" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filtrează vizibilitatea produselor" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Toate stările</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="ma-button ma-button-primary" onClick={() => openEditor('new')}>＋ Adaugă produs</button></div>
          <div className={`ma-catalog-layout${editor ? ' ma-catalog-editing' : ''}`}><div className="ma-product-list">{!products.length ? <Empty title="Niciun produs găsit">Adaugă o ofertă nouă sau schimbă filtrele.</Empty> : products.map((product) => <article key={product.id} className={`ma-panel ma-product${typeof editor === 'object' && editor?.id === product.id ? ' ma-product-selected' : ''}`}><div className="ma-product-top"><span className={`ma-badge ma-status-${product.status}`}>{STATUS_LABELS[product.status]}</span>{product.featured && <span className="ma-featured">★ Evidențiat</span>}</div><div className="ma-product-heading"><span className="ma-product-symbol" aria-hidden="true">{product.category === 'hosting' ? '◈' : product.category === 'tools' ? '♜' : product.category === 'customization' ? '✦' : '⌘'}</span><div><h3>{product.name}</h3><span>{MARKETPLACE_CATEGORY_LABELS[product.category]} · {MARKETPLACE_DELIVERY_LABELS[product.delivery]}</span></div></div><p>{product.summary}</p><div className="ma-product-footer"><strong>{marketplacePrice(product)}</strong><div><button type="button" className="ma-button ma-button-secondary" onClick={() => openEditor(product)}>Editează</button>{product.status !== 'archived' && <button type="button" className="ma-text-button" disabled={archiving !== null} onClick={() => void archive(product)}>{archiving === product.id ? 'Se arhivează…' : 'Arhivează'}</button>}</div></div></article>)}</div>{editor && <ProductEditor key={editor === 'new' ? 'new' : editor.id} product={editor === 'new' ? undefined : editor} onClose={() => openEditor(null)} onSaved={productSaved} onDirtyChange={setDirty} />}</div>
        </>}
        {tab === 'requests' && <RequestsPanel requests={data.requests} products={data.products} onRefresh={load} onGrant={prepareGrant} onDirtyChange={setDirty} onNotice={setNotice} />}
        {tab === 'access' && <AccessPanel products={data.products} entitlements={data.entitlements} seed={seed} onRefresh={load} onDirtyChange={setDirty} onNotice={setNotice} />}
        {tab === 'content' && <ContentPanel settings={data.settings} onSaved={(settings) => { setData((current) => current ? { ...current, settings } : current); setNotice('Conținutul public a fost salvat.'); }} onDirtyChange={setDirty} />}
        {tab === 'plugins' && <ManagementPlugins admin />}
        {tab === 'finance' && <AdminMarketplaceFinance products={data.products} onDirtyChange={setDirty} initialOrder={seed ? { buyerUserId: seed.user.id, productId: seed.productId } : undefined} />}
      </div>
      <footer className="ma-footer"><span>Modificările sunt păstrate în baza de date și în jurnalul de administrare.</span><span>Plăți online: neactivate</span></footer>
    </>}
  </div>;
}
