import React, { useEffect, useRef, useState } from 'react';
import { money } from '../lib/api';

const SLIDE_MS = 6000;

type Slide = { art: string; kicker: string; title: string; sub: string; tab: string };

/** Wordless 3D banners (art 6a–6c); every word on them is live text. */
function slidesFor(jackpot: number): readonly Slide[] {
  return [
    { art: 'cash-holdem.webp', kicker: 'Cash games', title: "No-Limit Hold'em", sub: 'Tables running around the clock', tab: 'holdem' },
    { art: 'cash-plo.webp', kicker: 'Cash games', title: 'Pot-Limit Omaha', sub: 'Four cards. Bigger pots.', tab: 'plo' },
    { art: 'cash-badbeat.webp', kicker: 'Bad Beat Jackpot', title: money(jackpot), sub: "Lose with quad 8s or better in Hold'em and the table shares it", tab: 'holdem' },
  ];
}

/** Promo carousel above the cash-game table list (reference 07 hero + dots). */
export function CashHero({ jackpot, onGame }: { jackpot: number; onGame: (tab: string) => void }) {
  const slides = slidesFor(jackpot);
  const [i, setI] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => { if (!paused.current) setI((n) => (n + 1) % slides.length); }, SLIDE_MS);
    return () => clearInterval(t);
  }, [slides.length]);

  return (
    <div
      className="cash-hero"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
    >
      {slides.map((s, idx) => (
        <button
          key={s.art}
          type="button"
          className={'cash-slide' + (idx === i ? ' on' : '')}
          aria-hidden={idx !== i}
          tabIndex={idx === i ? 0 : -1}
          onClick={() => onGame(s.tab)}
          aria-label={`${s.kicker}: ${s.title}`}
        >
          <img src={`/assets/ui/creatives/${s.art}`} alt="" loading={idx === 0 ? 'eager' : 'lazy'} />
          <span className="cash-slide-copy">
            <small>{s.kicker}</small>
            <b>{s.title}</b>
            <span>{s.sub}</span>
          </span>
        </button>
      ))}
      <div className="cash-dots" role="tablist" aria-label="Promotions">
        {slides.map((s, idx) => (
          <button
            key={s.art}
            type="button"
            role="tab"
            aria-selected={idx === i}
            aria-label={s.kicker === 'Cash games' ? s.title : s.kicker}
            className={idx === i ? 'on' : ''}
            onClick={() => setI(idx)}
          />
        ))}
      </div>
    </div>
  );
}
