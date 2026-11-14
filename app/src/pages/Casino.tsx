import React, { useEffect, useRef, useState } from 'react';
import { api, getToken, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell, SubNav } from '../components/PageShell';
import { MobileCasino } from '../components/mobile/MobileCasino';
import { MobileShell } from '../components/mobile/MobileShell';
import { casinoTabFromRoute } from '../components/mobile/casinoGames';
import { useIsPhone } from '../lib/useIsPhone';
import { AgeNotice } from '../components/AgeNotice';
import { WinnersTicker } from '../components/WinnersTicker';
import { loadWinners, type WinnerRow } from '../lib/slotGames';

const CASINO_NAV = [
  { key: 'lobby', label: 'Lobby' }, { key: 'roulette', label: 'Roulette' }, { key: 'blackjack', label: 'Blackjack' },
  { key: 'crash', label: 'Crash' }, { key: 'baccarat', label: 'Baccarat' }, { key: 'dragontiger', label: 'Dragon Tiger' },
  { key: 'sicbo', label: 'Sic Bo' },
];


const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export function Roulette({ onTab }: { onTab?: (key: string) => void }) {
  const { user, refreshUser, toast, navigate } = useApp();
  const [bet, setBet] = useState(100);
  const [kind, setKind] = useState('red');
  const [value, setValue] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [angle, setAngle] = useState(0);
  const [payout, setPayout] = useState<number | null>(null);

  const spin = async () => {
    if (!user) { navigate('/login'); return; }
    if (spinning) return;
    setSpinning(true); setPayout(null);
    sound.play('wheel', { volume: .5 });
    try {
      const res = await fetch('/api/games/roulette', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ bet, kind, value }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      const target = res.number * (360 / 37) + 720 * 3;
      setAngle((a) => a + target);
      await new Promise((r) => setTimeout(r, 2600));
      setResult(res.number);
      setPayout(res.payout);
      if (res.payout) { sound.play('win'); toast({ kind: 'reward', title: `Won ${money(res.payout)}`, body: `Number ${res.number}` }); }
      else sound.play('fold', { volume: .5 });
      await refreshUser();
    } catch (e: any) {
      toast({ kind: 'error', title: 'Roulette', body: e.message });
    } finally { setSpinning(false); }
  };

  const outside: [string, string, number][] = [
    ['red', 'Red', 2], ['black', 'Black', 2], ['even', 'Even', 2], ['odd', 'Odd', 2],
    ['low', '1-18', 2], ['high', '19-36', 2], ['dozen1', '1st 12', 3], ['dozen2', '2nd 12', 3], ['dozen3', '3rd 12', 3],
    ['column1', 'Column 1', 3], ['column2', 'Column 2', 3], ['column3', 'Column 3', 3],
  ];

  return (
    <PageShell activeTop="casino" subnav={<SubNav items={CASINO_NAV} active="roulette" onChange={(k) => onTab?.(k)} />}>
      <div className="page">
        <h1 className="page-title">Roulette</h1>
        <p className="page-sub">European single-zero wheel · play money</p>
        <AgeNotice />
        <div className="roulette-wrap">
          <div className="roulette-wheel-holder">
            <div className="roulette-wheel" style={{ transform: `rotate(${angle}deg)` }}>
              {Array.from({ length: 37 }).map((_, n) => (
                <div key={n} className="roulette-num" style={{ transform: `rotate(${n * (360 / 37)}deg) translateY(-118px)` }}>{n}</div>
              ))}
              <div className="roulette-center">{result ?? '—'}</div>
            </div>
          </div>
          <div className="roulette-board">
            <div className="num-grid">
              <div className="rnum zero" onClick={() => { setKind('number'); setValue(0); }}>0</div>
              {Array.from({ length: 36 }).map((_, i) => {
                const n = i + 1;
                return <div key={n} className={'rnum ' + (RED.has(n) ? 'red' : 'black')} onClick={() => { setKind('number'); setValue(n); }}>{n}</div>;
              })}
            </div>
            <div className="outside-grid">
              {outside.map(([k, label, mult]) => (
                <button key={k} className={'outside ' + (kind === k ? 'on' : '')} onClick={() => { setKind(k); setValue(null); }}>
                  {label}<small>pays {mult}:1</small>
                </button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <span className="muted small">Bet</span>
              {[50, 100, 500, 1000].map((b) => <button key={b} className={'btn btn-sm ' + (bet === b ? 'btn-gold' : 'btn-ghost')} onClick={() => setBet(b)}>{money(b)}</button>)}
              <div style={{ flex: 1 }} />
              <button className="btn btn-gold" style={{ height: 42, minWidth: 150 }} disabled={spinning} onClick={spin}>{spinning ? 'Spinning…' : 'Spin'}</button>
            </div>
            {result != null && (
              <div className="card" style={{ marginTop: 12 }}>
                <div className="between">
                  <span>Result: <b style={{ color: RED.has(result) ? '#ff7a7a' : '#ddd' }}>{result} {result === 0 ? '' : RED.has(result) ? 'Red' : 'Black'}</b></span>
                  <span className="gold">{payout ? `+${money(payout)}` : 'No win'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function bjValue(cards: string[]) {
  let sum = 0, aces = 0;
  for (const c of cards) {
    const r = c[0]; const v = r === 'A' ? 11 : ['T', 'J', 'Q', 'K'].includes(r) ? 10 : Number(r);
    sum += v; if (r === 'A') aces++;
  }
  while (sum > 21 && aces > 0) { sum -= 10; aces--; }
  return sum;
}

function draw() {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const suits = ['s', 'h', 'd', 'c'];
  return ranks[Math.floor(Math.random() * 13)] + suits[Math.floor(Math.random() * 4)];
}

export function Blackjack({ onTab }: { onTab?: (key: string) => void }) {
  const { user, refreshUser, toast, navigate } = useApp();
  const [bet, setBet] = useState(100);
  const [player, setPlayer] = useState<string[]>([]);
  const [dealer, setDealer] = useState<string[]>([]);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [msg, setMsg] = useState('');

  const post = (body: any) => fetch('/api/games/blackjack', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  }).then((r) => r.json());

  // A hand left open by a reload or navigation is still live on the server: pick it back up.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    post({ action: 'state' }).then((res) => {
      if (cancelled || !res.active) return;
      setPlayer(res.player); setDealer(res.dealer); setBet(res.bet); setPhase('playing');
      setMsg('Hand resumed');
    }).catch(() => { /* the table simply starts idle */ });
    return () => { cancelled = true; };
  }, [user?.id]);

  const deal = async () => {
    if (!user) { navigate('/login'); return; }
    try {
      const res = await post({ action: 'deal', bet });
      if (res.error) throw new Error(res.error);
      setPlayer(res.player); setDealer(res.dealer); setPhase('playing'); setMsg(res.blackjack ? 'Blackjack!' : '');
      sound.play('deal');
      await refreshUser();
    } catch (e: any) { toast({ kind: 'error', title: 'Blackjack', body: e.message }); }
  };

  const hit = async () => {
    try {
      const res = await post({ action: 'hit' });
      if (res.error) throw new Error(res.error);
      setPlayer(res.player);
      sound.play('deal', { volume: .6 });
      if (res.done) {
        setDealer(res.dealer); setPhase('done');
        setMsg(res.bust ? 'Bust!' : '');
        sound.play('fold', { volume: .5 });
        await refreshUser();
      }
    } catch (e: any) { toast({ kind: 'error', title: 'Blackjack', body: e.message }); }
  };

  const stand = async () => {
    try {
      const res = await post({ action: 'stand' });
      if (res.error) throw new Error(res.error);
      setPlayer(res.player); setDealer(res.dealer); setPhase('done');
      const label = res.result === 'bust' ? 'Bust' : res.result === 'push' ? 'Push' : res.result === 'win' ? 'You win' : 'Dealer wins';
      setMsg(label);
      if (res.result === 'win') sound.play('win'); else if (res.result === 'push') sound.play('click'); else sound.play('fold', { volume: .5 });
      await refreshUser();
    } catch (e: any) { toast({ kind: 'error', title: 'Blackjack', body: e.message }); }
  };

  return (
    <PageShell activeTop="casino" subnav={<SubNav items={CASINO_NAV} active="blackjack" onChange={(k) => onTab?.(k)} />}>
      <div className="page">
        <h1 className="page-title">Blackjack</h1>
        <p className="page-sub">Classic 21 · dealer stands on 17 · blackjack pays 3:2</p>
        <AgeNotice />
        <div className="bj-table">
          <div className="bj-side">
            <div className="panel-title">Dealer <small>{phase === 'playing' ? '?' : bjValue(dealer)}</small></div>
            <div className="board">
              {dealer.map((c, i) => (phase === 'playing' && i === 1) ? <div key={i} className="pcard back" /> : <div key={i} className={`pcard${c[1] === 'h' || c[1] === 'd' ? ' red' : ''}`}><span className="rank">{c[0] === 'T' ? '10' : c[0]}</span><span className="suit">{({ s: '♠', h: '♥', d: '♦', c: '♣' } as any)[c[1]]}</span><span className="big-suit">{({ s: '♠', h: '♥', d: '♦', c: '♣' } as any)[c[1]]}</span></div>)}
            </div>
            <div className="panel-title" style={{ marginTop: 28 }}>You <small>{player.length ? bjValue(player) : ''}</small></div>
            <div className="board">
              {player.map((c, i) => <div key={i} className={`pcard${c[1] === 'h' || c[1] === 'd' ? ' red' : ''}`}><span className="rank">{c[0] === 'T' ? '10' : c[0]}</span><span className="suit">{({ s: '♠', h: '♥', d: '♦', c: '♣' } as any)[c[1]]}</span><span className="big-suit">{({ s: '♠', h: '♥', d: '♦', c: '♣' } as any)[c[1]]}</span></div>)}
            </div>
            {msg && <div className="bj-msg">{msg}</div>}
          </div>
          <div className="bj-controls">
            <div className="panel-title">Bet</div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {[50, 100, 500, 1000].map((b) => <button key={b} className={'btn btn-sm ' + (bet === b ? 'btn-gold' : 'btn-ghost')} onClick={() => setBet(b)}>{money(b)}</button>)}
            </div>
            <button className="btn btn-red btn-block" style={{ marginTop: 14, height: 42 }} onClick={deal} disabled={phase === 'playing'}>Deal</button>
            <button className="btn btn-gold btn-block" style={{ marginTop: 8, height: 42 }} onClick={hit} disabled={phase !== 'playing'}>Hit</button>
            <button className="btn btn-dark btn-block" style={{ marginTop: 8, height: 42 }} onClick={stand} disabled={phase !== 'playing'}>Stand</button>
            <div className="kv" style={{ marginTop: 16 }}><span>Balance</span><b>{money(user?.balance ?? 0)}</b></div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export function Crash({ onTab }: { onTab?: (key: string) => void }) {
  const { user, refreshUser, toast, navigate } = useApp();
  const [bet, setBet] = useState(500);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'live' | 'cashed' | 'crashed'>('idle');
  const [multiplier, setMultiplier] = useState(1);
  const [crashAt, setCrashAt] = useState<number | null>(null);
  const [history, setHistory] = useState<{ m: number; won: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);

  const post = async (body: any) => {
    const r = await fetch('/api/games/crash', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  useEffect(() => {
    let saved: any = null;
    try { saved = JSON.parse(localStorage.getItem('ggpoker.crashRound') || 'null'); } catch { /* ignore */ }
    if (!saved?.roundId || !saved?.startedAt) return;
    if (Date.now() - Number(saved.startedAt) > 120000) { localStorage.removeItem('ggpoker.crashRound'); return; }
    post({ action: 'status', roundId: saved.roundId }).then((r) => {
      if (r.crashed) { localStorage.removeItem('ggpoker.crashRound'); return; }
      setRoundId(saved.roundId); setStartedAt(Number(saved.startedAt)); setMultiplier(Number(r.multiplier) || 1); setPhase('live');
    }).catch(() => localStorage.removeItem('ggpoker.crashRound'));
  }, []);

  const start = async () => {
    if (!user) { navigate('/login'); return; }
    if (busy || phase === 'live') return;
    setBusy(true);
    try {
      const r = await post({ action: 'start', bet });
      setRoundId(r.roundId); setStartedAt(r.startedAt); localStorage.setItem('ggpoker.crashRound', JSON.stringify({ roundId: r.roundId, startedAt: r.startedAt }));
      setMultiplier(1); setCrashAt(null); setPhase('live');
      sound.play('deal', { volume: .5 }); await refreshUser();
    } catch (e: any) { toast({ kind: 'error', title: 'Crash', body: e.message }); }
    finally { setBusy(false); }
  };

  const cashout = async () => {
    if (!roundId || phase !== 'live' || busy) return;
    setBusy(true);
    try {
      const r = await post({ action: 'cashout', roundId });
      if (r.won) {
        setMultiplier(r.multiplier); setPhase('cashed'); setCrashAt(r.crash); localStorage.removeItem('ggpoker.crashRound');
        setHistory((h) => [{ m: r.multiplier, won: true }, ...h].slice(0, 8));
        sound.play('win'); toast({ kind: 'reward', title: 'Cashed out', body: `${r.multiplier.toFixed(2)}x · ${money(r.payout)}` });
        await refreshUser();
      } else {
        setMultiplier(r.crash); setCrashAt(r.crash); setPhase('crashed'); localStorage.removeItem('ggpoker.crashRound');
        setHistory((h) => [{ m: r.crash, won: false }, ...h].slice(0, 8));
        sound.play('fold', { volume: .6 });
      }
    } catch (e: any) { toast({ kind: 'error', title: 'Cashout failed', body: e.message }); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (phase !== 'live' || !roundId) return;
    const timer = window.setInterval(() => setMultiplier(Math.exp((Date.now() - startedAt) / 1800)), 80);
    return () => window.clearInterval(timer);
  }, [phase, roundId, startedAt]);

  useEffect(() => {
    if (phase !== 'live' || !roundId) return;
    const poll = window.setInterval(async () => {
      try {
        const r = await post({ action: 'status', roundId });
        if (r.crashed) {
          setPhase('crashed'); setMultiplier(r.crash); setCrashAt(r.crash); localStorage.removeItem('ggpoker.crashRound');
          setHistory((h) => [{ m: r.crash, won: false }, ...h].slice(0, 8));
          sound.play('fold', { volume: .6 });
        } else {
          setMultiplier(r.multiplier);
        }
      } catch { /* ignore transient poll */ }
    }, 300);
    pollRef.current = poll;
    return () => { window.clearInterval(poll); pollRef.current = null; };
  }, [phase, roundId, startedAt]);

  return (
    <PageShell activeTop="casino" subnav={<SubNav items={CASINO_NAV} active="crash" onChange={(k) => onTab?.(k)} />}>
      <div className="page">
        <h1 className="page-title">Crash</h1>
        <p className="page-sub">Ride the multiplier · cash out before the crash</p>
        <AgeNotice />
        <div className="crash-table">
          <div className={'crash-stage ' + phase}>
            <div className="crash-grid" />
            <div className="crash-multiplier">{multiplier.toFixed(2)}<small>x</small></div>
            <div className="crash-label">
              {phase === 'idle' && 'Place a bet to launch'}
              {phase === 'live' && `Potential ${money(Math.round(bet * multiplier))}`}
              {phase === 'cashed' && `Cashed out at ${multiplier.toFixed(2)}x`}
              {phase === 'crashed' && `Crashed at ${crashAt?.toFixed(2)}x`}
            </div>
          </div>
          <div className="crash-controls">
            <div className="between"><span className="muted small">Bet</span><b className="gold">{money(bet)}</b></div>
            <input type="range" min={100} max={10000} step={100} value={bet} onChange={(e) => setBet(Number(e.target.value))} disabled={phase === 'live'} />
            <div className="row" style={{ gap: 6 }}>
              {[100, 500, 1000, 5000].map((v) => <button key={v} className="btn btn-ghost btn-sm" disabled={phase === 'live'} onClick={() => setBet(v)}>{money(v)}</button>)}
            </div>
            {phase === 'live' ? (
              <button className="btn btn-gold" style={{ width: '100%', height: 46, fontSize: 15 }} disabled={busy} onClick={cashout}>Cash out {money(Math.round(bet * multiplier))}</button>
            ) : (
              <button className="btn btn-red" style={{ width: '100%', height: 46, fontSize: 15 }} disabled={busy || !user} onClick={start}>{phase === 'idle' ? 'Start round' : 'Play again'}</button>
            )}
            <div className="muted small" style={{ textAlign: 'center' }}>Balance {money(user?.balance ?? 0)}</div>
          </div>
        </div>
        {!!history.length && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="panel-title">Recent rounds</div>
            <div className="row">{history.map((h, i) => <span key={i} className={'crash-chip' + (h.won ? ' win' : '')}>{h.m.toFixed(2)}x</span>)}</div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

const HUB_GAMES = [
  { key: 'slots', name: 'Slots', art: '/assets/ui/discover/Bg_Discover_CasinoBonus_EN.png', desc: 'Six DanGG Originals', tags: ['slots'] },
  { key: 'roulette', name: 'Roulette', art: '/assets/ui/discover/Bg_Discover_AoF.png', desc: 'European wheel', tags: ['table'] },
  { key: 'blackjack', name: 'Blackjack', art: '/assets/ui/discover/Bg_Discover_WSOPExpress_Promo1_EN.png', desc: 'Classic 21', tags: ['table'] },
  { key: 'crash', name: 'Crash', art: '/assets/ui/discover/Bg_Discover_RushNCash_Holdem.png', desc: 'Cash out before it crashes', tags: ['arcade'] },
  { key: 'baccarat', name: 'Baccarat', art: '/assets/ui/discover/Bg_Discover_Leaderboard_Holdem.png', desc: 'Player vs Banker', tags: ['table'] },
  { key: 'dragontiger', name: 'Dragon Tiger', art: '/assets/ui/discover/Bg_Discover_MysteryBattleRoyal.png', desc: 'Fast card duel', tags: ['table'] },
  { key: 'sicbo', name: 'Sic Bo', art: '/assets/ui/discover/Bg_Discover_SpinNGold.png', desc: 'Three dice', tags: ['table'] },
  { key: 'holdem', name: "Casino Hold'em", art: '/assets/ui/discover/Bg_Discover_Leaderboard_PLO6.png', desc: 'Poker vs dealer', tags: ['table', 'poker'] },
];
const HUB_CATEGORIES = [
  { key: 'all', label: 'All' }, { key: 'slots', label: 'Slots' }, { key: 'table', label: 'Table' },
  { key: 'arcade', label: 'Arcade' }, { key: 'poker', label: 'Poker' },
];
const HUB_SECTIONS = [
  { key: 'table', label: 'Table games', keys: ['blackjack', 'roulette', 'baccarat', 'dragontiger', 'sicbo'] },
  { key: 'slots', label: 'Slots', keys: ['slots'] },
  { key: 'arcade', label: 'Arcade', keys: ['crash'] },
  { key: 'poker', label: 'Poker', keys: ['holdem'] },
];
const HUB_SLIDES = [
  { key: 'slots', accent: '#f2c45c', art: '/assets/slots/wild-jungle.svg', kicker: 'Only on DanGG', title: 'Six slots. One floor.', sub: 'Wilds, wheels and clover cash — every one a real playable game.', cta: 'Browse slots', to: '/slots' },
  { key: 'crash', accent: '#48c8e0', art: '/assets/slots/robo-rush.svg', kicker: 'Crash', title: 'Cash out before it pops.', sub: 'The multiplier climbs until it does not. You decide when to leave.', cta: 'Play Crash', tab: 'crash' },
  { key: 'freebie', accent: '#c05cff', art: '/assets/slots/disco-cat.svg', kicker: 'Every day', title: 'Free play chips.', sub: 'Claim the daily freebie and take it straight to the reels.', cta: 'Claim now', to: '/rewards' },
];
const KIND_LABEL: Record<string, string> = { slots: 'Slots', roulette: 'Roulette', crash_win: 'Crash', blackjack: 'Blackjack' };

export function Casino() {
  const { navigate, route } = useApp();
  const isPhone = useIsPhone();
  const [tab, setTab] = useState(() => casinoTabFromRoute(route));
  const [category, setCategory] = useState('all');
  const [slide, setSlide] = useState(0);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  useEffect(() => { setTab(casinoTabFromRoute(route)); }, [route]);
  useEffect(() => {
    let cancelled = false;
    loadWinners(14).then((feed) => { if (!cancelled) setWinners(feed.winners); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const id = window.setInterval(() => setSlide((s) => (s + 1) % HUB_SLIDES.length), 6500);
    return () => window.clearInterval(id);
  }, []);

  if (tab === 'roulette') return <Roulette onTab={setTab} />;
  if (tab === 'blackjack') return <Blackjack onTab={setTab} />;
  if (tab === 'crash') return <Crash onTab={setTab} />;
  if (tab === 'baccarat') return <Baccarat onTab={setTab} />;
  if (tab === 'dragontiger') return <DragonTiger onTab={setTab} />;
  if (tab === 'sicbo') return <SicBo onTab={setTab} />;
  if (isPhone) return <MobileShell showBrand><MobileCasino /></MobileShell>;

  const shown = category === 'all' ? HUB_GAMES : HUB_GAMES.filter((g) => g.tags.includes(category));
  const go = (target?: string, nextTab?: string) => {
    if (target) navigate(target);
    else if (nextTab) setTab(nextTab);
  };

  return (
    <PageShell activeTop="casino">
      <div className="page">
        <div className="casino-hero" aria-roledescription="carousel" aria-label="Casino highlights">
          {HUB_SLIDES.map((s, i) => (
            <div key={s.key} className={'casino-hero-slide' + (i === slide ? ' on' : '')} style={{ ['--accent' as any]: s.accent }} aria-hidden={i !== slide}>
              <img className="casino-hero-art" src={s.art} alt="" />
              <div className="casino-hero-copy">
                <small>{s.kicker}</small>
                <b>{s.title}</b>
                <span>{s.sub}</span>
              </div>
              <button type="button" className="casino-hero-cta" onClick={() => go(s.to, s.tab)} tabIndex={i === slide ? 0 : -1}>{s.cta} →</button>
            </div>
          ))}
          <div className="casino-hero-dots" role="tablist" aria-label="Choose slide">
            {HUB_SLIDES.map((s, i) => (
              <button key={s.key} type="button" role="tab" aria-selected={i === slide} aria-label={s.title} className={i === slide ? 'on' : ''} onClick={() => setSlide(i)} />
            ))}
          </div>
        </div>

        <nav className="slots-chips" aria-label="Casino categories">
          {HUB_CATEGORIES.map((c) => (
            <button key={c.key} type="button" className={'slots-chip' + (category === c.key ? ' on' : '')} aria-pressed={category === c.key} onClick={() => setCategory(c.key)}>{c.label}</button>
          ))}
        </nav>

        <WinnersTicker winners={winners} labelFor={(w) => KIND_LABEL[w.kind] || w.memo} empty="No casino wins yet today — take a seat." />

        {category === 'all' ? HUB_SECTIONS.map((sec) => {
          const items = HUB_GAMES.filter((g) => sec.keys.includes(g.key));
          if (!items.length) return null;
          return (
            <section key={sec.key} className="casino-section" aria-labelledby={'cs-' + sec.key}>
              <div className="casino-hub-head"><h2 id={'cs-' + sec.key}>{sec.label}</h2><span className="muted small">{items.length} {items.length === 1 ? 'game' : 'games'}</span></div>
              <div className="casino-row">
                {items.map((g) => (
                  <div key={g.key} className="casino-card" onClick={() => go(g.key === 'slots' ? '/slots' : undefined, g.key)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(g.key === 'slots' ? '/slots' : undefined, g.key); } }}>
                    <img className="casino-card-art" src={g.art} alt="" />
                    <div className="casino-card-shade" />
                    <div className="cc-name">{g.name}</div>
                    <div className="cc-desc">{g.desc}</div>
                    <div className="cc-play">Play →</div>
                  </div>
                ))}
              </div>
            </section>
          );
        }) : (
          <>
            <div className="casino-hub-head"><h2>Only on DanGG</h2><span className="muted small">{shown.length} games</span></div>
            <div className="grid g3">
              {shown.map((g) => (
                <div key={g.key} className="casino-card" onClick={() => go(g.key === 'slots' ? '/slots' : undefined, g.key)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(g.key === 'slots' ? '/slots' : undefined, g.key); } }}>
                  <img className="casino-card-art" src={g.art} alt="" />
                  <div className="casino-card-shade" />
                  <div className="cc-name">{g.name}</div>
                  <div className="cc-desc">{g.desc}</div>
                  <div className="cc-play">Play →</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}

function GameCardRow({ cards }: { cards: string[] }) {
  return (
    <div className="board">
      {cards.map((c, i) => {
        const suit = ({ s: '♠', h: '♥', d: '♦', c: '♣' } as any)[c[1]];
        return (
          <div key={i} className={`pcard${c[1] === 'h' || c[1] === 'd' ? ' red' : ''}`}>
            <span className="rank">{c[0] === 'T' ? '10' : c[0]}</span>
            <span className="suit">{suit}</span>
            <span className="big-suit">{suit}</span>
          </div>
        );
      })}
    </div>
  );
}

function useTableGame(game: string) {
  const { user, refreshUser, toast, navigate } = useApp();
  const [bet, setBet] = useState(100);
  const [pick, setPick] = useState('player');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const play = async (choice?: string) => {
    if (!user) { navigate('/login'); return; }
    const p = choice ?? pick;
    setBusy(true);
    try {
      const r = await fetch('/api/games/tablegame', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ game, bet, pick: p }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setRes(r);
      sound.play(r.payout ? 'win' : 'fold', { volume: r.payout ? .9 : .45 });
      if (r.payout) toast({ kind: 'reward', title: 'You win!', body: money(r.payout) });
      await refreshUser();
    } catch (e: any) { toast({ kind: 'error', title: 'Game', body: e.message }); }
    finally { setBusy(false); }
  };
  return { user, bet, setBet, pick, setPick, busy, res, play };
}

export function Baccarat({ onTab }: { onTab?: (key: string) => void }) {
  const g = useTableGame('baccarat');
  const r = g.res?.result;
  return (
    <PageShell activeTop="casino" subnav={<SubNav items={CASINO_NAV} active="baccarat" onChange={(k) => onTab?.(k)} />}>
      <div className="page">
        <h1 className="page-title">Baccarat</h1>
        <p className="page-sub">Punto Banco · play money</p>
        <AgeNotice />
        <div className="bj-table">
          <div className="bj-side">
            <div className="panel-title">Player <small>{r ? r.playerTotal : ''}</small></div>
            <GameCardRow cards={r?.player || []} />
            <div className="panel-title" style={{ marginTop: 28 }}>Banker <small>{r ? r.bankerTotal : ''}</small></div>
            <GameCardRow cards={r?.banker || []} />
            {r && <div className="bj-msg">{r.winner === 'tie' ? 'Tie' : r.winner === 'player' ? 'Player wins' : 'Banker wins'} · {g.res.payout ? `+${money(g.res.payout)}` : 'No win'}</div>}
          </div>
          <div className="bj-controls">
            <div className="panel-title">Bet</div>
            <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
              {[50, 100, 500, 1000].map((b) => <button key={b} className={'btn btn-sm ' + (g.bet === b ? 'btn-gold' : 'btn-ghost')} onClick={() => g.setBet(b)}>{money(b)}</button>)}
            </div>
            {[['player', 'Player', '1:1'], ['banker', 'Banker', '0.95:1'], ['tie', 'Tie', '8:1']].map(([k, label, odds]) => (
              <button key={k} className={'btn btn-block ' + (g.pick === k ? 'btn-gold' : 'btn-dark')} style={{ marginBottom: 6 }} onClick={() => { g.setPick(k); g.play(k); }} disabled={g.busy}>
                {label} <span className="muted small" style={{ marginLeft: 6 }}>{odds}</span>
              </button>
            ))}
            <div className="kv" style={{ marginTop: 10 }}><span>Balance</span><b>{money(g.user?.balance ?? 0)}</b></div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export function DragonTiger({ onTab }: { onTab?: (key: string) => void }) {
  const g = useTableGame('dragontiger');
  const r = g.res?.result;
  return (
    <PageShell activeTop="casino" subnav={<SubNav items={CASINO_NAV} active="dragontiger" onChange={(k) => onTab?.(k)} />}>
      <div className="page">
        <h1 className="page-title">Dragon Tiger</h1>
        <p className="page-sub">One card each — highest wins · ties pay 8:1</p>
        <AgeNotice />
        <div className="bj-table">
          <div className="bj-side">
            <div className="panel-title">Dragon</div>
            <GameCardRow cards={r?.dragon || []} />
            <div className="panel-title" style={{ marginTop: 28 }}>Tiger</div>
            <GameCardRow cards={r?.tiger || []} />
            {r && <div className="bj-msg">{r.winner === 'tie' ? 'Tie' : r.winner === 'dragon' ? 'Dragon wins' : 'Tiger wins'} · {g.res.payout ? `+${money(g.res.payout)}` : 'No win'}</div>}
          </div>
          <div className="bj-controls">
            <div className="panel-title">Bet</div>
            <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
              {[50, 100, 500, 1000].map((b) => <button key={b} className={'btn btn-sm ' + (g.bet === b ? 'btn-gold' : 'btn-ghost')} onClick={() => g.setBet(b)}>{money(b)}</button>)}
            </div>
            {[['dragon', 'Dragon', '1:1'], ['tiger', 'Tiger', '1:1'], ['tie', 'Tie', '8:1']].map(([k, label, odds]) => (
              <button key={k} className={'btn btn-block ' + (g.pick === k ? 'btn-gold' : 'btn-dark')} style={{ marginBottom: 6 }} onClick={() => { g.setPick(k); g.play(k); }} disabled={g.busy}>
                {label} <span className="muted small" style={{ marginLeft: 6 }}>{odds}</span>
              </button>
            ))}
            <div className="kv" style={{ marginTop: 10 }}><span>Balance</span><b>{money(g.user?.balance ?? 0)}</b></div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export function SicBo({ onTab }: { onTab?: (key: string) => void }) {
  const g = useTableGame('sicbo');
  const r = g.res?.result;
  const totals = Array.from({ length: 14 }, (_, i) => i + 4);
  return (
    <PageShell activeTop="casino" subnav={<SubNav items={CASINO_NAV} active="sicbo" onChange={(k) => onTab?.(k)} />}>
      <div className="page">
        <h1 className="page-title">Sic Bo</h1>
        <p className="page-sub">Three dice · bet on big, small, triples or exact totals</p>
        <AgeNotice />
        <div className="bj-table">
          <div className="bj-side">
            <div className="dice-row">
              {(r?.dice || [1, 1, 1]).map((d: number, i: number) => <div key={i} className="die">{['⚀','⚁','⚂','⚃','⚄','⚅'][d - 1]}</div>)}
            </div>
            {r && <div className="bj-msg">Total {r.sum}{r.triple ? ' · Triple!' : ''} · {g.res.payout ? `+${money(g.res.payout)}` : 'No win'}</div>}
          </div>
          <div className="bj-controls" style={{ width: 340, flex: '0 0 340px' }}>
            <div className="panel-title">Bet</div>
            <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
              {[50, 100, 500, 1000].map((b) => <button key={b} className={'btn btn-sm ' + (g.bet === b ? 'btn-gold' : 'btn-ghost')} onClick={() => g.setBet(b)}>{money(b)}</button>)}
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
              {[['small', 'Small 4-10'], ['big', 'Big 11-17'], ['triple', 'Any triple']].map(([k, label]) => (
                <button key={k} className={'btn btn-sm ' + (g.pick === k ? 'btn-gold' : 'btn-ghost')} onClick={() => { g.setPick(k); g.play(k); }}>{label}</button>
              ))}
            </div>
            <div className="muted small" style={{ marginTop: 10 }}>Exact total</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 3 }}>
              {totals.map((t) => (
                <button key={t} className="btn btn-ghost btn-sm" style={{ minWidth: 34 }} onClick={() => { g.setPick('total' + t); g.play('total' + t); }}>{t}</button>
              ))}
            </div>
            <div className="kv" style={{ marginTop: 10 }}><span>Balance</span><b>{money(g.user?.balance ?? 0)}</b></div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
