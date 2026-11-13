// Gapless background music via Web Audio.
// <audio loop> leaves a short gap at the loop point (decoder padding and seek
// latency). An AudioBufferSourceNode with loop=true repeats the decoded
// samples exactly, so a loop mastered to be seamless stays seamless.

interface GainLike {
  gain: { value: number };
  connect(destination: unknown): unknown;
}

interface BufferLike {
  duration: number;
}

interface SourceLike {
  buffer: BufferLike | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  connect(destination: unknown): unknown;
  start(when?: number): void;
}

export interface AudioContextLike {
  state: string;
  destination: unknown;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<BufferLike>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
}

export interface MusicLoopDeps {
  createContext: () => AudioContextLike;
  fetchArrayBuffer: (url: string) => Promise<ArrayBuffer>;
}

export const browserMusicDeps: MusicLoopDeps = {
  createContext: () => {
    const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio is not available');
    return new Ctor() as unknown as AudioContextLike;
  },
  fetchArrayBuffer: async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
    return res.arrayBuffer();
  },
};

export class MusicLoop {
  private readonly sources: readonly string[];
  private readonly deps: MusicLoopDeps;
  private volume: number;
  private ctx: AudioContextLike | null = null;
  private gain: GainLike | null = null;
  private starting: Promise<boolean> | null = null;
  private wantPlaying = false;

  constructor(sources: readonly string[], volume: number, deps: MusicLoopDeps = browserMusicDeps) {
    this.sources = sources;
    this.volume = volume;
    this.deps = deps;
  }

  /** Start or resume the loop. Resolves false when no source can play, so the caller can fall back. */
  start(): Promise<boolean> {
    this.wantPlaying = true;
    this.starting ??= this.load();
    return this.starting.then(async (ok) => {
      if (ok && this.wantPlaying && this.ctx?.state === 'suspended') await this.ctx.resume();
      return ok;
    });
  }

  async pause(): Promise<void> {
    this.wantPlaying = false;
    if (this.ctx && this.ctx.state !== 'suspended') await this.ctx.suspend();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.gain) this.gain.gain.value = volume;
  }

  private async load(): Promise<boolean> {
    let ctx: AudioContextLike;
    try {
      ctx = this.deps.createContext();
    } catch (err) {
      console.warn('[music] Web Audio unavailable, using fallback', err);
      return false;
    }
    const buffer = await this.decodeFirst(ctx);
    if (!buffer) return false;
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    source.connect(this.gain);
    source.start(0);
    if (!this.wantPlaying) await ctx.suspend();
    return true;
  }

  private async decodeFirst(ctx: AudioContextLike): Promise<BufferLike | null> {
    for (const url of this.sources) {
      try {
        return await ctx.decodeAudioData(await this.deps.fetchArrayBuffer(url));
      } catch (err) {
        console.warn(`[music] cannot use ${url}`, err);
      }
    }
    return null;
  }
}
