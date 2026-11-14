import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';

const SLIDES = [
  { art: 'hero-november.jpg', title: 'November Giveaway', to: '/tournaments' },
  { art: 'tourn-ggmasters.jpg', title: 'GGMasters', to: '/tournaments' },
  { art: 'foryou-wsop.jpg', title: 'WSOP Express', to: '/tournaments' },
];

/** Promo carousel above the cash-game table list (reference 07 hero + dots). */
export function CashHero() {
  const { navigate } = useApp();
  const [i, setI] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => { if (!paused.current) setI((n) => (n + 1) % SLIDES.length); }, 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="cash-hero"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
    >
      {SLIDES.map((s, idx) => (
        <button
          key={s.art}
          type="button"
          className={'cash-slide' + (idx === i ? ' on' : '')}
          aria-hidden={idx !== i}
          tabIndex={idx === i ? 0 : -1}
          onClick={() => navigate(s.to)}
          aria-label={s.title}
        >
          <img src={`/assets/gg-creatives/${s.art}`} alt="" loading={idx === 0 ? 'eager' : 'lazy'} />
        </button>
      ))}
      <div className="cash-dots" role="tablist" aria-label="Promotions">
        {SLIDES.map((s, idx) => (
          <button
            key={s.art}
            type="button"
            role="tab"
            aria-selected={idx === i}
            aria-label={s.title}
            className={idx === i ? 'on' : ''}
            onClick={() => setI(idx)}
          />
        ))}
      </div>
    </div>
  );
}
