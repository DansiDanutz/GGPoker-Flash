import { useApp } from '../lib/store';
import { PageShell } from '../components/PageShell';
import { ContributorWorkspace } from '../components/ContributorWorkspace';
import { MarketplacePublisher } from '../components/MarketplacePublisher';
import { OrganizerBilling } from '../components/OrganizerBilling';
import { OrganizerChips } from '../components/OrganizerChips';
import { PlayMoneyPlugins } from '../components/PlayMoneyPlugins';

export function PlatformWorkspace({ kind }: { kind: 'contributor' | 'organiser' }) {
  const { user, navigate } = useApp();
  return <PageShell activeTop={kind}>
    <div className="page platform-workspace">
    {!user || user.is_guest ? <section className="contributor-workspace"><h1>{kind === 'contributor' ? 'Contributor' : 'Organiser'}</h1><p>Sign in to open this workspace. Play Money games remain free.</p><button onClick={() => navigate('/login')}>Sign in</button></section> : <>
      {kind === 'contributor' ? <><ContributorWorkspace key={user.id} /><PlayMoneyPlugins /><div className="mp-container"><button onClick={() => navigate('/marketplace')}>Manage $9 Contributor membership</button><MarketplacePublisher userId={user.id} onLogin={() => navigate('/login')} /></div></> : <section className="contributor-workspace"><h1>Organiser</h1><p>Manage your subscription, service credits and organizer-scoped Cash Chips.</p><button onClick={() => navigate('/?host=cash&economy=organizer')}>Create a game</button><OrganizerBilling key={user.id} userId={user.id} /><OrganizerChips key={`chips-${user.id}`} userId={user.id} /></section>}
    </>}
    </div>
  </PageShell>;
}
