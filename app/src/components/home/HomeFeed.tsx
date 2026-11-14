import React, { useEffect, useRef } from 'react';
import { money, type LobbyTable } from '../../lib/api';
import { useApp } from '../../lib/store';
import type { HomeTarget } from '../../lib/homeContent';

const CREATIVE = '/assets/ui/creatives';
const TABLE_ART = ['tv-0.png', 'tv-1.png', 'tv-2.png', 'tv-3.png'];

type Props = {
  tables: readonly LobbyTable[];
  online: number;
  onTarget: (target: HomeTarget) => void;
  onJoin: (t: LobbyTable) => void;
};

/** The reference Poker Home: hero, For You, TV, Tournaments For You, Special Features, Casino. */
export function HomeFeed({ tables, online, onTarget, onJoin }: Props) {
  const { navigate } = useApp();
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cleanups: (() => void)[] = [];
    root.querySelectorAll<HTMLElement>('.tilt').forEach((el) => {
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--rx', `${(0.5 - py) * 9}deg`);
        el.style.setProperty('--ry', `${(px - 0.5) * 11}deg`);
        el.style.setProperty('--mx', `${px * 100}%`);
        el.style.setProperty('--my', `${py * 100}%`);
      };
      const leave = () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      cleanups.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); });
    });
    const spot = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      root.style.setProperty('--px', `${((e.clientX - r.left) / r.width) * 100}%`);
      root.style.setProperty('--py', `${((e.clientY - r.top + root.scrollTop) / r.height) * 100}%`);
    };
    root.addEventListener('pointermove', spot);
    cleanups.push(() => root.removeEventListener('pointermove', spot));
    return () => cleanups.forEach((c) => c());
  }, []);

  const busiest = [...tables].filter((t) => !t.private).sort((a, b) => b.players - a.players).slice(0, 4);
  const tv = TABLE_ART.map((art, i) => ({ art, table: busiest[i] || null }));

  return (
    <div className="home-feed" ref={feedRef}>
      <div className="hf-bokeh" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <button type="button" className="hf-hero tilt" onClick={() => onTarget({ route: '/tournaments' })} aria-label="November Chip Rush — open tournaments">
        <img src={`${CREATIVE}/hero-november.png`} alt="November Chip Rush · freerolls and guarantees all month" />
        <span className="hf-sheen" aria-hidden="true" />
        <span className="hf-chip"><i aria-hidden="true" />Ends in {Math.max(0, Math.ceil((new Date(new Date().getFullYear(), 10, 30).getTime() - Date.now()) / 86400000))} days</span>
      </button>

      <section className="hf-section" aria-labelledby="hf-foryou">
        <div className="hf-head"><h2 id="hf-foryou">For You</h2></div>
        <div className="hf-row">
          {[
            { art: 'foryou-recent.png', label: 'Recent game', target: null },
            { art: 'foryou-freebie.png', label: 'Daily Freebie', target: { route: '/rewards' } as HomeTarget },
            { art: 'foryou-ocean.png', label: 'DanGG Rewards', target: { route: '/ocean' } as HomeTarget },
            { art: 'foryou-live-series.png', label: 'Live Series', target: { route: '/tournaments' } as HomeTarget },
          ].map((c, i) => (
            <button
              key={c.art}
              type="button"
              className="hf-card hf-foryou tilt"
              aria-label={c.label}
              onClick={() => (i === 0 && busiest[0] ? onJoin(busiest[0]) : c.target && onTarget(c.target))}
            >
              <img src={`${CREATIVE}/${c.art}`} alt="" />
            </button>
          ))}
        </div>
      </section>

      <section className="hf-section" aria-labelledby="hf-tv">
        <div className="hf-head"><h2 id="hf-tv">DanGG.TV</h2></div>
        <div className="hf-row hf-tv-row">
          {tv.map(({ art, table }, i) => (
            <button key={i} type="button" className="hf-tv tilt" onClick={() => (table ? navigate(`/table/${table.id}?observe=1`) : navigate('/?play=1'))} aria-label={table ? `Watch ${table.name}` : 'Browse tables'}>
              <img className="hf-tv-thumb" src={`${CREATIVE}/${art}`} alt="" />
              <span className="hf-tv-body">
                <b>{table ? `${table.name} — ${money(table.sb)}/${money(table.bb)}` : 'Open a table'}</b>
                <small><i className={`hf-flag f${i}`} aria-hidden="true" />DanGG Studio</small>
                <em>{table ? `${table.players} seated · ${table.seats}-max` : 'Live from the floor'}</em>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="hf-section" aria-labelledby="hf-tourn">
        <div className="hf-head"><h2 id="hf-tourn">Tournaments For You</h2><button type="button" onClick={() => navigate('/tournaments')}>View all</button></div>
        <div className="hf-row">
          {['tourn-masters.png', 'tourn-weekender.png', 'tourn-daily.png'].map((art) => (
            <button key={art} type="button" className="hf-card hf-tourn tilt" onClick={() => navigate('/tournaments')} aria-label="Open tournaments">
              <img src={`${CREATIVE}/${art}`} alt="" />
            </button>
          ))}
        </div>
      </section>

      <section className="hf-section" aria-labelledby="hf-features">
        <div className="hf-head"><h2 id="hf-features">Special Features</h2></div>
        <div className="hf-row">
          {[
            { art: 'feature-time-bank.png', label: 'Time Bank Card', to: '/settings' },
            { art: 'feature-run-it-twice.png', label: 'Run It Twice', to: '/settings' },
            { art: 'feature-social.png', label: 'Social Features', to: '/support' },
            { art: 'feature-hand-history.png', label: 'Hand History', to: '/hand-history' },
          ].map((f) => (
            <button key={f.art} type="button" className="hf-card hf-feature tilt" onClick={() => navigate(f.to)} aria-label={f.label}>
              <img src={`${CREATIVE}/${f.art}`} alt="" />
            </button>
          ))}
        </div>
      </section>

      <section className="hf-section" aria-labelledby="hf-casino">
        <div className="hf-head"><h2 id="hf-casino">Casino</h2><button type="button" onClick={() => navigate('/casino')}>View all</button></div>
        <div className="hf-row">
          {['casino-olympus-gold.png', 'casino-disco-cat.png', 'casino-robo-rush.png', 'casino-clover-cash.png'].map((art) => (
            <button key={art} type="button" className="hf-card hf-casino tilt" onClick={() => navigate('/casino')} aria-label="Open casino">
              <img src={`${CREATIVE}/${art}`} alt="" />
            </button>
          ))}
        </div>
      </section>

      <footer className="hf-foot">
        <span>{online.toLocaleString()} online</span>
        <span>Play money only · no cash value</span>
        <button type="button" onClick={() => navigate('/support')}>Security and Ecology Policy</button>
        <button type="button" onClick={() => navigate('/support')}>help@dangg.live</button>
      </footer>
    </div>
  );
}
