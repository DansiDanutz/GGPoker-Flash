import { useEffect, useState } from 'react';
import { contributorApi, type ContributorPlugin } from '../lib/contributor-api';
import { useApp } from '../lib/store';

const BUILT_INS = [
  { id: 'cash-games-manager', name: 'Cash Games Manager', playPath: '/?host=cash', summary: 'Try Hold’em, PLO and Short Deck tables.' },
  { id: 'tournaments-manager', name: 'Tournaments Manager', playPath: '/?host=tournament', summary: 'Try the tournament formats and setup tools.' },
  { id: 'spin-and-go-manager', name: 'Spin & Go Manager', playPath: '/?host=spin', summary: 'Try the three-player Jackpot SNG engine.' },
];
export function PlayMoneyPlugins() {
  const { user, navigate } = useApp();
  const [plugins, setPlugins] = useState<ContributorPlugin[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    contributorApi.plugins().then((data) => { if (!cancelled) setPlugins(data.plugins); }).catch(() => { if (!cancelled) setError('Community plugin list could not be loaded. Reload to try again.'); });
    return () => { cancelled = true; };
  }, []);
  return <section className="contributor-workspace" aria-label="Free Play Money plugins">
    <h2>Try game plugins in Play Money</h2><p>Installed game plugins are free to test. Virtual balances stay separate from organizer Cash Chips and service credits. Sign in to create private test games.</p>
    {error && <p role="alert">{error}</p>}
    <div className="mg-grid">{[...BUILT_INS, ...plugins].map((plugin) => <article key={plugin.id}><h3>{plugin.name}</h3><p>{plugin.summary}</p><button type="button" onClick={() => navigate(user ? plugin.playPath : '/login')}>{user ? 'Try in Play Money' : 'Sign in to test free'}</button></article>)}</div>
  </section>;
}
