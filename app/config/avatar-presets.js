// SPDX-License-Identifier: AGPL-3.0-only
// Stable numbered selections now use independently drawn OpenPoker artwork.
export const AVATAR_COUNT = 20;
export const AVATAR_NAMES = Object.freeze(['Fox', 'Owl', 'Cat', 'Bear', 'Robot', 'Astronaut', 'Alien', 'Penguin', 'Jellyfish', 'Octopus', 'Fish', 'Turtle', 'Lion', 'Panda', 'Rabbit', 'Frog', 'Eagle', 'Raccoon', 'Hedgehog', 'Dog']);

export function avatarPresetPath(number) {
  if (!Number.isInteger(number) || number < 1 || number > AVATAR_COUNT) throw new RangeError('Avatar selection must be between 1 and 20.');
  return `/assets/avatars/openpoker-${String(number).padStart(2, '0')}.svg`;
}

/** Accept existing saved paths/IDs without changing the user's numbered selection. */
export function resolveAvatarPreset(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(?:\/assets\/avatars\/gg-(\d{2})\.jpg|\/assets\/avatars\/openpoker-(\d{2})\.svg|gg-(\d{2}))$/);
  if (!match) return null;
  const number = Number(match[1] || match[2] || match[3]);
  return number >= 1 && number <= AVATAR_COUNT ? avatarPresetPath(number) : null;
}

export function normalizeAvatarSource(value) {
  return resolveAvatarPreset(value) || (typeof value === 'string' ? value : '');
}
