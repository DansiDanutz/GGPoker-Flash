// Single byte-range parsing for static files. Safari and iOS fetch <audio> sources with a
// Range request and will not play a media file whose server ignores it.

/**
 * Parses one `Range: bytes=…` header against a file size.
 * @param {string | undefined} header
 * @param {number} size
 * @returns {{ start: number, end: number } | null | 'unsatisfiable'}
 *   null when there is no usable single range (serve the whole file),
 *   'unsatisfiable' when the range lies outside the file (answer 416).
 */
export function parseByteRange(header, size) {
  if (typeof header !== 'string') return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (suffix === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(m[1]);
  if (start >= size) return 'unsatisfiable';
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (end < start) return null;
  return { start, end };
}
