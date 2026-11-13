// Lobby music: Dan's own loop replaces the generated BgmLobby track; Ogg first, AAC for Safari.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LOBBY_MUSIC, LOBBY_MUSIC_BASE_VOLUME, lobbyMusicSrc } from '../src/lib/lobbyMusic.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../public');

test('picks the Ogg file when the browser can play Ogg Vorbis', () => {
  assert.equal(lobbyMusicSrc(() => 'probably'), LOBBY_MUSIC.ogg);
  assert.equal(lobbyMusicSrc(() => 'maybe'), LOBBY_MUSIC.ogg);
});

test('falls back to the AAC file when Ogg is unsupported (Safari, iOS)', () => {
  assert.equal(lobbyMusicSrc(() => ''), LOBBY_MUSIC.m4a);
});

test('asks the browser about Ogg Vorbis specifically', () => {
  const asked = [];
  lobbyMusicSrc((type) => { asked.push(type); return ''; });
  assert.deepEqual(asked, ['audio/ogg; codecs="vorbis"']);
});

test('both music files ship in public/', () => {
  for (const url of Object.values(LOBBY_MUSIC)) {
    const file = path.join(PUBLIC, url);
    assert.ok(fs.statSync(file).size > 100_000, `${url} is missing or too small`);
  }
});

test('the old generated lobby track is gone', () => {
  assert.equal(fs.existsSync(path.join(PUBLIC, 'assets/sounds/BgmLobby.mp3')), false);
});

test('music base volume sits well under the old 0.16 to offset the louder master', () => {
  assert.ok(LOBBY_MUSIC_BASE_VOLUME > 0 && LOBBY_MUSIC_BASE_VOLUME < 0.08);
});
