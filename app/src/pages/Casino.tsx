import React, { useEffect, useRef, useState } from 'react';
import { api, getToken, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell, SubNav } from '../components/PageShell';

const SYM: Record<string, { g: string; c: string }> = {
  cherry: { g: '🍒', c: '#e2454f' }, lemon: { g: '🍋', c: '#e3c53c' }, bell: { g: '🔔', c: '#e3b23c' },
  star: { g: '⭐', c: '#f0d060' }, diamond: { g: '💎', c: '#63d2f0' }, seven: { g: '7️⃣', c: '#f06a6a' },
  clover: { g: '🍀', c: '#5fd07a' }, wild: { g: '🃏', c: '#c78bf0' },
};

export function Slots() {
  const { user, refreshUser, toast, navigate } = useApp();
  const [grid, setGrid] = useState<string[][]>(Array.from({ length: 5 }, () => ['cherry', 'lemon', 'bell']));
  const [bet, setBet] = useState(100);
  const [spinning, setSpinning] = useState(false);
  const [win, setWin] = useState(0);
  const [lines, setLines] = useState<any[]>([]);
  const [balance, setBalance] = useState(user?.balance ?? 0);

  useEffect(() => { setBalance(user?.balance ?? 0); }, [user?.balance]);

  const spin = async () => {
    if (!user) { navigate('/login'); return; }
    if (spinning) return;
    setSpinning(true); setWin(0); setLines([]);
    sound.play('wheel', { volume: .5 });
    try {
      const res = await fetch('/api/games/slot', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ bet }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      for (let i = 0; i < 12; i++) {
        setGrid(Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => {
          const keys = Object.keys(SYM); return keys[Math.floor(Math.random() * keys.length)];
        })));
        await new Promise((r) => setTimeout(r, 80));
      }
      setGrid(res.grid);
      setWin(res.win);
      setLines(res.lines || []);
      setBalance(res.balance);
      if (res.win) { sound.play('win'); toast({ kind: 'reward', title: 'Big win!', body: money(res.win) }); }
      else sound.play('click', { volume: .4 });
      await refreshUser();
    } catch (e: any) {
      toast({ kind: 'error', title: 'Slots', body: e.message });
    } finally { setSpinning(false); }
  };

  return (
    <PageShell activeTop="slots">
      <div className="page">
        <h1 className="page-title">Slots</h1>
        <p className="page-sub">Gates of Olympus-style play-money slot · 10 paylines</p>
        <div className="slot-machine">
          <div className="slot-head">
            <span>⚡ OLYMPUS GOLD</span>
            <span className="gold">{money(balance)}</span>
          </div>
          <div className="slot-grid">
            {Array.from({ length: 3 }).map((_, row) => (
              <div className="slot-row" key={row}>
                {Array.from({ length: 5 }).map((_, col) => {
                  const s = grid[col]?.[row] || 'cherry';
                  return (
                    <div key={col} className={'slot-cell' + (spinning ? ' spinning' : '')} style={{ color: SYM[s].c }}>
                      {SYM[s].g}
                    </div>
                  );
                })}
              </div>
            ))}
            {!!win && (
              <div className="slot-win">
                <div className="win-title" style={{ fontSize: 40 }}>WIN</div>
                <div>{money(win)}</div>
              </div>
            )}
          </div>
          <div className="slot-controls">
            <div className="row">
              <span className="muted small">Bet</span>
              {[50, 100, 500, 1000].map((b) => (
                <button key={b} className={'btn btn-sm ' + (bet === b ? 'btn-gold' : 'btn-ghost')} onClick={() => setBet(b)}>{money(b)}</button>
              ))}
            </div>
            <button className="btn btn-gold" style={{ height: 46, minWidth: 190, fontSize: 17, fontWeight: 800 }} disabled={spinning} onClick={spin}>
              {spinning ? 'SPINNING…' : 'SPIN'}
            </button>
          </div>
          {!!lines.length && (
            <div className="slot-lines">
              {lines.map((l, i) => <div key={i}>Line {l.line + 1}: {l.count}× {SYM[l.symbols[0]]?.g} → {money(l.amount)}</div>)}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export function Roulette() {
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
    <PageShell activeTop="casino">
      <div className="page">
        <h1 className="page-title">Roulette</h1>
        <p className="page-sub">European single-zero wheel · play money</p>
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

export function Blackjack() {
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
    <PageShell activeTop="casino">
      <div className="page">
        <h1 className="page-title">Blackjack</h1>
        <p className="page-sub">Classic 21 · dealer stands on 17 · blackjack pays 3:2</p>
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

export function Casino() {
  const [tab, setTab] = useState('lobby');
  const games = [
    { key: 'roulette', name: 'Roulette', emoji: '🎡', desc: 'European wheel' },
    { key: 'blackjack', name: 'Blackjack', emoji: '🃏', desc: 'Classic 21' },
    { key: 'baccarat', name: 'Baccarat', emoji: '🀄', desc: 'Player vs Banker' },
    { key: 'dragontiger', name: 'Dragon Tiger', emoji: '🐉', desc: 'Fast card duel' },
    { key: 'sicbo', name: 'Sic Bo', emoji: '🎲', desc: 'Three dice' },
    { key: 'holdem', name: 'Casino Hold’em', emoji: '♠️', desc: 'Poker vs dealer' },
  ];
  if (tab === 'roulette') return <Roulette />;
  if (tab === 'blackjack') return <Blackjack />;
  if (tab === 'baccarat') return <Baccarat />;
  if (tab === 'dragontiger') return <DragonTiger />;
  if (tab === 'sicbo') return <SicBo />;
  return (
    <PageShell activeTop="casino" subnav={<SubNav items={[{ key: 'lobby', label: 'Lobby' }, { key: 'roulette', label: 'Roulette' }, { key: 'blackjack', label: 'Blackjack' }, { key: 'baccarat', label: 'Baccarat' }, { key: 'dragontiger', label: 'Dragon Tiger' }, { key: 'sicbo', label: 'Sic Bo' }]} active={tab} onChange={setTab} />}>
      <div className="page">
        <h1 className="page-title">Casino</h1>
        <p className="page-sub">Play-money table games · instant play</p>
        <div className="grid g3">
          {games.map((g) => (
            <div key={g.key} className="casino-card" onClick={() => setTab(g.key)}>
              <div className="cc-emoji">{g.emoji}</div>
              <div className="cc-name">{g.name}</div>
              <div className="cc-desc">{g.desc}</div>
              <div className="cc-play">Play →</div>
            </div>
          ))}
        </div>
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

export function Baccarat() {
  const g = useTableGame('baccarat');
  const r = g.res?.result;
  return (
    <PageShell activeTop="casino">
      <div className="page">
        <h1 className="page-title">Baccarat</h1>
        <p className="page-sub">Punto Banco · play money</p>
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

export function DragonTiger() {
  const g = useTableGame('dragontiger');
  const r = g.res?.result;
  return (
    <PageShell activeTop="casino">
      <div className="page">
        <h1 className="page-title">Dragon Tiger</h1>
        <p className="page-sub">One card each — highest wins · ties pay 8:1</p>
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

export function SicBo() {
  const g = useTableGame('sicbo');
  const r = g.res?.result;
  const totals = Array.from({ length: 14 }, (_, i) => i + 4);
  return (
    <PageShell activeTop="casino">
      <div className="page">
        <h1 className="page-title">Sic Bo</h1>
        <p className="page-sub">Three dice · bet on big, small, triples or exact totals</p>
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
