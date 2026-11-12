import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { api, chips, getToken, money } from '../lib/api';
import { sound } from '../lib/sound';
import { PlayingCard } from '../components/Card';
import { SwfEffect } from '../components/SwfEffect';
import { betLabel, betTarget, betUnitOf, shortcutRoundUnit, enterBetRequest, readBetPrefs, readBettingOptions, readCardBack, readDealSpeed, readSqueeze, readStackMode, readShowChatBubbles, readShowReactions, type StackMode } from '../lib/tablePrefs';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/TitleBar';
import { bestHand, showdownFocus, focusClass, describeHole } from '../game/eval';
import { betLimits, potOdds, sizingPresets, type BetContext } from '../game/betting';
import { potChipLayout, shuffleFramePosition, shuffleScrubFrame, SHUFFLE_START_FRAME, SHUFFLE_END_FRAME } from '../game/potChips';
import { createSqueezePanel } from '../game/squeeze';
import { showdownComplete, showdownPlan } from '../game/showdown';
import { turnUrgencyClass, timeBankOffered } from '../game/turnClock';
import { seatNick, isAllInStatus } from '../game/seatLabel';
import { autoTopUpAmount } from '../lib/autoTopUp';
import { DEFAULT_NOTE_COLOR, noteColorHex, noteColorTitle, normalizeLabels } from '../lib/noteColors';
import { NoteColorPicker } from '../components/NoteColorPicker';
import { OpponentHud } from '../components/OpponentHud';
import { actionForCombo, comboFromEvent, readHotkeys, type HotkeyAction } from '../lib/hotkeys';
import { LOOK_KEY, ROOM_BGS, TABLE_THEMES, parseLookOverrides, resolveLook, withLookOverride, type LookOverride, type LookOverrides } from '../lib/tableLook';
import { APP_BUILD, APP_VERSION, buildLabel } from '../lib/version';
import { useWaitlist } from '../lib/waitlistState';
import { formatCountdown, queuePositionLabel } from '../lib/waitlist';
import { useOfferSeconds } from '../components/SeatOfferModal';
import { TableChat } from '../components/table/TableChat';
import { SeatReaction } from '../components/table/SeatReaction';
import { ReportPlayerModal } from '../components/table/ReportPlayerModal';
import { CashDropBanner } from '../components/table/CashDropBanner';
import type { CashDropEvent } from '../lib/cashDrop';
import { useTableChatStore } from '../lib/useTableChat';
import type { ChatLine, ReactionId } from '../lib/tableChat';
import { sitOutClock, straddlePrompt, type StraddleAsk } from '../game/straddlePrompt';
import { BAD_BEAT_BANNER_MS, badBeatRows, type BadBeatHit } from '../game/badBeat';
import { canShowHand, showOptions } from '../game/showOptions';
import { COLLECT_EASING, COLLECT_MS, collectedWagers } from '../game/chipCollect';
import { vpipOf } from '../game/seatVpip';
import { BuyInDialog, TakeSeatControl, type Reservation } from '../components/TakeSeat';
import { NATIVE_TABLE_WIDTH, PAYOUT_EASING, PAYOUT_FADE_MS, PAYOUT_HOLD_MS, PAYOUT_STOP_PX, PAYOUT_TRANSFER_MS, payoutShares, potOffset, stopShort, type PayoutShare } from '../game/payoutMotion';
import { bubbleLabel, finishTitle, finishToast, ordinal, PayoutRow } from '../lib/tournamentPrizes';

type PlayerState = {
  seat: number; id?: string; nick?: string; avatar?: string; stack?: number; bet?: number; totalBet?: number;
  folded?: boolean; allIn?: boolean; inHand?: boolean; sittingOut?: boolean; isBot?: boolean; isMe?: boolean;
  reveal?: boolean; shown?: number[]; cards?: string[]; sitOutNext?: boolean; lastAction?: { action: string; amount: number } | null;
  winAmount?: number; empty?: boolean; reserved?: boolean; mine?: boolean; disconnected?: boolean; autoStraddle?: boolean; sitOutEndsAt?: number; waitForBlinds?: boolean; waitingForBigBlind?: boolean;
};

type TableState = {
  id: string; tableEpoch?: string; tableVersion?: number; name: string; game: string; sb: number; bb: number; ante: number; seats: number;
  button: number; sbSeat?: number; bbSeat?: number; handNo: number; street: string; board: string[]; pot: number; currentBet: number;
  minRaise: number; actor: string | null; actionEndsAt: number; now: number; result: any;
  timeBankUsed?: number[];
  players: PlayerState[]; log: any[]; minBuyin?: number; maxBuyin?: number; ownerId?: number | null; private?: boolean; bombPot?: boolean; handId?: string | null;
  spin?: {
    multiplier: number | null;
    prize: number;
    buyIn?: number;
    /** Places 1-3 from the verified table; null until the first hand draws the Spin. */
    payouts?: number[] | null;
    finished?: { id: string | number; nick: string; place: number; payout: number }[];
    winner: any;
  } | null;
  tournament?: { id?: string | null; name: string; prizePool: number; level: number; winner: any; mode?: string; bounty?: number; ticket?: string; nextBlindAt?: number | null; managed?: boolean; tableIndex?: number; tables?: number; playersLeft?: number | null; payouts?: PayoutRow[] } | null;
  straddle?: boolean;
  straddleAsk?: StraddleAsk | null;
  runItTwice?: boolean;
  boards?: string[][] | null;
  potLimit?: boolean; allInOrFold?: boolean; maxRaiseTo?: number; actionTimeMs?: number; rake?: number;
};

// A decision queued while waiting for the action to come round.
type PreAction = { kind: 'checkfold' } | { kind: 'check' } | { kind: 'call'; amount: number };

// Observed Spin & Gold multipliers (server/spin.js), shown on the intro wheel.
const SPIN_WHEEL_MULTIPLIERS = [2, 3, 4, 5, 10, 50, 100, 20000];
const DEFAULT_ACTION_TIME_MS = 15000;

const POS6 = [[50, 76], [12, 68], [16, 32], [50, 17], [84, 32], [88, 68]];
const POS9 = [[50, 80], [26, 77], [10, 62], [11, 40], [29, 22], [50, 17], [71, 22], [89, 40], [90, 62]];
// Portrait phones lose the bottom of the screen to the action bar, so the two
// lowest seats move up to keep the hero's avatar, cards and stack visible.
const POS6_PHONE = [[50, 65], [12, 63], [16, 31], [50, 17], [84, 31], [88, 63]];
const POS9_PHONE = [[50, 68], [26, 69], [10, 58], [11, 38], [29, 21], [50, 16], [71, 21], [89, 38], [90, 58]];
// Landscape phones are short: pull the top seat clear of the bar and drop the
// hero above the action bar while leaving the pot and board room.
const POS6_LANDSCAPE = [[50, 76], [13, 66], [17, 30], [50, 20], [83, 30], [87, 66]];
const POS9_LANDSCAPE = [[50, 74], [26, 70], [10, 56], [11, 34], [29, 23], [50, 20], [71, 23], [89, 34], [90, 56]];

function useLandscapePhone() {
  const query = '(max-height: 520px) and (orientation: landscape)';
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setOn(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return on;
}

function useNarrowScreen(maxWidth = 760) {
  // Also compact the ring on phones held sideways (short viewport, wide width).
  const query = `(max-width: ${maxWidth}px), (max-height: 520px) and (orientation: landscape)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [query]);
  return narrow;
}

export function TablePage({ tableId }: { tableId: string }) {
  const { user, navigate, toast, setOpeningTable } = useApp();
  const [state, setState] = useState<TableState | null>(null);
  const [connected, setConnected] = useState(false);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [raiseTo, setRaiseTo] = useState(0);
  // Chat lives in its own store so incoming lines never re-render this page (C3).
  const chatStore = useTableChatStore();
  chatStore.setSelf(user?.id ?? null);
  const [showChatBubbles] = useState(readShowChatBubbles);
  const [showReactions] = useState(readShowReactions);
  const [chatReport, setChatReport] = useState<ChatLine | null>(null);
  const timerWarnRef = useRef<string>('');
  const [fx, setFx] = useState<{ id: number; seat: number; amount: number }[]>([]);
  const [winFx, setWinFx] = useState<{ id: number; amount: number; nick: string } | null>(null);
  const [cashDrop, setCashDrop] = useState<CashDropEvent | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [spinShow, setSpinShow] = useState(false);
  const [spinWin, setSpinWin] = useState<any>(null);
  const [tourneyWin, setTourneyWin] = useState<any>(null);
  const [allInFx, setAllInFx] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [preAction, setPreAction] = useState<PreAction | null>(null);
  const lastDealtHand = useRef(-1);
  const clockOffset = useRef(0);
  const [rabbit, setRabbit] = useState<string[]>([]);
  const [badBeat, setBadBeat] = useState<BadBeatHit | null>(null);
  const badBeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fourColor, setFourColor] = useState(() => localStorage.getItem('ggpoker.fourcolor') === '1');
  const [animOff, setAnimOff] = useState(() => localStorage.getItem('ggpoker.animations') === '0');
  const [observing, setObserving] = useState(false);
  // Wait-list position and held-seat offer come from the global wait-list state (W4b).
  const { queues: waitQueues, offer: seatOffer, refresh: refreshWaitlist, dismissOffer } = useWaitlist();
  const myTableQueue = waitQueues.find((q) => q.kind === 'table' && q.tableId === tableId && q.position > 0) || null;
  const offerHere = seatOffer && seatOffer.tableId === tableId ? seatOffer : null;
  const offerSeconds = useOfferSeconds(offerHere);
  const offerLive = !!offerHere && offerSeconds > 0;
  const dismissOfferRef = useRef<(id: string) => void>(() => {});
  dismissOfferRef.current = (id: string) => { if (seatOffer?.tableId === id) dismissOffer(); };
  const waitBannerText = offerLive && offerHere ? (
    <><b>Seat available.</b> Seat {offerHere.seat + 1} is held for you{' '}
      <span aria-hidden="true" style={{ fontVariantNumeric: 'tabular-nums' }}>· {formatCountdown(offerSeconds)}</span></>
  ) : myTableQueue
    ? `You are ${queuePositionLabel(myTableQueue)} on the waiting list. We will hold the next open seat for you.`
    : 'You are observing this table. Take a seat to join the action.';
  const [rebuyOpen, setRebuyOpen] = useState(false);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [rebuyAmount, setRebuyAmount] = useState(0);
  const [rebuyOffer, setRebuyOffer] = useState<{ min: number; max: number; until: number } | null>(null);
  const [notes, setNotes] = useState<Record<string, { note: string; color: string }>>({});
  const [noteTarget, setNoteTarget] = useState<PlayerState | null>(null);
  const [playerProfile, setPlayerProfile] = useState<any>(null);
  const [friendAdded, setFriendAdded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [mutes, setMutes] = useState<number[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteColor, setNoteColor] = useState(DEFAULT_NOTE_COLOR);
  const [noteLabels, setNoteLabels] = useState<string[]>(() => normalizeLabels(null));
  const [autoRebuy, setAutoRebuy] = useState(() => localStorage.getItem('ggpoker.autorebuy') === '1');
  const [autoMuck, setAutoMuck] = useState(() => localStorage.getItem('ggpoker.automuck') === '1');
  const [autoTopup] = useState(() => localStorage.getItem('ggpoker.autoTopup') === '1');
  const [topupTrigger] = useState(() => Number(localStorage.getItem('ggpoker.topupTrigger') || 25));
  const [topupTarget] = useState(() => Number(localStorage.getItem('ggpoker.topupTarget') || 100));
  const [cardBack] = useState(readCardBack);
  const [cardFront] = useState(() => localStorage.getItem('ggpoker.cardFront') || 'official');
  const [globalRoomBg] = useState(() => localStorage.getItem('ggpoker.roomBg') || 'featured');
  const [showHand] = useState(() => localStorage.getItem('ggpoker.showHand') !== '0');
  const [hotkeyHints] = useState(() => localStorage.getItem('ggpoker.hotkeyHints') !== '0');
  const [hotkeysOn] = useState(() => localStorage.getItem('ggpoker.hotkeys') !== '0');
  const [hotkeyMap] = useState(readHotkeys);
  // Latest handlers for hotkeys that are not table actions (kept in refs so the key
  // listener does not re-subscribe on every render).
  const hotkeyAnyTimeRef = useRef<Partial<Record<HotkeyAction, () => void>>>({});
  const hotkeyPresetRef = useRef<(index: number) => void>(() => {});
  const [dealSpeed] = useState(readDealSpeed);
  const [bettingOptions] = useState(readBettingOptions);
  const confirmBets = bettingOptions.confirm === 'always';
  const [pendingBet, setPendingBet] = useState<{ action: 'raise' | 'allin'; amount: number } | null>(null);
  const actionBarRef = useRef<HTMLDivElement | null>(null);
  const [squeezeEnabled] = useState(readSqueeze);
  const [squeezing, setSqueezing] = useState(false);
  const squeezeHostRef = useRef<HTMLDivElement | null>(null);
  const squeezeHandRef = useRef<number | null>(null);
  const firstStateRef = useRef(true);
  const [betPrefs] = useState(readBetPrefs);
  const [timeBankSeconds] = useState(() => Math.max(5, Math.min(60, Number(localStorage.getItem('ggpoker.timeBank') || 10))));
  const [stackMode, setStackMode] = useState<StackMode>(readStackMode);
  const [cardAnim, setCardAnim] = useState<'deal' | 'flip' | 'slide' | 'off'>(() => {
    const saved = localStorage.getItem('ggpoker.cardAnim');
    return saved === 'flip' || saved === 'slide' || saved === 'off' ? saved : 'deal';
  });
  const chooseCardAnim = (anim: 'deal' | 'flip' | 'slide' | 'off') => {
    setCardAnim(anim);
    localStorage.setItem('ggpoker.cardAnim', anim);
  };
  const [buttonLayout, setButtonLayout] = useState<'bottom' | 'side' | 'float'>(() => {
    const saved = localStorage.getItem('ggpoker.buttonLayout');
    return saved === 'side' || saved === 'float' ? saved : 'bottom';
  });
  const chooseLayout = (layout: 'bottom' | 'side' | 'float') => {
    setButtonLayout(layout);
    localStorage.setItem('ggpoker.buttonLayout', layout);
  };
  const [swfEffect, setSwfEffect] = useState<string | null>(null);
  const clearSwf = useCallback(() => setSwfEffect(null), []);
  const spinIntroSeen = useRef(false);
  const [squeeze, setSqueeze] = useState(false);
  const autoRebuyPending = useRef(false);
  const spinSeen = useRef(false);
  const [now, setNow] = useState(Date.now());
  const [chipShuffleOn] = useState(() => localStorage.getItem('ggpoker.chipShuffle') !== '0');
  const [chipShuffle, setChipShuffle] = useState<{ frame: number; key: number } | null>(null);
  const [showdownReveals, setShowdownReveals] = useState<Record<number, number>>({});
  // Best-five winner focus starts when the reveal sequence completes (native WIN timing).
  const [focusReady, setFocusReady] = useState(false);
  const chipShuffleTimer = useRef<number | null>(null);
  const chipShuffleIdle = useRef<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef<TableState | null>(null);
  const mySeatRef = useRef<number | null>(null);
  const fxId = useRef(1);
  const retry = useRef<number | null>(null);
  const everJoined = useRef(false);
  const tableEpoch = useRef<string | null>(null);
  const lastSeq = useRef(0);

  const [globalTheme] = useState(() => localStorage.getItem('ggpoker.theme') || 'Green');
  const [lookOverrides, setLookOverrides] = useState<LookOverrides>(() => parseLookOverrides(localStorage.getItem(LOOK_KEY)));
  const { theme, roomBg } = resolveLook({ theme: globalTheme, roomBg: globalRoomBg }, lookOverrides, tableId);
  const hasLookOverride = !!lookOverrides[tableId];
  const setTableLook = (patch: LookOverride | null) => {
    const next = withLookOverride(lookOverrides, tableId, patch);
    setLookOverrides(next);
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(next)); } catch { /* storage full or blocked: keep in memory */ }
  };
  useEffect(() => {
    // Another tab changed a table's look: follow it.
    const onStorage = (e: StorageEvent) => { if (e.key === LOOK_KEY) setLookOverrides(parseLookOverrides(e.newValue)); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const query = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const buyin = Number(query.get('buyin') || 0);
  const observe = query.get('observe') === '1';
  const seatParam = query.get('seat');

  useEffect(() => {
    if (!user) { navigate('/login'); }
  }, [user]);

  const connect = useCallback(() => {
    if (!user) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(getToken() || '')}`);
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'join_table', tableId, buyin, observe, seat: seatParam != null ? Number(seatParam) : null }));
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'state') {
        const s: TableState = msg.state;
        tableEpoch.current = s.tableEpoch || null;
        lastSeq.current = s.tableVersion || 0;
        const collected = collectedWagers(stateRef.current, s);
        stateRef.current = s;
        collected.forEach((w) => collectWager(w.seat));
        setState(s);
        clockOffset.current = s.now - Date.now();
        const mine = s.players.find((p) => p.isMe);
        if (mine) { mySeatRef.current = mine.seat; setMySeat(mine.seat); }
        // Once per hand: this handler closes over stale state, so track the hand in a ref.
        if (s.street === 'preflop' && lastDealtHand.current !== s.handNo) {
          lastDealtHand.current = s.handNo;
          sound.play('deal', { volume: .75 });
        }
        if (s.spin && !spinSeen.current) {
          spinSeen.current = true;
          setSpinShow(true);
          sound.play('wheel');
          window.setTimeout(() => sound.play('wheelTick', { volume: .5 }), 400);
          window.setTimeout(() => sound.play('cheer', { volume: .7 }), 1800);
          window.setTimeout(() => setSpinShow(false), 4200);
        }
      } else if (msg.type === 'seat_reserved') {
        // Native CheckTakeSeatCommand: a successful reservation opens the buy-in popup.
        setReservation({ seat: msg.seat, until: msg.until });
      } else if (msg.type === 'joined') {
        everJoined.current = true;
        setMySeat(msg.seat);
        if (msg.observe) setObserving(true); else {
          setObserving(false);
          // Keep the seat's auto-muck preference in sync with this device.
          ws.send(JSON.stringify({ type: 'option', tableId, autoMuck }));
        }
        if (msg.waitlist) refreshWaitlist();
        // Sitting down accepts a seat held for us here.
        if (!msg.observe) dismissOfferRef.current(tableId);
        setOpeningTable(null);
      } else if (msg.type === 'waitlist') {
        refreshWaitlist();
        setObserving(true);
        toast({ kind: 'info', title: 'Waitlist', body: `You are #${msg.position || 1} in line. We will hold the next seat for you.` });
      } else if (msg.type === 'rush_queued') {
        toast({ kind: 'info', title: 'Rush queue', body: 'Waiting for the next open Rush seat — you are sitting out meanwhile.' });
      } else if (msg.type === 'rush_move') {
        toast({ kind: 'info', title: 'Rush & Cash', body: 'New table, same stack.' });
        navigate(`/table/${msg.tableId}?buyin=${msg.stack || 0}`);
      } else if (msg.type === 'table_move') {
        // A tournament flight balanced or broke: the stack travels, the view follows.
        const where = msg.index ? `table ${msg.index}` : 'the next table';
        toast({
          kind: 'info',
          title: msg.reason === 'break' ? 'Table break' : 'Tables balanced',
          body: `Moving to ${where} — your stack comes with you.`,
        });
        navigate(`/table/${msg.tableId}?buyin=${msg.stack || 0}`);
      } else if (msg.type === 'table_break') {
        const tournamentId = stateRef.current?.tournament?.id;
        // `observe` comes from the URL, so it is stable inside this closure.
        if (observe && tournamentId) {
          // A watcher follows the field to the busiest remaining flight.
          fetch(`/api/tournaments/${tournamentId}/watch`, { headers: { authorization: `Bearer ${getToken()}` } })
            .then((r) => r.json())
            .then((r) => {
              if (!r.tableId || r.tableId === tableId) return;
              toast({ kind: 'info', title: 'Table break', body: 'Following the field to the next table.' });
              navigate(`/table/${r.tableId}?observe=1`);
            })
            .catch(() => { /* stay on the closed table */ });
        } else {
          toast({ kind: 'info', title: 'Table break', body: 'This table broke; the players were moved to the remaining tables.' });
        }
      } else if (msg.type === 'event') {
        const e = msg.event;
        if (tableEpoch.current && e.tableEpoch && e.tableEpoch !== tableEpoch.current) { ws.close(); return; }
        if (e.seq && lastSeq.current && e.seq > lastSeq.current + 1) { ws.close(); return; }
        if (e.seq) lastSeq.current = e.seq;
        handleEvent(e);
      } else if (msg.type === 'chat_history') {
        if (msg.tableId === tableId) chatStore.receiveHistory(msg.lines);
      } else if (msg.type === 'error') {
        toast({ kind: 'error', title: 'Table', body: msg.error });
      }
    };
    ws.onclose = () => {
      setConnected(false);
      if (!everJoined.current) return;
      retry.current = window.setTimeout(() => { if (wsRef.current === ws) connect(); }, 1600);
    };
    ws.onerror = () => { /* handled by close */ };
  }, [tableId, user]);

  const pushStack = (to: [number, number]) => {
    const el = tableRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const stack = document.createElement('div');
    stack.className = 'push-stack';
    stack.innerHTML = '<i></i><i></i><i></i><i></i>';
    stack.style.left = `${r.width * 0.5}px`;
    stack.style.top = `${r.height * 0.45}px`;
    el.appendChild(stack);
    const dx = (r.width * (to[0] - 50)) / 100;
    const dy = (r.height * (to[1] - 45)) / 100;
    stack.animate([
      { transform: 'translate(-50%,-50%) scale(.7)', opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.45 - 34}px)) scale(1.08)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.95)`, opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.8)`, opacity: 0 },
    ], { duration: 900, easing: 'cubic-bezier(.22,.8,.3,1)' });
    window.setTimeout(() => stack.remove(), 950);
  };

  // Street end: each wager slides from its seat anchor into the pot (native 400 ms, ease-out cubic).
  const collectWager = (seat: number) => {
    const el = tableRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const [x, y] = seatPosOf(seat);
    const from: [number, number] = [x + (50 - x) * 0.2, y + (45 - y) * 0.2];
    const chipEl = document.createElement('div');
    chipEl.className = 'collect-chip';
    chipEl.style.left = `${(r.width * from[0]) / 100}px`;
    chipEl.style.top = `${(r.height * from[1]) / 100}px`;
    el.appendChild(chipEl);
    const dx = (r.width * (50 - from[0])) / 100;
    const dy = (r.height * (45 - from[1])) / 100;
    chipEl.animate([
      { transform: 'translate(-50%,-50%)' },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))` },
    ], { duration: COLLECT_MS, easing: COLLECT_EASING, fill: 'forwards' });
    window.setTimeout(() => chipEl.remove(), COLLECT_MS + 20);
  };

  const awardPot = (share: PayoutShare) => {
    const el = tableRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const [ox, oy] = potOffset(share.potIndex, r.width);
    const from: [number, number] = [r.width * 0.5 + ox, r.height * 0.45 + oy];
    const [sx, sy] = seatPosOf(share.seat);
    const to = stopShort(from, [(r.width * sx) / 100, (r.height * sy) / 100], PAYOUT_STOP_PX * (r.width / NATIVE_TABLE_WIDTH));
    const node = document.createElement('div');
    node.className = 'payout-share';
    node.style.left = `${from[0]}px`;
    node.style.top = `${from[1]}px`;
    const label = document.createElement('span');
    // The socket handler keeps the first render's closures: read the live table state here.
    const tourney = !!stateRef.current?.tournament;
    label.textContent = tourney ? Math.round(share.amount).toLocaleString('en-US') : money(share.amount);
    node.appendChild(document.createElement('i'));
    node.appendChild(label);
    el.appendChild(node);
    const total = PAYOUT_TRANSFER_MS + PAYOUT_HOLD_MS + PAYOUT_FADE_MS;
    const at = `translate(calc(-50% + ${to[0] - from[0]}px), calc(-50% + ${to[1] - from[1]}px))`;
    node.animate([
      { transform: 'translate(-50%,-50%)', opacity: 1, easing: PAYOUT_EASING },
      { transform: at, opacity: 1, offset: PAYOUT_TRANSFER_MS / total },
      { transform: at, opacity: 1, offset: (PAYOUT_TRANSFER_MS + PAYOUT_HOLD_MS) / total },
      { transform: at, opacity: 0 },
    ], { duration: total, fill: 'forwards' });
    window.setTimeout(() => node.remove(), total + 50);
  };

  const flyChips = (from: [number, number], to: [number, number], count = 3, color = '#d9a83c') => {
    const el = tableRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const chip = document.createElement('div');
      chip.className = 'fly-chip';
      chip.style.background = `radial-gradient(circle at 35% 30%, #fff3c4, ${color} 55%, #5b3d06 100%)`;
      chip.style.left = `${(r.width * from[0]) / 100 + (Math.random() - 0.5) * 26}px`;
      chip.style.top = `${(r.height * from[1]) / 100 + (Math.random() - 0.5) * 18}px`;
      el.appendChild(chip);
      const dx = (r.width * (to[0] - from[0])) / 100;
      const dy = (r.height * (to[1] - from[1])) / 100;
      chip.animate([
        { transform: 'translate(-50%,-50%) scale(.7)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy * 0.55 - 26}px)) scale(1.05)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.85)`, opacity: 0 },
      ], { duration: 540 + Math.random() * 140, delay: i * 55, easing: 'cubic-bezier(.2,.8,.3,1)' });
      window.setTimeout(() => chip.remove(), 800 + i * 55);
    }
  };

  const handleEvent = (evt: any) => {
    if (evt.type === 'action') {
      const map: Record<string, any> = { fold: 'fold', check: 'check', call: 'call', bet: 'bet', raise: 'raise', allin: 'allin' };
      const key = map[evt.action];
      if (key) sound.play(key, { volume: key === 'fold' ? .55 : .8 });
      if (evt.allIn) { setAllInFx(true); setTimeout(() => setAllInFx(false), 1600); sound.play('allin'); }
      if (evt.amount || evt.paid) {
        const id = fxId.current++;
        setFx((prev) => [...prev, { id, seat: evt.seat, amount: evt.amount || evt.paid }]);
        window.setTimeout(() => setFx((prev) => prev.filter((f) => f.id !== id)), 1100);
        const s = stateRef.current;
        const p = s?.players.find((x) => x.seat === evt.seat);
        if (p) {
          const pos = seatPosOf(evt.seat);
          flyChips(pos, [50, 45], evt.action === 'raise' || evt.action === 'bet' ? 4 : 2);
        }
      }
    } else if (evt.type === 'street') {
      setAllInFx(false);
      sound.play('flop', { volume: .7 });
    } else if (evt.type === 'win') {
      setAllInFx(false);
      const s = stateRef.current;
      // Showdowns turn the cards in seat order before the badge and pot move.
      const isShowdown = evt.reason === 'showdown';
      const revealSeats = isShowdown ? (evt.hands || []).filter((h: any) => h.cards).map((h: any) => h.seat) : [];
      const plan = isShowdown ? showdownPlan(revealSeats) : [];
      const fxAt = isShowdown ? showdownComplete(revealSeats) : 0;
      setFocusReady(false);
      if (isShowdown) window.setTimeout(() => setFocusReady(true), fxAt);
      if (plan.length) {
        setShowdownReveals(Object.fromEntries(plan.map((r) => [r.seat, r.at])));
        window.setTimeout(() => setShowdownReveals({}), fxAt + 700);
      }
      // Native per-pot awards: one transfer per pot share from that pot's own position.
      const withSeats = (evt.winners || []).map((w: any) => ({ ...w, seat: typeof w.seat === 'number' ? w.seat : s?.players.find((x) => x.id === w.id)?.seat }));
      for (const share of payoutShares(withSeats)) {
        window.setTimeout(() => awardPot(share), fxAt);
        window.setTimeout(() => pushStack(seatPosOf(share.seat)), fxAt + PAYOUT_TRANSFER_MS);
      }
      window.setTimeout(() => sound.play('win', { volume: .9 }), fxAt);
      window.setTimeout(() => sound.play('gather', { volume: .6 }), fxAt + 450);
      const heroId = stateRef.current?.players.find((p) => p.isMe)?.id;
      const mine = (evt.winners || []).filter((x: any) => x.id === heroId);
      if (mine.length) {
        const total = mine.reduce((a: number, x: any) => a + (x.amount || 0), 0);
        window.setTimeout(() => {
          setWinFx({ id: fxId.current++, amount: total, nick: mine[0].nick });
          window.setTimeout(() => setWinFx(null), 2600);
        }, fxAt);
      }
      if (Array.isArray(evt.cards)) sound.play('show', { volume: .5 });
    } else if (evt.type === 'insurance_bought') {
      toast({ kind: 'info', title: 'Insurance bought', body: `Premium ${money(evt.premium)} for the next hand` });
    } else if (evt.type === 'insurance_paid') {
      toast({ kind: 'reward', title: 'Insurance paid', body: money(evt.amount) });
    } else if (evt.type === 'cashdrop') {
      setCashDrop({ amount: evt.amount, nick: evt.nick, rule: evt.rule });
      sound.play('cashdrop', { volume: .8 });
      toast({ kind: 'reward', title: 'Rush Cash Drop', body: `${evt.nick} won ${money(evt.amount)}` });
      window.setTimeout(() => setCashDrop(null), 4500);
    } else if (evt.type === 'spin_win') {
      setSwfEffect('/assets/swf/spin_win.swf');
      setSpinWin(evt);
      sound.play('sngWin');
      setTimeout(() => sound.play('fireworks', { volume: .7 }), 600);
    } else if (evt.type === 'bounty') {
      if (evt.mystery) setSwfEffect('/assets/swf/mystery_box.swf');
      toast({ kind: 'reward', title: evt.mystery ? 'Mystery bounty' : 'Bounty', body: `${evt.winnerNick} wins ${money(evt.amount)} (${evt.bustedNick})` });
      sound.play('coin');
    } else if (evt.type === 'tourney_payout') {
      toast({ kind: 'reward', ...finishToast(evt, (n) => money(n)) });
      sound.play('coin');
      // Any paid place gets the finish presentation with its real place and amount.
      const heroNow = stateRef.current?.players.find((p) => p && !p.empty && p.isMe);
      if (heroNow && String(evt.id) === String(heroNow.id)) {
        setTourneyWin({ ...evt, prize: evt.payout, tableName: stateRef.current?.name || '' });
      }
    } else if (evt.type === 'tourney_win') {
      if (!evt.ticket) setSwfEffect('/assets/swf/win_effect.swf');
      // Keep the hero's own paid-place presentation if it is already showing.
      setTourneyWin((prev: any) => (prev && prev.place > 1 ? prev : evt));
      sound.play('tournamentWin');
      setTimeout(() => sound.play('fireworks', { volume: .7 }), 600);
    } else if (evt.type === 'rebuy_offer') {
      const meNow = stateRef.current?.players.find((p) => p && !p.empty && p.isMe);
      if (meNow && Number(evt.playerId) === Number(meNow.id)) {
        setRebuyOffer({ min: Number(evt.min) || 0, max: Number(evt.max) || 0, until: Number(evt.until) || 0 });
        setRebuyAmount(Math.max(0, Number(evt.min) || 0));
        setRebuyOpen(true);
        toast({ kind: 'info', title: 'Out of chips', body: `Reload within ~${Math.round((Number(evt.until) - Date.now()) / 1000)}s to join the next hand.` });
      }
    } else if (evt.type === 'cards_shown') {
      const meNow = stateRef.current?.players.find((p) => p && !p.empty && p.isMe);
      if (!meNow || Number(evt.playerId) !== Number(meNow.id)) {
        toast({ kind: 'info', title: `${evt.nick} shows`, body: (evt.cards || []).join(' ') });
      }
      sound.play('show', { volume: .5 });
    } else if (evt.type === 'chip_shuffle') {
      startChipShuffle();
    } else if (evt.type === 'rabbit') {
      setRabbit(evt.cards || []);
    } else if (evt.type === 'waitlist_ready') {
      // The banner shows the held seat and its countdown; the stream usually beats this refresh.
      sound.play('turn', { volume: .6 });
      refreshWaitlist();
    } else if (evt.type === 'timebank') {
      sound.play('timebank', { volume: .6 });
      toast({ kind: 'info', title: 'Time bank', body: `+${evt.seconds || timeBankSeconds} seconds` });
    } else if (evt.type === 'sit_out') {
      if (evt.playerId === user?.id) toast({ kind: 'info', title: 'Sitting out', body: 'You ran out of time twice. Press "Deal Me In" to rejoin.' });
    } else if (evt.type === 'bad_beat_jackpot') {
      sound.play('fireworks', { volume: .8 });
      setBadBeat({ total: evt.total, shares: evt.shares || [] });
      if (badBeatTimer.current) clearTimeout(badBeatTimer.current);
      badBeatTimer.current = setTimeout(() => setBadBeat(null), BAD_BEAT_BANNER_MS);
    } else if (evt.type === 'sit_out_expired') {
      if (evt.playerId === user?.id) toast({ kind: 'info', title: 'Seat released', body: 'You have been removed from your seat: your sit-out time ran out.' });
    } else if (evt.type === 'blinds_up') {
      sound.play('turn', { volume: .5 });
    } else if (evt.type === 'turn') {
      if (evt.playerId && stateRef.current) {
        const me = stateRef.current.players.find((p) => p.id === evt.playerId);
        if (me?.isMe) sound.play('turn', { volume: .55 });
      }
    } else {
      chatStore.receiveEvent(evt);
    }
  };

  useEffect(() => {
    if (!user) return;
    connect();
    return () => {
      if (retry.current) window.clearTimeout(retry.current);
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'leave_table', tableId }));
        window.setTimeout(() => ws.close(), 100);
      } else if (ws) ws.close();
      wsRef.current = null;
    };
  }, [connect, tableId, user]);

  useEffect(() => {
    fetch('/api/notes', { headers: { authorization: `Bearer ${getToken()}` } })
      .then((r) => r.json())
      .then((d) => {
        const m: Record<string, { note: string; color: string }> = {};
        for (const n of d.notes || []) m[n.target] = { note: n.note, color: n.color };
        setNotes(m);
        setNoteLabels(normalizeLabels(d.labels));
      }).catch(() => {});
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);



  const me = state?.players.find((p) => p.isMe) || null;
  // Native Take Seat: only an unseated viewer at a cash table can reserve an empty seat.
  const canTakeSeat = !me && !!state && !state.tournament && !state.spin;
  // A successful reload makes the bust offer stale.
  useEffect(() => { if ((me?.stack || 0) > 0) setRebuyOffer(null); }, [me?.stack]);
  const myTurn = !!(state && me && state.actor === me.id);
  const tbUsed = (state?.timeBankUsed || []).includes(Number(me?.id));
  const tbOfferedRef = useRef(false);
  const betCtx: BetContext = {
    pot: state?.pot || 0, currentBet: state?.currentBet || 0, minRaise: state?.minRaise || 0, bb: state?.bb || 0,
    myBet: me?.bet || 0, myStack: me?.stack || 0, maxRaiseTo: state?.maxRaiseTo || 0, street: state?.street || 'idle',
  };
  const { toCall, minTo, maxTo, allInTo, canRaise } = betLimits(betCtx);
  // Cash tables are stored in cents and shown in dollars; tournaments use whole chips.
  const displayUnit = state?.tournament ? 1 : 100;
  const chipStep = state?.tournament ? 1 : Math.min(100, state?.sb || 100);
  const betStep = betUnitOf(bettingOptions, state?.sb || 0, state?.bb || 0);
  const potColumns = potChipLayout(state?.pot || 0, state?.bb || 1);
  const startChipShuffle = useCallback(() => {
    if (!chipShuffleOn) return;
    if (chipShuffleTimer.current) window.clearInterval(chipShuffleTimer.current);
    let frame = SHUFFLE_START_FRAME;
    setChipShuffle({ frame, key: Date.now() });
    sound.play('shuffleUp', { volume: .55 });
    chipShuffleTimer.current = window.setInterval(() => {
      frame += 1;
      if (frame === 143) sound.play('shuffleCombine', { volume: .55 });
      if (frame >= SHUFFLE_END_FRAME) {
        if (chipShuffleTimer.current) window.clearInterval(chipShuffleTimer.current);
        chipShuffleTimer.current = null;
        sound.play('shuffleOther', { volume: .5 });
        window.setTimeout(() => setChipShuffle(null), 200);
        return;
      }
      setChipShuffle({ frame, key: frame });
    }, 10);
  }, [chipShuffleOn]);

  // The native shuffle can be scrubbed with the wheel; the auto-play stops and
  // the art fades out after a short idle.
  const onShuffleWheel = (e: React.WheelEvent) => {
    if (!chipShuffle) return;
    if ((e.target as HTMLElement).closest('.action-bar, .table-menu')) return;
    if (chipShuffleTimer.current) { window.clearInterval(chipShuffleTimer.current); chipShuffleTimer.current = null; }
    if (chipShuffleIdle.current) window.clearTimeout(chipShuffleIdle.current);
    setChipShuffle((cur) => {
      const base = cur?.frame ?? SHUFFLE_START_FRAME;
      const frame = shuffleScrubFrame(base, e.deltaY);
      if (frame !== base) {
        sound.play(frame >= 143 && base < 143 ? 'shuffleCombine' : 'shuffleUp', { volume: .45 });
      }
      chipShuffleIdle.current = window.setTimeout(() => {
        setChipShuffle(null);
        sound.play('shuffleOther', { volume: .5 });
      }, frame >= SHUFFLE_END_FRAME ? 300 : 2800);
      return { frame, key: Date.now() };
    });
  };
  const nudgeBet = (direction: number) => setRaiseTo((v) => Math.max(minTo, Math.min(maxTo, v + direction * betStep)));
  const roundUnit = shortcutRoundUnit(bettingOptions, state?.sb || 0);
  const presets = state ? sizingPresets(betCtx, roundUnit) : [];
  const odds = myTurn ? potOdds(state?.pot || 0, toCall) : null;
  const sittingOut = !!me?.sittingOut;
  const sitOutNext = !!me?.sitOutNext;
  const canRabbit = !!me && state?.street === 'ended' && (state?.board?.length || 0) < 5;
  const facingShove = !!state?.players.some((p) => !p.empty && !p.isMe && p.allIn && !p.folded);
  const canPreAct = !!(state && me && !myTurn && me.inHand && !me.folded && !me.allIn
    && ['preflop', 'flop', 'turn', 'river'].includes(state.street) && !state.allInOrFold);

  useEffect(() => { setPreAction(null); }, [state?.handNo]);
  // A queued call is only valid for the price it was queued at.
  useEffect(() => {
    if (preAction?.kind === 'call' && preAction.amount !== toCall) setPreAction(null);
    if (preAction?.kind === 'check' && toCall > 0) setPreAction(null);
  }, [toCall, preAction]);
  useEffect(() => {
    if (!myTurn || !preAction) return;
    if (preAction.kind === 'checkfold') act(toCall > 0 ? 'fold' : 'check');
    else if (preAction.kind === 'check' && toCall === 0) act('check');
    else if (preAction.kind === 'call' && preAction.amount === toCall && toCall > 0) act('call');
    setPreAction(null);
  }, [myTurn]);

  useEffect(() => {
    if (myTurn) setRaiseTo((prev) => (prev >= minTo && prev <= maxTo ? prev : Math.min(maxTo, minTo)));
    else setRaiseTo(minTo);
  }, [myTurn, minTo, maxTo, state?.handNo]);

  // A confirmation is only valid for the exact moment it was raised on.
  useEffect(() => { setPendingBet(null); }, [state?.handNo, state?.street, myTurn, raiseTo]);

  const send = (msg: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ ...msg, tableId }));
  };

  // Stable chat callbacks keep the memoised chat panel from re-rendering with the table.
  const sendChat = useCallback((message: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'chat', message, tableId }));
  }, [tableId]);
  const sendReaction = useCallback((id: ReactionId) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'reaction', id, tableId }));
  }, [tableId]);
  const muteChatLine = useCallback((line: ChatLine) => {
    chatStore.mute(line.userId);
    // The host's mute is the table mute (table_mutes); anyone else hides the player locally.
    if (user && stateRef.current?.ownerId === user.id) {
      api.muteHostPlayer(tableId, line.userId, true)
        .then(() => setMutes((xs) => (xs.includes(line.userId) ? xs : [...xs, line.userId])))
        .catch((e: any) => toast({ kind: 'error', title: 'Could not mute', body: e?.message || 'Try again' }));
    }
    toast({ kind: 'info', title: 'Player muted', body: `${line.nick}'s chat and reactions are hidden.` });
  }, [chatStore, tableId, toast, user]);
  const reportChatLine = useCallback((line: ChatLine) => {
    setChatReport(line);
    setReportOpen(true);
  }, []);
  const closeReport = () => { setReportOpen(false); setChatReport(null); };

  const act = (action: string, amount = 0) => {
    if (!myTurn) return;
    const voices: Record<string, string> = { fold: 'voiceFold', check: 'voiceCheck', call: 'voiceCall', raise: 'voiceRaise', bet: 'voiceBet', allin: 'voiceAllIn' };
    const voice = voices[action];
    if (voice) setTimeout(() => sound.play(voice as any, { volume: .6 }), 120);
    send({ type: 'action', action, amount });
  };

  // "Always confirm" turns every bet into a two-step action; off, it fires at once.
  const requestBet = (action: 'raise' | 'allin', rawAmount: number) => {
    // A typed amount may still be below the minimum raise; never send it that way.
    const amount = action === 'raise' ? Math.max(minTo, Math.min(maxTo, rawAmount)) : rawAmount;
    if (confirmBets) setPendingBet({ action, amount });
    else act(action, amount);
  };

  const sitIn = () => {
    send({ type: 'join_table', buyin: state?.minBuyin || buyin || 0, observe: false });
  };

  const doRebuy = () => {
    send({ type: 'rebuy', amount: rebuyAmount });
    setRebuyOpen(false);
    setRebuyOffer(null);
    sound.play('coin');
  };

  const leave = () => {
    send({ type: 'leave_table' });
    everJoined.current = false;
    sound.play('click');
    navigate('/');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // Chat and nickname fields keep their own Enter; the bet amount is fair game.
      const typing = tag === 'TEXTAREA' || tag === 'SELECT'
        || (tag === 'INPUT' && (target as HTMLInputElement).type !== 'number');
      if (e.key === 'Escape') { setPendingBet(null); setMenuOpen(false); setConfirmLeave(false); if (squeezing) setSqueezing(false); return; }
      if (typing || squeezing) return;
      if (e.key === 'Enter') {
        // Enter is the native bet key, including while the amount field has focus.
        const request = pendingBet
          ? { action: pendingBet.action, amount: pendingBet.amount, confirm: false }
          : enterBetRequest({ myTurn, canRaise, raiseTo, allInTo, confirm: confirmBets });
        if (!request) return;
        e.preventDefault();
        if (request.confirm) setPendingBet({ action: request.action, amount: request.amount });
        else act(request.action, request.amount);
        return;
      }
      if (!hotkeysOn) return;
      const action = actionForCombo(hotkeyMap, comboFromEvent(e));
      if (!action) return;
      // Functions and options work any time; table actions only on your turn.
      const anyTime = hotkeyAnyTimeRef.current[action];
      if (anyTime) { e.preventDefault(); anyTime(); return; }
      if (!myTurn) return;
      e.preventDefault();
      if (action === 'fold') act('fold');
      else if (action === 'check') { if (!state?.allInOrFold) act(toCall > 0 ? 'call' : 'check'); }
      else if (action === 'raise') { if (!state?.allInOrFold && canRaise) requestBet(raiseTo >= allInTo ? 'allin' : 'raise', raiseTo); }
      else if (action === 'allin') { if (state?.allInOrFold) act('allin'); else requestBet('allin', allInTo); }
      else if (action.startsWith('preset')) hotkeyPresetRef.current(Number(action.slice(6)) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeysOn, hotkeyMap, myTurn, toCall, raiseTo, maxTo, canRaise, allInTo, pendingBet, confirmBets, squeezing, state?.allInOrFold, act, requestBet]);

  // Mouse wheel changes the bet by the chosen unit, in the chosen direction.
  useEffect(() => {
    const el = actionBarRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (!ev.deltaY || !myTurn || !canRaise) return;
      const target = ev.target as HTMLElement | null;
      if (!target?.closest('.quick-bets, .bet-slider, .bet-stepper')) return;
      ev.preventDefault();
      const up = ev.deltaY < 0;
      const increase = bettingOptions.wheelUp === 'increase' ? up : !up;
      setRaiseTo((v) => Math.max(minTo, Math.min(maxTo, v + (increase ? betStep : -betStep))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [myTurn, canRaise, minTo, maxTo, betStep, bettingOptions.wheelUp]);

  const seatPosOf = (seat: number): [number, number] => {
    const n = stateRef.current?.seats || 6;
    const base = mySeatRef.current ?? 0;
    const rel = (seat - base + n) % n;
    const lay = n >= 7 ? POS9 : POS6;
    const p = lay[rel % lay.length] || [50, 50];
    return [p[0], p[1]];
  };

  // Native seat badge: each player's VPIP % at this table, refreshed once per hand.
  const [seatVpip, setSeatVpip] = useState<Record<string, number>>({});
  const vpipHand = state?.street === 'ended' ? state?.handNo : (state?.handNo ?? 0) - 1;
  useEffect(() => {
    if (!tableId) return;
    const controller = new AbortController();
    fetch(`/api/tables/${encodeURIComponent(tableId)}/vpip`, { headers: { authorization: `Bearer ${getToken()}` }, signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.vpip) setSeatVpip(d.vpip); })
      .catch(() => { /* badge keeps its last value; the table works without it */ });
    return () => controller.abort();
  }, [tableId, vpipHand]);

  const narrowScreen = useNarrowScreen();
  const landscapePhone = useLandscapePhone();
  const layout = state
    ? state.seats >= 7
      ? (narrowScreen ? (landscapePhone ? POS9_LANDSCAPE : POS9_PHONE) : POS9)
      : (narrowScreen ? (landscapePhone ? POS6_LANDSCAPE : POS6_PHONE) : POS6)
    : POS6;
  const seatPos = (seat: number) => {
    const n = state?.seats || 6;
    const base = mySeatRef.current ?? 0;
    const rel = (seat - base + n) % n;
    return layout[rel % layout.length] || [50, 50];
  };

  const chip = (v: number | undefined | null) => state?.tournament ? Math.round(v || 0).toLocaleString('en-US') : money(v || 0);
  const stackLabel = (v: number | undefined | null) => {
    const raw = Number(v || 0);
    if (state?.tournament) return chip(raw);
    const bb = state?.bb || 0;
    if (stackMode === 'bb' && bb) return `${(raw / bb).toFixed(1)} BB`;
    if (stackMode === 'both' && bb) return `${chip(raw)} · ${(raw / bb).toFixed(1)} BB`;
    return chip(raw);
  };
  const cycleStackMode = () => {
    const next: StackMode = stackMode === 'chips' ? 'bb' : stackMode === 'bb' ? 'both' : 'chips';
    setStackMode(next); localStorage.setItem('ggpoker.stackMode', next);
  };
  const myCards = me?.cards?.filter((c) => c !== '??') || [];
  const winnerFocus = state && state.street === 'ended' && focusReady ? showdownFocus(state.result, state.board, state.game) : null;
  const handInfo = state && myCards.length >= 2 && state.board.length >= 3 ? bestHand(myCards, state.board, ['omaha', 'omaha5', 'omaha6', 'rushplo'].includes(state.game), state.game === 'shortdeck') : null;
  const holeLabel = myCards.length >= 2 ? describeHole(myCards) : '';
  // After the hand (native ShowMuck) anyone dealt in, folded or not, picks cards to show once.
  const canShowCards = canShowHand(me, state?.street, observing);
  const showCards = (indices: number[]) => {
    if (!indices.length) return;
    send({ type: 'show_cards', cards: indices });
  };
  const presetOpening = state?.board.length === 0 && (state?.currentBet || 0) <= (state?.bb || 0);
  const presetValues = presetOpening ? betPrefs.opening : betPrefs.normal;
  hotkeyPresetRef.current = (index: number) => {
    const value = presetValues[index];
    if (!state || value == null || !canRaise) return;
    setRaiseTo(betTarget(value, presetOpening, { pot: state.pot, currentBet: state.currentBet, bb: state.bb }, toCall, minTo, maxTo, roundUnit));
  };
  hotkeyAnyTimeRef.current = {
    timebank: () => { if (tbOfferedRef.current) send({ type: 'timebank', seconds: timeBankSeconds }); },
    sitout: () => { if (me) send({ type: 'sit_out', value: !(sittingOut || sitOutNext) }); },
    history: () => navigate('/hand-history'),
    toggleUnits: () => cycleStackMode(),
    showAll: () => { if (canShowCards) showCards((me?.cards || []).map((_, i) => i)); },
  };
  useEffect(() => { setRabbit([]); setShowdownReveals({}); }, [state?.handNo]);
  useEffect(() => () => {
    if (chipShuffleTimer.current) window.clearInterval(chipShuffleTimer.current);
    if (chipShuffleIdle.current) window.clearTimeout(chipShuffleIdle.current);
    if (badBeatTimer.current) clearTimeout(badBeatTimer.current);
  }, []);

  // Card squeeze: skip the hand already in progress when the page connects,
  // then peel every fresh deal while the preference is on.
  useEffect(() => {
    if (!state) return;
    if (firstStateRef.current) { firstStateRef.current = false; squeezeHandRef.current = state.handNo; return; }
    if (!squeezeEnabled || observing || !me?.inHand) return;
    if (state.street !== 'preflop') return;
    if (!['holdem', 'omaha', 'omaha5', 'omaha6'].includes(state.game)) return;
    if (squeezeHandRef.current === state.handNo) return;
    const cards = (me.cards || []).filter((c) => c !== '??');
    if (![2, 4, 5, 6].includes(cards.length) || cards.length !== (me.cards || []).length) return;
    squeezeHandRef.current = state.handNo;
    setSqueezing(true);
  }, [state?.handNo, state?.street, state?.game, observing, squeezeEnabled, me?.inHand, me?.cards?.length]);

  useEffect(() => {
    if (!squeezing) return;
    const host = squeezeHostRef.current;
    const cards = (me?.cards || []).filter((c) => c !== '??');
    if (!host || ![2, 4, 5, 6].includes(cards.length)) { setSqueezing(false); return; }
    return createSqueezePanel(host, cards, () => setSqueezing(false), () => sound.play('deal', { volume: .5 }));
  }, [squeezing]);

  useEffect(() => {
    if (state?.spin && state.handNo === 1 && !spinIntroSeen.current) {
      spinIntroSeen.current = true;
      setSwfEffect('/assets/swf/spin_intro.swf');
    }
  }, [state?.spin, state?.handNo]);

  useEffect(() => {
    if (!state?.handNo) return;
    setSqueeze(true);
    const id = window.setTimeout(() => setSqueeze(false), 700);
    return () => window.clearTimeout(id);
  }, [state?.handNo]);

  useEffect(() => {
    if ((!autoRebuy && !autoTopup) || !me || !state || observing) return;
    if (state.tournament || state.spin) return;
    // Between hands: once a hand has ended the seat is still flagged in it until the next
    // deal, so the end of the hand counts as between hands (the server accepts it then).
    const betweenHands = state.street === 'ended' || state.street === 'idle' || !me.inHand;
    if (!betweenHands) { autoRebuyPending.current = false; return; }
    const min = state.minBuyin || state.bb * 20;
    const max = state.maxBuyin || Math.max(min, state.bb * 100);
    const trigger = autoTopup ? max * Math.max(0, Math.min(100, topupTrigger)) / 100 : state.bb * 10;
    const target = autoTopup ? max * Math.max(0, Math.min(100, topupTarget)) / 100 : Math.max(min, state.bb * 20);
    const amount = autoTopUpAmount({ stack: me.stack || 0, trigger, target, min, max });
    if (amount > 0 && !autoRebuyPending.current) {
      autoRebuyPending.current = true;
      send({ type: 'rebuy', amount });
    }
  }, [autoRebuy, autoTopup, topupTrigger, topupTarget, me?.stack, me?.inHand, state?.street, state?.handNo, state?.minBuyin, state?.maxBuyin, state?.bb]);

  const openNote = (p: PlayerState) => {
    if (!p.nick) return;
    setPlayerProfile(null); setFriendAdded(false);
    if (p.id && !p.isBot) api.userProfile(Number(p.id)).then(setPlayerProfile).catch(() => {});
    const existing = notes[p.nick];
    setNoteTarget(p);
    setNoteText(existing?.note || '');
    setNoteColor(existing?.color || DEFAULT_NOTE_COLOR);
  };

  const saveNote = async () => {
    if (!noteTarget?.nick) return;
    try {
      await fetch('/api/notes', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ target: noteTarget.nick, note: noteText, color: noteColor }),
      });
      setNotes((prev) => {
        const next = { ...prev };
        if (!noteText.trim()) delete next[noteTarget.nick!];
        else next[noteTarget.nick!] = { note: noteText, color: noteColor };
        return next;
      });
      setNoteTarget(null);
      sound.play('click');
      toast({ kind: 'success', title: 'Note saved', body: noteTarget.nick });
    } catch (e: any) { toast({ kind: 'error', title: 'Note', body: e.message }); }
  };

  // Compare against the server's clock so a skewed local clock cannot distort the timer.
  const serverNow = now + clockOffset.current;
  const straddleModel = straddlePrompt(state?.straddleAsk, serverNow);
  const sitOutText = me?.sittingOut ? sitOutClock(me.sitOutEndsAt, serverNow) : null;
  const timerPct = state && state.actor ? Math.max(0, Math.min(1, (state.actionEndsAt - serverNow) / (state.actionTimeMs || DEFAULT_ACTION_TIME_MS))) : 0;
  const clockSeconds = state?.actor ? Math.max(0, Math.ceil((state.actionEndsAt - serverNow) / 1000)) : null;
  // Native: the Time bank button and hotkey exist only in the final ten seconds of your turn.
  const tbOffered = timeBankOffered({ myTurn, secondsLeft: clockSeconds, used: tbUsed });
  tbOfferedRef.current = tbOffered;
  const rebuyMax = Math.max(0, (state?.maxBuyin || 0) - (me?.stack || 0));
  const rebuyMin = Math.min(rebuyMax, Math.max(state?.bb || 0, (state?.minBuyin || 0) - (me?.stack || 0)));
  // A bust offer carries the exact allowed range, so the modal works before the next snapshot.
  const rebuyFloor = rebuyOffer ? Math.max(0, rebuyOffer.min) : rebuyMin;
  const rebuyCeil = rebuyOffer ? Math.max(rebuyFloor, rebuyOffer.max) : rebuyMax;
  const myTurnNow = !!me?.isMe && state?.street !== 'ended';
  useEffect(() => {
    if (!state || !myTurnNow) { timerWarnRef.current = ''; return; }
    const key = `${state.handNo}-${state.street}-${state.actor}`;
    const remaining = state.actionEndsAt - serverNow;
    if (remaining > 0 && remaining <= 5200 && timerWarnRef.current !== key) {
      timerWarnRef.current = key;
      sound.play('winding', { volume: .55 });
    }
  }, [now, state?.handNo, state?.street, state?.actor, state?.actionEndsAt, myTurnNow]);

  if (!user) return null;

  const reportTarget = chatReport
    ? { id: chatReport.userId, nick: chatReport.nick }
    : noteTarget && playerProfile?.user ? { id: Number(playerProfile.user.id), nick: String(playerProfile.user.nick) } : null;
  // Bubble line during play: the room's field-wide count, or this table's own field.
  const tableBubble = state?.tournament && !state.tournament.winner
    ? bubbleLabel(
      state.tournament.payouts || [],
      state.tournament.playersLeft ?? state.players.filter((p) => p && !p.empty && Number(p.stack) > 0).length,
    )
    : null;

  return (
    <div ref={tableRef} onWheel={onShuffleWheel} className={`table-screen theme-${theme.toLowerCase()}${fourColor ? ' four-color' : ''}${animOff ? ' anim-off' : ''} layout-${buttonLayout} cards-${cardAnim} back-skin-${cardBack} front-${cardFront} room-bg-${roomBg}`} style={{ '--deal-speed': `${[0,.7,.58,.42,.32,.25][dealSpeed]}s` } as React.CSSProperties}>
      <div className="table-topbar">
        <span className="name">{state?.name || 'Table'}</span>
        <span className="pill">{state ? `${state.seats}-max` : ''}</span>
        <span className="pill">Blinds {state ? (state.tournament ? `${state.sb}/${state.bb}` : `${money(state.sb)}/${money(state.bb)}`) : ''}</span>
        <span className="pill">Hand #{state?.handNo ?? '-'}</span>
        {state?.spin?.multiplier && <span className="pill" style={{ color: '#ffd98a' }}>Spin {state.spin.multiplier}x · {money(state.spin.prize)}</span>}
        {state?.tournament && <span className="pill" style={{ color: '#ffd98a' }}>Level {state.tournament.level}{state.tournament.nextBlindAt ? ` · ${Math.max(0, Math.floor((state.tournament.nextBlindAt - now) / 1000 / 60))}m ${Math.max(0, Math.floor((state.tournament.nextBlindAt - now) / 1000) % 60).toString().padStart(2, '0')}s` : ''} · Prize {money(state.tournament.prizePool)}</span>}
        {state?.tournament && (state.tournament.tables || 1) > 1 && (
          <span className="pill" style={{ color: '#ffd98a' }}>
            Table {state.tournament.tableIndex || 1}/{state.tournament.tables}
            {state.tournament.playersLeft != null ? ` · ${state.tournament.playersLeft} left` : ''}
          </span>
        )}
        {tableBubble && <span className="pill" style={{ color: '#ffd98a' }}>{tableBubble}</span>}
        {state?.bombPot && <span className="pill" style={{ color: '#ffd98a' }}>BOMB POT</span>}
        <span className={`pill`} style={{ color: connected ? '#7fe0a0' : '#ff9a9a' }}>{connected ? 'Connected' : 'Reconnecting…'}</span>
        {observing && <span className="pill" style={{ color: '#9ad0ff' }}>Spectating</span>}
        <div className="spacer" />
        <button onClick={() => sound.setEnabled(!sound.enabled)}>🔊</button>
        <button className="popout-btn" onClick={() => window.open(location.href, '_blank', 'width=1200,height=961')} title="Open in a new window">Pop out</button>
        <button onClick={() => setMenuOpen((v) => !v)}>Menu</button>
        <button onClick={() => setConfirmLeave(true)}>Leave table</button>
      </div>

      {cashDrop && <CashDropBanner drop={cashDrop} />}

      {allInFx && <div className="allin-flash"><span>ALL IN</span></div>}

      {menuOpen && (
        <div className="table-menu" onClick={() => setMenuOpen(false)}>
          <button disabled={!me} onClick={() => {
            const value = !(sittingOut || sitOutNext);
            send({ type: 'sit_out', value });
            toast({ kind: 'info', title: value ? 'Sitting out next hand' : sittingOut ? 'Sitting back in' : 'Sit out cancelled' });
          }}>{sittingOut ? 'Post blinds / sit in' : sitOutNext ? '✓ Sitting out next hand' : 'Sit out next hand'}</button>
          <button disabled={!me || rebuyMax <= 0 || !!state?.tournament || !!state?.spin} onClick={() => { setRebuyAmount(rebuyMin); setRebuyOpen(true); setMenuOpen(false); }}>Rebuy / add chips</button>
          <button onClick={() => { const v = !autoRebuy; setAutoRebuy(v); localStorage.setItem('ggpoker.autorebuy', v ? '1' : '0'); }}>{autoRebuy ? '✓ ' : ''}Auto rebuy</button>
          <button disabled={!canRabbit} title={canRabbit ? '' : 'Rabbit hunt is available after a hand ends with an incomplete board'} onClick={() => { send({ type: 'rabbit' }); sound.play('rabbit'); }}>Rabbit hunt</button>
          <button onClick={() => setSwfEffect('/assets/swf/chip_shuffle.swf')}>Official FX preview</button>
          <button disabled={!me} title={me ? '' : 'Take a seat first'} onClick={() => send({ type: 'shuffle' })}>Shuffle chips</button>
          {state?.ownerId === user?.id && state.private && (
            <button onClick={async () => { setMuteOpen(true); setMenuOpen(false); try { const r = await api.hostMutes(tableId); setMutes((r.muted || []).map((m) => m.user_id)); } catch { setMutes([]); } }}>Table moderation…</button>
          )}
          <div className="menu-section">Card animation</div>
          <div className="anim-switch">
            {([['deal', 'Deal'], ['flip', 'Flip'], ['slide', 'Slide'], ['off', 'Off']] as const).map(([key, label]) => (
              <button key={key} className={cardAnim === key ? 'on' : ''} aria-pressed={cardAnim === key} onClick={() => chooseCardAnim(key)}>{label}</button>
            ))}
          </div>
          <div className="menu-section">This table{hasLookOverride ? ' · custom' : ''}</div>
          <div className="look-row" onClick={(e) => e.stopPropagation()}>
            <select aria-label="Felt colour for this table" value={theme} onChange={(e) => setTableLook({ theme: e.target.value })}>
              {TABLE_THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select aria-label="Background for this table" value={roomBg} onChange={(e) => setTableLook({ roomBg: e.target.value })}>
              {ROOM_BGS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <button disabled={!hasLookOverride} onClick={() => setTableLook(null)}>Use Game Settings look</button>
          <div className="menu-section">Button layout</div>
          <div className="layout-switch">
            {([['bottom', 'Bottom bar'], ['side', 'Side panel'], ['float', 'Floating']] as const).map(([key, label]) => (
              <button key={key} className={buttonLayout === key ? 'on' : ''} aria-pressed={buttonLayout === key} onClick={() => chooseLayout(key)}>{label}</button>
            ))}
          </div>
          <button disabled={!me} title={me ? '' : 'Take a seat first'} onClick={() => send({ type: 'option', tableId, straddle: !state?.straddle })}>{state?.straddle ? '✓ ' : ''}Allow straddles at this table</button>
          {state?.straddle && <button disabled={!me} title="Post a straddle automatically whenever you are asked" onClick={() => send({ type: 'option', tableId, autoStraddle: !me?.autoStraddle })}>{me?.autoStraddle ? '✓ ' : ''}Auto-straddle</button>}
          <button disabled={!me} title={me ? '' : 'Take a seat first'} onClick={() => { const v = !autoMuck; setAutoMuck(v); localStorage.setItem('ggpoker.automuck', v ? '1' : '0'); send({ type: 'option', tableId, autoMuck: v }); }}>{autoMuck ? '✓ ' : ''}Auto-muck losing hand</button>
          <button disabled={!me} title={me ? '' : 'Take a seat first'} onClick={() => send({ type: 'option', tableId, runItTwice: !state?.runItTwice })}>{state?.runItTwice ? '✓ ' : ''}Run it twice</button>
          {state?.spin && <button disabled title="Insurance is not available in DanGG yet">Insurance — not available</button>}
          <button onClick={() => { const v = !fourColor; setFourColor(v); localStorage.setItem('ggpoker.fourcolor', v ? '1' : '0'); }}>{fourColor ? '✓ ' : ''}Four-colour deck</button>
          <button onClick={() => { const v = !animOff; setAnimOff(v); localStorage.setItem('ggpoker.animations', v ? '0' : '1'); }}>{animOff ? 'Enable animations' : 'Disable animations'}</button>
          <button onClick={() => navigate('/hand-history')}>Hand history</button>
          <button onClick={() => { sessionStorage.setItem('ggpoker.settingsTab', 'table'); navigate('/settings'); }}>Table settings</button>
          <button onClick={() => setConfirmLeave(true)}>Leave table</button>
          <div className="menu-version">v{APP_VERSION} · build {buildLabel(APP_BUILD)}</div>
        </div>
      )}

      <div className="room-mark" />
      <div className="room-ambient" aria-hidden="true">
        <span className="room-light l1" />
        <span className="room-light l2" />
        <span className="room-light l3" />
        <div className="room-dust">
          {Array.from({ length: 14 }).map((_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
        </div>
      </div>
      <div className="room-floor" />
      <div className="felt" />
      <div className="table-watermark" style={{ top: '34%', fontSize: 20, letterSpacing: 5 }}>{state?.name || ''}</div>
      <div className="table-center">
        <div className="pot-stack">
          {chipShuffle ? (
            <div
              className="chip-shuffle"
              aria-hidden="true"
              style={{ backgroundPosition: `${shuffleFramePosition(chipShuffle.frame).x}% ${shuffleFramePosition(chipShuffle.frame).y}%` }}
            />
          ) : potColumns.length > 0 && (
            <div className="pot-chips" aria-hidden="true">
              {potColumns.map((col) => (
                <span key={col.denom} className={`pot-chip-col denom-${col.denom}`}>
                  {Array.from({ length: col.count }, (_, i) => <i key={i} />)}
                </span>
              ))}
            </div>
          )}
          {!winFx && <div className="pot-label">Total Pot : {chip(state?.pot)}</div>}
        </div>
        {badBeat && <div className="bad-beat-banner" role="alert" onClick={() => setBadBeat(null)}>
          <div className="bbj-title">BAD BEAT JACKPOT!</div>
          <div className="bbj-total">{money(badBeat.total)}</div>
          {badBeatRows(badBeat).map((row) => (
            <div className="bbj-row" key={row.label}><span>{row.label}</span><b>{row.names}</b><em>{money(row.amount)}</em></div>
          ))}
        </div>}
        {sitOutText && <div className="sit-out-clock" role="timer" aria-label="Sit-out time left">{sitOutText}</div>}
        <div className="board">
          {(state?.board || []).map((c, i) => {
            const [dxp, dyp] = state && state.button >= 0 ? seatPos(state.button) : [50, 12];
            const fromX = Math.round((50 - dxp) * 4);
            const fromY = Math.round((45 - dyp) * 3);
            return <PlayingCard key={`${state?.handNo}-${i}-${c}`} card={c} dealt className={focusClass(winnerFocus?.board, i)} style={{ '--dx': `${fromX}px`, '--dy': `${fromY}px`, animationDelay: `${(i < 3 ? i : 0) * 0.07}s` } as React.CSSProperties} />;
          })}
          {state?.boards && state.boards.length > 1 && (
            <div className="board second-board">
              {state.boards[1].map((c, i) => <PlayingCard key={`second-${state?.handNo}-${i}-${c}`} card={c} size="mini" />)}
            </div>
          )}
          {state && state.board.length === 0 && state.street !== 'idle' && (
            <div style={{ color: 'rgba(255,255,255,.35)', fontSize: 12, letterSpacing: 2 }}>PRE-FLOP</div>
          )}
        </div>
        {handInfo && showHand && (
          <div className="hand-strength">{handInfo.name} <span>·</span> {holeLabel}</div>
        )}
        {rabbit.length > 0 && (
          <div className="rabbit-row">
            <span className="rabbit-label">Rabbit hunt</span>
            {rabbit.map((c, i) => <PlayingCard key={i} card={c} size="mini" />)}
          </div>
        )}
        {state && state.street === 'ended' && state.result?.winners?.length ? (
          <div style={{ color: '#ffe0a0', fontSize: 12.5, background: 'rgba(0,0,0,.45)', padding: '3px 10px', borderRadius: 10 }}>
            {Object.values(state.result.winners.reduce((acc: any, w: any) => {
              const key = String(w.id ?? w.nick);
              if (!acc[key]) acc[key] = { ...w, amount: 0 };
              acc[key].amount += w.amount || 0;
              return acc;
            }, {})).map((w: any) => `${w.nick} wins ${chip(w.amount)}${w.hand ? ` · ${w.hand}` : ''}`).join('   ·   ')}
          </div>
        ) : null}
      </div>

      {(state?.players || []).map((p) => {
        if (!p || p.empty) {
          const [x, y] = seatPos(p.seat);
          if (p.reserved || canTakeSeat) {
            return (
              <div key={p.seat} className="seat seat-take" style={{ left: `${x}%`, top: `${y}%` }}>
                <TakeSeatControl reserved={!!p.reserved} onTake={() => send({ type: 'reserve_seat', seat: p.seat })} />
              </div>
            );
          }
          return (
            <div key={p.seat} className="seat" style={{ left: `${x}%`, top: `${y}%`, opacity: .5 }}>
              <div className="avatar-wrap"><div className="face" style={{ fontSize: 26, color: '#555' }}>+</div></div>
              <div className="plate"><div className="nm" style={{ color: '#777' }}>Open seat</div></div>
            </div>
          );
        }
        const [x, y] = seatPos(p.seat);
        const isActor = state?.actor === p.id;
        return (
          <div
            key={p.seat}
            className={'seat' + (p.isMe ? ' me' : '') + (landscapePhone && (y < 25 || y > 70) ? ' seat-row' : '') + (p.isMe && squeeze ? ' squeeze' : '') + (p.folded ? ' folded' : '') + (isActor ? ' active' + turnUrgencyClass(clockSeconds, !!p.isMe) : '') + ((p.winAmount || 0) > 0 ? ' winner' : '')}
            style={{ left: `${x}%`, top: `${y}%`, cursor: p.nick ? 'pointer' : 'default' }}
            onClick={() => { if (p.nick) openNote(p); }}
            title={p.nick ? 'Player note' : ''}
          >
            {isActor && clockSeconds != null && (
              <div className={`native-clock${clockSeconds <= 5 ? ' hot' : ''}${x < 30 ? ' clock-right' : ''}`} aria-hidden="true">
                {String(Math.min(99, clockSeconds)).split('').map((d, i) => (
                  <img key={i} className="clock-digit" src={`/assets/table/clock/${d}${clockSeconds <= 5 ? '-hot' : ''}.png`} alt="" />
                ))}
              </div>
            )}
            {p.winAmount ? <div className="win-amount">+{chip(p.winAmount)}</div> : null}
            {p.winAmount ? <img className="native-win" src={animOff ? '/assets/table/native-win-final.png' : '/assets/table/native-win-effect.png'} alt="" /> : null}
            {isActor && !p.folded ? <div className="timer" style={{ animationDuration: '1.4s' }} /> : null}
            {!(p.isMe && squeezing) && <div
              className={'cards' + (showdownReveals[p.seat] != null && p.reveal ? ' showdown-reveal' : '')}
              style={{ '--reveal-delay': `${showdownReveals[p.seat] || 0}ms` } as React.CSSProperties}
            >
              {(p.cards || []).map((c, i) => {
                const [px, py] = seatPosOf(p.seat!);
                const pickable = p.isMe && canShowCards && c !== '??';
                const shown = (p.shown || []).includes(i);
                return (
                  <span
                    key={`${state?.handNo}-${p.seat}-${i}`}
                    className={'card-slot' + (pickable ? ' pickable' : '') + (shown ? ' shown' : '')}
                    onClick={pickable ? (ev) => { ev.stopPropagation(); showCards([i]); } : undefined}
                    title={pickable ? 'Show this card' : undefined}
                  >
                    <PlayingCard card={c} size="mini" dealt className={focusClass(winnerFocus ? winnerFocus.hole[p.seat!] ?? [] : undefined, i)}
                      style={{ '--dx': `${(50 - px) * 8}px`, '--dy': `${(45 - py) * 5.5}px`, animationDelay: `${i * 0.08}s` } as React.CSSProperties} />
                  </span>
                );
              })}
            </div>}
            <div className="avatar-wrap">
              <img className="seat-ring" src={(p.winAmount || 0) > 0 ? '/assets/table/ring_gold.png' : isActor ? '/assets/table/ring_gold.png' : '/assets/table/ring_silver.png'} alt="" />
              <div className="face">
                <Avatar name={p.nick || '?'} src={p.avatar} size={54} />
              </div>
              {p.nick && <span className="vpip-badge" title="VPIP at this table">{vpipOf(seatVpip, p.nick)}</span>}
            </div>
            <div className="plate">
              <div className="nm" title={p.nick || undefined}>{seatNick(p.nick)}</div>
              <div className={'st' + (isAllInStatus(p) ? ' st-allin' : '')} onClick={(e) => { e.stopPropagation(); cycleStackMode(); }} title="Click to change stack display">
                {isAllInStatus(p) ? 'All-In' : stackLabel(p.stack)}
                {narrowScreen && (p.bet || 0) > 0 ? <span className="seat-bet-inline"> · {chip(p.bet).replace(/\.00$/, '')}</span> : null}
              </div>
            </div>
            {p.nick && notes[p.nick] && <span className="note-dot" title={`${noteColorTitle(notes[p.nick].color, noteLabels)}: ${notes[p.nick].note}`} style={{ '--note-color': noteColorHex(notes[p.nick].color) } as React.CSSProperties}>📝</span>}
            {p.lastAction && !p.folded && (
              <div className={'action-badge ' + (p.lastAction.action || '').toLowerCase()}>
                {p.lastAction.action}{p.lastAction.amount ? ` ${money(p.lastAction.amount)}` : ''}
              </div>
            )}
            {p.folded && <div className="action-badge fold">Fold</div>}
            {(p.disconnected || p.sittingOut) && !isAllInStatus(p) && <div className="action-badge away">{p.disconnected ? 'Reconnecting' : 'Sitting out'}</div>}
            {p.id != null && (
              <SeatReaction store={chatStore} userId={Number(p.id)} showBubbles={showChatBubbles} showReactions={showReactions} />
            )}
          </div>
        );
      })}

      {state && state.button >= 0 && (() => {
        const [x, y] = seatPos(state.button);
        const rowSeat = landscapePhone && (y < 25 || y > 70);
        const dx = rowSeat ? x + 13 : x + (x <= 50 ? 6.2 : -6.2);
        const dy = rowSeat ? y : y + (y < 45 ? 4.5 : -4.5);
        return <div className="dealer-btn" style={{ left: `${dx}%`, top: `${dy}%` }} />;
      })()}

      {state && state.street !== 'idle' && ([['SB', state.sbSeat], ['BB', state.bbSeat]] as const).map(([label, seat]) => {
        if (seat == null || seat < 0) return null;
        const [x, y] = seatPos(seat);
        // Toward the felt centre from the seat, clear of the dealer disc.
        const dx = x + (50 - x) * 0.2;
        const dy = y + (45 - y) * 0.32;
        return <div key={label} className={`blind-marker ${label.toLowerCase()}`} style={{ left: `${dx}%`, top: `${dy}%` }} aria-label={label === 'SB' ? 'Small blind' : 'Big blind'}>{label}</div>;
      })}

      {(state?.players || []).filter((p) => p && !p.empty && (p.bet || 0) > 0).map((p) => {
        const [x, y] = seatPos(p.seat!);
        const pull = narrowScreen ? 0.42 : 0.2;
        const bx = x + (50 - x) * pull;
        const by = y + (45 - y) * pull;
        const betCols = potChipLayout(p.bet || 0, state?.bb || 1, 4);
        return (
          <div key={'bet' + p.seat} className="table-bet" style={{ left: `${bx}%`, top: `${by}%` }}>
            <span className="wager-chips" aria-hidden="true">
              {betCols.map((col) => (
                <span key={col.denom} className={`wager-col denom-${col.denom}`}>
                  {Array.from({ length: Math.min(4, col.count) }, (_, i) => <i key={i} />)}
                </span>
              ))}
            </span>
            <span className="wager-amount">{chip(p.bet)}</span>
          </div>
        );
      })}

      {fx.map((f) => {
        const [x, y] = seatPos(f.seat);
        return <div key={f.id} className="float-chip" style={{ left: `${x}%`, top: `${y - 9}%` }}>{chip(f.amount)}</div>;
      })}

      <div className="squeeze-host" ref={squeezeHostRef} />

      {winFx && (
        <div className="win-overlay">
          <div className="confetti">{Array.from({ length: 18 }).map((_, i) => <i key={i} style={{ left: `${(i * 53) % 100}%`, animationDelay: `${(i % 9) * 0.08}s`, background: ['#ffd76a', '#ff6b6b', '#6bd6ff', '#9dff8a'][i % 4] }} />)}</div>
          <div className="win-title">WIN</div>
          <div className="win-amount-big">{chip(winFx.amount)}</div>
          <div className="win-nick">{winFx.nick}</div>
        </div>
      )}

      <TableChat store={chatStore} selfId={user?.id ?? null} readOnly={observing}
        onSend={sendChat} onReact={sendReaction} onMute={muteChatLine} onReport={reportChatLine} />

      {observing ? (
        <div className="action-bar">
          <div className="action-row">
            <div style={{ flex: 1, color: '#cfcfcf', fontSize: 13 }} role="status" aria-live="polite">{waitBannerText}</div>
            {!state?.tournament && <button className={'btn ' + (myTableQueue && !offerLive ? 'btn-gold' : 'btn-red')} onClick={sitIn}>{offerLive ? 'Take seat' : 'Take a seat'} · {chip(state?.minBuyin)}</button>}
            <button className="btn btn-dark" onClick={() => setConfirmLeave(true)}>Leave</button>
          </div>
        </div>
      ) : (
      <div className={'action-bar' + (squeezing ? ' squeeze-lock' : '')} ref={actionBarRef}>
        {straddleModel && (
          <div className="straddle-ask" role="dialog" aria-label="Straddle">
            <div className="straddle-ask-head">
              <b>Straddle to {chip(straddleModel.amount)}</b>
              <span className="straddle-time">TIME {straddleModel.secondsLeft}</span>
              <button className="title-icon" aria-label="Don't straddle" onClick={() => send({ type: 'straddle_decide', tableId, decision: 'no' })}>✕</button>
            </div>
            <div className="straddle-ask-note">You will be able to straddle at any position.</div>
            <div className="action-row">
              {straddleModel.showStraddle && <button className="btn btn-green" onClick={() => send({ type: 'straddle_decide', tableId, decision: 'yes' })}>Straddle to {chip(straddleModel.amount)}</button>}
              <button className="btn btn-red" onClick={() => send({ type: 'straddle_decide', tableId, decision: 'allin' })}>All-in to {chip(straddleModel.allInTo)}</button>
            </div>
          </div>
        )}
        {myTurn && (
          <div className="turn-timer-bar"><i style={{ width: `${timerPct * 100}%` }} /></div>
        )}
        {pendingBet && (
          <div className="action-row" style={{ background: 'rgba(217,168,60,.12)', borderTop: '1px solid #d9a83c', padding: '8px 10px' }}>
            <span style={{ flex: 1, color: '#ffd98a', fontSize: 13 }}>
              Confirm {pendingBet.action === 'allin' ? 'all in for' : (state?.currentBet || 0) > 0 ? 'raise to' : 'bet'}{' '}
              {chip(pendingBet.amount)}?
            </span>
            <button className="btn btn-gold btn-sm" onClick={() => { const b = pendingBet; setPendingBet(null); act(b.action, b.amount); }}>Confirm</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPendingBet(null)}>Cancel</button>
          </div>
        )}
        {canShowCards && (
          <div className="action-row show-row">
            <span style={{ color: '#ffd98a', fontSize: 12.5 }}>Show your cards?</span>
            <div className="grow" />
            {showOptions(me?.cards || []).map((o) => (
              <button key={o.indices.join('-')} className={'btn btn-sm show-opt' + (o.indices.length > 1 ? ' btn-gold' : ' btn-ghost')} onClick={() => showCards(o.indices)}>
                Show <b>{o.label}</b>
              </button>
            ))}
          </div>
        )}
        {me && !state?.tournament && !state?.spin && (me.stack || 0) <= 0 && !me.inHand && (state?.street === 'ended' || state?.street === 'idle' || !!rebuyOffer) && (
          <div className="action-row" style={{ justifyContent: 'center', gap: 10 }}>
            <span style={{ color: '#ffd98a', fontSize: 13 }}>You are out of chips.</span>
            <button className="btn btn-gold btn-sm" onClick={() => { if (rebuyOffer && rebuyOffer.until <= now) setRebuyOffer(null); setRebuyAmount(rebuyMin); setRebuyOpen(true); }}>Reload {chip(rebuyMin)}</button>
          </div>
        )}
        {sittingOut && (
          <div className="action-row sitout-row">
            <span>You are sitting out and will not be dealt in.</span>
            <div className="grow" />
            {!state?.tournament && (
              <label className="wait-blinds" title="Come back on your big blind instead of posting now">
                <input type="checkbox" checked={!!me?.waitForBlinds} onChange={(e) => send({ type: 'option', tableId, waitForBlinds: e.target.checked })} /> Wait for Blinds
              </label>
            )}
            <button className="btn btn-red" onClick={() => send({ type: 'sit_out', value: false })}>Deal Me In</button>
          </div>
        )}
        {!sittingOut && me?.waitingForBigBlind && (
          <div className="action-row sitout-row">
            <span>Waiting for the big blind. You will be dealt in when it reaches your seat.</span>
            <div className="grow" />
            <button className="btn btn-ghost" onClick={() => send({ type: 'option', tableId, waitForBlinds: false })}>Post now</button>
          </div>
        )}
        {canPreAct && !squeezing && (
          <div className="reserved-actions" role="group" aria-label="Actions on your next turn">
            <button
              type="button"
              aria-pressed={preAction?.kind === 'checkfold'}
              onClick={() => setPreAction(preAction?.kind === 'checkfold' ? null : { kind: 'checkfold' })}
            ><span className="reserve-text">{toCall > 0 ? 'Fold' : 'Check/Fold'}</span></button>
            {toCall === 0 && (
              <button
                type="button"
                aria-pressed={preAction?.kind === 'check'}
                onClick={() => setPreAction(preAction?.kind === 'check' ? null : { kind: 'check' })}
              ><span className="reserve-text">Check</span></button>
            )}
            {toCall > 0 && (
              <button
                type="button"
                aria-pressed={preAction?.kind === 'call' && preAction.amount === toCall}
                onClick={() => setPreAction(preAction?.kind === 'call' && preAction.amount === toCall ? null : { kind: 'call', amount: toCall })}
              ><span className="reserve-text">Call {chip(toCall)}</span></button>
            )}
          </div>
        )}
        {state?.allInOrFold ? (
          <div className="action-row aof-row">
            <button className={'tb-btn' + (tbUsed ? ' used' : '')} disabled={!tbOffered} style={tbOffered || tbUsed ? undefined : { visibility: 'hidden' }} onClick={() => send({ type: 'timebank', seconds: timeBankSeconds })} title={`Add ${timeBankSeconds} seconds once per hand`}>⏱ {tbUsed ? 'Used' : 'Time bank'}</button>
            <button className="act-btn act-fold" disabled={!myTurn} onClick={() => act('fold')}>Fold</button>
            <button className="act-btn act-allin" disabled={!myTurn} onClick={() => act('allin')}>All-in{me?.stack ? ` ${chip(me.stack)}` : ''}</button>
            <div className="grow" />
            <span className="aof-note">All-in or fold only</span>
          </div>
        ) : (
        <div className="action-row">
          <button className={'tb-btn' + (tbUsed ? ' used' : '')} disabled={!tbOffered} style={tbOffered || tbUsed ? undefined : { visibility: 'hidden' }} onClick={() => send({ type: 'timebank', seconds: timeBankSeconds })} title={`Add ${timeBankSeconds} seconds once per hand`}>⏱ {tbUsed ? 'Used' : 'Time bank'}</button>
          <button className="act-btn act-fold" disabled={!myTurn} onClick={() => act('fold')}>Fold</button>
          {toCall === 0 ? (
            <button className="act-btn act-check" disabled={!myTurn || !!state?.allInOrFold} onClick={() => act('check')}>Check</button>
          ) : (
            <button className="act-btn act-call" disabled={!myTurn || (!!state?.allInOrFold && !facingShove)} onClick={() => act('call')}>
              Call {chip(toCall)}
            </button>
          )}
          {odds && (
            <span className="pot-odds" title="The pot is laying you this price. Call if you expect to win more often than the percentage shown.">
              Pot odds {odds.ratio.toFixed(1)}:1 · need {Math.round(odds.equityNeeded * 100)}%
            </span>
          )}
          <div className="grow" />
          <div className="quick-bets">
            {(state?.board.length === 0 && (state?.currentBet || 0) <= (state?.bb || 0) ? betPrefs.opening : betPrefs.normal).map((value, i) => {
              const opening = state?.board.length === 0 && (state?.currentBet || 0) <= (state?.bb || 0);
              const target = state ? betTarget(value, opening, { pot: state.pot, currentBet: state.currentBet, bb: state.bb }, toCall, minTo, maxTo, roundUnit) : minTo;
              return <button key={`${value}-${i}`} disabled={!myTurn || !canRaise} onClick={() => setRaiseTo(target)}>{betLabel(value, opening)}</button>;
            })}
          </div>
          <input
            className="bet-slider"
            type="range"
            min={minTo}
            max={Math.max(minTo, maxTo)}
            step={Math.max(100, state?.bb || 100)}
            value={raiseTo}
            disabled={!myTurn || !canRaise}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
          />
          <div className="bet-stepper">
            <button
              type="button"
              className="bet-step"
              aria-label="Bet less"
              disabled={!myTurn || !canRaise || raiseTo <= minTo}
              onClick={() => nudgeBet(-1)}
            >−</button>
            <input
              className="amount-input"
              type="number"
              value={state?.tournament ? raiseTo : Math.round(raiseTo / 100)}
              disabled={!myTurn || !canRaise}
              min={state?.tournament ? minTo : Math.round(minTo / 100)}
              max={state?.tournament ? maxTo : Math.round(maxTo / 100)}
              step={state?.tournament ? betStep : betStep / 100}
              // Native bet input: focus selects the amount so typing replaces it; while typing
              // only the maximum applies, and the minimum is enforced on blur and on betting.
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setRaiseTo(Math.min(maxTo, Math.max(0, Number(e.target.value) * (state?.tournament ? 1 : 100))))}
              onBlur={() => setRaiseTo((v) => Math.max(minTo, Math.min(maxTo, v)))}
            />
            <button
              type="button"
              className="bet-step"
              aria-label="Bet more"
              disabled={!myTurn || !canRaise || raiseTo >= maxTo}
              onClick={() => nudgeBet(1)}
            >+</button>
          </div>
          <button
            className={'act-btn ' + (raiseTo >= allInTo ? 'act-allin' : 'act-raise')}
            disabled={!myTurn || maxTo <= (state?.currentBet || 0)}
            onClick={() => requestBet(raiseTo >= allInTo ? 'allin' : 'raise', raiseTo)}
          >
            {raiseTo >= allInTo ? 'All in' : (state && state.currentBet > 0 ? 'Raise' : 'Bet')} {chip(raiseTo)}
          </button>
        </div>
        )}
        <div className="action-row status-row" style={{ color: '#9a9a9a', fontSize: 11.5 }}>
          <span>{myTurn ? 'Your turn — choose an action' : state ? (state.actor ? 'Waiting for opponents…' : state.street === 'ended' ? 'Hand complete' : 'Dealing…') : 'Connecting…'}</span>
          <div className="grow" />
          {hotkeyHints && <span>{state?.allInOrFold ? `${hotkeyMap.fold} Fold · ${hotkeyMap.allin} All-in` : `${state?.potLimit ? 'Pot limit · ' : ''}${hotkeyMap.fold} Fold · ${hotkeyMap.check} Check/Call · ${hotkeyMap.raise} Raise · ${hotkeyMap.allin} ${state?.potLimit ? 'Pot' : 'All-in'}`}</span>}
          {hotkeyHints && <span>·</span>}
          <span>Hand #{state?.handNo ?? 0}</span>
          <span>·</span>
          <span>{me ? `Your stack ${stackLabel(me.stack)}` : ''}</span>
        </div>
      </div>
      )}

      {spinShow && state?.spin && (
        <div className="spin-overlay">
          <div className="spin-title">SPIN & GOLD</div>
          <div className="spin-ring">
            {SPIN_WHEEL_MULTIPLIERS.map((m, i) => (
              <span key={m} style={{ transform: `rotate(${i * (360 / SPIN_WHEEL_MULTIPLIERS.length)}deg) translateY(-118px)` }}>{m}x</span>
            ))}
            <div className="spin-center">{state.spin.multiplier}x</div>
          </div>
          <div className="spin-prize">Prize pool <b>{money(state.spin.prize)}</b></div>
          <div className="spin-sub">
            {state.spin.payouts?.some((p, i) => i > 0 && p > 0)
              ? state.spin.payouts.filter((p) => p > 0).map((p, i) => `${ordinal(i + 1)} ${money(p)}`).join(' · ')
              : `Good luck — ${state.seats}-handed winner takes all`}
          </div>
        </div>
      )}

      {swfEffect && <SwfEffect src={swfEffect} onDone={clearSwf} />}

      {tourneyWin && (
        <div className="spin-overlay win">
          <div className="spin-title">{finishTitle(tourneyWin.place)}</div>
          <div style={{ fontSize: 60, margin: '10px 0' }}>{!tourneyWin.place || tourneyWin.place === 1 ? '🏆' : '🏅'}</div>
          <div className="spin-prize">{tourneyWin.nick} wins {tourneyWin.ticket ? <b>{tourneyWin.ticket} ticket</b> : <b>{money(tourneyWin.prize)}</b>}</div>
          <div className="spin-sub">{tourneyWin.tableName}</div>
          <button className="btn btn-gold" style={{ marginTop: 18 }} onClick={() => navigate('/')}>Back to lobby</button>
        </div>
      )}

      {spinWin && (
        <div className="spin-overlay win">
          <div className="spin-title">WINNER</div>
          <div className="spin-center" style={{ width: 150, height: 150, fontSize: 38 }}>{spinWin.multiplier}x</div>
          <div className="spin-prize">{spinWin.nick} wins <b>{money(spinWin.prize)}</b></div>
          <button className="btn btn-gold" style={{ marginTop: 18 }} onClick={() => navigate('/')}>Back to lobby</button>
        </div>
      )}

      {muteOpen && state?.ownerId === user?.id && (
        <div className="modal-backdrop" onClick={() => setMuteOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 430 }}>
            <div className="modal-head"><h3>Table chat moderation</h3><button className="title-icon" onClick={() => setMuteOpen(false)}>✕</button></div>
            <div className="modal-body">
              <p className="muted small" style={{ marginTop: 0 }}>Muted players can still bet and sit; they cannot send table chat.</p>
              {(state.players || []).filter((p) => p && !p.empty && Number(p.id) !== user?.id).map((p) => (
                <div key={p.seat} className="mute-row">
                  <div><b>{p.nick}</b><span>Seat {p.seat + 1}</span></div>
                  <button className={'btn btn-sm ' + (mutes.includes(Number(p.id)) ? 'btn-red' : 'btn-ghost')} onClick={async () => { const muted = !mutes.includes(Number(p.id)); await api.muteHostPlayer(tableId, Number(p.id), muted); setMutes((xs) => muted ? [...xs, Number(p.id)] : xs.filter((x) => x !== Number(p.id))); }}>{mutes.includes(Number(p.id)) ? 'Unmute' : 'Mute'}</button>
                </div>
              ))}
              {!(state.players || []).some((p) => p && !p.empty && Number(p.id) !== user?.id) && <p className="muted">No other seated players.</p>}
            </div>
          </div>
        </div>
      )}

      {noteTarget && (
        <div className="modal-backdrop" onClick={() => setNoteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>Note · {noteTarget.nick}</h3></div>
            <div className="modal-body">
              {playerProfile?.user && (
                <div className="player-profile-card">
                  <Avatar name={playerProfile.user.nick} src={playerProfile.user.avatar} size={52} />
                  <div>
                    <b>{playerProfile.user.nick}</b>
                    <span>VIP {playerProfile.user.vip_level} · {playerProfile.user.country || 'Local'} · {playerProfile.online ? 'At a table' : 'Offline'}</span>
                  </div>
                  <div className="row" style={{ marginLeft: 'auto' }}>
                    {playerProfile.user.id === user?.id ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => { setNoteTarget(null); navigate('/my-page'); }}>My Page</button>
                    ) : (<>
                      <button className="btn btn-ghost btn-sm" disabled={friendAdded || playerProfile.friend || playerProfile.pending} onClick={async () => { await api.addFriend(playerProfile.user.nick); setFriendAdded(true); toast({ kind: 'success', title: 'Friend request sent', body: playerProfile.user.nick }); }}>{playerProfile.friend ? 'Friend' : (playerProfile.pending || friendAdded) ? 'Requested' : 'Add friend'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setNoteTarget(null); navigate(`/my-page?dm=${playerProfile.user.id}`); }}>Message</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setReportOpen(true)} title="Report player">Report</button>
                    </>)}
                  </div>
                </div>
              )}
              {noteTarget?.nick && user && <OpponentHud tableId={tableId} nick={noteTarget.nick} formatChips={chip} />}
              {playerProfile?.stats && (
                <div className="player-stats-row"><span><b>{playerProfile.stats.played}</b> hands</span><span><b>{playerProfile.stats.won}</b> wins</span><span><b>{chip(playerProfile.stats.biggest)}</b> biggest</span></div>
              )}
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} placeholder="Notes are private and only visible to you…"
                style={{ width: '100%', background: '#121212', border: '1px solid #343434', borderRadius: 5, color: '#eee', padding: 10, fontFamily: 'inherit' }} />
              <div className="row" style={{ marginTop: 10 }}>
                <NoteColorPicker value={noteColor} labels={noteLabels} onChange={setNoteColor} />
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm" onClick={() => { setNoteText(''); saveNote(); }}>Delete</button>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-dark" onClick={() => setNoteTarget(null)}>Cancel</button>
              <button className="btn btn-red" onClick={saveNote}>Save note</button>
            </div>
          </div>
        </div>
      )}

      {reportOpen && reportTarget && (
        <ReportPlayerModal target={reportTarget} handId={state?.handId} onClose={closeReport}
          initialDetail={chatReport ? `Chat: "${chatReport.text}"` : ''} />
      )}

      {reservation && state && (
        <BuyInDialog reservation={reservation} now={now} format={chip}
          min={state.minBuyin || state.bb * 20} max={state.maxBuyin || state.bb * 100} step={Math.max(chipStep, state.bb || chipStep)}
          onCancel={() => { send({ type: 'cancel_reservation' }); setReservation(null); }}
          onBuyIn={(amount) => { send({ type: 'join_table', buyin: amount, seat: reservation.seat, observe: false }); setReservation(null); }} />
      )}
      {rebuyOpen && (
        <div className="modal-backdrop" onClick={() => { setRebuyOpen(false); setRebuyOffer(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>{rebuyOffer ? 'Reload' : 'Rebuy'}</h3></div>
            <div className="modal-body">
              <p className="muted small">Add chips between hands, up to the table maximum of {chip(state?.maxBuyin)}. Your stack is {chip(me?.stack)}.</p>
              {rebuyOffer && (now < rebuyOffer.until
                ? <p className="muted small" style={{ color: '#ffd98a' }}>{Math.max(1, Math.ceil((rebuyOffer.until - now) / 1000))}s to reload before the next hand is dealt.</p>
                : <p className="muted small" style={{ color: '#ffd98a' }}>The next hand is dealing without you — reload to join the following one.</p>)}
              <input type="range" aria-label="Chips to add" min={rebuyFloor} max={rebuyCeil} step={Math.max(chipStep, state?.bb || chipStep)}
                value={Math.max(rebuyFloor, Math.min(rebuyCeil, rebuyAmount))}
                onChange={(e) => setRebuyAmount(Math.min(rebuyCeil, Math.max(rebuyFloor, Number(e.target.value))))} style={{ width: '100%' }} />
              <div className="between" style={{ marginTop: 8 }}>
                <span className="muted small">{chip(rebuyFloor)}</span>
                <b style={{ color: '#ffd98a' }}>{chip(Math.max(rebuyFloor, Math.min(rebuyCeil, rebuyAmount)))}</b>
                <span className="muted small">{chip(rebuyCeil)}</span>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-dark" onClick={() => { setRebuyOpen(false); setRebuyOffer(null); }}>Cancel</button>
              <button className="btn btn-red" disabled={rebuyAmount <= 0 || rebuyAmount > rebuyCeil} onClick={doRebuy}>Add chips</button>
            </div>
          </div>
        </div>
      )}

      {confirmLeave && (
        <div className="modal-backdrop" onClick={() => setConfirmLeave(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>Leave the table?</h3></div>
            <div className="modal-body">
              <p style={{ margin: 0, color: '#bbb' }}>
                Your remaining stack will be returned to your balance. If you are in a hand, you will fold.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-dark" onClick={() => setConfirmLeave(false)}>Stay</button>
              <button className="btn btn-red" onClick={leave}>Leave table</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
