// Sound engine using the original GGPoker client audio files.
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
  voiceRaise: 'VoiceRaise.mp3',
  voiceAllIn: 'VoiceAllIn.mp3',
  voiceCheck: 'VoiceCheck.mp3',
  voiceFold: 'VoiceFold.mp3',
  voiceCall: 'VoiceCall.mp3',
  voiceBet: 'VoiceBet.mp3',
  bgm: 'BgmLobby.mp3',
};

type Channel = 'sfx' | 'voice' | 'alerts' | 'music' | 'ambience';
const DEFAULT_CHANNELS: Record<Channel, boolean> = { sfx: true, voice: true, alerts: true, music: true, ambience: true };

class SoundEngine {
  enabled = true;
  volume = 0.7;
  musicVolume = 0.16;
  cache = new Map<string, HTMLAudioElement>();
  music: HTMLAudioElement | null = null;
  unlocked = false;
  channels: Record<Channel, boolean> = { ...DEFAULT_CHANNELS };

  constructor() {
    try {
      const saved = localStorage.getItem('ggpoker.sound');
      if (saved != null) this.enabled = saved === '1';
      const channels = JSON.parse(localStorage.getItem('ggpoker.soundChannels') || '{}');
      this.channels = { ...DEFAULT_CHANNELS, ...channels };
    } catch { /* ignore */ }
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
      a.volume = Math.min(1, (opts.volume ?? 1) * this.volume);
      a.playbackRate = opts.rate ?? 1;
      void a.play().catch(() => {});
    } catch { /* ignore */ }
  }

  startMusic() {
    if (!this.enabled || !this.channels.music) return;
    if (!this.music) {
      this.music = new Audio(BASE + FILES.bgm);
      this.music.loop = true;
      this.music.volume = this.musicVolume;
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
