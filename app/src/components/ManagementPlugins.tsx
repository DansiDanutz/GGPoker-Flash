import { useEffect, useState } from 'react';
import { marketplaceApi, type ManagementAccount, type ManagementAccess, type ManagementMode } from '../lib/marketplace-api';
import '../management-plugins.css';

const modeLabels: Record<ManagementMode, string> = {
  off: 'Acces comunitar', observe: 'Pregătire pentru activare', enforce: 'Acces plătit obligatoriu',
};

function dateLabel(value: string, locale = 'ro-RO') {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

/** Read-only service information; access is always decided again by the server. */
export function ManagementPlugins({ userId, admin = false, onSelect }: {
  userId?: number; admin?: boolean; onSelect?: (productId: string) => void;
}) {
  const [data, setData] = useState<ManagementAccount | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setData(null); setError('');
    const request = userId ? marketplaceApi.managementMine() : marketplaceApi.management().then((catalog) => ({ ...catalog, access: [] }));
    request.then((result) => { if (!cancelled) setData(result); })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Nu am putut încărca pluginurile.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, retry]);

  return <section className={`mg-section${admin ? ' mg-section-admin' : ''}`} aria-label="Pluginuri pentru organizatori">
    <div className="mg-heading">
      <div><span className="mg-eyebrow">INSTRUMENTELE ORGANIZATORULUI</span><h3>{admin ? 'Politica pluginurilor' : 'Alegi ce vrei să organizezi.'}</h3></div>
      <button type="button" className="mg-link" disabled={loading} onClick={() => setRetry((value) => value + 1)}>{loading ? 'Se încarcă…' : 'Actualizează'}</button>
    </div>
    <p className="mg-intro">Pluginurile activează administrarea meselor și evenimentelor pe serviciul găzduit. Participarea jucătorilor și jetoanele virtuale sunt separate de aceste licențe.</p>
    {error && <p className="mg-error" role="alert">{error}</p>}
    {loading && <p className="mg-loading" role="status">Verificăm disponibilitatea și accesul…</p>}
    {data && <>
      {admin && <div className="mg-policy"><strong>{modeLabels[data.mode]}</strong><p>{data.mode === 'enforce' ? 'Serverul cere acces plătit activ pentru operațiunile de organizare protejate.' : data.mode === 'observe' ? 'Serverul urmărește operațiunile care vor necesita acces plătit, fără a bloca organizatorii.' : 'Verificarea comercială este oprită pentru această instalare. Publicarea ofertelor nu activează automat restricțiile.'} Politica se configurează la nivelul instalării. Cumpărarea unui plugin nu acordă drepturi de administrator.</p></div>}
      <div className="mg-grid">
        {data.plugins.map((plugin) => {
          const access = data.access.find((entry) => entry.product_id === plugin.id);
          const available = plugin.implemented;
          const status = !available ? 'În dezvoltare' : access?.active ? 'Acces plătit activ' : access?.can_manage ? 'Disponibil în această instalare' : data.mode === 'enforce' ? 'Necesită activare' : 'Administrare implementată';
          return <article key={plugin.id} className={`mg-plugin${!available ? ' mg-plugin-planned' : ''}`}>
            <div className="mg-plugin-top"><span className={`mg-status${access?.active ? ' mg-status-active' : ''}`}>{status}</span><span className="mg-plugin-symbol" aria-hidden="true">{plugin.id === 'cash-games-manager' ? '♠' : plugin.id === 'tournaments-manager' ? '♜' : plugin.id === 'spin-and-go-manager' ? '◉' : '◇'}</span></div>
            <h4>{plugin.name}</h4><p>{plugin.summary}</p>
            {plugin.capabilities.length > 0 && <ul>{plugin.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>}
            {access?.active && <p className="mg-validity">{access.expires_at ? `Valabil până la ${dateLabel(access.expires_at)}` : 'Fără dată de expirare'}</p>}
            {onSelect && <button className="mg-link" type="button" onClick={() => onSelect(plugin.id)}>{available ? 'Vezi oferta și condițiile' : 'Urmărește disponibilitatea'} <span aria-hidden="true">→</span></button>}
          </article>;
        })}
      </div>
      <div className="mg-principles"><p><strong>Perioada plătită este protejată.</strong> Un sold insuficient al editorului oprește vânzările noi, fără să anuleze accesul deja plătit.</p><p><strong>Codul rămâne deschis.</strong> Condițiile serviciului găzduit nu schimbă drepturile AGPL asupra codului OpenPoker.</p></div>
      {admin && <p className="mg-footnote">Accesul manual din fila „Acces” nu este dovadă de plată. Activarea comercială trebuie legată de o comandă verificată. Încasarea online este încă neactivată.</p>}
    </>}
  </section>;
}

export function ManagementAccessNotice({ name, access, mode, loading, error, onMarketplace, onRetry }: {
  name: string; access?: ManagementAccess; mode?: ManagementMode; loading: boolean; error: string;
  onMarketplace: () => void; onRetry: () => void;
}) {
  return <div className={`mg-host-access${access?.active ? ' mg-host-access-active' : ''}`} aria-live="polite">
    <div><strong>{name}</strong><span>{loading ? 'Checking your management access…' : error ? 'Access could not be checked.' : access?.active ? `Paid management access active${access.expires_at ? ` until ${dateLabel(access.expires_at, 'en-GB')}` : ''}.` : access?.can_manage && mode !== 'enforce' ? 'Management is available on this installation. Commercial activation is being prepared.' : 'An active paid plugin is required to create this game.'}</span></div>
    {error ? <><p role="alert">{error}</p><button type="button" className="mg-link" onClick={onRetry}>Try again</button></> : !loading && !access?.active && <button type="button" className="mg-link" onClick={onMarketplace}>View Marketplace →</button>}
    <small>Existing games, invitations and safe cleanup remain available. Players do not need this management plugin.</small>
  </div>;
}
