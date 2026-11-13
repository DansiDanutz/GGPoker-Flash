// Sound engine for the original DanGG sound set (tools/original-assets) and Dan's lobby music loop.
import { savedVolume, VOLUME_KEY } from './volume';
import { CHANNEL_VOLUMES_KEY, DEFAULT_CHANNEL_VOLUMES, mixedVolume, parseChannelVolumes, withChannelVolume, type Channel, type ChannelVolumes } from './soundMix';
import { subscribePrefs } from './prefsSync';
import { LOBBY_MUSIC_BASE_VOLUME, lobbyMusicSrc } from './lobbyMusic';

const BASE = '/assets/sounds/';

const FILES = {
  click: 'tick.mp3',
  deal: 'SoundDealCard.mp3',
  flop: 'SoundBoard.mp3',
  check: 'SoundCheck.mp3',
  call: 'SoundCall.mp3',
  bet: 'SoundBet.mp3',
  raise: 'SoundRaise.mp3',
  fold: 'SoundFold.mp3',
  allin: 'SoundAllIn.mp3',
  win: 'SoundWinPot.mp3',
  gather: 'SoundGatherChips.mp3',
  coin: 'CoinDrop.mp3',
  turn: 'NotificationTimeTurnToAct.mp3',
  timebank: 'NotificationTimeBank.mp3',
  winding: 'NotificationTimeWinding.mp3',
  show: 'SoundShowCard.mp3',
  rabbit: 'SoundRabbitCard.mp3',
  jackpot: 'SoundJackPotToast.mp3',
  mission: 'MissionReward.mp3',
  sngWin: 'SoundSngBigWin.mp3',
  fireworks: 'SoundSngFireworks.mp3',
  cheer: 'SoundSngPrizeCheers.mp3',
  bubble: 'BubbleInWater.mp3',
  fish: 'FishBubblePop.mp3',
  wheel: 'SoundSngWheelBaseLight.mp3',
  wheelTick: 'SoundSngWheelFrameLight.mp3',
  tournamentWin: 'SoundTournamentWin.mp3',
  cashdrop: 'SoundCashdropBig.mp3',
  squeeze: 'SoundSqueezeOpen.mp3',
  shuffleUp: 'SoundShuffleUp.mp3',
  shuffleCombine: 'SoundShuffleCombine.mp3',
  shuffleOther: 'SoundShuffleOther.mp3',
  voiceRaise: 'VoiceRaise.mp3',
  voiceAllIn: 'VoiceAllIn.mp3',
  voiceCheck: 'VoiceCheck.mp3',
  voiceFold: 'VoiceFold.mp3',
  voiceCall: 'VoiceCall.mp3',
  voiceBet: 'VoiceBet.mp3',
  // Not in /assets/sounds: resolved by lobbyMusicSrc() (Ogg, or AAC on Safari).
  bgm: 'DanGG-Lobby-Loop',
};

const DEFAULT_CHANNELS: Record<Channel, boolean> = { sfx: true, voice: true, alerts: true, music: true, ambience: true };

class SoundEngine {
  enabled = true;
  volume = 0.7;
  musicVolume = LOBBY_MUSIC_BASE_VOLUME;
  cache = new Map<string, HTMLAudioElement>();
  music: HTMLAudioElement | null = null;
  unlocked = false;
  channels: Record<Channel, boolean> = { ...DEFAULT_CHANNELS };
  channelVolumes: ChannelVolumes = DEFAULT_CHANNEL_VOLUMES;
  /** The one Settings preview allowed to play; a new preview or Cancel stops it. */
  private previewAudio: HTMLAudioElement | null = null;

  constructor() {
    try {
      const saved = localStorage.getItem('ggpoker.sound');
      if (saved != null) this.enabled = saved === '1';
      // The Settings page saves the master volume as 0-100 under this key.
      this.volume = savedVolume(localStorage.getItem(VOLUME_KEY));
      const channels = JSON.parse(localStorage.getItem('ggpoker.soundChannels') || '{}');
      this.channels = { ...DEFAULT_CHANNELS, ...channels };
    } catch { /* ignore */ }
    this.channelVolumes = this.readChannelVolumes();
    // Settings applied in another window (or restored from the account) reach this one live.
    subscribePrefs(['ggpoker.sound', VOLUME_KEY, 'ggpoker.soundChannels', CHANNEL_VOLUMES_KEY], () => this.syncFromStorage());
  }

  channelFor(key: string): Channel {
    if (key === 'bgm') return 'music';
    if (key.startsWith('voice')) return 'voice';
    if (['turn', 'timebank', 'winding', 'mission', 'jackpot', 'coin'].includes(key)) return 'alerts';
    if (['bubble', 'fish', 'cashdrop'].includes(key)) return 'ambience';
    return 'sfx';
  }

  setChannel(channel: Channel, on: boolean) {
    this.channels[channel] = on;
    try { localStorage.setItem('ggpoker.soundChannels', JSON.stringify(this.channels)); } catch { /* ignore */ }
    if (channel === 'music') { if (on && this.enabled) this.startMusic(); else this.music?.pause(); }
  }

  private readChannelVolumes(): ChannelVolumes {
    try { return parseChannelVolumes(localStorage.getItem(CHANNEL_VOLUMES_KEY)); } catch { return DEFAULT_CHANNEL_VOLUMES; }
  }

  /** Re-read the toggles and volumes after Settings → Apply, another window or the account changed them. */
  syncFromStorage() {
    try {
      const saved = localStorage.getItem('ggpoker.sound');
      this.enabled = saved == null ? true : saved === '1';
      this.channels = { ...DEFAULT_CHANNELS, ...JSON.parse(localStorage.getItem('ggpoker.soundChannels') || '{}') };
      this.channelVolumes = this.readChannelVolumes();
      this.volume = savedVolume(localStorage.getItem(VOLUME_KEY));
    } catch { /* keep the current mix */ }
    if (this.music) this.music.volume = this.musicLevel();
    if (!this.enabled || !this.channels.music) this.music?.pause();
    else if (this.unlocked) this.startMusic();
  }

  setChannelVolume(channel: Channel, value: number) {
    this.channelVolumes = withChannelVolume(this.channelVolumes, channel, value);
    try { localStorage.setItem(CHANNEL_VOLUMES_KEY, JSON.stringify(this.channelVolumes)); } catch { /* ignore */ }
    if (channel === 'music' && this.music) this.music.volume = this.musicLevel();
  }

  private musicLevel(): number {
    return mixedVolume(this.musicVolume, 1, this.channelVolumes.music);
  }

  /**
   * Settings preview at the draft levels: plays even if the channel is switched off, and stops
   * whichever preview is still playing first so previews never overlap.
   */
  preview(key: keyof typeof FILES, levels: { master: number; channel: number }) {
    this.stopPreview();
    try {
      const a = new Audio(this.srcFor(key));
      // Music has its own quiet base level and, as in play(), ignores the master slider.
      const isMusic = this.channelFor(key) === 'music';
      a.volume = mixedVolume(isMusic ? this.musicVolume : 1, isMusic ? 1 : levels.master, levels.channel);
      this.previewAudio = a;
      void a.play().catch(() => {});
    } catch { /* ignore */ }
  }

  stopPreview() {
    const a = this.previewAudio;
    this.previewAudio = null;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.enabled) this.startMusic();
  }

  preload() {
    for (const [key, file] of Object.entries(FILES)) {
      if (key === 'bgm') continue;
      const audio = new Audio(BASE + file);
      audio.preload = 'auto';
      this.cache.set(key, audio);
    }
  }

  play(key: keyof typeof FILES, opts: { volume?: number; rate?: number } = {}) {
    if (!this.enabled) return;
    if (!this.channels[this.channelFor(key)]) return;
    this.unlock();
    const src = this.cache.get(key);
    if (!src) return;
    try {
      const a = src.cloneNode(true) as HTMLAudioElement;
      a.volume = mixedVolume(opts.volume ?? 1, this.volume, this.channelVolumes[this.channelFor(key)]);
      a.playbackRate = opts.rate ?? 1;
      void a.play().catch(() => {});
    } catch { /* ignore */ }
  }

  private srcFor(key: keyof typeof FILES): string {
    if (key !== 'bgm') return BASE + FILES[key];
    return lobbyMusicSrc((type) => new Audio().canPlayType(type));
  }

  startMusic() {
    if (!this.enabled || !this.channels.music) return;
    if (!this.music) {
      this.music = new Audio(this.srcFor('bgm'));
      this.music.loop = true;
      this.music.volume = this.musicLevel();
    }
    void this.music.play().catch(() => {});
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try { localStorage.setItem('ggpoker.sound', on ? '1' : '0'); } catch { /* ignore */ }
    if (on) { this.unlock(); this.startMusic(); }
    else if (this.music) this.music.pause();
  }
}

export const sound = new SoundEngine();
