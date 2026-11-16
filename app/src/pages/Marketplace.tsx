import React, { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import {
  MARKETPLACE_CATEGORY_LABELS, MARKETPLACE_DELIVERY_LABELS, marketplaceApi, marketplacePrice,
  type MarketplaceAccount, type MarketplaceCatalog, type MarketplaceCategory, type MarketplaceProduct,
} from '../lib/marketplace-api';
import '../marketplace.css';
import { ManagementPlugins } from '../components/ManagementPlugins';
import { MarketplacePublisher } from '../components/MarketplacePublisher';
import { OrganizerBilling } from '../components/OrganizerBilling';
import { OrganizerChips } from '../components/OrganizerChips';
import { PlatformTabs } from '../components/PlatformTabs';
import { PlayMoneyPlugins } from '../components/PlayMoneyPlugins';

type IconName = 'arrow' | 'code' | 'server' | 'layers' | 'check' | 'search' | 'close' | 'spark' | 'clock' | 'shield' | 'external' | 'grid';

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    code: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" /></>,
    server: <><rect x="3" y="3" width="18" height="7" rx="2" /><rect x="3" y="14" width="18" height="7" rx="2" /><path d="M7 6.5h.01M7 17.5h.01M16 6.5h2M16 17.5h2" /></>,
    layers: <><path d="m12 2 10 6-10 6L2 8l10-6Zm-9 11 9 5 9-5M3 18l9 5 9-5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /><path d="M20 2v4m-2-2h4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    shield: <><path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z" /><path d="m8 12 3 3 5-6" /></>,
    external: <><path d="M14 3h7v7m0-7L10 14" /><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  };
  return <svg className={`mp-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const CATEGORY_ICONS: Record<MarketplaceCategory, IconName> = {
  hosting: 'server', tools: 'grid', customization: 'spark', extensions: 'code',
};
const REQUEST_STATUS = { pending: 'În evaluare', approved: 'Aprobată', declined: 'Refuzată' };
const EMPTY_ACCOUNT: MarketplaceAccount = { requests: [], entitlements: [] };
const SOURCE_URL = __APP_SOURCE_URL__;
const SOURCE_FILE_ROOT = SOURCE_URL.replace('/tree/', '/blob/');

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nu am putut finaliza cererea. Încearcă din nou.';
}

function displayDate(value: string): string {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function searchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro-RO');
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function ProductCard({ product, onOpen, requested, active }: {
  product: MarketplaceProduct; onOpen: (product: MarketplaceProduct) => void; requested: boolean; active: boolean;
}) {
  return (
    <article className={`mp-product ${product.featured ? 'mp-product-featured' : ''}`}>
      <div className={`mp-product-cover mp-cover-${product.category}`}>
        <span className="mp-product-symbol"><Icon name={CATEGORY_ICONS[product.category]} /></span>
        <span className={`mp-status ${product.status === 'available' ? 'mp-status-ready' : ''}`}>
          <span />{product.status === 'available' ? 'Disponibil' : 'În pregătire'}
        </span>
        <span className="mp-cover-category">{MARKETPLACE_CATEGORY_LABELS[product.category]}</span>
      </div>
      <div className="mp-product-body">
        <span className="mp-eyebrow mp-product-delivery">{MARKETPLACE_DELIVERY_LABELS[product.delivery]}</span>
        <h3><button type="button" onClick={() => onOpen(product)}>{product.name}</button></h3>
        <p>{product.summary}</p>
        {product.features.length > 0 && <ul className="mp-feature-list">{product.features.slice(0, 3).map((feature, i) => <li key={`${feature}-${i}`}><Icon name="check" /><span>{feature}</span></li>)}</ul>}
        <div className="mp-product-bottom">
          <div className="mp-price"><strong>{marketplacePrice(product)}</strong><span>{product.pricing === 'quote' ? 'Oferta se confirmă individual' : product.status === 'coming_soon' ? 'Disponibilitate în pregătire' : 'Vezi condițiile serviciului'}</span></div>
          <button type="button" className="mp-round-button" onClick={() => onOpen(product)} aria-label={`Vezi detalii: ${product.name}`}><Icon name="arrow" /></button>
        </div>
        {(active || requested) && <div className="mp-product-account"><Icon name={active ? 'shield' : 'clock'} />{active ? 'Acces înregistrat în cont' : 'Solicitare în evaluare'}</div>}
      </div>
    </article>
  );
}

export function Marketplace() {
  const { user, brand, navigate } = useApp();
  const [catalog, setCatalog] = useState<MarketplaceCatalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [account, setAccount] = useState<MarketplaceAccount>(EMPTY_ACCOUNT);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [accountRetry, setAccountRetry] = useState(0);
  const [category, setCategory] = useState<MarketplaceCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MarketplaceProduct | null>(null);
  const [message, setMessage] = useState('');
  const [submittingProducts, setSubmittingProducts] = useState<Set<string>>(() => new Set());
  const [requestError, setRequestError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const inFlightProducts = useRef(new Set<string>());
  const dialogGeneration = useRef(0);
  const currentUserId = useRef(user?.id);
  currentUserId.current = user?.id;
  const dialogRef = useRef<HTMLElement>(null);
  const dialogTitle = useId();
  const messageId = useId();
  const searchId = useId();

  const closeProduct = useCallback(() => {
    dialogGeneration.current += 1;
    setSelected(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setCatalogError('');
    marketplaceApi.catalog().then((data) => { if (!cancelled) setCatalog(data); })
      .catch((error: unknown) => { if (!cancelled) setCatalogError(errorMessage(error)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);

  useEffect(() => {
    let cancelled = false;
    setAccount(EMPTY_ACCOUNT); setAccountError('');
    if (!user) { setAccountLoading(false); return; }
    setAccountLoading(true);
    marketplaceApi.mine().then((data) => { if (!cancelled) setAccount(data); })
      .catch((error: unknown) => { if (!cancelled) setAccountError(errorMessage(error)); })
      .finally(() => { if (!cancelled) setAccountLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id, accountRetry]);

  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>('[data-dialog-close]')?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeProduct(); }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled]), [tabindex="0"]'));
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener('keydown', onKeyDown); if (previous?.isConnected) previous.focus(); };
  }, [selected?.id, closeProduct]);

  const products = useMemo(() => (catalog?.products || []).filter((p) => p.status === 'available' || p.status === 'coming_soon')
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ro')), [catalog]);
  const filtered = useMemo(() => {
    const needle = searchText(query.trim());
    return products.filter((product) => (category === 'all' || product.category === category)
      && (!needle || searchText(`${product.name} ${product.summary} ${product.description} ${product.features.join(' ')}`).includes(needle)));
  }, [products, category, query]);
  const pendingProducts = useMemo(() => new Set(account.requests.filter((r) => r.status === 'pending').map((r) => r.product_id)), [account.requests]);
  const activeProducts = useMemo(() => new Set(account.entitlements.filter((e) => e.status === 'active' && (!e.expires_at || new Date(e.expires_at).getTime() > Date.now())).map((e) => e.product_id)), [account.entitlements]);

  const openProduct = useCallback((product: MarketplaceProduct) => {
    dialogGeneration.current += 1;
    setMessage(''); setRequestError(''); setSelected(product);
  }, []);

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !user || inFlightProducts.current.has(selected.id)) return;
    // A request belongs to the product/user/dialog that submitted it. The user
    // may close this dialog and inspect another product while the API responds.
    const product = selected;
    const submittedBy = user.id;
    const submittedFrom = dialogGeneration.current;
    inFlightProducts.current.add(product.id);
    setSubmittingProducts((current) => new Set(current).add(product.id));
    setRequestError(''); setActionError('');
    try {
      const result = await marketplaceApi.requestAccess(product.id, message.trim());
      if (currentUserId.current !== submittedBy) return;
      setAccount((current) => ({ ...current, requests: [result.request, ...current.requests.filter((request) => request.id !== result.request.id)] }));
      setSuccess(`Solicitarea pentru „${product.name}” a fost înregistrată. Urmărește răspunsul în secțiunea Contul meu.`);
      if (dialogGeneration.current === submittedFrom) closeProduct();
    } catch (error: unknown) {
      if (currentUserId.current !== submittedBy) return;
      if (dialogGeneration.current === submittedFrom) setRequestError(errorMessage(error));
      else setActionError(`Solicitarea pentru „${product.name}” nu a fost trimisă. ${errorMessage(error)}`);
    } finally {
      inFlightProducts.current.delete(product.id);
      setSubmittingProducts((current) => { const next = new Set(current); next.delete(product.id); return next; });
    }
  };

  const requestsEnabled = catalog?.settings.requests_enabled ?? false;
  const selectedRequest = selected ? account.requests.find((r) => r.product_id === selected.id && r.status === 'pending') : undefined;
  const submitting = selected ? submittingProducts.has(selected.id) : false;

  return (
    <div className="marketplace" lang="ro">
      <a className="mp-skip-link" href="#" onClick={(event) => { event.preventDefault(); scrollToSection('marketplace-catalog'); }}>Sari la catalog</a>
      <header className="mp-header">
        <div className="mp-container mp-header-inner">
          <button className="mp-brand" type="button" onClick={() => navigate(user ? '/' : '/login')} aria-label="Deschide DanGG"><img src={brand.logo} alt="DanGG" /><span>MARKETPLACE</span></button>
          <nav className="mp-navigation" aria-label="Navigare marketplace">
            <button type="button" onClick={() => scrollToSection('marketplace-catalog')}>Catalog</button>
            <button type="button" onClick={() => scrollToSection('marketplace-management')}>Organizatori</button>
            <button type="button" onClick={() => scrollToSection('marketplace-how')}>Cum funcționează</button>
            {user && <button type="button" onClick={() => scrollToSection('marketplace-account')}>Contul meu</button>}
          </nav>
          <div className="mp-header-actions">
            {user?.is_admin ? <button type="button" className="mp-button mp-button-secondary mp-header-admin" onClick={() => navigate('/admin?section=marketplace')}><Icon name="shield" />Administrare</button> : null}
            <button type="button" className="mp-button mp-button-primary" onClick={() => navigate(user ? '/' : '/login?returnTo=marketplace')}>{user ? 'Deschide DanGG' : 'Intră în cont'}<Icon name="arrow" /></button>
          </div>
        </div>
      </header>
      <PlatformTabs />

      <main>
        <section className="mp-hero mp-container" aria-labelledby="marketplace-title">
          <div className="mp-hero-copy">
            <span className="mp-eyebrow"><span className="mp-gold-dot" />DANGG OPEN NETWORK</span>
            <h1 id="marketplace-title">{catalog?.settings.title || 'Comunitatea ta. Posibilități noi.'}</h1>
            <p className="mp-hero-description">{catalog?.settings.subtitle || 'Cod deschis pentru comunitate. Servicii și instrumente DanGG pentru organizatori. Alege cum îți construiești experiența de poker.'}</p>
            <div className="mp-hero-actions"><button type="button" className="mp-button mp-button-primary mp-button-large" onClick={() => scrollToSection('marketplace-catalog')}>Explorează catalogul<Icon name="arrow" /></button><a className="mp-text-link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer"><Icon name="code" />Vezi proiectul open-source<Icon name="external" /></a></div>
            <div className="mp-hero-facts"><span><Icon name="check" />Jucători gratuit</span><span><Icon name="check" />Comunități independente</span><span><Icon name="check" />Servicii la alegere</span></div>
          </div>
          <div className="mp-ecosystem" aria-label="DanGG conectează ediția Community, serviciile oficiale și extensiile marketplace">
            <div className="mp-orbit mp-orbit-one" /><div className="mp-orbit mp-orbit-two" />
            <div className="mp-ecosystem-glow" />
            <div className="mp-ecosystem-center"><img src={brand.logo} alt="" /><span>UN LOC PENTRU COMUNITATEA TA</span></div>
            <div className="mp-ecosystem-card mp-ecosystem-community"><span className="mp-ecosystem-icon"><Icon name="code" /></span><div><strong>Community</strong><span>Cod deschis · AGPLv3</span></div><span className="mp-mini-dot" /></div>
            <div className="mp-ecosystem-card mp-ecosystem-network"><span className="mp-ecosystem-icon"><Icon name="server" /></span><div><strong>DanGG Network</strong><span>Servicii oficiale</span></div><Icon name="arrow" /></div>
            <div className="mp-ecosystem-card mp-ecosystem-extensions"><span className="mp-ecosystem-icon"><Icon name="layers" /></span><div><strong>Marketplace</strong><span>Instrumente & extensii</span></div><Icon name="spark" /></div>
            <span className="mp-ecosystem-caption">COMUNITATE · INFRASTRUCTURĂ · POSIBILITĂȚI</span>
          </div>
        </section>

        <section className="mp-principles mp-container" aria-label="Principiile DanGG Marketplace">
          <div><Icon name="code" /><p><strong>Tu alegi unde rulezi</strong><span>Pe infrastructura ta sau prin serviciile oficiale DanGG.</span></p></div>
          <div><Icon name="shield" /><p><strong>Condiții transparente</strong><span>Fiecare produs își precizează livrarea și disponibilitatea.</span></p></div>
          <div><Icon name="layers" /><p><strong>Separat de jetoanele de joc</strong><span>Marketplace-ul este pentru software și servicii.</span></p></div>
        </section>

        {success && <div className="mp-container"><div className="mp-notice mp-notice-success" role="status"><Icon name="check" /><span>{success}</span><button type="button" onClick={() => setSuccess('')} aria-label="Închide confirmarea"><Icon name="close" /></button></div></div>}
        {actionError && <div className="mp-container"><div className="mp-notice mp-notice-error mp-action-error" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError('')} aria-label="Închide mesajul de eroare"><Icon name="close" /></button></div></div>}

        <section id="marketplace-catalog" className="mp-section mp-container" aria-labelledby="marketplace-catalog-title">
          <div className="mp-section-heading"><div><span className="mp-eyebrow">ALEGE CE SE POTRIVEȘTE COMUNITĂȚII TALE</span><h2 id="marketplace-catalog-title">Catalogul DanGG</h2></div><p>Explorează oferta și trimite o solicitare.<br />Disponibilitatea și condițiile se confirmă înainte de activare.</p></div>
          <div className="mp-catalog-toolbar">
            <div className="mp-filters" role="group" aria-label="Filtrează după categorie"><button type="button" className={category === 'all' ? 'is-active' : ''} onClick={() => setCategory('all')} aria-pressed={category === 'all'}>Toate<span>{products.length}</span></button>{(Object.keys(MARKETPLACE_CATEGORY_LABELS) as MarketplaceCategory[]).map((key) => <button key={key} type="button" className={category === key ? 'is-active' : ''} onClick={() => setCategory(key)} aria-pressed={category === key}>{MARKETPLACE_CATEGORY_LABELS[key]}</button>)}</div>
            <label className="mp-search" htmlFor={searchId}><Icon name="search" /><span className="mp-sr-only">Caută în catalog</span><input id={searchId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Caută un serviciu sau o extensie" type="search" /></label>
          </div>
          {loading ? <div className="mp-product-grid" aria-busy="true" aria-label="Se încarcă produsele">{[0, 1, 2].map((i) => <div className="mp-skeleton" key={i}><div /><span /><span /><span /></div>)}</div>
            : catalogError ? <div className="mp-empty" role="alert"><Icon name="server" /><h3>Catalogul nu este disponibil momentan</h3><p>{catalogError}</p><button type="button" className="mp-button mp-button-secondary" onClick={() => setRetry((value) => value + 1)}>Încearcă din nou</button></div>
              : filtered.length ? <div className="mp-product-grid">{filtered.map((product) => <ProductCard key={product.id} product={product} onOpen={openProduct} requested={pendingProducts.has(product.id)} active={activeProducts.has(product.id)} />)}</div>
                : <div className="mp-empty"><Icon name={products.length ? 'search' : 'layers'} /><h3>{products.length ? 'Niciun produs pentru această căutare' : 'Catalogul se pregătește'}</h3><p>{products.length ? 'Încearcă alt termen sau explorează toate categoriile.' : 'Produsele publicate de echipa DanGG vor apărea aici, cu detalii și disponibilitate.'}</p>{products.length > 0 && <button type="button" className="mp-button mp-button-secondary" onClick={() => { setQuery(''); setCategory('all'); }}>Resetează filtrele</button>}</div>}
          <div className="mp-catalog-note"><Icon name="shield" /><p>{catalog?.settings.contact_note || 'Solicitările sunt analizate de echipa DanGG. Această pagină nu procesează plăți; prețul și livrarea se confirmă înainte de activare.'}</p></div>
        </section>

        <section id="marketplace-management" className="mp-section mp-container" aria-label="Administrare prin pluginuri">
          <ManagementPlugins userId={user?.id} onSelect={(productId) => { const product = products.find((entry) => entry.id === productId); if (product) openProduct(product); else { setCategory('all'); setQuery(''); scrollToSection('marketplace-catalog'); } }} />
        </section>

        <section className="mp-section mp-container"><OrganizerBilling key={user?.id ?? "guest"} userId={user?.id} /></section>
        <PlayMoneyPlugins />
        <section className="mp-section mp-container"><OrganizerChips key={`chips-${user?.id ?? 'guest'}`} userId={user?.id} /></section>

        <section id="marketplace-how" className="mp-explanation-band" aria-labelledby="marketplace-how-title"><div className="mp-container mp-section">
          <div className="mp-section-heading"><div><span className="mp-eyebrow">LIBERTATE PENTRU COMUNITATE. OPȚIUNI PENTRU ORGANIZATORI.</span><h2 id="marketplace-how-title">Un proiect deschis.<br />Mai multe moduri de a-l folosi.</h2></div><p>Licența codului și accesul la un serviciu sunt lucruri distincte. Alege varianta potrivită pentru tine.</p></div>
          <div className="mp-explanation-grid">
            <article><span className="mp-explanation-number">01</span><Icon name="code" /><h3>DanGG Community</h3><p>Descarci, instalezi și îmbunătățești ediția open-source pe serverul tău, în condițiile AGPLv3. Tu îți administrezi infrastructura și datele.</p><a className="mp-text-link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">Explorează codul<Icon name="external" /></a></article>
            <article><span className="mp-explanation-number">02</span><Icon name="server" /><h3>Serviciile oficiale</h3><p>Poți solicita găzduire, capacitate, configurare sau suport de la DanGG. Serviciile se oferă conform disponibilității și condițiilor fiecărui produs.</p><button type="button" className="mp-text-link" onClick={() => { setCategory('hosting'); scrollToSection('marketplace-catalog'); }}>Vezi opțiunile de găzduire<Icon name="arrow" /></button></article>
            <article><span className="mp-explanation-number">03</span><Icon name="layers" /><h3>Extensii și integrări</h3><p>Fiecare extensie are propriile condiții de utilizare, compatibile cu aplicația. O extensie vândută sub AGPL păstrează drepturile oferite de acea licență.</p><button type="button" className="mp-text-link" onClick={() => { setCategory('extensions'); scrollToSection('marketplace-catalog'); }}>Explorează extensiile<Icon name="arrow" /></button></article>
          </div>
          <div className="mp-flow"><span><b>1</b>Alegi un produs</span><Icon name="arrow" /><span><b>2</b>Trimiți o solicitare</span><Icon name="arrow" /><span><b>3</b>Primești un răspuns în cont</span></div>
        </div></section>

        {user && <section id="marketplace-account" className="mp-section mp-container" aria-labelledby="marketplace-account-title">
          <div className="mp-section-heading"><div><span className="mp-eyebrow">SPAȚIUL TĂU</span><h2 id="marketplace-account-title">Solicitări și acces</h2></div><button type="button" className="mp-button mp-button-secondary" onClick={() => setAccountRetry((value) => value + 1)} disabled={accountLoading}>{accountLoading ? 'Se actualizează…' : 'Actualizează'}</button></div>
          {accountError && <div className="mp-notice mp-notice-error" role="alert">{accountError}</div>}
          {accountLoading ? <p className="mp-account-loading" role="status">Se încarcă datele contului…</p> : <div className="mp-account-grid">
            <div className="mp-account-panel"><h3><Icon name="clock" />Solicitările mele<span>{account.requests.length}</span></h3>{account.requests.length === 0 ? <p className="mp-account-empty">Nu ai trimis încă o solicitare. Alege un produs din catalog pentru a începe.</p> : <ul className="mp-account-list">{account.requests.map((request) => <li key={request.id}><div className="mp-account-row"><strong>{request.product_name}</strong><span className={`mp-account-status mp-account-${request.status}`}>{REQUEST_STATUS[request.status]}</span></div><time>{displayDate(request.created_at)}</time>{request.message && <p className="mp-account-message">{request.message}</p>}{request.response && <div className="mp-team-response"><b>Răspuns DanGG</b><p>{request.response}</p></div>}</li>)}</ul>}</div>
            <div className="mp-account-panel"><h3><Icon name="shield" />Accesul meu<span>{account.entitlements.length}</span></h3>{account.entitlements.length === 0 ? <p className="mp-account-empty">Accesul acordat de echipa DanGG va apărea aici, împreună cu perioada de valabilitate.</p> : <ul className="mp-account-list">{account.entitlements.map((entitlement) => {
              const expired = Boolean(entitlement.expires_at && new Date(entitlement.expires_at).getTime() <= Date.now());
              const active = entitlement.status === 'active' && !expired;
              return <li key={entitlement.id}><div className="mp-account-row"><strong>{entitlement.product_name}</strong><span className={`mp-account-status ${active ? 'mp-account-approved' : 'mp-account-declined'}`}>{entitlement.status === 'revoked' ? 'Revocat' : expired ? 'Expirat' : 'Acordat'}</span></div><time>{entitlement.expires_at ? `Valabil până la ${displayDate(entitlement.expires_at)}` : 'Fără dată de expirare'}</time>{entitlement.note && <p>{entitlement.note}</p>}</li>;
            })}</ul>}<p className="mp-access-note">Drepturile de acces sunt înregistrate în cont. Livrarea fiecărui serviciu se confirmă conform ofertei.</p></div>
          </div>}
        </section>}

        <div className="mp-section mp-container" id="marketplace-publisher"><MarketplacePublisher userId={user?.id} onLogin={() => navigate('/login?returnTo=marketplace')} /></div>

        <section className="mp-section mp-container mp-faq" aria-labelledby="marketplace-faq-title">
          <div><span className="mp-eyebrow">RĂSPUNSURI CLARE</span><h2 id="marketplace-faq-title">Înainte să alegi.</h2><p>Ce primești prin codul open-source și ce înseamnă serviciile din marketplace.</p><a className="mp-text-link" href={`${SOURCE_FILE_ROOT}/docs/LICENSING.md`} target="_blank" rel="noopener noreferrer">Ghidul de licențiere<Icon name="external" /></a></div>
          <div className="mp-faq-list">
            <details><summary>Pot copia, folosi și îmbunătăți DanGG?<span>+</span></summary><p>Da. Ediția Community este publicată sub AGPLv3. Poți să o folosești și să o modifici, inclusiv comercial, respectând licența. Pentru versiunile modificate oferite utilizatorilor prin rețea se aplică obligațiile AGPL privind accesul la sursa corespunzătoare.</p></details>
            <details><summary>Pentru ce plătesc în marketplace?<span>+</span></summary><p>Pentru serviciile, capacitatea sau extensiile descrise în oferta aleasă. În această etapă trimiți o solicitare, iar echipa confirmă disponibilitatea, prețul și condițiile. Trimiterea unei solicitări nu efectuează o plată și nu creează automat un abonament.</p></details>
            <details><summary>O funcție plătită este automat cu cod închis?<span>+</span></summary><p>Nu. Licența fiecărui produs stabilește drepturile asupra codului. O funcție distribuită sub AGPL poate fi modificată pe o instalare proprie; aceasta nu oferă acces gratuit la infrastructura sau serviciile oficiale DanGG. Condițiile modulelor comerciale se verifică înainte de livrare.</p></details>
            <details><summary>Serviciile au legătură cu jetoanele de joc?<span>+</span></summary><p>Soldurile demo gratuite nu au valoare monetară și nu se convertesc în Cash Chips. Când serviciile plătite sunt active, abonamentul Organizator de $9/lună include 100.000 Cash Chips; pachetele suplimentare costă $1 pentru 10.000. Cash Chips sunt valabile numai la organizatorul emitent. Acesta stabilește separat condițiile cu jucătorii și plătește eventualele răscumpărări; platforma nu execută și nu garantează acele plăți externe. Creditele pentru servicii rămân un sold separat.</p></details>
            <details><summary>Cum se verifică o alimentare sau o solicitare de rambursare?<span>+</span></summary><p>Alimentările NervixPay se creditează numai după verificarea manuală a plății finale și a contului beneficiar. Păstrează ID-ul comenzii și contactează Suport pentru verificare, o plată greșită sau o solicitare de rambursare. Deschiderea checkout-ului nu confirmă plata, iar alimentarea nu activează automat un abonament. Rambursările și răscumpărările externe nu sunt automate.</p></details>
          </div>
        </section>
      </main>

      <footer className="mp-footer"><div className="mp-container"><div><img src={brand.logo} alt="DanGG" /><p>Poker social. Cod deschis. Comunitatea ta.</p></div><nav aria-label="Informații legale"><a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">Cod sursă<Icon name="external" /></a><a href="/legal/LICENSE" target="_blank" rel="noopener noreferrer">Licență AGPLv3</a><a href={`${SOURCE_FILE_ROOT}/TRADEMARKS.md`} target="_blank" rel="noopener noreferrer">Brand DanGG</a><button type="button" onClick={() => navigate('/support')}>Suport</button></nav><span>DanGG · Demo &amp; organizer services · 18+</span></div></footer>

      {selected && <div className="mp-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProduct(); }}>
        <section ref={dialogRef} className="mp-modal" role="dialog" aria-modal="true" aria-labelledby={dialogTitle}>
          <button type="button" data-dialog-close className="mp-modal-close mp-round-button" onClick={closeProduct} aria-label="Închide detaliile"><Icon name="close" /></button>
          <div className="mp-modal-heading"><span className="mp-product-symbol"><Icon name={CATEGORY_ICONS[selected.category]} /></span><span className="mp-eyebrow">{MARKETPLACE_DELIVERY_LABELS[selected.delivery]}</span><h2 id={dialogTitle}>{selected.name}</h2><p>{selected.summary}</p></div>
          <div className="mp-modal-price"><strong>{marketplacePrice(selected)}</strong><span className={`mp-status ${selected.status === 'available' ? 'mp-status-ready' : ''}`}><span />{selected.status === 'available' ? 'Disponibil' : 'În pregătire'}</span></div>
          <p className="mp-product-description">{selected.description}</p>
          {selected.features.length > 0 && <ul className="mp-feature-list">{selected.features.map((feature, i) => <li key={`${feature}-${i}`}><Icon name="check" /><span>{feature}</span></li>)}</ul>}
          <div className="mp-delivery-explanation"><Icon name="shield" /><p>{selected.delivery === 'hosted_service' ? 'Serviciu furnizat de DanGG, conform ofertei confirmate. Accesul la serviciu este separat de dreptul de a instala ediția Community.' : selected.delivery === 'open_source_extension' ? 'Extensie open-source. Licența aplicabilă și instrucțiunile de instalare se comunică înainte de livrare; plata nu elimină drepturile oferite de licență.' : 'Modul comercial. Condițiile de licențiere, compatibilitatea și livrarea se confirmă înainte de orice achiziție.'}</p></div>
          {requestError && <div className="mp-notice mp-notice-error" role="alert">{requestError}</div>}
          {selectedRequest ? <div className="mp-modal-requested" role="status"><Icon name="clock" /><div><strong>Solicitarea ta este în evaluare</strong><p>Poți urmări răspunsul în secțiunea Contul meu.</p></div><button type="button" className="mp-text-link" onClick={() => { closeProduct(); scrollToSection('marketplace-account'); }}>Vezi solicitările<Icon name="arrow" /></button></div>
            : activeProducts.has(selected.id) ? <div className="mp-modal-requested"><Icon name="shield" /><div><strong>Ai un drept de acces înregistrat</strong><p>Verifică detaliile și valabilitatea în secțiunea Contul meu.</p></div></div>
              : !requestsEnabled ? <div className="mp-modal-requested"><Icon name="clock" /><p>Solicitările sunt momentan închise. Poți reveni pentru disponibilitatea acestui produs.</p></div>
                : !user ? <div className="mp-modal-signin"><p>Intră în cont pentru a trimite o solicitare și a urmări răspunsul echipei.</p><button type="button" className="mp-button mp-button-primary" onClick={() => { closeProduct(); navigate('/login?returnTo=marketplace'); }}>Intră în cont<Icon name="arrow" /></button></div>
                  : <form className="mp-request-form" onSubmit={submitRequest}><label htmlFor={messageId}>{selected.status === 'coming_soon' ? 'Spune-ne cum ai folosi acest produs' : 'Spune-ne de ce are nevoie comunitatea ta'}<span>Opțional</span></label><textarea id={messageId} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={3} placeholder="De exemplu: numărul de participanți și serviciile care te interesează." disabled={submitting} /><div className="mp-request-footer"><p>Solicitarea nu implică o plată.{selected.status === 'coming_soon' ? ' Produsul este încă în pregătire.' : ''}</p><button type="submit" className="mp-button mp-button-primary" disabled={submitting}>{submitting ? 'Se trimite…' : selected.status === 'coming_soon' ? 'Înregistrează interesul' : 'Trimite solicitarea'}<Icon name="arrow" /></button></div></form>}
        </section>
      </div>}
    </div>
  );
}
