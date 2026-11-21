/** Preserve hash-based game URLs while supporting the public marketplace entry. */
export function resolveEntryRoute(hash: string, pathname: string, search: string, fallback: string): string {
  const hashRoute = hash.replace(/^#/, '');
  if (hashRoute) return hashRoute;
  const path = pathname.replace(/\/+$/, '') || '/';
  if (['/marketplace', '/contributor', '/organiser', '/organizers'].includes(path)) return path;
  if (path === '/marketplace/admin') return '/admin?section=marketplace';
  if (path === '/admin') return `/admin${search}`;
  return fallback;
}

/** Only known internal destinations can be resumed after authentication. */
export function marketplaceAuthDestination(route: string): string | null {
  const [path, query = ''] = route.split('?');
  if (path === '/admin') return route;
  if (['/marketplace', '/contributor', '/organiser', '/organizers'].includes(path)) return path;
  const params = new URLSearchParams(query);
  const destination = params.get('returnTo');
  const id = params.get('id'), invite = params.get('invite');
  if (id && invite && (path === '/tournaments' || (path === '/login' && destination === 'tournaments'))) {
    return '/tournaments?' + new URLSearchParams({ id, invite });
  }
  return ['marketplace', 'contributor', 'organiser', 'organizers'].includes(destination || '') ? `/${destination}` : null;
}
