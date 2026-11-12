// Table chat state (P0 slice C3). Pure and import-free so Node can test it directly.

export const CHAT_MAX_CHARS = 280;
export const CHAT_HISTORY_LIMIT = 50;
/** The live counter appears once fewer than this many characters remain. */
export const CHAT_COUNTER_FROM = 40;
export const SEAT_REACTION_MS = 4000;
export const SEAT_BUBBLE_MS = 4500;

export type ReactionId = 1 | 2 | 3;
export type Reaction = { id: ReactionId; label: string };

// Mirrors the server allowlist in server/chat.js (IDs 1–3, Codex-evidenced labels).
export const REACTIONS: readonly Reaction[] = Object.freeze([
  Object.freeze({ id: 1 as const, label: 'Angry' }),
  Object.freeze({ id: 2 as const, label: 'Listening' }),
  Object.freeze({ id: 3 as const, label: 'Laughing' }),
]);

export function reactionById(id: unknown): Reaction | null {
  return REACTIONS.find((r) => r.id === id) || null;
}

export type ChatLine = {
  id: string;
  kind: 'chat' | 'reaction';
  userId: number;
  nick: string;
  text: string;
  reactionId?: ReactionId;
  at: number;
};

export type ChatState = {
  lines: readonly ChatLine[];
  unread: number;
  open: boolean;
};

export type ChatAction =
  | { type: 'append'; line: ChatLine; own?: boolean }
  | { type: 'history'; lines: readonly ChatLine[] }
  | { type: 'open' }
  | { type: 'close' };

export const INITIAL_CHAT: ChatState = Object.freeze({ lines: Object.freeze([]), unread: 0, open: false });

const byTime = (a: ChatLine, b: ChatLine) => a.at - b.at;

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'append': {
      if (state.lines.some((l) => l.id === action.line.id)) return state;
      const lines = [...state.lines, action.line].slice(-CHAT_HISTORY_LIMIT);
      const unread = state.open || action.own ? state.unread : state.unread + 1;
      return { ...state, lines, unread };
    }
    case 'history': {
      // A rejoin replays the server buffer: keep one copy of each line, oldest first.
      const known = new Set(state.lines.map((l) => l.id));
      const fresh = action.lines.filter((l) => !known.has(l.id));
      if (!fresh.length) return state;
      const lines = [...state.lines, ...fresh].sort(byTime).slice(-CHAT_HISTORY_LIMIT);
      return { ...state, lines };
    }
    case 'open':
      return state.open && state.unread === 0 ? state : { ...state, open: true, unread: 0 };
    case 'close':
      return state.open ? { ...state, open: false } : state;
    default:
      return state;
  }
}

/** Server `chat` event or `chat_history` row → a chat line. Null for malformed input. */
export function chatLineFrom(raw: any): ChatLine | null {
  if (!raw || typeof raw.message !== 'string' || raw.id == null) return null;
  return {
    id: `c:${raw.id}`,
    kind: 'chat',
    userId: Number(raw.userId) || 0,
    nick: String(raw.nick || 'Player'),
    text: raw.message,
    at: Number(raw.at) || 0,
  };
}

/** Server `emote` event (reaction broadcast) → a log line. Null for unknown reactions. */
export function reactionLineFrom(raw: any): ChatLine | null {
  const reaction = reactionById(raw?.reactionId);
  if (!reaction) return null;
  const userId = Number(raw.userId) || 0;
  const at = Number(raw.at) || 0;
  return {
    id: `r:${userId}:${at}`,
    kind: 'reaction',
    userId,
    nick: String(raw.nick || 'Player'),
    text: reaction.label,
    reactionId: reaction.id,
    at,
  };
}

/** Characters left, shown only near the limit; null hides the counter. */
export function chatCounter(text: string): number | null {
  const left = CHAT_MAX_CHARS - [...text].length;
  return left < CHAT_COUNTER_FROM ? left : null;
}

export type SenderRole = 'self' | 'other';
export function senderRole(line: Pick<ChatLine, 'userId'>, selfId: number | null | undefined): SenderRole {
  return selfId != null && line.userId === selfId ? 'self' : 'other';
}
