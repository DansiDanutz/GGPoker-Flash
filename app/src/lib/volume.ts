/** localStorage key the Settings page writes the master volume (0-100) to. */
export const VOLUME_KEY = 'ggpoker.volume';
/** Master volume used until the player saves one. */
export const DEFAULT_VOLUME = 0.7;

/** The saved master volume as a 0-1 gain, or the default when nothing valid is stored. */
export function savedVolume(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return DEFAULT_VOLUME;
  const percent = Number(raw);
  if (!Number.isFinite(percent)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(100, percent)) / 100;
}
