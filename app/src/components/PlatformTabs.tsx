import { useApp } from '../lib/store';
import '../contributor.css';

export function PlatformTabs() {
  const { user, navigate, route } = useApp();
  if (!user || user.is_guest) return null;
  return <nav className="platform-tabs" aria-label="Platform workspaces">
    {['Contributor', 'Organiser', 'Marketplace'].map((label) => <button key={label} type="button" aria-current={route.split('?')[0] === '/' + label.toLowerCase() ? 'page' : undefined} onClick={() => navigate('/' + label.toLowerCase())}>{label}</button>)}
  </nav>;
}
