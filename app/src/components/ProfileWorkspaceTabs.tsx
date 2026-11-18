import { useApp } from '../lib/store';

const WORKSPACES = [
  { label: 'Contributor', route: '/contributor' },
  { label: 'Organizer', route: '/organiser' },
  { label: 'Marketplace', route: '/marketplace' },
];

export function ProfileWorkspaceTabs({ active }: { active?: 'contributor' | 'organiser' | 'marketplace' } = {}) {
  const { navigate, route } = useApp();
  const path = route.split('?')[0];
  const activeRoute = active ? `/${active}` : path;

  return <nav className="profile-workspace-tabs" aria-label="Profile workspaces">
    {WORKSPACES.map((workspace) => <button
      key={workspace.route}
      type="button"
      className={activeRoute === workspace.route ? 'active' : undefined}
      aria-current={activeRoute === workspace.route ? 'page' : undefined}
      onClick={() => navigate(workspace.route)}
    >{workspace.label}</button>)}
  </nav>;
}
