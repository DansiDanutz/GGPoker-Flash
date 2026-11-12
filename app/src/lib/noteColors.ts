// Native player-note palette (mirrors server/player-labels.js). Ids are `c0`…`c10`;
// the first ten can carry a private label title, the eleventh is the untitled white.

export const NOTE_COLORS: readonly string[] = [
  '#00B050', '#269CFF', '#7030AA', '#7AFFE8', '#862C08', '#96FA3E',
  '#FF0000', '#FF8121', '#FFC7D2', '#FFFF00', '#FFFFFF',
];
export const NOTE_COLOR_IDS: readonly string[] = NOTE_COLORS.map((_, i) => `c${i}`);
export const DEFAULT_NOTE_COLOR = 'c9';
export const LABEL_COUNT = 10;
export const LABEL_MAX = 20;
const LEGACY: Record<string, string> = { yellow: 'c9', green: 'c0', red: 'c6', blue: 'c1' };

/** Hex colour for a stored id (legacy names and unknown values fall back sensibly). */
export function noteColorHex(id: string | undefined): string {
  const key = id && LEGACY[id] ? LEGACY[id] : id;
  const index = key ? NOTE_COLOR_IDS.indexOf(key) : -1;
  return NOTE_COLORS[index >= 0 ? index : NOTE_COLOR_IDS.indexOf(DEFAULT_NOTE_COLOR)];
}

/** Display name for a colour: the owner's title when set, else a generic label. */
export function noteColorTitle(id: string, labels: readonly string[] | undefined): string {
  const index = NOTE_COLOR_IDS.indexOf(LEGACY[id] || id);
  if (index < 0) return 'Label';
  if (index >= LABEL_COUNT) return 'No label';
  return labels?.[index]?.trim() || `Label ${index + 1}`;
}

/** Normalises a server labels array to ten strings of at most 20 characters. */
export function normalizeLabels(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: LABEL_COUNT }, (_, i) => {
    const t = list[i];
    return typeof t === 'string' ? [...t.replace(/[\r\n]/g, ' ')].slice(0, LABEL_MAX).join('') : '';
  });
}
