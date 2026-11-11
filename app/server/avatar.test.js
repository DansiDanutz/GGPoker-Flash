import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { normalizeAvatar } from './avatar.js';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const t = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  t.copy(out, 4);
  body.copy(out, 8);
  out.writeUInt32BE(crc(Buffer.concat([t, body])), 8 + body.length);
  return out;
}
function png({ size = 256, ancillary = false } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.alloc(1 + size * 4);
  for (let x = 0; x < size; x++) {
    row[1 + x * 4] = 20;
    row[2 + x * 4] = 120;
    row[3 + x * 4] = 80;
    row[4 + x * 4] = 255;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const parts = [Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr)];
  if (ancillary) parts.push(chunk('tEXt', Buffer.from('note\0strip me')));
  parts.push(chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

test('normalizes a valid 256x256 PNG and strips ancillary chunks', () => {
  const data = png({ ancillary: true });
  const result = normalizeAvatar('data:image/png;base64,' + data.toString('base64'));
  assert.match(result.dataUrl, /^data:image\/png;base64,/);
  assert.equal(result.hash.length, 64);
  assert.equal(Buffer.from(result.dataUrl.slice(22), 'base64').includes(Buffer.from('tEXt')), false);
});

test('rejects wrong dimensions and malformed base64', () => {
  const data = png({ size: 128 });
  assert.throws(() => normalizeAvatar('data:image/png;base64,' + data.toString('base64')), /256-pixel/);
  assert.throws(() => normalizeAvatar('data:image/png;base64,not-base64'), /256-pixel/);
  assert.equal(normalizeAvatar(''), '');
});
