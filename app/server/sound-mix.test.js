// Per-channel sound volumes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNELS, CHANNEL_PREVIEW, DEFAULT_CHANNEL_VOLUMES, mixedVolume, parseChannelVolumes, withChannelVolume } from '../src/lib/soundMix.ts';

test('every channel defaults to full volume and has a preview sound', () => {
  assert.deepEqual(CHANNELS, ['sfx', 'voice', 'alerts', 'music', 'ambience']);
  for (const ch of CHANNELS) {
    assert.equal(DEFAULT_CHANNEL_VOLUMES[ch], 1);
    assert.equal(typeof CHANNEL_PREVIEW[ch], 'string');
  }
});

test('parseChannelVolumes clamps saved values and ignores junk', () => {
  assert.deepEqual(parseChannelVolumes(null), DEFAULT_CHANNEL_VOLUMES);
  assert.deepEqual(parseChannelVolumes('{bad'), DEFAULT_CHANNEL_VOLUMES);
  const v = parseChannelVolumes(JSON.stringify({ sfx: 0.25, voice: 7, alerts: -1, music: 'loud', nope: 0.1 }));
  assert.equal(v.sfx, 0.25);
  assert.equal(v.voice, 1);
  assert.equal(v.alerts, 0);
  assert.equal(v.music, 1);
  assert.equal('nope' in v, false);
});

test('withChannelVolume returns a new object', () => {
  const next = withChannelVolume(DEFAULT_CHANNEL_VOLUMES, 'voice', 0.4);
  assert.equal(next.voice, 0.4);
  assert.equal(DEFAULT_CHANNEL_VOLUMES.voice, 1);
});

test('mixedVolume multiplies cue, master and channel', () => {
  assert.equal(mixedVolume(1, 0.5, 0.5), 0.25);
  assert.equal(mixedVolume(2, 1, 1), 1);
  assert.equal(mixedVolume(1, 0.7, 0), 0);
  assert.equal(mixedVolume(Number.NaN, 1, 1), 0);
});
