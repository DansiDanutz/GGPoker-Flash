import { useApp } from '../lib/store';
import '../profile-roles.css';

export function ProfileRoleGuide() {
  const { user, navigate } = useApp();
  const registered = user && !user.is_guest;
  return <section className="profile-role-guide" aria-label="Choose how you use OpenPoker">
    <p className="profile-role-eyebrow">YOUR OPENPOKER ACCOUNT</p>
    <h2>Play, organise, create.</h2>
    <p>One profile, three ways to take part. You can use all three; opening a workspace never buys a membership.</p>
    <div className="profile-role-cards">
      <article><span>01 · FREE</span><h3>Player for fun</h3><p>Enjoy Play Money games and try installed plugins with virtual chips.</p><ol><li>Personalise your avatar in Profile.</li><li>Explore games and practise for free.</li></ol><button type="button" onClick={() => navigate('/')}>Play for fun</button></article>
      <article><span>02 · HOST YOUR COMMUNITY</span><h3>Organiser</h3><p>$9 per month includes 100,000 organiser Cash Chips. Game setup and active table hours cost service credits separately.</p><ol><li>Activate your membership and fund service credits.</li><li>Create games; manage rake, chips, tickets and schedules.</li></ol><button type="button" onClick={() => navigate(registered ? '/organiser' : '/login')}>{registered ? 'Open Organiser' : 'Sign in to organise'}</button></article>
      <article><span>03 · BUILD FOR PLAYERS</span><h3>Contributor</h3><p>Build and test locally for free. The $9 monthly membership lets you submit plugins for marketplace review.</p><ol><li>Register your publisher profile for approval.</li><li>Submit tested work and track review and publication.</li></ol><button type="button" onClick={() => navigate(registered ? '/contributor' : '/login')}>{registered ? 'Open Contributor' : 'Sign in to contribute'}</button></article>
    </div>
    <p className="profile-role-note">Memberships renew manually. Service credits, publisher commission credits, Play Money and organiser Cash Chips are separate balances.</p>
    {/* The account menu owns the workspace shortcuts; the guide keeps the marketplace
        reachable on phones, where there is no account menu. */}
    <div className="profile-role-workspaces">
      <button type="button" onClick={() => navigate('/marketplace')}>Browse the Marketplace</button>
    </div>
  </section>;
}
