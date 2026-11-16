// SPDX-License-Identifier: AGPL-3.0-only
// Public deployment identity. Only this allowlist is compiled into the client.
export const SITE_ENV_KEYS = Object.freeze([
  'OPENPOKER_PROFILE', 'OPENPOKER_SITE_NAME', 'OPENPOKER_SITE_ORIGIN',
  'OPENPOKER_SITE_LOGO', 'OPENPOKER_SITE_ICON', 'OPENPOKER_SITE_IMAGE', 'OPENPOKER_SUPPORT_EMAIL',
]);

const imageType = (asset) => ({ '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' })[asset.slice(asset.lastIndexOf('.')).toLowerCase()];

function assetPath(value, key) {
  if (!/^\/(?!\/)[a-zA-Z0-9_./-]+$/.test(value) || value.split('/').some((part) => part === '..' || part === '.') || !imageType(value)) {
    throw new Error(`${key} must be a root-relative SVG, PNG, JPEG, WebP or GIF path inside app/public (no query, fragment or parent traversal).`);
  }
  return value;
}

export function resolveSiteProfile(env = {}) {
  const profile = String(env.OPENPOKER_PROFILE || 'dangg').trim();
  if (!['dangg', 'portable'].includes(profile)) throw new Error('OPENPOKER_PROFILE must be dangg or portable.');
  const portable = profile === 'portable';
  const name = String(env.OPENPOKER_SITE_NAME || (portable ? 'OpenPoker' : 'DanGG')).trim();
  if (!name || [...name].length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('OPENPOKER_SITE_NAME must contain 1–80 printable characters.');
  let origin;
  try {
    const url = new URL(String(env.OPENPOKER_SITE_ORIGIN || (portable ? 'http://localhost:5198' : 'https://dangg.live')).trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    origin = url.origin;
  } catch { throw new Error('OPENPOKER_SITE_ORIGIN must be an http(s) origin without credentials, path, query or fragment.'); }
  const customName = !!String(env.OPENPOKER_SITE_NAME || '').trim();
  const logo = assetPath(String(env.OPENPOKER_SITE_LOGO || (portable ? '/openpoker/logo.svg' : '/assets/brand/logo-animated.gif')), 'OPENPOKER_SITE_LOGO');
  const icon = assetPath(String(env.OPENPOKER_SITE_ICON || (portable ? '/openpoker/icon-512.png' : '/assets/brand/favicon.png')), 'OPENPOKER_SITE_ICON');
  if (!['image/png', 'image/svg+xml'].includes(imageType(icon))) throw new Error('OPENPOKER_SITE_ICON must be a square 512-pixel PNG or an SVG.');
  const image = assetPath(String(env.OPENPOKER_SITE_IMAGE || (portable ? '/openpoker/social.png' : '/assets/brand/og-card.jpg')), 'OPENPOKER_SITE_IMAGE');
  const supportEmail = String(env.OPENPOKER_SUPPORT_EMAIL || (portable ? '' : 'support@dangg.live')).trim();
  if (supportEmail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(supportEmail)) throw new Error('OPENPOKER_SUPPORT_EMAIL must be an email address.');
  return Object.freeze({
    profile, name, origin, logo, icon, image, supportEmail,
    bootLogo: (env.OPENPOKER_SITE_LOGO || portable) ? logo : '/assets/brand/logo.png',
    pwaName: portable || customName ? name : 'No More Middleman',
    shortName: portable || customName ? [...name].slice(0, 12).join('') : 'No Middleman',
    description: `${name} — play-money poker with full-screen tables, tournaments and rewards.`,
    imageType: imageType(image), iconType: imageType(icon),
    touchIcon: env.OPENPOKER_SITE_ICON ? icon : portable ? '/openpoker/apple-touch-icon.png' : '/pwa/apple-touch-icon.png',
    customIcon: !!env.OPENPOKER_SITE_ICON,
    customImage: !!env.OPENPOKER_SITE_IMAGE,
  });
}

export function siteProfileEnv(site) {
  return {
    OPENPOKER_PROFILE: site.profile, OPENPOKER_SITE_NAME: site.name,
    OPENPOKER_SITE_ORIGIN: site.origin, OPENPOKER_SITE_LOGO: site.logo,
    OPENPOKER_SITE_ICON: site.icon, OPENPOKER_SITE_IMAGE: site.image,
    OPENPOKER_SUPPORT_EMAIL: site.supportEmail,
  };
}

export function siteManifest(base, site) {
  const manifest = { ...base, name: site.pwaName, short_name: site.shortName,
    description: site.profile === 'dangg' && site.name === 'DanGG' ? base.description : site.description };
  if (site.customIcon) {
    manifest.icons = [{ src: site.icon, sizes: site.iconType === 'image/svg+xml' ? 'any' : '512x512', type: site.iconType, purpose: 'any' }];
  } else if (site.profile === 'portable') {
    manifest.icons = [
      { src: '/openpoker/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/openpoker/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/openpoker/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ];
  }
  return manifest;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** Rewrite only the public identity slots, retaining the existing loading layout. */
export function renderSiteHtml(html, site) {
  const meta = (attribute, key, value) => {
    const pattern = new RegExp(`(<meta ${attribute}="${key}" content=")[^"]*("[^>]*>)`);
    html = html.replace(pattern, (_all, before, after) => `${before}${escapeHtml(value)}${after}`);
  };
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(site.name)}</title>`);
  meta('name', 'description', site.description);
  meta('property', 'og:url', `${site.origin}/`);
  meta('property', 'og:site_name', site.name);
  for (const [attribute, key] of [['property', 'og:title'], ['name', 'twitter:title']]) meta(attribute, key, `${site.name} — Free play-money poker`);
  for (const [attribute, key] of [['property', 'og:image'], ['name', 'twitter:image']]) meta(attribute, key, new URL(site.image, site.origin).href);
  meta('property', 'og:image:type', site.imageType);
  meta('property', 'og:image:alt', `${site.name} — play-money poker`);
  // Only the bundled preview cards have known 1200×630 dimensions.
  if (site.customImage) html = html.replace(/\s*<meta property="og:image:(?:width|height)"[^>]*>/g, '');
  meta('name', 'apple-mobile-web-app-title', site.shortName);
  html = html.replace(/<link rel="icon"[^>]+>/, `<link rel="icon" type="${site.iconType}" href="${escapeHtml(site.icon)}" />`);
  html = html.replace(/<link rel="apple-touch-icon"[^>]+>/, `<link rel="apple-touch-icon" href="${escapeHtml(site.touchIcon)}" />`);
  html = html.replace(/src="\/assets\/brand\/logo\.png\?v=20261113" alt="DanGG"/, () => `src="${escapeHtml(site.bootLogo)}" alt="${escapeHtml(site.name)}"`);
  return html;
}
