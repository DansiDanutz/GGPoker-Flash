import React, { useEffect, useRef, useState } from 'react';
import { money, type LobbyTable } from '../../lib/api';
import { useApp } from '../../lib/store';
import { HERO_INTERVAL_MS, HERO_SLIDES, PROMO_CARDS, stepSlide, type HomeTarget } from '../../lib/homeContent';
import { GameBadge, NavGlyph, type BadgeName } from './PhoneIcons';
import { CASINO_GAMES } from './casinoGames';

const LIVE_ROW_SIZE = 6;
const TABLE_ART = ['table_5ring.png', 'table_supercircuit.png', 'featured_6ring.png', 'table_plo6_supercircuit.png'];

type Props = {
  tables: readonly LobbyTable[];
  online: number;
  jackpot: number;
  jumpBackIn: LobbyTable | null;
  gameLabel: (t: LobbyTable) => string;
  onJoin: (t: LobbyTable) => void;
  onTarget: (target: HomeTarget) => void;
};

/** The busiest tables right now, for the "Live tables" row. */
function liveTables(tables: readonly LobbyTable[]): LobbyTable[] {
  return [...tables].filter((t) => t.players > 0 && !t.private).sort((a, b) => b.players - a.players).slice(0, LIVE_ROW_SIZE);
}

function HeroCarousel({ onTarget }: { onTarget: (target: HomeTarget) => void }) {
  const { user, navigate } = useApp();
  const [idx, setIdx] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => stepSlide(i, 1, HERO_SLIDES.length)), HERO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    const el = track.current;
    if (el) el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
  }, [idx]);

  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== idx) setIdx(next);
  };

  return (
    <section className="mh-hero" aria-roledescription="carousel" aria-label="Featured">
      <div className="mh-hero-track" ref={track} onScroll={onScroll}>
        {HERO_SLIDES.map((s) => (
          <button key={s.key} type="button" className="mh-slide" style={{ background: s.bg }} onClick={() => onTarget(s.target)} aria-label={`${s.title}: ${s.cta}`}>
            <img src={s.art} alt="" />
            <span className="mh-slide-copy">
              <small>{s.kicker}</small>
              <b>{s.title}</b>
              <em>{s.cta} →</em>
            </span>
          </button>
        ))}
      </div>
      <div className="mh-wallet">
        {user ? (
          <button type="button" onClick={() => navigate('/cashier')} aria-label="Open cashier">
            <b>{money(user.balance)}</b><NavGlyph name="wallet" size={30} />
          </button>
        ) : (
          <button type="button" className="mh-login" onClick={() => navigate('/login')}>Log in</button>
        )}
      </div>
      <div className="mh-dots" role="tablist" aria-label="Choose slide">
        {HERO_SLIDES.map((s, i) => (
          <button key={s.key} type="button" role="tab" aria-selected={i === idx} aria-label={s.title} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} />
        ))}
      </div>
    </section>
  );
}

export function MobileHome({ tables, online, jackpot, jumpBackIn, gameLabel, onJoin, onTarget }: Props) {
  const { navigate } = useApp();
  const live = liveTables(tables);
  return (
    <div className="mh">
      <HeroCarousel onTarget={onTarget} />

      <button type="button" className="mh-jackpot" onClick={() => navigate('/tournaments')}>
        <span>BAD BEAT JACKPOT</span>
        <b>{money(jackpot)}</b>
      </button>

      <section className="mh-section" aria-labelledby="mh-foryou">
        <header className="mh-head">
          <h2 id="mh-foryou">For You</h2>
          <span className="mh-online">{online.toLocaleString()} online</span>
        </header>
        <div className="mh-rail">
          {jumpBackIn && (
            <button type="button" className="mh-card mh-card-jump" onClick={() => onJoin(jumpBackIn)}>
              <small>Jump back in</small>
              <b>{jumpBackIn.name}</b>
              <span>{gameLabel(jumpBackIn)} · {jumpBackIn.players}/{jumpBackIn.seats} seated</span>
              <img src={`/assets/tables/${TABLE_ART[0]}`} alt="" />
            </button>
          )}
          {PROMO_CARDS.map((c) => (
            <button key={c.key} type="button" className="mh-card" onClick={() => onTarget(c.target)}>
              <b>{c.title}</b>
              <span>{c.sub}</span>
              <img src={c.art} alt="" />
            </button>
          ))}
        </div>
      </section>

      {live.length > 0 && (
        <section className="mh-section" aria-labelledby="mh-live">
          <header className="mh-head"><h2 id="mh-live">Live Tables</h2></header>
          <div className="mh-rail">
            {live.map((t, i) => (
              <button key={t.id} type="button" className="mh-live" onClick={() => navigate(`/table/${t.id}?observe=1`)}>
                <span className="mh-live-thumb" style={{ backgroundImage: `url(/assets/tables/${TABLE_ART[i % TABLE_ART.length]})` }}>
                  <i className="mh-live-tag">LIVE</i>
                  <i className="mh-live-count"><NavGlyph name="people" size={13} />{t.players}/{t.seats}</i>
                </span>
                <b>{t.name}</b>
                <small>{gameLabel(t)} · {money(t.sb)}/{money(t.bb)}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mh-section" aria-labelledby="mh-casino">
        <header className="mh-head"><h2 id="mh-casino">Casino</h2><button type="button" onClick={() => navigate('/casino')}>View all</button></header>
        <div className="mh-rail">
          {CASINO_GAMES.map((g) => (
            <button key={g.key} type="button" className="mh-casino" onClick={() => navigate(g.route)}>
              <GameBadge name={g.badge as BadgeName} size={58} />
              <b>{g.name}</b>
            </button>
          ))}
        </div>
      </section>

      <footer className="mh-foot">18+ · Play money only · No real-money gambling</footer>
    </div>
  );
}
