import React, { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import {
  MARKETPLACE_CATEGORY_LABELS, MARKETPLACE_DELIVERY_LABELS, marketplaceApi, marketplacePrice,
  type MarketplaceAccount, type MarketplaceCatalog, type MarketplaceCategory, type MarketplaceProduct,
} from '../lib/marketplace-api';
import '../marketplace.css';
import '../profile-roles.css';
import { ManagementPlugins } from '../components/ManagementPlugins';
import { MarketplacePublisher } from '../components/MarketplacePublisher';
import { OrganizerBilling } from '../components/OrganizerBilling';
import { OrganizerChips } from '../components/OrganizerChips';
import { PlayMoneyPlugins } from '../components/PlayMoneyPlugins';
import { ContributorDirectory, marketplaceProductLabel, type PublicContributor } from '../components/ContributorDirectory';
import { ProfileWorkspaceTabs } from '../components/ProfileWorkspaceTabs';
import { Avatar } from '../components/Avatar';

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
const REQUEST_STATUS = { pending: 'Under review', approved: 'Approved', declined: 'Declined' };
const EMPTY_ACCOUNT: MarketplaceAccount = { requests: [], entitlements: [] };
const SOURCE_URL = __APP_SOURCE_URL__;
const SOURCE_FILE_ROOT = SOURCE_URL.replace('/tree/', '/blob/');

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'We could not complete the request. Please try again.';
}

function displayDate(value: string): string {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function searchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US');
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function ProductArtwork({ product }: { product: MarketplaceProduct }) {
  const kind = product.id === 'cash-games-manager' ? 'cash'
    : product.id === 'tournaments-manager' ? 'tournament'
      : product.id === 'spin-and-go-manager' ? 'spin'
        : product.category;
  return <svg className={`mp-product-art mp-product-art-${kind}`} viewBox="0 0 360 180" aria-hidden="true" focusable="false">
    <path className="mp-art-horizon" d="M18 142C92 91 172 158 342 72" />
    {kind === 'cash' ? <>
      <ellipse cx="181" cy="105" rx="115" ry="54" /><ellipse cx="181" cy="105" rx="86" ry="36" />
      <path d="m151 112 18-39 24 5 18 42-30 13-30-21Z" /><path d="m169 73 14 30 10-25" />
      <circle cx="83" cy="91" r="15" /><circle cx="278" cy="111" r="15" /><path d="m74 91 9-9 9 9-9 9-9-9Zm195 20 9-9 9 9-9 9-9-9Z" />
    </> : kind === 'tournament' ? <>
      <path d="M137 51h86v28c0 30-17 50-43 50s-43-20-43-50V51Z" /><path d="M137 65h-24v12c0 21 16 31 34 31m76-43h24v12c0 21-16 31-34 31M180 129v22m-31 0h62" />
      <path d="m180 67 6 12 14 2-10 10 2 14-12-7-12 7 2-14-10-10 14-2 6-12Z" />
      <circle cx="88" cy="110" r="18" /><circle cx="278" cy="92" r="12" />
    </> : kind === 'spin' ? <>
      <circle cx="181" cy="99" r="64" /><circle cx="181" cy="99" r="13" />
      <path d="m181 35 13 51 40-34-27 44 55 3-55 10 34 42-47-29-13 41-9-41-48 29 34-42-56-10 55-3-27-44 40 34 11-51Z" />
      <path className="mp-art-spin-mark" d="m180 74 8 17 18 7-18 8-8 18-8-18-18-8 18-7 8-17Z" />
    </> : kind === 'hosting' ? <>
      <rect x="104" y="55" width="152" height="35" rx="9" /><rect x="104" y="99" width="152" height="35" rx="9" />
      <circle cx="125" cy="72" r="4" /><circle cx="125" cy="116" r="4" /><path d="M145 72h82M145 116h82" />
    </> : kind === 'customization' ? <>
      <path d="M121 136 222 35l27 27-101 101-35 8 8-35Z" /><path d="m205 52 27 27M126 134l22 22" />
      <circle cx="91" cy="67" r="15" /><circle cx="271" cy="126" r="10" />
    </> : kind === 'extensions' ? <>
      <path d="M113 73h39V48a18 18 0 1 1 36 0v25h39v39h25a18 18 0 1 1 0 36h-64v-25h-36v25h-39V73Z" />
    </> : <>
      <rect x="104" y="45" width="65" height="65" rx="13" /><rect x="191" y="45" width="65" height="65" rx="13" /><rect x="148" y="105" width="65" height="55" rx="13" />
    </>}
  </svg>;
}

function ProductCard({ product, contributor, onOpen, requested, active }: {
  product: MarketplaceProduct; contributor?: PublicContributor; onOpen: (product: MarketplaceProduct) => void; requested: boolean; active: boolean;
}) {
  const productName = marketplaceProductLabel(product);
  return (
    <article id={`product-${encodeURIComponent(product.id)}`} className={`mp-product ${product.featured ? 'mp-product-featured' : ''}`}>
      <div className={`mp-product-cover mp-cover-${product.category}`}>
        <ProductArtwork product={product} />
        <span className="mp-product-symbol"><Icon name={CATEGORY_ICONS[product.category]} /></span>
        <span className={`mp-status ${product.status === 'available' ? 'mp-status-ready' : ''}`}>
          <span />{product.status === 'available' ? 'Available' : 'Coming soon'}
        </span>
        <span className="mp-cover-category">{MARKETPLACE_CATEGORY_LABELS[product.category]}</span>
      </div>
      <div className="mp-product-body">
        <span className="mp-eyebrow mp-product-delivery">{MARKETPLACE_DELIVERY_LABELS[product.delivery]}</span>
        <h3><button type="button" onClick={() => onOpen(product)}>{productName}</button></h3>
        {contributor && <button type="button" className="mp-product-creator" onClick={() => scrollToSection(`contributor-${encodeURIComponent(contributor.id)}`)}>By {contributor.display_name}</button>}
        <p>{product.summary}</p>
        {product.features.length > 0 && <ul className="mp-feature-list">{product.features.slice(0, 3).map((feature, i) => <li key={`${feature}-${i}`}><Icon name="check" /><span>{feature}</span></li>)}</ul>}
        <div className="mp-product-bottom">
          <div className="mp-price"><strong>{marketplacePrice(product)}</strong><span>{product.pricing === 'quote' ? 'Quote confirmed individually' : product.status === 'coming_soon' ? 'Availability in preparation' : 'Review the service terms'}</span></div>
          <button type="button" className="mp-card-cta" onClick={() => onOpen(product)} aria-label={`View details: ${productName}`}>View details<Icon name="arrow" /></button>
        </div>
        {(active || requested) && <div className="mp-product-account"><Icon name={active ? 'shield' : 'clock'} />{active ? 'Access recorded in your account' : 'Request under review'}</div>}
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
  const [contributors, setContributors] = useState<PublicContributor[]>([]);
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
    .sort((a, b) => Number(b.status === 'available') - Number(a.status === 'available') || Number(b.featured) - Number(a.featured) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'en')), [catalog]);
  const filtered = useMemo(() => {
    const needle = searchText(query.trim());
    return products.filter((product) => (category === 'all' || product.category === category)
      && (!needle || searchText(`${product.name} ${product.summary} ${product.description} ${product.features.join(' ')}`).includes(needle)));
  }, [products, category, query]);
  const pendingProducts = useMemo(() => new Set(account.requests.filter((r) => r.status === 'pending').map((r) => r.product_id)), [account.requests]);
  const activeProducts = useMemo(() => new Set(account.entitlements.filter((e) => e.status === 'active' && (!e.expires_at || new Date(e.expires_at).getTime() > Date.now())).map((e) => e.product_id)), [account.entitlements]);
  const contributorsByProduct = useMemo(() => new Map(contributors.flatMap((contributor) => contributor.products.map((product) => [product.id, contributor]))), [contributors]);
  const receiveContributors = useCallback((next: PublicContributor[]) => setContributors(next), []);
  const showContributorProduct = useCallback((productId: string) => {
    setCategory('all');
    setQuery('');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => scrollToSection(`product-${encodeURIComponent(productId)}`)));
  }, []);

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
      setSuccess(`Your request for “${marketplaceProductLabel(product)}” was recorded. Track the response in My account.`);
      if (dialogGeneration.current === submittedFrom) closeProduct();
    } catch (error: unknown) {
      if (currentUserId.current !== submittedBy) return;
      if (dialogGeneration.current === submittedFrom) setRequestError(errorMessage(error));
      else setActionError(`Your request for “${marketplaceProductLabel(product)}” was not sent. ${errorMessage(error)}`);
    } finally {
      inFlightProducts.current.delete(product.id);
      setSubmittingProducts((current) => { const next = new Set(current); next.delete(product.id); return next; });
    }
  };

  const requestsEnabled = catalog?.settings.requests_enabled ?? false;
  const selectedRequest = selected ? account.requests.find((r) => r.product_id === selected.id && r.status === 'pending') : undefined;
  const submitting = selected ? submittingProducts.has(selected.id) : false;

  return (
    <div className="marketplace" lang="en">
      <a className="mp-skip-link" href="#" onClick={(event) => { event.preventDefault(); scrollToSection('marketplace-catalog'); }}>Skip to catalog</a>
      <header className="mp-header">
        <div className="mp-container mp-header-inner">
          <button className="mp-brand" type="button" onClick={() => navigate(user ? '/' : '/login')} aria-label="Open DanGG"><img src={brand.logo} alt="DanGG" /><span>MARKETPLACE</span></button>
          <nav className="mp-navigation" aria-label="Marketplace navigation">
            <button type="button" onClick={() => scrollToSection('marketplace-catalog')}>Catalog</button>
            <button type="button" onClick={() => scrollToSection('marketplace-contributors')}>Contributors</button>
            <button type="button" onClick={() => scrollToSection('marketplace-management')}>Organizers</button>
            <button type="button" onClick={() => scrollToSection('marketplace-how')}>How it works</button>
            {user && <button type="button" onClick={() => scrollToSection('marketplace-account')}>My account</button>}
          </nav>
          <div className="mp-header-actions">
            {user?.is_admin ? <button type="button" className="mp-button mp-button-secondary mp-header-admin" onClick={() => navigate('/admin?section=marketplace')}><Icon name="shield" />Admin</button> : null}
            {user ? <button type="button" className="mp-profile-button" aria-label="Open Profile" onClick={() => navigate('/my-page')}><Avatar name={user.nick || 'Player'} src={user.avatar} size={38} /></button>
              : <button type="button" className="mp-button mp-button-primary" onClick={() => navigate('/login?returnTo=marketplace')}>Sign in<Icon name="arrow" /></button>}
          </div>
        </div>
      </header>

      <main>
        <div className="mp-container mp-workspace-navigation"><ProfileWorkspaceTabs active="marketplace" /></div>
        <section className="mp-hero mp-container" aria-labelledby="marketplace-title">
          <div className="mp-hero-copy">
            <span className="mp-eyebrow"><span className="mp-gold-dot" />DANGG OPEN NETWORK</span>
            <h1 id="marketplace-title">{catalog?.settings.title || 'Your community. New possibilities.'}</h1>
            <p className="mp-hero-description">{catalog?.settings.subtitle || 'Open source for the community. DanGG services and tools for organizers. Choose how you build your poker experience.'}</p>
            <div className="mp-hero-actions"><button type="button" className="mp-button mp-button-primary mp-button-large" onClick={() => scrollToSection('marketplace-catalog')}>Explore the catalog<Icon name="arrow" /></button><button type="button" className="mp-button mp-button-secondary mp-button-large" onClick={() => scrollToSection('marketplace-contributors')}>Contributors</button><a className="mp-text-link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer"><Icon name="code" />View the open-source project<Icon name="external" /></a></div>
            <div className="mp-hero-facts"><span><Icon name="check" />Free for players</span><span><Icon name="check" />Independent communities</span><span><Icon name="check" />Optional services</span></div>
          </div>
          <div className="mp-ecosystem" aria-label="DanGG connects the Community edition, official services, and marketplace extensions">
            <div className="mp-orbit mp-orbit-one" /><div className="mp-orbit mp-orbit-two" />
            <div className="mp-ecosystem-glow" />
            <div className="mp-ecosystem-center"><img src={brand.logo} alt="" /><span>A PLACE FOR YOUR COMMUNITY</span></div>
            <div className="mp-ecosystem-card mp-ecosystem-community"><span className="mp-ecosystem-icon"><Icon name="code" /></span><div><strong>Community</strong><span>Open source · AGPLv3</span></div><span className="mp-mini-dot" /></div>
            <div className="mp-ecosystem-card mp-ecosystem-network"><span className="mp-ecosystem-icon"><Icon name="server" /></span><div><strong>DanGG Network</strong><span>Official services</span></div><Icon name="arrow" /></div>
            <div className="mp-ecosystem-card mp-ecosystem-extensions"><span className="mp-ecosystem-icon"><Icon name="layers" /></span><div><strong>Marketplace</strong><span>Tools &amp; extensions</span></div><Icon name="spark" /></div>
            <span className="mp-ecosystem-caption">COMMUNITY · INFRASTRUCTURE · POSSIBILITIES</span>
          </div>
        </section>

        <section className="mp-principles mp-container" aria-label="DanGG Marketplace principles">
          <div><Icon name="code" /><p><strong>You choose where to run it</strong><span>On your infrastructure or through official DanGG services.</span></p></div>
          <div><Icon name="shield" /><p><strong>Transparent terms</strong><span>Every product states its delivery model and availability.</span></p></div>
          <div><Icon name="layers" /><p><strong>Separate from game chips</strong><span>The marketplace is for software and services.</span></p></div>
        </section>

        {success && <div className="mp-container"><div className="mp-notice mp-notice-success" role="status"><Icon name="check" /><span>{success}</span><button type="button" onClick={() => setSuccess('')} aria-label="Close confirmation"><Icon name="close" /></button></div></div>}
        {actionError && <div className="mp-container"><div className="mp-notice mp-notice-error mp-action-error" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError('')} aria-label="Close error message"><Icon name="close" /></button></div></div>}

        <section id="marketplace-catalog" className="mp-section mp-container" aria-labelledby="marketplace-catalog-title">
          <div className="mp-section-heading"><div><span className="mp-eyebrow">CHOOSE WHAT FITS YOUR COMMUNITY</span><h2 id="marketplace-catalog-title">DanGG Catalog</h2></div><p>Explore the offers and send a request.<br />Availability and terms are confirmed before activation.</p></div>
          <div className="mp-catalog-toolbar">
            <div className="mp-filters" role="group" aria-label="Filter by category"><button type="button" className={category === 'all' ? 'is-active' : ''} onClick={() => setCategory('all')} aria-pressed={category === 'all'}>All<span>{products.length}</span></button>{(Object.keys(MARKETPLACE_CATEGORY_LABELS) as MarketplaceCategory[]).map((key) => <button key={key} type="button" className={category === key ? 'is-active' : ''} onClick={() => setCategory(key)} aria-pressed={category === key}>{MARKETPLACE_CATEGORY_LABELS[key]}</button>)}</div>
            <label className="mp-search" htmlFor={searchId}><Icon name="search" /><span className="mp-sr-only">Search the catalog</span><input id={searchId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for a service or extension" type="search" /></label>
          </div>
          {loading ? <div className="mp-product-grid" aria-busy="true" aria-label="Loading products">{[0, 1, 2].map((i) => <div className="mp-skeleton" key={i}><div /><span /><span /><span /></div>)}</div>
            : catalogError ? <div className="mp-empty" role="alert"><Icon name="server" /><h3>The catalog is currently unavailable</h3><p>{catalogError}</p><button type="button" className="mp-button mp-button-secondary" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>
              : filtered.length ? <div className="mp-product-grid">{filtered.map((product) => <ProductCard key={product.id} product={product} contributor={contributorsByProduct.get(product.id)} onOpen={openProduct} requested={pendingProducts.has(product.id)} active={activeProducts.has(product.id)} />)}</div>
                : <div className="mp-empty"><Icon name={products.length ? 'search' : 'layers'} /><h3>{products.length ? 'No products match this search' : 'The catalog is being prepared'}</h3><p>{products.length ? 'Try another term or explore every category.' : 'Products published by the DanGG team will appear here with details and availability.'}</p>{products.length > 0 && <button type="button" className="mp-button mp-button-secondary" onClick={() => { setQuery(''); setCategory('all'); }}>Reset filters</button>}</div>}
          <div className="mp-catalog-note"><Icon name="shield" /><p>{catalog?.settings.contact_note || 'Requests are reviewed by the DanGG team. This page does not process payments; price and delivery are confirmed before activation.'}</p></div>
        </section>

        <ContributorDirectory onContributors={receiveContributors} onProductSelect={showContributorProduct} />

        <section id="marketplace-management" className="mp-section mp-container" aria-label="Plugin management">
          <ManagementPlugins userId={user?.id} onSelect={(productId) => { const product = products.find((entry) => entry.id === productId); if (product) openProduct(product); else { setCategory('all'); setQuery(''); scrollToSection('marketplace-catalog'); } }} />
        </section>

        <section className="mp-section mp-container"><OrganizerBilling key={user?.id ?? "guest"} userId={user?.id} /></section>
        <PlayMoneyPlugins />
        <section className="mp-section mp-container"><OrganizerChips key={`chips-${user?.id ?? 'guest'}`} userId={user?.id} /></section>

        <section id="marketplace-how" className="mp-explanation-band" aria-labelledby="marketplace-how-title"><div className="mp-container mp-section">
          <div className="mp-section-heading"><div><span className="mp-eyebrow">FREEDOM FOR THE COMMUNITY. OPTIONS FOR ORGANIZERS.</span><h2 id="marketplace-how-title">One open project.<br />More ways to use it.</h2></div><p>The code license and access to a service are separate. Choose the option that fits you.</p></div>
          <div className="mp-explanation-grid">
            <article><span className="mp-explanation-number">01</span><Icon name="code" /><h3>DanGG Community</h3><p>Download, install, and improve the open-source edition on your server under AGPLv3. You manage your infrastructure and data.</p><a className="mp-text-link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">Explore the code<Icon name="external" /></a></article>
            <article><span className="mp-explanation-number">02</span><Icon name="server" /><h3>Official services</h3><p>Request hosting, capacity, configuration, or support from DanGG. Services are provided according to each product's availability and terms.</p><button type="button" className="mp-text-link" onClick={() => { setCategory('hosting'); scrollToSection('marketplace-catalog'); }}>View hosting options<Icon name="arrow" /></button></article>
            <article><span className="mp-explanation-number">03</span><Icon name="layers" /><h3>Extensions and integrations</h3><p>Each extension has its own application-compatible terms. An extension sold under AGPL retains the rights granted by that license.</p><button type="button" className="mp-text-link" onClick={() => { setCategory('extensions'); scrollToSection('marketplace-catalog'); }}>Explore extensions<Icon name="arrow" /></button></article>
          </div>
          <div className="mp-flow"><span><b>1</b>Choose a product</span><Icon name="arrow" /><span><b>2</b>Send a request</span><Icon name="arrow" /><span><b>3</b>Receive a response in your account</span></div>
        </div></section>

        {user && <section id="marketplace-account" className="mp-section mp-container" aria-labelledby="marketplace-account-title">
          <div className="mp-section-heading"><div><span className="mp-eyebrow">YOUR SPACE</span><h2 id="marketplace-account-title">Requests and access</h2></div><button type="button" className="mp-button mp-button-secondary" onClick={() => setAccountRetry((value) => value + 1)} disabled={accountLoading}>{accountLoading ? 'Refreshing…' : 'Refresh'}</button></div>
          {accountError && <div className="mp-notice mp-notice-error" role="alert">{accountError}</div>}
          {accountLoading ? <p className="mp-account-loading" role="status">Loading account data…</p> : <div className="mp-account-grid">
            <div className="mp-account-panel"><h3><Icon name="clock" />My requests<span>{account.requests.length}</span></h3>{account.requests.length === 0 ? <p className="mp-account-empty">You have not sent a request yet. Choose a product from the catalog to begin.</p> : <ul className="mp-account-list">{account.requests.map((request) => <li key={request.id}><div className="mp-account-row"><strong>{marketplaceProductLabel({ id: request.product_id, name: request.product_name })}</strong><span className={`mp-account-status mp-account-${request.status}`}>{REQUEST_STATUS[request.status]}</span></div><time>{displayDate(request.created_at)}</time>{request.message && <p className="mp-account-message">{request.message}</p>}{request.response && <div className="mp-team-response"><b>DanGG response</b><p>{request.response}</p></div>}</li>)}</ul>}</div>
            <div className="mp-account-panel"><h3><Icon name="shield" />My access<span>{account.entitlements.length}</span></h3>{account.entitlements.length === 0 ? <p className="mp-account-empty">Access granted by the DanGG team will appear here with its validity period.</p> : <ul className="mp-account-list">{account.entitlements.map((entitlement) => {
              const expired = Boolean(entitlement.expires_at && new Date(entitlement.expires_at).getTime() <= Date.now());
              const active = entitlement.status === 'active' && !expired;
              return <li key={entitlement.id}><div className="mp-account-row"><strong>{marketplaceProductLabel({ id: entitlement.product_id, name: entitlement.product_name })}</strong><span className={`mp-account-status ${active ? 'mp-account-approved' : 'mp-account-declined'}`}>{entitlement.status === 'revoked' ? 'Revoked' : expired ? 'Expired' : 'Granted'}</span></div><time>{entitlement.expires_at ? `Valid until ${displayDate(entitlement.expires_at)}` : 'No expiration date'}</time>{entitlement.note && <p>{entitlement.note}</p>}</li>;
            })}</ul>}<p className="mp-access-note">Access rights are recorded in your account. Delivery of each service is confirmed according to its offer.</p></div>
          </div>}
        </section>}

        <div className="mp-section mp-container" id="marketplace-publisher"><MarketplacePublisher userId={user?.id} onLogin={() => navigate('/login?returnTo=marketplace')} /></div>

        <section className="mp-section mp-container mp-faq" aria-labelledby="marketplace-faq-title">
          <div><span className="mp-eyebrow">CLEAR ANSWERS</span><h2 id="marketplace-faq-title">Before you choose.</h2><p>What the open-source code includes and what marketplace services mean.</p><a className="mp-text-link" href={`${SOURCE_FILE_ROOT}/docs/LICENSING.md`} target="_blank" rel="noopener noreferrer">Licensing guide<Icon name="external" /></a></div>
          <div className="mp-faq-list">
            <details><summary>Can I copy, use, and improve DanGG?<span>+</span></summary><p>Yes. The Community edition is published under AGPLv3. You may use and modify it, including commercially, while following the license. Modified versions offered to users over a network are subject to the AGPL requirements for access to the corresponding source.</p></details>
            <details><summary>What do I pay for in the marketplace?<span>+</span></summary><p>For the services, capacity, or extensions described in the offer you choose. At this stage you send a request, and the team confirms availability, price, and terms. Sending a request does not make a payment or automatically create a subscription.</p></details>
            <details><summary>Is a paid feature automatically closed source?<span>+</span></summary><p>No. Each product's license defines your rights to its code. A feature distributed under AGPL may be modified on your own installation; that does not provide free access to official DanGG infrastructure or services. Commercial module terms are reviewed before delivery.</p></details>
            <details><summary>Are services connected to game chips?<span>+</span></summary><p>Free demo balances have no monetary value and cannot be converted into Cash Chips. When paid services are active, the $9/month Organizer membership includes 100,000 Cash Chips; additional packs cost $1 for 10,000. Cash Chips are valid only with the issuing organizer. The organizer separately sets player terms and pays any buybacks; the platform does not execute or guarantee those external payments. Service credits remain a separate balance.</p></details>
            <details><summary>How is a top-up or refund request verified?<span>+</span></summary><p>NervixPay top-ups are credited only after manual verification of the final payment and beneficiary account. Keep the order ID and contact Support for verification, an incorrect payment, or a refund request. Opening checkout does not confirm payment, and a top-up does not automatically activate a subscription. External refunds and buybacks are not automatic.</p></details>
          </div>
        </section>
      </main>

      <footer className="mp-footer"><div className="mp-container"><div><img src={brand.logo} alt="DanGG" /><p>Social poker. Open source. Your community.</p></div><nav aria-label="Legal information"><a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">Source code<Icon name="external" /></a><a href="/legal/LICENSE" target="_blank" rel="noopener noreferrer">AGPLv3 license</a><a href={`${SOURCE_FILE_ROOT}/TRADEMARKS.md`} target="_blank" rel="noopener noreferrer">DanGG brand</a><button type="button" onClick={() => navigate('/support')}>Support</button></nav><span>DanGG · Demo &amp; organizer services · 18+</span></div></footer>

      {selected && <div className="mp-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProduct(); }}>
        <section ref={dialogRef} className="mp-modal" role="dialog" aria-modal="true" aria-labelledby={dialogTitle}>
          <button type="button" data-dialog-close className="mp-modal-close mp-round-button" onClick={closeProduct} aria-label="Close details"><Icon name="close" /></button>
          <div className="mp-modal-heading"><span className="mp-product-symbol"><Icon name={CATEGORY_ICONS[selected.category]} /></span><span className="mp-eyebrow">{MARKETPLACE_DELIVERY_LABELS[selected.delivery]}</span><h2 id={dialogTitle}>{marketplaceProductLabel(selected)}</h2><p>{selected.summary}</p></div>
          <div className="mp-modal-price"><strong>{marketplacePrice(selected)}</strong><span className={`mp-status ${selected.status === 'available' ? 'mp-status-ready' : ''}`}><span />{selected.status === 'available' ? 'Available' : 'Coming soon'}</span></div>
          <p className="mp-product-description">{selected.description}</p>
          {selected.features.length > 0 && <ul className="mp-feature-list">{selected.features.map((feature, i) => <li key={`${feature}-${i}`}><Icon name="check" /><span>{feature}</span></li>)}</ul>}
          <div className="mp-delivery-explanation"><Icon name="shield" /><p>{selected.delivery === 'hosted_service' ? 'A service provided by DanGG under the confirmed offer. Service access is separate from the right to install the Community edition.' : selected.delivery === 'open_source_extension' ? 'An open-source extension. The applicable license and installation instructions are provided before delivery; payment does not remove the rights granted by the license.' : 'A commercial module. Licensing terms, compatibility, and delivery are confirmed before any purchase.'}</p></div>
          {requestError && <div className="mp-notice mp-notice-error" role="alert">{requestError}</div>}
          {selected.id === 'club-entry' ? <div className="mp-modal-signin"><p>Club Entry is an admission service, not a software purchase. Choose a club to see its free or paid entry terms. Paid access is granted only after server-side payment verification.</p><button type="button" className="mp-button mp-button-primary" onClick={() => { closeProduct(); navigate('/organizers'); }}>Choose a club<Icon name="arrow" /></button></div>
            : selectedRequest ? <div className="mp-modal-requested" role="status"><Icon name="clock" /><div><strong>Your request is under review</strong><p>Track the response in My account.</p></div><button type="button" className="mp-text-link" onClick={() => { closeProduct(); scrollToSection('marketplace-account'); }}>View requests<Icon name="arrow" /></button></div>
            : activeProducts.has(selected.id) ? <div className="mp-modal-requested"><Icon name="shield" /><div><strong>You have a recorded access entitlement</strong><p>Review its details and validity in My account.</p></div></div>
              : !requestsEnabled ? <div className="mp-modal-requested"><Icon name="clock" /><p>Requests are currently closed. Check back for this product's availability.</p></div>
                : !user ? <div className="mp-modal-signin"><p>Sign in to send a request and track the team's response.</p><button type="button" className="mp-button mp-button-primary" onClick={() => { closeProduct(); navigate('/login?returnTo=marketplace'); }}>Sign in<Icon name="arrow" /></button></div>
                  : <form className="mp-request-form" onSubmit={submitRequest}><label htmlFor={messageId}>{selected.status === 'coming_soon' ? 'Tell us how you would use this product' : 'Tell us what your community needs'}<span>Optional</span></label><textarea id={messageId} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={3} placeholder="For example: participant count and the services you are interested in." disabled={submitting} /><div className="mp-request-footer"><p>The request does not make a payment.{selected.status === 'coming_soon' ? ' This product is still in preparation.' : ''}</p><button type="submit" className="mp-button mp-button-primary" disabled={submitting}>{submitting ? 'Sending…' : selected.status === 'coming_soon' ? 'Register interest' : 'Send request'}<Icon name="arrow" /></button></div></form>}
        </section>
      </div>}
    </div>
  );
}
