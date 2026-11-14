import React from 'react';
import { money, type LobbyTable } from '../../lib/api';
import { useApp } from '../../lib/store';
import type { HomeTarget } from '../../lib/homeContent';

const CREATIVE = '/assets/gg-creatives';
const TABLE_ART = ['tv-0.jpg', 'tv-1.jpg', 'tv-2.jpg', 'tv-3.jpg'];

type Props = {
  tables: readonly LobbyTable[];
  online: number;
  onTarget: (target: HomeTarget) => void;
  onJoin: (t: LobbyTable) => void;
};

/** The reference Poker Home: hero, For You, TV, Tournaments For You, Special Features, Casino. */
export function HomeFeed({ tables, online, onTarget, onJoin }: Props) {
  const { navigate } = useApp();
  const busiest = [...tables].filter((t) => !t.private).sort((a, b) => b.players - a.players).slice(0, 4);
  const tv = TABLE_ART.map((art, i) => ({ art, table: busiest[i] || null }));

  return (
    <div className="home-feed">
      <button type="button" className="hf-hero" onClick={() => onTarget({ route: '/tournaments' })} aria-label="November Giveaway — open tournaments">
        <img src={`${CREATIVE}/hero-november.jpg`} alt="November Giveaway · Nov 1st to Nov 30th" />
      </button>

      <section className="hf-section" aria-labelledby="hf-foryou">
        <div className="hf-head"><h2 id="hf-foryou">For You</h2></div>
        <div className="hf-row">
          {[
            { art: 'foryou-recent.jpg', label: 'Recent game', target: null },
            { art: 'foryou-freebie.jpg', label: 'Daily Freebie', target: { route: '/rewards' } as HomeTarget },
            { art: 'foryou-fish.jpg', label: 'Fish', target: { route: '/rewards' } as HomeTarget },
            { art: 'foryou-wsop.jpg', label: 'WSOP Express Promotion', target: { route: '/tournaments' } as HomeTarget },
          ].map((c, i) => (
            <button
              key={c.art}
              type="button"
              className="hf-card hf-foryou"
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
            <button key={i} type="button" className="hf-tv" onClick={() => (table ? navigate(`/table/${table.id}?observe=1`) : navigate('/?play=1'))} aria-label={table ? `Watch ${table.name}` : 'Browse tables'}>
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
          {['tourn-ggmasters.jpg', 'tourn-weekender.jpg', 'tourn-daily.jpg'].map((art) => (
            <button key={art} type="button" className="hf-card hf-tourn" onClick={() => navigate('/tournaments')} aria-label="Open tournaments">
              <img src={`${CREATIVE}/${art}`} alt="" />
            </button>
          ))}
        </div>
      </section>

      <section className="hf-section" aria-labelledby="hf-features">
        <div className="hf-head"><h2 id="hf-features">Special Features</h2></div>
        <div className="hf-row">
          {[
            { art: 'feature-0.jpg', label: 'Time Bank Card', to: '/settings' },
            { art: 'feature-1.jpg', label: 'EV Cashout', to: '/settings' },
            { art: 'feature-2.jpg', label: 'Social Features', to: '/support' },
            { art: 'feature-3.jpg', label: 'PokerCraft', to: '/hand-history' },
          ].map((f) => (
            <button key={f.art} type="button" className="hf-card hf-feature" onClick={() => navigate(f.to)} aria-label={f.label}>
              <img src={`${CREATIVE}/${f.art}`} alt="" />
            </button>
          ))}
        </div>
      </section>

      <section className="hf-section" aria-labelledby="hf-casino">
        <div className="hf-head"><h2 id="hf-casino">Casino</h2><button type="button" onClick={() => navigate('/casino')}>View all</button></div>
        <div className="hf-row">
          {['casino-0.jpg', 'casino-1.jpg', 'casino-2.jpg', 'casino-3.jpg'].map((art) => (
            <button key={art} type="button" className="hf-card hf-casino" onClick={() => navigate('/casino')} aria-label="Open casino">
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
