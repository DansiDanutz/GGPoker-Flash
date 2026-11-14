import React, { useEffect, useRef, useState } from 'react';
import { money, type LobbyTable } from '../../lib/api';
import { useApp } from '../../lib/store';
import { HERO_INTERVAL_MS, HERO_SLIDES, PROMO_CARDS, stepSlide, type HomeTarget } from '../../lib/homeContent';
import { MobileShell } from './MobileShell';
import { GameBadge, NavGlyph, type BadgeName } from './PhoneIcons';
import { CASINO_GAMES } from './casinoGames';

const LIVE_ROW_SIZE = 5;

type Props = {
  tables: readonly LobbyTable[];
  online: number;
  jackpot: number;
  jumpBackIn: LobbyTable | null;
  gameLabel: (t: LobbyTable) => string;
  onJoin: (t: LobbyTable) => void;
  onTarget: (target: HomeTarget) => void;
};

function liveTables(tables: readonly LobbyTable[]): LobbyTable[] {
  return [...tables].filter((t) => t.players > 0 && !t.private).sort((a, b) => b.players - a.players).slice(0, LIVE_ROW_SIZE);
}

/** One message, one CTA: a short tile banner, not the desktop key art. */
function PhoneHero({ onTarget }: { onTarget: (target: HomeTarget) => void }) {
  const { navigate } = useApp();
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => stepSlide(i, 1, HERO_SLIDES.length)), HERO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
  const slide = HERO_SLIDES[idx];
  return (
    <section className="p-hero" aria-roledescription="carousel" aria-label="Featured">
      {HERO_SLIDES.map((s, i) => (
        <div key={s.key} className={'p-hero-bg' + (i === idx ? ' on' : '')} style={{ backgroundImage: `url(${s.artWide || s.art})` }} aria-hidden={i !== idx} />
      ))}
      <span className="p-hero-scrim" aria-hidden="true" />
      <div className="p-hero-copy">
        <small>{slide.kicker}</small>
        <h2>{slide.title}</h2>
        <button type="button" className="p-hero-cta" onClick={() => onTarget(slide.target)}>{slide.cta} →</button>
      </div>
      <div className="p-hero-dots" role="tablist" aria-label="Choose banner">
        {HERO_SLIDES.map((s, i) => (
          <button key={s.key} type="button" role="tab" aria-selected={i === idx} aria-label={s.title} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} />
        ))}
      </div>
      {!slide && <button type="button" onClick={() => navigate('/')}>Home</button>}
    </section>
  );
}

export function MobileHome({ tables, online, jackpot, jumpBackIn, gameLabel, onJoin, onTarget }: Props) {
  const { navigate } = useApp();
  const live = liveTables(tables);
  return (
    <MobileShell showBrand>
      <div className="phome">
        <PhoneHero onTarget={onTarget} />

        <button type="button" className="p-jackpot" onClick={() => navigate('/tournaments')}>
          <span>BAD BEAT JACKPOT</span>
          <b>{money(jackpot)}</b>
        </button>

        <nav className="p-actions" aria-label="Quick actions">
          <button type="button" onClick={() => navigate('/?play=1')}><span className="p-action-ico"><NavGlyph name="tables" size={24} /></span>Play</button>
          <button type="button" onClick={() => navigate('/tournaments')}><span className="p-action-ico"><NavGlyph name="events" size={24} /></span>Tournaments</button>
          <button type="button" onClick={() => navigate('/casino')}><span className="p-action-ico"><NavGlyph name="casino" size={24} /></span>Casino</button>
          <button type="button" onClick={() => navigate('/rewards')}><span className="p-action-ico"><NavGlyph name="rewards" size={24} /></span>Rewards</button>
        </nav>

        <section className="p-section" aria-labelledby="p-foryou">
          <div className="p-head"><h2 id="p-foryou">For You</h2><span className="p-online">{online.toLocaleString()} online</span></div>
          <div className="p-feed">
            {jumpBackIn && (
              <button type="button" className="p-jump" onClick={() => onJoin(jumpBackIn)}>
                <span className="p-jump-copy">
                  <small>Jump back in</small>
                  <b>{jumpBackIn.name}</b>
                  <em>{gameLabel(jumpBackIn)} · {jumpBackIn.players}/{jumpBackIn.seats} seated</em>
                </span>
                <span className="p-jump-go">Join</span>
              </button>
            )}
            {PROMO_CARDS.slice(0, 3).map((c) => (
              <button key={c.key} type="button" className="p-rowcard" onClick={() => onTarget(c.target)}>
                <img src={c.art} alt="" />
                <span><b>{c.title}</b><small>{c.sub}</small></span>
                <i aria-hidden="true">›</i>
              </button>
            ))}
          </div>
        </section>

        {live.length > 0 && (
          <section className="p-section" aria-labelledby="p-live">
            <div className="p-head"><h2 id="p-live">Live tables</h2><button type="button" onClick={() => navigate('/?play=1')}>See all</button></div>
            <div className="p-list">
              {live.map((t) => (
                <button key={t.id} type="button" className="p-table" onClick={() => navigate(`/table/${t.id}?observe=1`)}>
                  <span className="p-live-dot" aria-hidden="true" />
                  <span className="p-table-copy"><b>{t.name}</b><small>{gameLabel(t)} · {money(t.sb)}/{money(t.bb)}</small></span>
                  <span className="p-seats">{t.players}/{t.seats}</span>
                  <i aria-hidden="true">›</i>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="p-section" aria-labelledby="p-casino">
          <div className="p-head"><h2 id="p-casino">Casino</h2><button type="button" onClick={() => navigate('/casino')}>View all</button></div>
          <div className="p-list">
            {CASINO_GAMES.slice(0, 3).map((g) => (
              <button key={g.key} type="button" className="p-casino-row" onClick={() => navigate(g.route)}>
                <GameBadge name={g.badge as BadgeName} size={40} />
                <span><b>{g.name}</b><small>{g.desc}</small></span>
                <i aria-hidden="true">›</i>
              </button>
            ))}
          </div>
        </section>

        <p className="p-legal">18+ · Play money only · No real-money gambling</p>
      </div>
    </MobileShell>
  );
}
