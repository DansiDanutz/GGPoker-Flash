import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MusicLoop } from '../src/lib/music-loop.ts';

type Fake = ReturnType<typeof fakeAudio>;

function fakeAudio(decodable: string[]) {
  const fetched: string[] = [];
  const sources: Array<Record<string, unknown>> = [];
  const gain = { gain: { value: 1 }, connect: (dst: unknown) => { gain.connectedTo = dst; }, connectedTo: null as unknown };
  const ctx = {
    state: 'running' as 'running' | 'suspended',
    destination: { name: 'speakers' },
    createGain: () => gain,
    createBufferSource: () => {
      const src: Record<string, unknown> = { loop: false, loopStart: -1, loopEnd: -1, buffer: null, startedAt: null };
      src.connect = (dst: unknown) => { src.connectedTo = dst; };
      src.start = (when = 0) => { src.startedAt = when; };
      sources.push(src);
      return src;
    },
    decodeAudioData: async (data: ArrayBuffer) => {
      const url = new TextDecoder().decode(data);
      if (!decodable.includes(url)) throw new Error(`cannot decode ${url}`);
      return { duration: 42.352948, url };
    },
    suspend: async () => { ctx.state = 'suspended'; },
    resume: async () => { ctx.state = 'running'; },
  };
  const deps = {
    createContext: () => ctx,
    fetchArrayBuffer: async (url: string) => { fetched.push(url); return new TextEncoder().encode(url).buffer as ArrayBuffer; },
  };
  return { ctx, gain, sources, fetched, deps };
}

const SOURCES = ['/s/loop.ogg', '/s/loop.m4a'];

function loopWith(f: Fake, volume = 0.16) {
  return new MusicLoop(SOURCES, volume, f.deps);
}

test('plays the decoded buffer as a sample-accurate loop through a gain node', async () => {
  const f = fakeAudio(['/s/loop.ogg']);
  const ok = await loopWith(f).start();
  assert.equal(ok, true);
  assert.equal(f.sources.length, 1);
  const src = f.sources[0];
  assert.equal(src.loop, true);
  assert.equal(src.loopStart, 0);
  assert.equal(src.loopEnd, 42.352948);
  assert.equal((src.buffer as { url: string }).url, '/s/loop.ogg');
  assert.equal(src.connectedTo, f.gain);
  assert.equal(f.gain.connectedTo, f.ctx.destination);
  assert.equal(f.gain.gain.value, 0.16);
  assert.equal(src.startedAt, 0);
});

test('falls back to the next source when the first one cannot be decoded', async () => {
  const f = fakeAudio(['/s/loop.m4a']);
  const ok = await loopWith(f).start();
  assert.equal(ok, true);
  assert.deepEqual(f.fetched, SOURCES);
  assert.equal((f.sources[0].buffer as { url: string }).url, '/s/loop.m4a');
});

test('reports failure when no source can be decoded so the caller can fall back', async () => {
  const f = fakeAudio([]);
  const ok = await loopWith(f).start();
  assert.equal(ok, false);
  assert.equal(f.sources.length, 0);
});

test('reports failure when Web Audio is unavailable', async () => {
  const f = fakeAudio(['/s/loop.ogg']);
  const loop = new MusicLoop(SOURCES, 0.16, { ...f.deps, createContext: () => { throw new Error('no AudioContext'); } });
  assert.equal(await loop.start(), false);
});

test('concurrent starts load once and create a single source', async () => {
  const f = fakeAudio(['/s/loop.ogg']);
  const loop = loopWith(f);
  const results = await Promise.all([loop.start(), loop.start(), loop.start()]);
  assert.deepEqual(results, [true, true, true]);
  assert.deepEqual(f.fetched, ['/s/loop.ogg']);
  assert.equal(f.sources.length, 1);
});

test('pause suspends playback and a later start resumes the same source', async () => {
  const f = fakeAudio(['/s/loop.ogg']);
  const loop = loopWith(f);
  await loop.start();
  await loop.pause();
  assert.equal(f.ctx.state, 'suspended');
  await loop.start();
  assert.equal(f.ctx.state, 'running');
  assert.equal(f.sources.length, 1);
});

test('pausing while the loop is still loading keeps it silent once loaded', async () => {
  const f = fakeAudio(['/s/loop.ogg']);
  const loop = loopWith(f);
  const starting = loop.start();
  await loop.pause();
  await starting;
  assert.equal(f.ctx.state, 'suspended');
});

test('a suspended context (autoplay policy) is resumed on start', async () => {
  const f = fakeAudio(['/s/loop.ogg']);
  f.ctx.state = 'suspended';
  await loopWith(f).start();
  assert.equal(f.ctx.state, 'running');
});

test('setVolume updates the gain, before and after loading', async () => {
  const f = fakeAudio(['/s/loop.ogg']);
  const loop = loopWith(f);
  loop.setVolume(0.3);
  await loop.start();
  assert.equal(f.gain.gain.value, 0.3);
  loop.setVolume(0.05);
  assert.equal(f.gain.gain.value, 0.05);
});
