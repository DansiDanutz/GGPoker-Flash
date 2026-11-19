import { useApp } from '../lib/store';
import { ProfileWorkspaceTabs } from './ProfileWorkspaceTabs';
import '../profile-roles.css';

export function ProfileRoleGuide() {
  const { user, navigate } = useApp();
  const registered = user && !user.is_guest;
  return <section className="profile-role-guide" aria-label="Choose how you use OpenPoker">
    <p className="profile-role-eyebrow">CHOOSE YOUR NEXT CHAPTER</p>
    <h2>More ways to make it yours.</h2>
    <p>One profile, three ways to take part. Play for free, run a community your way, or build tools players can choose to buy. Opening a workspace never buys a membership.</p>
    <ProfileWorkspaceTabs />
    <div className="profile-role-cards">
      <article><span>01 · PLAY FREE</span><h3>Make it yours</h3><p>Enjoy Play Money games and try installed plugins with virtual chips.</p><ol><li>Personalize your avatar and nickname.</li><li>Explore games and practice for free.</li></ol><button type="button" onClick={() => navigate('/')}>Play for free</button></article>
      <article className="profile-role-featured"><span>02 · HOST YOUR COMMUNITY</span><h3>Run games your way</h3><p>Create a recognizable home for your players with your own game lineup and organizer economy.</p><ol><li>Launch cash tables, tournaments, and Spin &amp; Go games.</li><li>Control schedules, rake, Cash Chips, tickets, and active hours.</li><li>Share invite links and manage everything from one workspace.</li></ol><p className="profile-role-terms">$9 per calendar month includes 100,000 organizer Cash Chips. Setup and active cash-table hours use service credits separately.</p><button type="button" onClick={() => navigate(registered ? '/organiser' : '/login')}>{registered ? 'Open Organizer workspace' : 'Sign in to host games'}</button></article>
      <article><span>03 · BUILD FOR PLAYERS</span><h3>Turn useful ideas into offers</h3><p>Build and test locally or in Play Money for free. Keep ownership of your work and earn when customers pay for an eligible published plugin or customization.</p><ol><li>A $9 monthly Contributor membership is required only for official marketplace submission.</li><li>Register a publisher profile, submit tested work, and track review.</li><li>Eligible paid sales carry the platform's 20% commission.</li></ol><p className="profile-role-terms">New listings currently use quote and manual access until a paid offer and settlement are configured. Approval and earnings are not guaranteed.</p><button type="button" onClick={() => navigate(registered ? '/contributor' : '/login')}>{registered ? 'Open Contributor workspace' : 'Sign in to contribute'}</button></article>
    </div>
    <p className="profile-role-note">Memberships renew manually. Service credits, publisher commission credits, Play Money and organizer Cash Chips are separate balances.</p>
  </section>;
}
