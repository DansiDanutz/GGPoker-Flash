import { useApp } from '../lib/store';
import { PageShell } from '../components/PageShell';
import { ContributorWorkspace } from '../components/ContributorWorkspace';
import { MarketplacePublisher } from '../components/MarketplacePublisher';
import { OrganizerBilling } from '../components/OrganizerBilling';
import { OrganizerChips } from '../components/OrganizerChips';
import { PlayMoneyPlugins } from '../components/PlayMoneyPlugins';
import '../profile-roles.css';

export function PlatformWorkspace({ kind }: { kind: 'contributor' | 'organiser' }) {
  const { user, navigate } = useApp();
  return <PageShell activeTop={kind}>
    <div className="page platform-workspace">
    {!user || user.is_guest ? <section className="contributor-workspace"><h1>{kind === 'contributor' ? 'Contributor' : 'Organiser'}</h1><p>Sign in to open this workspace. Play Money games remain free.</p><button onClick={() => navigate('/login')}>Sign in</button></section> : <>
      <header className="workspace-intro"><a href="#/my-page?tab=overview">← Profile and role guide</a><h1>{kind === 'contributor' ? 'Contributor management' : 'Organiser management'}</h1><p>{kind === 'contributor' ? 'Your membership, publisher profile, submission history and published plugins in one workspace.' : 'Your membership, service credits, games, rake, Cash Chips and tournament tickets in one workspace.'}</p></header>
      {kind === 'contributor' ? <>
        <div className="mp-container"><OrganizerBilling key={user.id} userId={user.id} role="contributor" /><MarketplacePublisher userId={user.id} onLogin={() => navigate('/login')} /></div>
        <ContributorWorkspace key={user.id} /><PlayMoneyPlugins />
      </> : <>
        <section className="workspace-intro" aria-label="Organiser management"><h2>Start and manage your games</h2><ol><li>Activate your monthly membership and add service credits.</li><li>Create a cash table, tournament or Spin &amp; Go. Review the setup fee before confirming.</li><li>Manage active hours, rake and schedules below; distribute Cash Chips and tickets in your own economy.</li></ol><nav aria-label="Create an organiser game"><button onClick={() => navigate('/?host=cash&economy=organizer')}>Create cash table</button><button onClick={() => navigate('/?host=tournament&economy=organizer')}>Create tournament</button><button onClick={() => navigate('/?host=spin&economy=organizer')}>Create Spin &amp; Go</button></nav><p>Membership includes 100,000 Cash Chips each month. These chips stay within your organiser economy. Creating games and starting cash hours require separate service credits.</p></section>
        <div className="mp-container"><OrganizerBilling key={user.id} userId={user.id} role="organizer" /><OrganizerChips key={`chips-${user.id}`} userId={user.id} /></div>
      </>}
    </>}
    </div>
  </PageShell>;
}
