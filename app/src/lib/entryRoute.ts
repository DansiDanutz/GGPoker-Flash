/** Preserve hash-based game URLs while supporting the public marketplace entry. */
export function resolveEntryRoute(hash: string, pathname: string, search: string, fallback: string): string {
  const hashRoute = hash.replace(/^#/, '');
  if (hashRoute) return hashRoute;
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/marketplace') return '/marketplace';
  if (path === '/marketplace/admin') return '/admin?section=marketplace';
  if (path === '/admin') return `/admin${search}`;
  return fallback;
}

/** Only known internal destinations can be resumed after authentication. */
export function marketplaceAuthDestination(route: string): string | null {
  const [path, query = ''] = route.split('?');
  if (path === '/admin') return route;
  if (path === '/marketplace') return '/marketplace';
  return new URLSearchParams(query).get('returnTo') === 'marketplace' ? '/marketplace' : null;
}
