import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { api, chips, getToken, money } from '../lib/api';
import { sound } from '../lib/sound';
import { PlayingCard } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/TitleBar';
import { bestHand, describeHole } from '../game/eval';

type PlayerState = {
  seat: number; id?: string; nick?: string; avatar?: string; stack?: number; bet?: number; totalBet?: number;
  folded?: boolean; allIn?: boolean; inHand?: boolean; sittingOut?: boolean; isBot?: boolean; isMe?: boolean;
  reveal?: boolean; cards?: string[]; lastAction?: { action: string; amount: number } | null;
  winAmount?: number; empty?: boolean; disconnected?: boolean;
};

type TableState = {
  id: string; name: string; game: string; sb: number; bb: number; ante: number; seats: number;
  button: number; handNo: number; street: string; board: string[]; pot: number; currentBet: number;
  minRaise: number; actor: string | null; actionEndsAt: number; now: number; result: any;
  timeBankUsed?: number[];
  players: PlayerState[]; log: any[]; minBuyin?: number; maxBuyin?: number;
  spin?: { multiplier: number; prize: number; winner: any } | null;
  tournament?: { name: string; prizePool: number; level: number; winner: any } | null;
};

const POS6 = [[50, 80], [12, 71], [16, 32], [50, 17], [84, 32], [88, 71]];
const POS9 = [[50, 84], [26, 81], [10, 64], [11, 40], [29, 22], [50, 17], [71, 22], [89, 40], [90, 64]];

export function TablePage({ tableId }: { tableId: string }) {
  const { user, navigate, toast, setOpeningTable } = useApp();
  const [state, setState] = useState<TableState | null>(null);
  const [connected, setConnected] = useState(false);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [raiseTo, setRaiseTo] = useState(0);
  const [chat, setChat] = useState<{ nick: string; message: string }[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [emoteFx, setEmoteFx] = useState<{ userId: number; nick: string; emote: string; key: number } | null>(null);
  const emoteTimer = useRef<number | null>(null);
  const [chatFx, setChatFx] = useState<{ userId: number; nick: string; message: string; key: number } | null>(null);
  const chatFxTimer = useRef<number | null>(null);
  const timerWarnRef = useRef<string>('');
  const [fx, setFx] = useState<{ id: number; seat: number; amount: number }[]>([]);
  const [winFx, setWinFx] = useState<{ id: number; amount: number; nick: string } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [spinShow, setSpinShow] = useState(false);
  const [spinWin, setSpinWin] = useState<any>(null);
  const [tourneyWin, setTourneyWin] = useState<any>(null);
  const [allInFx, setAllInFx] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sittingOut, setSittingOut] = useState(false);
  const [rabbit, setRabbit] = useState<string[]>([]);
  const [fourColor, setFourColor] = useState(() => localStorage.getItem('ggpoker.fourcolor') === '1');
  const [animOff, setAnimOff] = useState(() => localStorage.getItem('ggpoker.animations') === '0');
  const [observing, setObserving] = useState(false);
  const [waitlistPos, setWaitlistPos] = useState(0);
  const [rebuyOpen, setRebuyOpen] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState(0);
  const [notes, setNotes] = useState<Record<string, { note: string; color: string }>>({});
  const [noteTarget, setNoteTarget] = useState<PlayerState | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteColor, setNoteColor] = useState('yellow');
  const [autoRebuy, setAutoRebuy] = useState(() => localStorage.getItem('ggpoker.autorebuy') === '1');
  const autoRebuyPending = useRef(false);
  const spinSeen = useRef(false);
  const [now, setNow] = useState(Date.now());
  const tableRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef<TableState | null>(null);
  const mySeatRef = useRef<number | null>(null);
  const fxId = useRef(1);
  const retry = useRef<number | null>(null);
  const everJoined = useRef(false);

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
        stateRef.current = s;
        setState(s);
        const mine = s.players.find((p) => p.isMe);
        if (mine) { mySeatRef.current = mine.seat; setMySeat(mine.seat); }
        if (s.street === 'preflop' && (!state || state.handNo !== s.handNo)) {
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
        if (msg.observe) setObserving(true); else setObserving(false);
        if (msg.waitlist) setWaitlistPos(msg.waitlist);
        setOpeningTable(null);
      } else if (msg.type === 'waitlist') {
        setWaitlistPos(msg.position || 1);
        setObserving(true);
        toast({ kind: 'info', title: 'Waitlist', body: `You are #${msg.position || 1} in line. We will hold the next seat for you.` });
      } else if (msg.type === 'event') {
        handleEvent(msg.event);
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
      for (const w of evt.winners || []) {
        const pl = s?.players.find((x) => x.id === w.id);
        if (pl) {
          const pos = seatPosOf(pl.seat);
          setTimeout(() => flyChips([50, 45], pos, 7), 220);
          setTimeout(() => pushStack(pos), 160);
        }
      }
      sound.play('win', { volume: .9 });
      setTimeout(() => sound.play('gather', { volume: .6 }), 450);
      const heroId = stateRef.current?.players.find((p) => p.isMe)?.id;
      const mine = (evt.winners || []).filter((x: any) => x.id === heroId);
      if (mine.length) {
        const total = mine.reduce((a: number, x: any) => a + (x.amount || 0), 0);
        setWinFx({ id: fxId.current++, amount: total, nick: mine[0].nick });
        window.setTimeout(() => setWinFx(null), 2600);
      }
      if (Array.isArray(evt.cards)) sound.play('show', { volume: .5 });
    } else if (evt.type === 'tourney_payout') {
      toast({ kind: 'reward', title: `Finished #${evt.place}`, body: `${evt.nick} wins ${money(evt.payout)}` });
      sound.play('coin');
    } else if (evt.type === 'tourney_win') {
      setTourneyWin(evt);
      sound.play('tournamentWin');
      setTimeout(() => sound.play('fireworks', { volume: .7 }), 600);
    } else if (evt.type === 'spin_win') {
      setSpinWin(evt);
      sound.play('sngWin');
      setTimeout(() => sound.play('fireworks', { volume: .7 }), 600);
    } else if (evt.type === 'rabbit') {
      setRabbit(evt.cards || []);
    } else if (evt.type === 'waitlist_ready') {
      sound.play('turn', { volume: .6 });
      toast({ kind: 'success', title: 'Seat available', body: 'A seat just opened — click Take a seat.' });
    } else if (evt.type === 'timebank') {
      sound.play('timebank', { volume: .6 });
      toast({ kind: 'info', title: 'Time bank', body: '+10 seconds' });
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
  const myTurn = !!(state && me && state.actor === me.id);
  const tbUsed = (state?.timeBankUsed || []).includes(Number(me?.id));
  const toCall = state && me ? Math.max(0, state.currentBet - (me.bet || 0)) : 0;
  const maxTo = me ? (me.bet || 0) + (me.stack || 0) : 0;
  const minTo = state ? Math.min(maxTo, Math.max(state.currentBet + state.minRaise, state.bb)) : 0;

  useEffect(() => {
    if (myTurn) setRaiseTo((prev) => (prev >= minTo && prev <= maxTo ? prev : Math.min(maxTo, minTo)));
    else setRaiseTo(minTo);
  }, [myTurn, minTo, maxTo, state?.handNo]);

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

  const sitIn = () => {
    send({ type: 'join_table', buyin: state?.minBuyin || buyin || 0, observe: false });
  };

  const doRebuy = () => {
    send({ type: 'rebuy', amount: rebuyAmount });
    setRebuyOpen(false);
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
      if (e.key === 'Escape') { setMenuOpen(false); setConfirmLeave(false); return; }
      if (!myTurn) return;
      if (e.key === 'F1') { e.preventDefault(); act('fold'); }
      else if (e.key === 'F2') { e.preventDefault(); act(toCall > 0 ? 'call' : 'check'); }
      else if (e.key === 'F3') { e.preventDefault(); act(raiseTo >= maxTo ? 'allin' : 'raise', raiseTo); }
      else if (e.key === 'F4') { e.preventDefault(); act('allin'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [myTurn, toCall, raiseTo, maxTo, act]);

  const seatPosOf = (seat: number): [number, number] => {
    const n = stateRef.current?.seats || 6;
    const base = mySeatRef.current ?? 0;
    const rel = (seat - base + n) % n;
    const lay = n >= 7 ? POS9 : POS6;
    const p = lay[rel % lay.length] || [50, 50];
    return [p[0], p[1]];
  };

  const layout = state ? (state.seats >= 7 ? POS9 : POS6) : POS6;
  const seatPos = (seat: number) => {
    const n = state?.seats || 6;
    const base = mySeatRef.current ?? 0;
    const rel = (seat - base + n) % n;
    return layout[rel % layout.length] || [50, 50];
  };

  const chip = (v: number | undefined | null) => state?.tournament ? Math.round(v || 0).toLocaleString('en-US') : money(v || 0);
  const myCards = me?.cards?.filter((c) => c !== '??') || [];
  const handInfo = state && myCards.length >= 2 && state.board.length >= 3 ? bestHand(myCards, state.board, state.game === 'omaha' || state.game === 'omaha5') : null;
  const holeLabel = myCards.length >= 2 ? describeHole(myCards) : '';

  useEffect(() => {
    if (!autoRebuy || !me || !state || observing) return;
    if (state.tournament || state.spin) return;
    if (me.inHand) { autoRebuyPending.current = false; return; }
    if ((me.stack || 0) < state.bb * 10 && state.street === 'ended' && !autoRebuyPending.current) {
      autoRebuyPending.current = true;
      send({ type: 'rebuy', amount: state.minBuyin || state.bb * 20 });
    }
  }, [autoRebuy, me?.stack, me?.inHand, state?.street, state?.handNo]);

  const openNote = (p: PlayerState) => {
    if (!p.nick) return;
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

  const timerPct = state && state.actor ? Math.max(0, Math.min(1, (state.actionEndsAt - now) / 15000)) : 0;
  const myTurnNow = !!me?.isMe && state?.street !== 'ended';
  useEffect(() => {
    if (!state || !myTurnNow) { timerWarnRef.current = ''; return; }
    const key = `${state.handNo}-${state.street}-${state.actor}`;
    const remaining = state.actionEndsAt - now;
    if (remaining > 0 && remaining <= 5200 && timerWarnRef.current !== key) {
      timerWarnRef.current = key;
      sound.play('winding', { volume: .55 });
    }
  }, [now, state?.handNo, state?.street, state?.actor, state?.actionEndsAt, myTurnNow]);

  const emotes = ['😂', '😎', '😭', '🔥', '👏', '🐟', '🤡', '💪', '🍀', '😱'];

  if (!user) return null;

  return (
    <div ref={tableRef} className={`table-screen theme-${theme.toLowerCase()}${fourColor ? ' four-color' : ''}${animOff ? ' anim-off' : ''}`}>
      <div className="table-topbar">
        <span className="name">{state?.name || 'Table'}</span>
        <span className="pill">{state ? `${state.seats}-max` : ''}</span>
        <span className="pill">Blinds {state ? (state.tournament ? `${state.sb}/${state.bb}` : `${chips(state.sb)}/${chips(state.bb)}`) : ''}</span>
        <span className="pill">Hand #{state?.handNo ?? '-'}</span>
        {state?.spin && <span className="pill" style={{ color: '#ffd98a' }}>Spin {state.spin.multiplier}x · {money(state.spin.prize)}</span>}
        {state?.tournament && <span className="pill" style={{ color: '#ffd98a' }}>Level {state.tournament.level} · Prize {money(state.tournament.prizePool)}</span>}
        <span className={`pill`} style={{ color: connected ? '#7fe0a0' : '#ff9a9a' }}>{connected ? 'Connected' : 'Reconnecting…'}</span>
        <div className="spacer" />
        <button onClick={() => setChatOpen((v) => !v)}>💬 Chat</button>
        <button onClick={() => sound.setEnabled(!sound.enabled)}>🔊</button>
        <button onClick={() => window.open(location.href, '_blank', 'width=1200,height=961')} title="Open in a new window">Pop out</button>
        <button onClick={() => setMenuOpen((v) => !v)}>Menu</button>
        <button onClick={() => setConfirmLeave(true)}>Leave table</button>
      </div>

      {allInFx && <div className="allin-flash"><span>ALL IN</span></div>}

      {menuOpen && (
        <div className="table-menu" onClick={() => setMenuOpen(false)}>
          <button onClick={() => { const next = !sittingOut; setSittingOut(next); send({ type: 'sit_out', value: next }); }}>{sittingOut ? 'Post blinds / sit in' : 'Sit out next hand'}</button>
          <button onClick={() => { setRebuyAmount(state?.minBuyin || 0); setRebuyOpen(true); setMenuOpen(false); }}>Rebuy / add chips</button>
          <button onClick={() => { const v = !autoRebuy; setAutoRebuy(v); localStorage.setItem('ggpoker.autorebuy', v ? '1' : '0'); }}>{autoRebuy ? '✓ ' : ''}Auto rebuy</button>
          <button onClick={() => { send({ type: 'rabbit' }); sound.play('rabbit'); }}>Rabbit hunt</button>
          <button onClick={() => { const v = !fourColor; setFourColor(v); localStorage.setItem('ggpoker.fourcolor', v ? '1' : '0'); }}>{fourColor ? '✓ ' : ''}Four-colour deck</button>
          <button onClick={() => { const v = !animOff; setAnimOff(v); localStorage.setItem('ggpoker.animations', v ? '0' : '1'); }}>{animOff ? 'Enable animations' : 'Disable animations'}</button>
          <button onClick={() => navigate('/hand-history')}>Hand history</button>
          <button onClick={() => navigate('/settings')}>Table settings</button>
          <button onClick={() => setConfirmLeave(true)}>Leave table</button>
        </div>
      )}

      <div className="room-mark" />
      <div className="room-floor" />
      <div className="felt" />
      <div className="table-watermark" style={{ top: '34%', fontSize: 20, letterSpacing: 5 }}>{state?.name || ''}</div>
      <div className="table-center">
        {!winFx && <div className="pot-label">Total Pot : {chip(state?.pot)}</div>}
        <div className="board">
          {(state?.board || []).map((c, i) => <PlayingCard key={`${state?.handNo}-${i}-${c}`} card={c} dealt style={{ '--dx': '0px', '--dy': '34px', animationDelay: `${i * 0.08}s` } as React.CSSProperties} />)}
          {state && state.board.length === 0 && state.street !== 'idle' && (
            <div style={{ color: 'rgba(255,255,255,.35)', fontSize: 12, letterSpacing: 2 }}>PRE-FLOP</div>
          )}
        </div>
        {handInfo && (
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
            className={'seat' + (p.isMe ? ' me' : '') + (p.folded ? ' folded' : '') + (isActor ? ' active' : '') + ((p.winAmount || 0) > 0 ? ' winner' : '')}
            style={{ left: `${x}%`, top: `${y}%`, cursor: p.nick ? 'pointer' : 'default' }}
            onClick={() => { if (p.nick) openNote(p); }}
            title={p.nick ? 'Player note' : ''}
          >
            {p.winAmount ? <div className="win-amount">+{chip(p.winAmount)}</div> : null}
            {isActor && !p.folded ? <div className="timer" style={{ animationDuration: '1.4s' }} /> : null}
            <div className="cards">
              {(p.cards || []).map((c, i) => {
                const [px, py] = seatPosOf(p.seat!);
                return <PlayingCard key={`${state?.handNo}-${p.seat}-${i}`} card={c} size="mini" dim={p.folded}
                  style={{ '--dx': `${(50 - px) * 8}px`, '--dy': `${(45 - py) * 5.5}px`, animationDelay: `${i * 0.08}s` } as React.CSSProperties} />;
              })}
            </div>
            <div className="avatar-wrap">
              <img className="seat-ring" src={(p.winAmount || 0) > 0 ? '/assets/table/ring_gold.png' : isActor ? '/assets/table/ring_gold.png' : '/assets/table/ring_silver.png'} alt="" />
              <div className="face">
                <Avatar name={p.nick || '?'} src={p.avatar} size={54} />
              </div>
            </div>
            <div className="plate">
              <div className="nm">{p.nick}</div>
              <div className="st">{chip(p.stack)}</div>
            </div>
            {p.nick && notes[p.nick] && <span className="note-dot" title={notes[p.nick].note}>📝</span>}
            {p.lastAction && !p.folded && (
              <div className={'action-badge ' + (p.lastAction.action || '').toLowerCase()}>
                {p.lastAction.action}{p.lastAction.amount ? ` ${money(p.lastAction.amount)}` : ''}
              </div>
            )}
            {p.folded && <div className="action-badge fold">Fold</div>}
            {p.allIn && <div className="action-badge" style={{ color: '#ffd98a' }}>ALL IN</div>}
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
        const dx = x + (x <= 50 ? 6.2 : -6.2);
        const dy = y + (y < 45 ? 4.5 : -4.5);
        return <div className="dealer-btn" style={{ left: `${dx}%`, top: `${dy}%` }}>D</div>;
      })()}

      {(state?.players || []).filter((p) => p && !p.empty && (p.bet || 0) > 0).map((p) => {
        const [x, y] = seatPos(p.seat!);
        const bx = x + (50 - x) * 0.2;
        const by = y + (45 - y) * 0.2;
        return <div key={'bet' + p.seat} className="table-bet" style={{ left: `${bx}%`, top: `${by}%` }}><span className="chip-ico" />{chip(p.bet)}</div>;
      })}

      {fx.map((f) => {
        const [x, y] = seatPos(f.seat);
        return <div key={f.id} className="float-chip" style={{ left: `${x}%`, top: `${y - 9}%` }}>{chip(f.amount)}</div>;
      })}

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
            <button className={'btn ' + (waitlistPos > 0 ? 'btn-gold' : 'btn-red')} onClick={sitIn}>Take a seat · {chip(state?.minBuyin)}</button>
            <button className="btn btn-dark" onClick={() => setConfirmLeave(true)}>Leave</button>
          </div>
        </div>
      ) : (
      <div className="action-bar">
        {myTurn && (
          <div className="turn-timer-bar"><i style={{ width: `${timerPct * 100}%` }} /></div>
        )}
        <div className="action-row">
          <button className={'tb-btn' + (tbUsed ? ' used' : '')} disabled={!myTurn || tbUsed} onClick={() => send({ type: 'timebank' })} title="Add 10 seconds once per hand">⏱ {tbUsed ? 'Used' : 'Time bank'}</button>
          <button className="act-btn act-fold" disabled={!myTurn} onClick={() => act('fold')}>Fold</button>
          {toCall === 0 ? (
            <button className="act-btn act-check" disabled={!myTurn} onClick={() => act('check')}>Check</button>
          ) : (
            <button className="act-btn act-call" disabled={!myTurn} onClick={() => act('call')}>
              Call {chip(Math.min(toCall, me?.stack || 0))}
            </button>
          )}
          <div className="grow" />
          <div className="quick-bets">
            {[0.5, 0.75, 1].map((f) => (
              <button key={f} disabled={!myTurn} onClick={() => {
                const target = Math.min(maxTo, Math.max(minTo, Math.round((state!.pot * f + state!.currentBet) / 100) * 100));
                setRaiseTo(target);
              }}>{f === 1 ? 'Pot' : `${f * 100}%`}</button>
            ))}
          </div>
          <input
            className="bet-slider"
            type="range"
            min={minTo}
            max={Math.max(minTo, maxTo)}
            step={Math.max(100, state?.bb || 100)}
            value={raiseTo}
            disabled={!myTurn}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
          />
          <input
            className="amount-input"
            type="number"
            value={state?.tournament ? raiseTo : Math.round(raiseTo / 100)}
            disabled={!myTurn}
            min={state?.tournament ? minTo : Math.round(minTo / 100)}
            max={state?.tournament ? maxTo : Math.round(maxTo / 100)}
            onChange={(e) => setRaiseTo(Math.max(minTo, Math.min(maxTo, Number(e.target.value) * (state?.tournament ? 1 : 100))))}
          />
          <button
            className={'act-btn ' + (raiseTo >= maxTo ? 'act-allin' : 'act-raise')}
            disabled={!myTurn || maxTo <= state?.currentBet!}
            onClick={() => act(raiseTo >= maxTo ? 'allin' : 'raise', raiseTo)}
          >
            {raiseTo >= maxTo ? 'All in' : (state && state.currentBet > 0 ? 'Raise' : 'Bet')} {chip(raiseTo)}
          </button>
        </div>
        <div className="action-row" style={{ color: '#9a9a9a', fontSize: 11.5 }}>
          <span>{myTurn ? 'Your turn — choose an action' : state ? (state.actor ? 'Waiting for opponents…' : state.street === 'ended' ? 'Hand complete' : 'Dealing…') : 'Connecting…'}</span>
          <div className="grow" />
          <span>F1 Fold · F2 Check/Call · F3 Raise · F4 All-in</span>
          <span>·</span>
          <span>Hand #{state?.handNo ?? 0}</span>
          <span>·</span>
          <span>{me ? `Your stack ${chip(me.stack)}` : ''}</span>
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

      {tourneyWin && (
        <div className="spin-overlay win">
          <div className="spin-title">TOURNAMENT WINNER</div>
          <div style={{ fontSize: 60, margin: '10px 0' }}>🏆</div>
          <div className="spin-prize">{tourneyWin.nick} wins <b>{money(tourneyWin.prize)}</b></div>
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

      {noteTarget && (
        <div className="modal-backdrop" onClick={() => setNoteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>Note · {noteTarget.nick}</h3></div>
            <div className="modal-body">
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

      {rebuyOpen && (
        <div className="modal-backdrop" onClick={() => setRebuyOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>Rebuy</h3></div>
            <div className="modal-body">
              <p className="muted small">Add chips to your stack between hands. Your stack is {chip(me?.stack)}.</p>
              <input type="range" min={state?.minBuyin || 0} max={state?.maxBuyin || 0} step={Math.max(100, state?.bb || 100)}
                value={rebuyAmount} onChange={(e) => setRebuyAmount(Number(e.target.value))} style={{ width: '100%' }} />
              <div className="between" style={{ marginTop: 8 }}>
                <span className="muted small">{chip(state?.minBuyin)}</span>
                <b style={{ color: '#ffd98a' }}>{chip(rebuyAmount)}</b>
                <span className="muted small">{chip(state?.maxBuyin)}</span>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-dark" onClick={() => setRebuyOpen(false)}>Cancel</button>
              <button className="btn btn-red" onClick={doRebuy}>Add chips</button>
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
