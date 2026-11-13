import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getToken, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell } from '../components/PageShell';
import { AgeNotice } from '../components/AgeNotice';
import { WinnersTicker } from '../components/WinnersTicker';
import {
  gameNameFromMemo, loadSlotGames, loadWinners, SLOT_CATEGORIES,
  type SlotGame, type WinnerRow,
} from '../lib/slotGames';

const SHUFFLE_TICKS = 12;

function SlotTile({ game, featured, onPlay }: { game: SlotGame; featured?: boolean; onPlay: (g: SlotGame) => void }) {
  return (
    <button
      type="button"
      className={'slot-tile' + (featured ? ' slot-tile-featured' : '')}
      style={{ ['--accent' as any]: game.accent }}
      onClick={() => onPlay(game)}
      aria-label={`Play ${game.name}`}
    >
      <img src={`/assets/slots/${game.id}.svg`} alt="" loading="lazy" />
      <span className="slot-tile-badge">{game.badge}</span>
      <span className="slot-tile-copy">
        <b>{game.name}</b>
        <small>{game.tagline}</small>
        <em>{game.volatility} volatility · from {money(game.bets[0])}</em>
      </span>
      <span className="slot-tile-play">Play →</span>
    </button>
  );
}

export function Slots() {
  const { user, route, navigate, toast, refreshUser } = useApp();
  const [games, setGames] = useState<SlotGame[]>([]);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [mine, setMine] = useState<WinnerRow | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeId = route.split('?')[0].split('/')[2] || '';
  const active = games.find((g) => g.id === activeId) || null;

  const [grid, setGrid] = useState<string[][]>(Array.from({ length: 5 }, () => ['cherry', 'lemon', 'bell']));
  const [bet, setBet] = useState(100);
  const [spinning, setSpinning] = useState(false);
  const [win, setWin] = useState(0);
  const [lines, setLines] = useState<any[]>([]);
  const [balance, setBalance] = useState(user?.balance ?? 0);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { setBalance(user?.balance ?? 0); }, [user?.balance]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, feed] = await Promise.all([loadSlotGames(), loadWinners(18).catch(() => ({ winners: [], mine: null }))]);
        if (cancelled) return;
        setGames(list);
        setWinners(feed.winners.filter((w) => w.kind === 'slots'));
        setMine(feed.mine);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Could not load the slot catalogue');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Each game has its own bet ladder; snap to it when the game changes.
  useEffect(() => {
    if (active) setBet(active.bets[Math.min(1, active.bets.length - 1)]);
    // Show a varied idle grid rather than five identical reels.
    const keys = active ? Object.keys(active.glyphs) : ['cherry', 'lemon', 'bell'];
    setGrid(Array.from({ length: 5 }, (_, c) => [keys[c % keys.length], keys[(c + 3) % keys.length], keys[(c + 5) % keys.length]]));
    setWin(0); setLines([]);
  }, [active?.id]);

  const shown = useMemo(
    () => (category === 'all' ? games : games.filter((g) => g.tags.includes(category))),
    [games, category],
  );
  const featured = shown.find((g) => g.badge === 'FEATURED') || shown[0];
  const rest = shown.filter((g) => g.id !== featured?.id);
  const symbols = active ? Object.keys(active.glyphs) : [];
  const glyph = (s: string) => active?.glyphs[s] || '';

  const spin = async () => {
    if (!active) return;
    if (!user) { navigate('/login'); return; }
    if (spinning) return;
    setSpinning(true); setWin(0); setLines([]);
    sound.play('wheel', { volume: .5 });
    try {
      const res = await fetch('/api/games/slot', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ bet, game: active.id }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      for (let i = 0; i < SHUFFLE_TICKS && alive.current; i++) {
        setGrid(Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)])));
        await new Promise((r) => setTimeout(r, 70));
      }
      setGrid(res.grid);
      setWin(res.win);
      setLines(res.lines || []);
      setBalance(res.balance);
      if (res.win) { sound.play('win'); toast({ kind: 'reward', title: 'Win!', body: `${active.name} paid ${money(res.win)}` }); }
      else sound.play('click', { volume: .4 });
      await refreshUser();
      if (res.win) {
        setMine((prev) => (!prev || res.win > prev.amount ? { nick: user.nick, amount: res.win, kind: 'slots', memo: `Slots ${active.name} win ${res.win}`, created_at: new Date().toISOString() } : prev));
      }
    } catch (e: any) {
      toast({ kind: 'error', title: 'Slots', body: e.message });
    } finally {
      if (alive.current) setSpinning(false);
    }
  };

  if (active) {
    return (
      <PageShell activeTop="slots">
        <div className="page slot-game" style={{ ['--accent' as any]: active.accent }}>
          <button type="button" className="slot-back" onClick={() => navigate('/slots')}>← All games</button>
          <div className="slot-game-head">
            <div>
              <h1 className="page-title">{active.name}</h1>
              <p className="page-sub">{active.tagline} · {active.volatility} volatility · 10 paylines</p>
            </div>
            <span className="slot-balance">{money(balance)}</span>
          </div>
          <AgeNotice />
          <div className="slot-machine">
            <div className="slot-grid">
              {Array.from({ length: 3 }).map((_, row) => (
                <div className="slot-row" key={row}>
                  {Array.from({ length: 5 }).map((_, col) => {
                    const s = grid[col]?.[row] || symbols[0];
                    return <div key={col} className={'slot-cell' + (spinning ? ' spinning' : '')}>{glyph(s)}</div>;
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
                {active.bets.map((b) => (
                  <button key={b} className={'btn btn-sm ' + (bet === b ? 'btn-gold' : 'btn-ghost')} onClick={() => setBet(b)}>{money(b)}</button>
                ))}
              </div>
              <button className="btn btn-gold slot-spin" disabled={spinning || !user} onClick={spin}>
                {spinning ? 'SPINNING…' : user ? 'SPIN' : 'LOG IN TO SPIN'}
              </button>
            </div>
            {!!lines.length && (
              <div className="slot-lines">
                {lines.map((l, i) => (
                  <div key={i}>Line {l.line + 1}: {l.count}× {glyph(l.symbols.find((s: string) => s !== 'wild') || 'wild')} → {money(l.amount)}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PageShell>
    );
  }

  const topWin = winners[0] || null;

  return (
    <PageShell activeTop="slots">
      <div className="page slots-page">
        <h1 className="page-title">Slots</h1>
        <p className="page-sub">{games.length ? `${games.length} DanGG Originals · play-money only` : 'DanGG Originals · play-money only'}</p>
        <AgeNotice />

        <nav className="slots-chips" aria-label="Slot categories">
          {SLOT_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={'slots-chip' + (category === c.key ? ' on' : '')}
              aria-pressed={category === c.key}
              onClick={() => { setCategory(c.key); sound.play('click', { volume: .4 }); }}
            >{c.label}</button>
          ))}
        </nav>

        <div className="slots-cards">
          <article className="slots-card">
            <small>Top win today</small>
            <b>{topWin ? money(topWin.amount) : '—'}</b>
            <span>{topWin ? `${topWin.nick} · ${gameNameFromMemo(topWin.memo, games)}` : 'No wins yet today'}</span>
          </article>
          <article className="slots-card">
            <small>Your best today</small>
            <b>{mine ? money(mine.amount) : money(0)}</b>
            <span>{mine ? gameNameFromMemo(mine.memo, games) : user ? 'Spin to set a win' : 'Log in to track wins'}</span>
          </article>
          <article className="slots-card slots-card-cta">
            <small>Daily freebie</small>
            <b>Free play chips</b>
            <span>Claim once a day in Rewards.</span>
            <button type="button" className="btn btn-gold btn-sm" onClick={() => navigate('/rewards')}>Claim →</button>
          </article>
        </div>

        <WinnersTicker winners={winners} labelFor={(w) => gameNameFromMemo(w.memo, games)} />

        <div className="slots-grid-head">
          <h2>Only on DanGG</h2>
          <span>{shown.length} game{shown.length === 1 ? '' : 's'}</span>
        </div>

        {error && <div className="list-empty" role="alert">{error}</div>}
        {!error && loading && <div className="slots-loading">Loading the floor…</div>}
        {!error && !loading && !shown.length && <div className="list-empty">No games in this category yet.</div>}

        {!error && !!shown.length && (
          <div className="slots-grid">
            {featured && <SlotTile game={featured} featured onPlay={(g) => navigate(`/slots/${g.id}`)} />}
            {rest.map((g) => <SlotTile key={g.id} game={g} onPlay={(x) => navigate(`/slots/${x.id}`)} />)}
          </div>
        )}
      </div>
    </PageShell>
  );
}
