// SPDX-License-Identifier: AGPL-3.0-only
const maxBytes = 5 * 1024 * 1024;
export function validVerificationImage(url) {
  if (typeof url !== 'string' || url.length > 24 + 4 * Math.ceil(maxBytes / 3)) return false;
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  return !!match && match[1].length % 4 === 0 && Buffer.byteLength(match[1], 'base64') <= maxBytes;
}
