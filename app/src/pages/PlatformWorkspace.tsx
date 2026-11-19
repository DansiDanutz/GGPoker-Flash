import { useApp } from '../lib/store';
import { PageShell } from '../components/PageShell';
import { ContributorWorkspace } from '../components/ContributorWorkspace';
import { MarketplacePublisher } from '../components/MarketplacePublisher';
import { OrganizerBilling } from '../components/OrganizerBilling';
import { OrganizerWorkspace } from '../components/OrganizerWorkspace';
import { PlayMoneyPlugins } from '../components/PlayMoneyPlugins';
import { ProfileWorkspaceTabs } from '../components/ProfileWorkspaceTabs';
import '../profile-roles.css';

export function PlatformWorkspace({ kind }: { kind: 'contributor' | 'organiser' }) {
  const { user, navigate } = useApp();
  return <PageShell activeTop={kind}>
    <div className="page platform-workspace">
    {!user || user.is_guest ? <section className="contributor-workspace"><ProfileWorkspaceTabs active={kind} /><p className="account-eyebrow">YOUR WORKSPACE</p><h1>{kind === 'contributor' ? 'Contributor' : 'Organizer'}</h1><p>Sign in to open this workspace. Play Money games remain free.</p><button onClick={() => navigate('/login')}>Sign in</button></section> : <>
      <header className="workspace-intro"><a href="#/my-page?tab=overview">← Profile and role guide</a><ProfileWorkspaceTabs active={kind} /><p className="account-eyebrow">YOUR WORKSPACE</p><h1>{kind === 'contributor' ? 'Contributor management' : 'Organizer management'}</h1><p>{kind === 'contributor' ? 'Your membership, publisher profile, submission history and published plugins in one workspace.' : 'Your membership, service credits, games, rake, Cash Chips and tournament tickets in one workspace.'}</p></header>
      {kind === 'contributor' ? <>
        <div className="mp-container"><OrganizerBilling key={user.id} userId={user.id} role="contributor" /><MarketplacePublisher userId={user.id} onLogin={() => navigate('/login')} /></div>
        <ContributorWorkspace key={user.id} /><PlayMoneyPlugins />
      </> : <OrganizerWorkspace key={user.id} userId={user.id} />}
    </>}
    </div>
  </PageShell>;
}
