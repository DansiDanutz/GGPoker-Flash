export const AVATAR_COUNT: number;
export const AVATAR_NAMES: readonly string[];
export function avatarPresetPath(number: number): string;
export function resolveAvatarPreset(value: unknown): string | null;
export function normalizeAvatarSource(value: unknown): string;
