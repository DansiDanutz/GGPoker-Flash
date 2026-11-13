// DanGG lobby music: Dan's own loop ("DanGG-Lobby-Loop", 42.4 s, 44.1 kHz stereo).
// Ogg Vorbis is the in-game file. Safari and iOS cannot play Ogg Vorbis, so they get
// the AAC (.m4a) export of the same master.
export const LOBBY_MUSIC = Object.freeze({
  ogg: '/assets/music/DanGG-Lobby-Loop.ogg',
  m4a: '/assets/music/DanGG-Lobby-Loop.m4a',
});

/**
 * Base volume for the loop before the master and channel sliders. The master is mixed
 * loud (about -13 dB mean), roughly 14 dB hotter than the old synthesised loop, so this sits
 * the music just under the table sounds instead of over them.
 */
export const LOBBY_MUSIC_BASE_VOLUME = 0.045;

const OGG_VORBIS = 'audio/ogg; codecs="vorbis"';

/** Picks the Ogg file when the browser says it can play it, otherwise the AAC file. */
export function lobbyMusicSrc(canPlayType: (type: string) => string): string {
  return canPlayType(OGG_VORBIS) === '' ? LOBBY_MUSIC.m4a : LOBBY_MUSIC.ogg;
}
