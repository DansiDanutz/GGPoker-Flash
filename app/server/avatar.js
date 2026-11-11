import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const CRC = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function fail() {
  const err = new Error('Use a valid square 256-pixel PNG avatar');
  err.status = 400;
  throw err;
}

/** Validate and canonicalise a 256×256 PNG avatar, stripping ancillary chunks. */
function normalizeAvatar(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,') || value.length > 530000) fail();
  const encoded = value.slice(22);
  const data = Buffer.from(encoded, 'base64');
  if (data.length > 393216 || data.toString('base64') !== encoded) fail();
  if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail();
  let offset = 8, header = false, ended = false, channels = 0;
  const compressed = [];
  const stored = [data.subarray(0, 8)];
  while (offset < data.length) {
    if (offset + 12 > data.length) fail();
    const size = data.readUInt32BE(offset);
    const end = offset + 12 + size;
    if (end > data.length) fail();
    const type = data.toString('ascii', offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, end - 4);
    let crc = 0xffffffff;
    for (const byte of data.subarray(offset + 4, end - 4)) crc = CRC[(crc ^ byte) & 255] ^ (crc >>> 8);
    if (((crc ^ 0xffffffff) >>> 0) !== data.readUInt32BE(end - 4)) fail();
    if (!header && type !== 'IHDR') fail();
    if (type === 'IHDR') {
      if (header || size !== 13 || chunk.readUInt32BE(0) !== 256 || chunk.readUInt32BE(4) !== 256 ||
          chunk[8] !== 8 || ![2, 6].includes(chunk[9]) || chunk[10] || chunk[11] || chunk[12]) fail();
      header = true;
      channels = chunk[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') compressed.push(chunk);
    else if (type === 'IEND') {
      if (size || end !== data.length) fail();
      ended = true;
    } else if (!/^[a-z][A-Za-z][A-Z][A-Za-z]$/.test(type)) fail();
    if (['IHDR', 'IDAT', 'IEND'].includes(type)) stored.push(data.subarray(offset, end));
    offset = end;
  }
  if (!ended || !compressed.length) fail();
  const stride = 256 * channels + 1;
  let pixels;
  try {
    pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: stride * 256 });
  } catch { fail(); }
  if (pixels.length !== stride * 256) fail();
  for (let row = 0; row < 256; row++) if (pixels[row * stride] > 4) fail();
  const normalized = Buffer.concat(stored);
  return { hash: createHash('sha256').update(normalized).digest('hex'), dataUrl: 'data:image/png;base64,' + normalized.toString('base64') };
}

export { normalizeAvatar };
