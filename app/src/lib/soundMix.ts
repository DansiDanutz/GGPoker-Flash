// Per-channel gain for the sound engine. Pure, so it is tested under node --test.

export type Channel = 'sfx' | 'voice' | 'alerts' | 'music' | 'ambience';
export type ChannelVolumes = Readonly<Record<Channel, number>>;

export const CHANNELS: ReadonlyArray<Channel> = ['sfx', 'voice', 'alerts', 'music', 'ambience'];
export const CHANNEL_VOLUMES_KEY = 'ggpoker.soundChannelVolumes';
export const DEFAULT_CHANNEL_VOLUMES: ChannelVolumes = Object.freeze({ sfx: 1, voice: 1, alerts: 1, music: 1, ambience: 1 });

/** A sound each channel plays when previewed from Settings. */
export const CHANNEL_PREVIEW: Readonly<Record<Channel, string>> = Object.freeze({
  sfx: 'bet', voice: 'voiceRaise', alerts: 'turn', music: 'bgm', ambience: 'bubble',
});

export const clampUnit = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Saved channel volumes (0..1) over the defaults; junk values keep the default. */
export function parseChannelVolumes(raw: string | null): ChannelVolumes {
  let saved: Record<string, unknown> = {};
  try {
    const data = JSON.parse(raw || '{}');
    if (data && typeof data === 'object' && !Array.isArray(data)) saved = data;
  } catch { return DEFAULT_CHANNEL_VOLUMES; }
  const out: Record<string, number> = { ...DEFAULT_CHANNEL_VOLUMES };
  for (const ch of CHANNELS) {
    const v = saved[ch];
    if (typeof v === 'number' && Number.isFinite(v)) out[ch] = clampUnit(v);
  }
  return Object.freeze(out as Record<Channel, number>);
}

export function withChannelVolume(volumes: ChannelVolumes, channel: Channel, value: number): ChannelVolumes {
  return Object.freeze({ ...volumes, [channel]: clampUnit(value) });
}

/** Final element volume: the cue's own level × master × channel, clamped to 0..1. */
export function mixedVolume(cue: number, master: number, channel: number): number {
  return clampUnit(cue * master * channel);
}
