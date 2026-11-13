// Byte ranges for static media: Safari needs 206 responses to play the lobby music.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { parseByteRange } from './byte-range.js';
import { startServer } from './test-helpers.js';

test('no header or a malformed one serves the whole file', () => {
  assert.equal(parseByteRange(undefined, 100), null);
  assert.equal(parseByteRange('bytes=-', 100), null);
  assert.equal(parseByteRange('items=0-1', 100), null);
  assert.equal(parseByteRange('bytes=0-1,4-5', 100), null, 'multi-range falls back to the whole file');
  assert.equal(parseByteRange('bytes=9-3', 100), null);
});

test('open, closed and suffix ranges', () => {
  assert.deepEqual(parseByteRange('bytes=0-1', 100), { start: 0, end: 1 });
  assert.deepEqual(parseByteRange('bytes=10-', 100), { start: 10, end: 99 });
  assert.deepEqual(parseByteRange('bytes=90-500', 100), { start: 90, end: 99 }, 'end is clamped');
  assert.deepEqual(parseByteRange('bytes=-20', 100), { start: 80, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-500', 100), { start: 0, end: 99 });
});

test('ranges outside the file are unsatisfiable', () => {
  assert.equal(parseByteRange('bytes=100-', 100), 'unsatisfiable');
  assert.equal(parseByteRange('bytes=-0', 100), 'unsatisfiable');
});

let srv;
before(async () => { srv = await startServer(); });
after(() => srv?.stop?.());

const MUSIC = '/assets/music/DanGG-Lobby-Loop.m4a';

test('music is served with an audio type and accepts ranges', async () => {
  const res = await fetch(srv.base + MUSIC);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'audio/mp4');
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  await res.arrayBuffer();
  const ogg = await fetch(srv.base + '/assets/music/DanGG-Lobby-Loop.ogg');
  assert.equal(ogg.headers.get('content-type'), 'audio/ogg');
  await ogg.arrayBuffer();
});

test('a Range request gets 206 with exactly the asked bytes', async () => {
  const res = await fetch(srv.base + MUSIC, { headers: { range: 'bytes=0-1' } });
  assert.equal(res.status, 206);
  assert.match(res.headers.get('content-range'), /^bytes 0-1\/\d+$/);
  assert.equal((await res.arrayBuffer()).byteLength, 2);
});

test('a range past the end gets 416', async () => {
  const res = await fetch(srv.base + MUSIC, { headers: { range: 'bytes=999999999-' } });
  assert.equal(res.status, 416);
  assert.match(res.headers.get('content-range'), /^bytes \*\/\d+$/);
  await res.arrayBuffer();
});

test('the animated brand logo is served as image/gif', async () => {
  const res = await fetch(srv.base + '/assets/brand/logo-animated.gif');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/gif');
  await res.arrayBuffer();
});
