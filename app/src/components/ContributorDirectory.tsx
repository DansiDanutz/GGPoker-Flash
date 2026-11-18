import { useEffect, useState } from 'react';
import { marketplaceApi, type PublicContributor } from '../lib/marketplace-api';

export type { PublicContributor } from '../lib/marketplace-api';

const PRODUCT_LABELS: Record<string, string> = {
  'cash-games-manager': 'Cash Table',
  'tournaments-manager': 'Tournaments',
  'spin-and-go-manager': 'Spin & Go',
};

export function marketplaceProductLabel(product: { id: string; name: string }): string {
  return PRODUCT_LABELS[product.id] || product.name;
}

export function ContributorDirectory({ onContributors, onProductSelect }: {
  onContributors: (contributors: PublicContributor[]) => void;
  onProductSelect: (productId: string) => void;
}) {
  const [contributors, setContributors] = useState<PublicContributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    marketplaceApi.contributors()
      .then(({ contributors: next }) => {
        if (cancelled) return;
        setContributors(next);
        onContributors(next);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setContributors([]);
        onContributors([]);
        setError(reason instanceof Error ? reason.message : 'Contributors could not be loaded.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry, onContributors]);

  return <section id="marketplace-contributors" className="mp-section mp-container mp-contributors" aria-labelledby="marketplace-contributors-title">
    <div className="mp-section-heading">
      <div><span className="mp-eyebrow">PUBLIC CREDIT</span><h2 id="marketplace-contributors-title">Contributors</h2></div>
      <p>OpenPoker provides the open platform. Approved contributors publish the listed plugins and customisations.</p>
    </div>
    <div className="mp-contributor-policy">
      <p><strong>Build it. Test it. Get approved.</strong> Local development and Play Money testing are free.</p>
      <p>Contributors earn when customers pay for eligible use, with the existing 20% platform commission. Approval does not grant company equity, guarantee income, or create automatic royalties.</p>
    </div>
    {loading ? <div className="mp-contributor-grid" aria-busy="true" aria-label="Loading contributors">{[0, 1, 2].map((item) => <div className="mp-contributor-skeleton" key={item}><span /><span /></div>)}</div>
      : error ? <div className="mp-empty" role="alert"><h3>Contributors are unavailable</h3><p>{error}</p><button type="button" className="mp-button mp-button-secondary" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>
        : contributors.length === 0 ? <div className="mp-empty"><h3>No approved contributors yet</h3><p>Approved public profiles will appear here.</p></div>
          : <div className="mp-contributor-grid">{contributors.map((contributor) => <article id={`contributor-${encodeURIComponent(contributor.id)}`} className="mp-contributor" key={contributor.id}>
            <span>{contributor.kind === 'company' ? 'Company' : 'Individual'}</span>
            <h3>{contributor.display_name}</h3>
            {contributor.products.length ? <ul>{contributor.products.map((product) => <li key={product.id}><button type="button" onClick={() => onProductSelect(product.id)}>{marketplaceProductLabel(product)}</button></li>)}</ul> : <p className="mp-contributor-empty">No published products yet.</p>}
          </article>)}</div>}
  </section>;
}
