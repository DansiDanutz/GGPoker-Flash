import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { api, chips, getToken, money } from '../lib/api';
import { sound } from '../lib/sound';
import { PlayingCard } from '../components/Card';
import { SwfEffect } from '../components/SwfEffect';
import { betLabel, betTarget, betUnitOf, enterBetRequest, readBetPrefs, readBettingOptions, readCardBack, readDealSpeed, readSqueeze, readStackMode, readHotkeys, normalizeHotkey, type StackMode } from '../lib/tablePrefs';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/TitleBar';
import { bestHand, describeHole } from '../game/eval';
import { betLimits, potOdds, sizingPresets, type BetContext } from '../game/betting';
import { potChipLayout, shuffleFramePosition, SHUFFLE_START_FRAME, SHUFFLE_END_FRAME } from '../game/potChips';
import { createSqueezePanel } from '../game/squeeze';
import { showdownComplete, showdownPlan } from '../game/showdown';

type PlayerState = {
  seat: number; id?: string; nick?: string; avatar?: string; stack?: number; bet?: number; totalBet?: number;
  folded?: boolean; allIn?: boolean; inHand?: boolean; sittingOut?: boolean; isBot?: boolean; isMe?: boolean;
  reveal?: boolean; shown?: number[]; cards?: string[]; sitOutNext?: boolean; lastAction?: { action: string; amount: number } | null;
  winAmount?: number; empty?: boolean; disconnected?: boolean;
};

type TableState = {
  id: string; tableEpoch?: string; tableVersion?: number; name: string; game: string; sb: number; bb: number; ante: number; seats: number;
  button: number; handNo: number; street: string; board: string[]; pot: number; currentBet: number;
  minRaise: number; actor: string | null; actionEndsAt: number; now: number; result: any;
  timeBankUsed?: number[];
  players: PlayerState[]; log: any[]; minBuyin?: number; maxBuyin?: number; ownerId?: number | null; private?: boolean; bombPot?: boolean; handId?: string | null;
  spin?: { multiplier: number; prize: number; winner: any } | null;
  tournament?: { id?: string | null; name: string; prizePool: number; level: number; winner: any; mode?: string; bounty?: number; ticket?: string; nextBlindAt?: number | null; managed?: boolean; tableIndex?: number; tables?: number; playersLeft?: number | null } | null;
  straddle?: boolean;
  runItTwice?: boolean;
  boards?: string[][] | null;
  potLimit?: boolean; allInOrFold?: boolean; maxRaiseTo?: number; actionTimeMs?: number; rake?: number;
};

// A decision queued while waiting for the action to come round.
type PreAction = { kind: 'checkfold' } | { kind: 'check' } | { kind: 'call'; amount: number };

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
  const [chat, setChat] = useState<{ nick: string; message: string }[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [emoteFx, setEmoteFx] = useState<{ userId: number; nick: string; emote: string; key: number } | null>(null);
  const emoteTimer = useRef<number | null>(null);
  const [chatFx, setChatFx] = useState<{ userId: number; nick: string; message: string; key: number } | null>(null);
  const chatFxTimer = useRef<number | null>(null);
  const timerWarnRef = useRef<string>('');
  const [fx, setFx] = useState<{ id: number; seat: number; amount: number }[]>([]);
  const [winFx, setWinFx] = useState<{ id: number; amount: number; nick: string } | null>(null);
  const [cashDrop, setCashDrop] = useState<{ amount: number; nick: string } | null>(null);
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
  const [fourColor, setFourColor] = useState(() => localStorage.getItem('ggpoker.fourcolor') === '1');
  const [animOff, setAnimOff] = useState(() => localStorage.getItem('ggpoker.animations') === '0');
  const [observing, setObserving] = useState(false);
  const [waitlistPos, setWaitlistPos] = useState(0);
  const [rebuyOpen, setRebuyOpen] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState(0);
  const [rebuyOffer, setRebuyOffer] = useState<{ min: number; max: number; until: number } | null>(null);
  const [notes, setNotes] = useState<Record<string, { note: string; color: string }>>({});
  const [noteTarget, setNoteTarget] = useState<PlayerState | null>(null);
  const [playerProfile, setPlayerProfile] = useState<any>(null);
  const [friendAdded, setFriendAdded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Abusive chat');
  const [reportDetail, setReportDetail] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [mutes, setMutes] = useState<number[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteColor, setNoteColor] = useState('yellow');
  const [autoRebuy, setAutoRebuy] = useState(() => localStorage.getItem('ggpoker.autorebuy') === '1');
  const [autoMuck, setAutoMuck] = useState(() => localStorage.getItem('ggpoker.automuck') === '1');
  const [autoTopup] = useState(() => localStorage.getItem('ggpoker.autoTopup') === '1');
  const [topupTrigger] = useState(() => Number(localStorage.getItem('ggpoker.topupTrigger') || 25));
  const [topupTarget] = useState(() => Number(localStorage.getItem('ggpoker.topupTarget') || 100));
  const [cardBack] = useState(readCardBack);
  const [cardFront] = useState(() => localStorage.getItem('ggpoker.cardFront') || 'official');
  const [roomBg] = useState(() => localStorage.getItem('ggpoker.roomBg') || 'featured');
  const [showHand] = useState(() => localStorage.getItem('ggpoker.showHand') !== '0');
  const [hotkeyHints] = useState(() => localStorage.getItem('ggpoker.hotkeyHints') !== '0');
  const [hotkeysOn] = useState(() => localStorage.getItem('ggpoker.hotkeys') !== '0');
  const [hotkeyMap] = useState(readHotkeys);
  const [dealSpeed] = useState(readDealSpeed);
  const [bettingOptions] = useState(readBettingOptions);
  const confirmBets = bettingOptions.confirm === 'always';
  const [pendingBet, setPendingBet] = useState<{ action: 'raise' | 'allin'; amount: number } | null>(null);
  const [showPick, setShowPick] = useState<number[]>([]);
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
  const chipShuffleTimer = useRef<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef<TableState | null>(null);
  const mySeatRef = useRef<number | null>(null);
  const fxId = useRef(1);
  const retry = useRef<number | null>(null);
  const everJoined = useRef(false);
  const tableEpoch = useRef<string | null>(null);
  const lastSeq = useRef(0);

  const [theme] = useState(() => localStorage.getItem('ggpoker.theme') || 'Green');
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
        stateRef.current = s;
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
      } else if (msg.type === 'joined') {
        everJoined.current = true;
        setMySeat(msg.seat);
        if (msg.observe) setObserving(true); else {
          setObserving(false);
          // Keep the seat's auto-muck preference in sync with this device.
          ws.send(JSON.stringify({ type: 'option', tableId, autoMuck }));
        }
        if (msg.waitlist) setWaitlistPos(msg.waitlist);
        setOpeningTable(null);
      } else if (msg.type === 'waitlist') {
        setWaitlistPos(msg.position || 1);
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
      const revealSeats = isShowdown ? (evt.hands || []).map((h: any) => h.seat) : [];
      const plan = isShowdown ? showdownPlan(revealSeats) : [];
      const fxAt = isShowdown ? showdownComplete(revealSeats) : 0;
      if (plan.length) {
        setShowdownReveals(Object.fromEntries(plan.map((r) => [r.seat, r.at])));
        window.setTimeout(() => setShowdownReveals({}), fxAt + 700);
      }
      for (const w of evt.winners || []) {
        const pl = s?.players.find((x) => x.id === w.id);
        if (pl) {
          const pos = seatPosOf(pl.seat);
          window.setTimeout(() => flyChips([50, 45], pos, 7), fxAt + 220);
          window.setTimeout(() => pushStack(pos), fxAt + 160);
        }
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
      setCashDrop({ amount: evt.amount, nick: evt.nick });
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
      toast({ kind: 'reward', title: `Finished #${evt.place}`, body: `${evt.nick} wins ${money(evt.payout)}` });
      sound.play('coin');
    } else if (evt.type === 'tourney_win') {
      if (!evt.ticket) setSwfEffect('/assets/swf/win_effect.swf');
      setTourneyWin(evt);
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
      sound.play('turn', { volume: .6 });
      toast({ kind: 'success', title: 'Seat available', body: 'A seat just opened — click Take a seat.' });
    } else if (evt.type === 'timebank') {
      sound.play('timebank', { volume: .6 });
      toast({ kind: 'info', title: 'Time bank', body: `+${evt.seconds || timeBankSeconds} seconds` });
    } else if (evt.type === 'sit_out') {
      if (evt.playerId === user?.id) toast({ kind: 'info', title: 'Sitting out', body: 'You ran out of time twice. Press "I\'m back" to rejoin.' });
    } else if (evt.type === 'blinds_up') {
      sound.play('turn', { volume: .5 });
    } else if (evt.type === 'turn') {
      if (evt.playerId && stateRef.current) {
        const me = stateRef.current.players.find((p) => p.id === evt.playerId);
        if (me?.isMe) sound.play('turn', { volume: .55 });
      }
    } else if (evt.type === 'chat') {
      setChat((prev) => [...prev.slice(-30), { nick: evt.nick, message: evt.message }]);
      setChatFx({ userId: evt.userId, nick: evt.nick, message: evt.message, key: Date.now() });
      sound.play('click', { volume: .35 });
      if (chatFxTimer.current) window.clearTimeout(chatFxTimer.current);
      chatFxTimer.current = window.setTimeout(() => setChatFx(null), 4500);
    } else if (evt.type === 'emote') {
      setEmoteFx({ userId: evt.userId, nick: evt.nick, emote: evt.emote, key: Date.now() });
      sound.play('bubble', { volume: .55 });
      if (emoteTimer.current) window.clearTimeout(emoteTimer.current);
      emoteTimer.current = window.setTimeout(() => setEmoteFx(null), 2300);
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
      }).catch(() => {});
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);



  const me = state?.players.find((p) => p.isMe) || null;
  // A successful reload makes the bust offer stale.
  useEffect(() => { if ((me?.stack || 0) > 0) setRebuyOffer(null); }, [me?.stack]);
  const myTurn = !!(state && me && state.actor === me.id);
  const tbUsed = (state?.timeBankUsed || []).includes(Number(me?.id));
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
        window.setTimeout(() => setChipShuffle(null), 200);
        return;
      }
      setChipShuffle({ frame, key: frame });
    }, 10);
  }, [chipShuffleOn]);
  const nudgeBet = (direction: number) => setRaiseTo((v) => Math.max(minTo, Math.min(maxTo, v + direction * betStep)));
  const presets = state ? sizingPresets(betCtx, chipStep) : [];
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

  const act = (action: string, amount = 0) => {
    if (!myTurn) return;
    const voices: Record<string, string> = { fold: 'voiceFold', check: 'voiceCheck', call: 'voiceCall', raise: 'voiceRaise', bet: 'voiceBet', allin: 'voiceAllIn' };
    const voice = voices[action];
    if (voice) setTimeout(() => sound.play(voice as any, { volume: .6 }), 120);
    send({ type: 'action', action, amount });
  };

  // "Always confirm" turns every bet into a two-step action; off, it fires at once.
  const requestBet = (action: 'raise' | 'allin', amount: number) => {
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
      if (!hotkeysOn || !myTurn) return;
      const key = normalizeHotkey(e.key);
      if (key === hotkeyMap.fold) { e.preventDefault(); act('fold'); }
      else if (key === hotkeyMap.check) { e.preventDefault(); act(toCall > 0 ? 'call' : 'check'); }
      else if (key === hotkeyMap.raise) { e.preventDefault(); if (canRaise) requestBet(raiseTo >= allInTo ? 'allin' : 'raise', raiseTo); }
      else if (key === hotkeyMap.allin) { e.preventDefault(); requestBet('allin', allInTo); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeysOn, hotkeyMap, myTurn, toCall, raiseTo, maxTo, canRaise, allInTo, pendingBet, confirmBets, squeezing, act, requestBet]);

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
  const handInfo = state && myCards.length >= 2 && state.board.length >= 3 ? bestHand(myCards, state.board, state.game === 'omaha' || state.game === 'omaha5', state.game === 'shortdeck') : null;
  const holeLabel = myCards.length >= 2 ? describeHole(myCards) : '';
  // After the hand I can reveal one card or both to the table.
  const canShowCards = !!me && state?.street === 'ended' && me.inHand && !me.folded
    && (me.cards?.length || 0) > 0
    && (me.shown?.length || 0) < (me.cards?.length || 0)
    && !observing;
  const showCards = (indices: number[]) => {
    if (!indices.length) return;
    send({ type: 'show_cards', cards: indices });
    setShowPick([]);
  };
  useEffect(() => { setShowPick([]); setRabbit([]); setShowdownReveals({}); }, [state?.handNo]);
  useEffect(() => () => { if (chipShuffleTimer.current) window.clearInterval(chipShuffleTimer.current); }, []);

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
    if (me.inHand) { autoRebuyPending.current = false; return; }
    const betweenHands = state.street === 'ended' || state.street === 'idle';
    if (!betweenHands) { autoRebuyPending.current = false; return; }
    const min = state.minBuyin || state.bb * 20;
    const max = state.maxBuyin || Math.max(min, state.bb * 100);
    const trigger = autoTopup ? max * Math.max(0, Math.min(100, topupTrigger)) / 100 : state.bb * 10;
    const target = autoTopup ? max * Math.max(0, Math.min(100, topupTarget)) / 100 : Math.max(min, state.bb * 20);
    if ((me.stack || 0) < trigger && !autoRebuyPending.current) {
      autoRebuyPending.current = true;
      const amount = Math.max(min, Math.min(max, Math.round((target - (me.stack || 0)) / 100) * 100));
      if (amount > 0) send({ type: 'rebuy', amount });
    }
  }, [autoRebuy, autoTopup, topupTrigger, topupTarget, me?.stack, me?.inHand, state?.street, state?.handNo, state?.minBuyin, state?.maxBuyin, state?.bb]);

  const openNote = (p: PlayerState) => {
    if (!p.nick) return;
    setPlayerProfile(null); setFriendAdded(false);
    if (p.id && !p.isBot) api.userProfile(Number(p.id)).then(setPlayerProfile).catch(() => {});
    const existing = notes[p.nick];
    setNoteTarget(p);
    setNoteText(existing?.note || '');
    setNoteColor(existing?.color || 'yellow');
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
  const timerPct = state && state.actor ? Math.max(0, Math.min(1, (state.actionEndsAt - serverNow) / (state.actionTimeMs || DEFAULT_ACTION_TIME_MS))) : 0;
  const clockSeconds = state?.actor ? Math.max(0, Math.ceil((state.actionEndsAt - serverNow) / 1000)) : null;
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

  const emotes = ['😂', '😎', '😭', '🔥', '👏', '🐟', '🤡', '💪', '🍀', '😱'];

  if (!user) return null;

  return (
    <div ref={tableRef} className={`table-screen theme-${theme.toLowerCase()}${fourColor ? ' four-color' : ''}${animOff ? ' anim-off' : ''} layout-${buttonLayout} cards-${cardAnim} back-skin-${cardBack} front-${cardFront} room-bg-${roomBg}`} style={{ '--deal-speed': `${[0,.7,.58,.42,.32,.25][dealSpeed]}s` } as React.CSSProperties}>
      <div className="table-topbar">
        <span className="name">{state?.name || 'Table'}</span>
        <span className="pill">{state ? `${state.seats}-max` : ''}</span>
        <span className="pill">Blinds {state ? (state.tournament ? `${state.sb}/${state.bb}` : `${money(state.sb)}/${money(state.bb)}`) : ''}</span>
        <span className="pill">Hand #{state?.handNo ?? '-'}</span>
        {state?.spin && <span className="pill" style={{ color: '#ffd98a' }}>Spin {state.spin.multiplier}x · {money(state.spin.prize)}</span>}
        {state?.tournament && <span className="pill" style={{ color: '#ffd98a' }}>Level {state.tournament.level}{state.tournament.nextBlindAt ? ` · ${Math.max(0, Math.floor((state.tournament.nextBlindAt - now) / 1000 / 60))}m ${Math.max(0, Math.floor((state.tournament.nextBlindAt - now) / 1000) % 60).toString().padStart(2, '0')}s` : ''} · Prize {money(state.tournament.prizePool)}</span>}
        {state?.tournament && (state.tournament.tables || 1) > 1 && (
          <span className="pill" style={{ color: '#ffd98a' }}>
            Table {state.tournament.tableIndex || 1}/{state.tournament.tables}
            {state.tournament.playersLeft != null ? ` · ${state.tournament.playersLeft} left` : ''}
          </span>
        )}
        {state?.bombPot && <span className="pill" style={{ color: '#ffd98a' }}>BOMB POT</span>}
        <span className={`pill`} style={{ color: connected ? '#7fe0a0' : '#ff9a9a' }}>{connected ? 'Connected' : 'Reconnecting…'}</span>
        {observing && <span className="pill" style={{ color: '#9ad0ff' }}>Spectating</span>}
        <div className="spacer" />
        <button onClick={() => setChatOpen((v) => !v)}>💬 Chat</button>
        <button onClick={() => setEmoteOpen((v) => !v)} title="Send a reaction">😀</button>
        <button onClick={() => sound.setEnabled(!sound.enabled)}>🔊</button>
        <button className="popout-btn" onClick={() => window.open(location.href, '_blank', 'width=1200,height=961')} title="Open in a new window">Pop out</button>
        <button onClick={() => setMenuOpen((v) => !v)}>Menu</button>
        <button onClick={() => setConfirmLeave(true)}>Leave table</button>
      </div>

      {emoteOpen && (
        <div className="emote-tray" onClick={(e) => e.stopPropagation()}>
          {['😀', '😂', '😎', '😱', '😡', '🍀', '🎉', '🐟'].map((e) => (
            <button key={e} onClick={() => { send({ type: 'emote', emote: e }); setEmoteOpen(false); sound.play('bubble', { volume: .45 }); }}>{e}</button>
          ))}
        </div>
      )}

      {cashDrop && (
        <div className="cashdrop-overlay">
          <div className="cashdrop-title">RUSH CASH DROP</div>
          <div className="cashdrop-amount">{money(cashDrop.amount)}</div>
          <div className="cashdrop-nick">{cashDrop.nick}</div>
        </div>
      )}

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
          <div className="menu-section">Button layout</div>
          <div className="layout-switch">
            {([['bottom', 'Bottom bar'], ['side', 'Side panel'], ['float', 'Floating']] as const).map(([key, label]) => (
              <button key={key} className={buttonLayout === key ? 'on' : ''} aria-pressed={buttonLayout === key} onClick={() => chooseLayout(key)}>{label}</button>
            ))}
          </div>
          <button disabled={!me} title={me ? '' : 'Take a seat first'} onClick={() => send({ type: 'option', tableId, straddle: !state?.straddle })}>{state?.straddle ? '✓ ' : ''}Straddle</button>
          <button disabled={!me} title={me ? '' : 'Take a seat first'} onClick={() => { const v = !autoMuck; setAutoMuck(v); localStorage.setItem('ggpoker.automuck', v ? '1' : '0'); send({ type: 'option', tableId, autoMuck: v }); }}>{autoMuck ? '✓ ' : ''}Auto-muck losing hand</button>
          <button disabled={!me} title={me ? '' : 'Take a seat first'} onClick={() => send({ type: 'option', tableId, runItTwice: !state?.runItTwice })}>{state?.runItTwice ? '✓ ' : ''}Run it twice</button>
          {state?.spin && <button disabled={!me} onClick={() => send({ type: 'option', tableId, insurance: true })}>Buy Spin insurance (5%)</button>}
          <button onClick={() => { const v = !fourColor; setFourColor(v); localStorage.setItem('ggpoker.fourcolor', v ? '1' : '0'); }}>{fourColor ? '✓ ' : ''}Four-colour deck</button>
          <button onClick={() => { const v = !animOff; setAnimOff(v); localStorage.setItem('ggpoker.animations', v ? '0' : '1'); }}>{animOff ? 'Enable animations' : 'Disable animations'}</button>
          <button onClick={() => navigate('/hand-history')}>Hand history</button>
          <button onClick={() => { sessionStorage.setItem('ggpoker.settingsTab', 'table'); navigate('/settings'); }}>Table settings</button>
          <button onClick={() => setConfirmLeave(true)}>Leave table</button>
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
        <div className="board">
          {(state?.board || []).map((c, i) => {
            const [dxp, dyp] = state && state.button >= 0 ? seatPos(state.button) : [50, 12];
            const fromX = Math.round((50 - dxp) * 4);
            const fromY = Math.round((45 - dyp) * 3);
            return <PlayingCard key={`${state?.handNo}-${i}-${c}`} card={c} dealt style={{ '--dx': `${fromX}px`, '--dy': `${fromY}px`, animationDelay: `${(i < 3 ? i : 0) * 0.07}s` } as React.CSSProperties} />;
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
            className={'seat' + (p.isMe ? ' me' : '') + (landscapePhone && (y < 25 || y > 70) ? ' seat-row' : '') + (p.isMe && squeeze ? ' squeeze' : '') + (p.folded ? ' folded' : '') + (isActor ? ' active' : '') + ((p.winAmount || 0) > 0 ? ' winner' : '')}
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
                const picked = pickable && showPick.includes(i);
                const shown = (p.shown || []).includes(i);
                return (
                  <span
                    key={`${state?.handNo}-${p.seat}-${i}`}
                    className={'card-slot' + (pickable ? ' pickable' : '') + (picked ? ' picked' : '') + (shown ? ' shown' : '')}
                    onClick={pickable ? (ev) => { ev.stopPropagation(); setShowPick((cur) => cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]); } : undefined}
                    title={pickable ? 'Select this card to show it' : undefined}
                  >
                    <PlayingCard card={c} size="mini" dim={p.folded} dealt
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
            </div>
            <div className="plate">
              <div className="nm">{p.nick}</div>
              <div className="st" onClick={(e) => { e.stopPropagation(); cycleStackMode(); }} title="Click to change stack display">{stackLabel(p.stack)}</div>
            </div>
            {p.nick && notes[p.nick] && <span className="note-dot" title={notes[p.nick].note}>📝</span>}
            {p.lastAction && !p.folded && (
              <div className={'action-badge ' + (p.lastAction.action || '').toLowerCase()}>
                {p.lastAction.action}{p.lastAction.amount ? ` ${money(p.lastAction.amount)}` : ''}
              </div>
            )}
            {p.folded && <div className="action-badge fold">Fold</div>}
            {p.allIn && <div className="action-badge" style={{ color: '#ffd98a' }}>ALL IN</div>}
            {(p.disconnected || p.sittingOut) && !p.allIn && <div className="action-badge away">{p.disconnected ? 'Reconnecting' : 'Sitting out'}</div>}
            {emoteFx && emoteFx.userId === (p as any).id && (
              <div key={emoteFx.key} className="emote-bubble" title={emoteFx.nick}>{emoteFx.emote}</div>
            )}
            {chatFx && chatFx.userId === (p as any).id && (
              <div key={chatFx.key} className="chat-bubble">{chatFx.message}</div>
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

      {(state?.players || []).filter((p) => p && !p.empty && (p.bet || 0) > 0).map((p) => {
        const [x, y] = seatPos(p.seat!);
        const pull = narrowScreen ? 0.3 : 0.2;
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

      {chatOpen && (
        <div className="chat-panel">
          <div className="chat-log">
            {chat.slice(-12).map((c, i) => <div key={i}><b>{c.nick}:</b> {c.message}</div>)}
            {!chat.length && <div className="muted">Table chat — say hello 👋</div>}
          </div>
          <div className="emote-row">
            {emotes.map((e) => (
              <button key={e} onClick={() => {
                send({ type: 'emote', emote: e });
                if (user) {
                  setEmoteFx({ userId: user.id, nick: user.nick, emote: e, key: Date.now() });
                  sound.play('bubble', { volume: .5 });
                  if (emoteTimer.current) window.clearTimeout(emoteTimer.current);
                  emoteTimer.current = window.setTimeout(() => setEmoteFx(null), 2300);
                }
              }}>{e}</button>
            ))}
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!chatInput.trim()) return;
              send({ type: 'chat', message: chatInput });
              setChatInput('');
            }}
          >
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type a message…" maxLength={120} />
            <button className="btn btn-ghost btn-sm" type="submit">Send</button>
          </form>
        </div>
      )}

      {observing ? (
        <div className="action-bar">
          <div className="action-row">
            <div style={{ flex: 1, color: '#cfcfcf', fontSize: 13 }}>{waitlistPos > 0 ? `You are #${waitlistPos} on the waitlist. We will hold the next open seat for you.` : 'You are observing this table. Take a seat to join the action.'}</div>
            {!state?.tournament && <button className={'btn ' + (waitlistPos > 0 ? 'btn-gold' : 'btn-red')} onClick={sitIn}>Take a seat · {chip(state?.minBuyin)}</button>}
            <button className="btn btn-dark" onClick={() => setConfirmLeave(true)}>Leave</button>
          </div>
        </div>
      ) : (
      <div className={'action-bar' + (squeezing ? ' squeeze-lock' : '')} ref={actionBarRef}>
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
            <span style={{ color: '#ffd98a', fontSize: 12.5 }}>
              {showPick.length
                ? `${showPick.length} card${showPick.length > 1 ? 's' : ''} selected — show to everyone?`
                : 'Hand over: tap your cards to show one or both.'}
            </span>
            <div className="grow" />
            <button className="btn btn-gold btn-sm" disabled={!showPick.length} onClick={() => showCards(showPick)}>Show</button>
            <button className="btn btn-ghost btn-sm" onClick={() => showCards((me?.cards || []).map((_, i) => i))}>Show all</button>
          </div>
        )}
        {me && !state?.tournament && !state?.spin && (me.stack || 0) <= 0 && (
          <div className="action-row" style={{ justifyContent: 'center', gap: 10 }}>
            <span style={{ color: '#ffd98a', fontSize: 13 }}>You are out of chips.</span>
            <button className="btn btn-gold btn-sm" onClick={() => { if (rebuyOffer && rebuyOffer.until <= now) setRebuyOffer(null); setRebuyAmount(rebuyMin); setRebuyOpen(true); }}>Reload {chip(rebuyMin)}</button>
          </div>
        )}
        {sittingOut && (
          <div className="action-row sitout-row">
            <span>You are sitting out and will not be dealt in.</span>
            <div className="grow" />
            <button className="btn btn-gold" onClick={() => send({ type: 'sit_out', value: false })}>I'm back</button>
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
        <div className="action-row">
          <button className={'tb-btn' + (tbUsed ? ' used' : '')} disabled={!myTurn || tbUsed} onClick={() => send({ type: 'timebank', seconds: timeBankSeconds })} title={`Add ${timeBankSeconds} seconds once per hand`}>⏱ {tbUsed ? 'Used' : 'Time bank'}</button>
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
              const target = state ? betTarget(value, opening, { pot: state.pot, currentBet: state.currentBet, bb: state.bb }, toCall, minTo, maxTo) : minTo;
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
              onChange={(e) => setRaiseTo(Math.max(minTo, Math.min(maxTo, Number(e.target.value) * (state?.tournament ? 1 : 100))))}
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
        <div className="action-row status-row" style={{ color: '#9a9a9a', fontSize: 11.5 }}>
          <span>{myTurn ? 'Your turn — choose an action' : state ? (state.actor ? 'Waiting for opponents…' : state.street === 'ended' ? 'Hand complete' : 'Dealing…') : 'Connecting…'}</span>
          <div className="grow" />
          {hotkeyHints && <span>{state?.potLimit ? 'Pot limit · ' : ''}{hotkeyMap.fold} Fold · {hotkeyMap.check} Check/Call · {hotkeyMap.raise} Raise · {hotkeyMap.allin} {state?.potLimit ? 'Pot' : 'All-in'}</span>}
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
            {[2, 3, 5, 10, 25, 100].map((m, i) => (
              <span key={m} style={{ transform: `rotate(${i * 60}deg) translateY(-118px)` }}>{m}x</span>
            ))}
            <div className="spin-center">{state.spin.multiplier}x</div>
          </div>
          <div className="spin-prize">Prize pool <b>{money(state.spin.prize)}</b></div>
          <div className="spin-sub">Good luck — {state.seats}-handed winner takes all</div>
        </div>
      )}

      {swfEffect && <SwfEffect src={swfEffect} onDone={clearSwf} />}

      {tourneyWin && (
        <div className="spin-overlay win">
          <div className="spin-title">TOURNAMENT WINNER</div>
          <div style={{ fontSize: 60, margin: '10px 0' }}>🏆</div>
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
              {playerProfile?.stats && (
                <div className="player-stats-row"><span><b>{playerProfile.stats.played}</b> hands</span><span><b>{playerProfile.stats.won}</b> wins</span><span><b>{chip(playerProfile.stats.biggest)}</b> biggest</span></div>
              )}
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} placeholder="Notes are private and only visible to you…"
                style={{ width: '100%', background: '#121212', border: '1px solid #343434', borderRadius: 5, color: '#eee', padding: 10, fontFamily: 'inherit' }} />
              <div className="row" style={{ marginTop: 10 }}>
                {['yellow', 'green', 'red', 'blue'].map((c) => (
                  <button key={c} onClick={() => setNoteColor(c)} style={{ width: 26, height: 26, borderRadius: '50%', background: c === 'yellow' ? '#e0b34b' : c === 'green' ? '#45c777' : c === 'red' ? '#d0455a' : '#3f9ad0', border: noteColor === c ? '2px solid #fff' : '2px solid transparent' }} />
                ))}
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

      {reportOpen && noteTarget && playerProfile?.user && (
        <div className="modal-backdrop" onClick={() => setReportOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>Report {playerProfile.user.nick}</h3></div>
            <div className="modal-body">
              <label className="admin-label">Reason</label>
              <select className="admin-select" style={{ width: '100%' }} value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                {['Abusive chat', 'Collusion', 'Slow play', 'Chip dumping', 'Offensive nickname', 'Other'].map((r) => <option key={r}>{r}</option>)}
              </select>
              <label className="admin-label" style={{ marginTop: 10 }}>Details</label>
              <textarea value={reportDetail} onChange={(e) => setReportDetail(e.target.value)} rows={4} maxLength={500} placeholder="What happened?"
                style={{ width: '100%', background: '#121212', border: '1px solid #343434', borderRadius: 5, color: '#eee', padding: 10, fontFamily: 'inherit' }} />
              <p className="muted small">Reports are reviewed by the local administrator. False reports may be actioned.</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-dark" onClick={() => setReportOpen(false)}>Cancel</button>
              <button className="btn btn-red" disabled={reportBusy} onClick={async () => {
                setReportBusy(true);
                try { await api.reportPlayer(playerProfile.user.id, reportReason, reportDetail, state?.handId || undefined); setReportOpen(false); setReportDetail(''); toast({ kind: 'success', title: 'Report submitted', body: `Reported ${playerProfile.user.nick}` }); }
                catch (e: any) { toast({ kind: 'error', title: 'Could not report', body: e.message }); }
                finally { setReportBusy(false); }
              }}>Submit report</button>
            </div>
          </div>
        </div>
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
