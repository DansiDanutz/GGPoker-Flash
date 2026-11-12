// Table chat store (P0 slice C3). Chat lives outside TablePage's React state: the socket
// handler dispatches here and only the chat panel and the seat overlays subscribe, so an
// incoming line never re-renders the action bar, resets a bet draft or closes the confirm
// dialog.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { sound } from './sound';
import {
  chatLineFrom, chatReducer, INITIAL_CHAT, reactionLineFrom, SEAT_BUBBLE_MS, SEAT_REACTION_MS,
  type ChatAction, type ChatLine, type ChatState, type ReactionId,
} from './tableChat';

export type SeatFx = {
  reaction: { id: ReactionId; label: string; key: number } | null;
  bubble: { text: string; key: number } | null;
};
const NO_FX: SeatFx = Object.freeze({ reaction: null, bubble: null });

type Listener = () => void;

export type TableChatStore = ReturnType<typeof createTableChatStore>;

export function createTableChatStore() {
  let state: ChatState = INITIAL_CHAT;
  let fx: ReadonlyMap<number, SeatFx> = new Map();
  let muted: ReadonlySet<number> = new Set();
  let selfId: number | null = null;
  let timers = new Map<string, number>();
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l());

  const dispatch = (action: ChatAction) => {
    const next = chatReducer(state, action);
    if (next !== state) { state = next; emit(); }
  };

  const setFx = (userId: number, patch: Partial<SeatFx>) => {
    fx = new Map(fx).set(userId, { ...(fx.get(userId) || NO_FX), ...patch });
    emit();
  };

  const schedule = (key: string, ms: number, run: () => void) => {
    const prev = timers.get(key);
    if (prev) window.clearTimeout(prev);
    timers = new Map(timers).set(key, window.setTimeout(run, ms));
  };

  const showOnSeat = (line: ChatLine) => {
    const key = Date.now();
    if (line.kind === 'reaction' && line.reactionId) {
      setFx(line.userId, { reaction: { id: line.reactionId, label: line.text, key } });
      schedule(`r${line.userId}`, SEAT_REACTION_MS, () => setFx(line.userId, { reaction: null }));
    } else {
      setFx(line.userId, { bubble: { text: line.text, key } });
      schedule(`b${line.userId}`, SEAT_BUBBLE_MS, () => setFx(line.userId, { bubble: null }));
    }
  };

  const receiveLine = (line: ChatLine | null) => {
    if (!line || muted.has(line.userId)) return;
    dispatch({ type: 'append', line, own: line.userId === selfId });
    showOnSeat(line);
    if (line.kind === 'reaction') sound.play('bubble', { volume: .55 });
    else sound.play('click', { volume: .35 });
  };

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getState: () => state,
    getFx: (userId: number) => fx.get(userId) || NO_FX,
    isMuted: (userId: number) => muted.has(userId),
    setSelf(id: number | null) { selfId = id; },
    open: () => dispatch({ type: 'open' }),
    close: () => dispatch({ type: 'close' }),
    /** Feed a server `chat` or `emote` event. Returns true when it was a chat event. */
    receiveEvent(evt: any): boolean {
      if (evt?.type === 'chat') { receiveLine(chatLineFrom(evt)); return true; }
      if (evt?.type === 'emote') { receiveLine(reactionLineFrom(evt)); return true; }
      return false;
    },
    receiveHistory(rows: unknown) {
      if (!Array.isArray(rows)) return;
      const lines = rows.map(chatLineFrom).filter((l): l is ChatLine => !!l && !muted.has(l.userId));
      dispatch({ type: 'history', lines });
    },
    /** Hide a player's lines and seat effects on this device. */
    mute(userId: number) {
      muted = new Set(muted).add(userId);
      state = { ...state, lines: state.lines.filter((l) => l.userId !== userId) };
      fx = new Map([...fx].filter(([id]) => id !== userId));
      emit();
    },
    dispose() {
      timers.forEach((t) => window.clearTimeout(t));
      timers = new Map();
    },
  };
}

/** One store per table page, disposed on unmount. */
export function useTableChatStore(): TableChatStore {
  const ref = useRef<TableChatStore | null>(null);
  if (!ref.current) ref.current = createTableChatStore();
  useEffect(() => () => ref.current?.dispose(), []);
  return ref.current;
}

export function useTableChat(store: TableChatStore): ChatState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useSeatFx(store: TableChatStore, userId: number): SeatFx {
  const get = () => store.getFx(userId);
  return useSyncExternalStore(store.subscribe, get, get);
}
