import React, { useEffect, useState } from 'react';
import { money } from '../../lib/api';
import { eventClock } from '../../lib/mobileLobby';
import { tournamentFilterCount, TOURNAMENT_SEARCH_MAX, type TournamentFilters } from '../../lib/tournamentFilters';
import { TournamentCategoryRail, TournamentFilterBar } from '../TournamentFilterBar';
import { GameBadge, NavGlyph, type BadgeName } from './PhoneIcons';

const CLOCK_TICK_MS = 1000;

/** The four format shortcuts under the hero; each one selects a category of the rail. */
const FORMAT_TILES: readonly { key: string; label: string; badge: BadgeName; tone: string }[] = [
  { key: 'flip', label: 'Quick Flip', badge: 'aof', tone: 'red' },
  { key: 'spin', label: 'Jackpot SNG', badge: 'spin', tone: 'gold' },
  { key: 'mystery', label: 'Mystery Bounty', badge: 'mystery', tone: 'violet' },
  { key: 'bounty', label: 'Bounty Hunters', badge: 'rush', tone: 'amber' },
];

type Props = {
  list: readonly any[];
  featured: any | null;
  heroArt?: string;
  filters: TournamentFilters;
  onFilters: (patch: Partial<TournamentFilters>) => void;
  onReset: () => void;
  onOpen: (t: any) => void;
  emptyText: string;
};

function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Highlighted events get a banner title, the way the reference marks series and specials. */
function bannerTone(t: any): string {
  const mode = String(t.mode || '').toUpperCase();
  const name = String(t.name || '').toLowerCase();
  if (name.includes('live series') || name.includes('masters')) return 'red';
  if (mode === 'BOUNTY' || mode === 'MYSTERY') return 'gold';
  return '';
}

/** Whole amounts read without cents, like the reference prize boxes ($100,000). */
const wholeMoney = (cents: number) => money(cents).replace(/\.00$/, '');

/** Satellites pay seats, not chips; everything else shows its guarantee. */
const prizeLabel = (t: any) => (String(t.mode || '').toUpperCase() === 'SATELLITE' || !t.gtd ? 'Ticket' : wholeMoney(t.gtd));

const startLabel = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

function EventRow({ t, now, onOpen }: { t: any; now: number; onOpen: () => void }) {
  const clock = eventClock(t, now);
  const tone = bannerTone(t);
  return (
    <button type="button" className={'me-row tone-' + clock.tone} onClick={onOpen}>
      <span className="me-clock">
        <b>{clock.label}</b>
        {clock.value
          ? <><small>{clock.caption}</small><strong className={clock.value.includes('min') ? 'long' : ''}>{clock.value}</strong></>
          : <strong className="me-clock-idle">{clock.tone === 'run' ? 'Live' : '—'}</strong>}
      </span>
      <span className={'me-title' + (tone ? ' banner banner-' + tone : '')}>{t.name}</span>
      <span className="me-info">
        <span className="me-meta">Starts: {startLabel(t.start_at)}</span>
        <span className="me-meta">Buy-in: {t.buyin === 0 ? 'Freeroll' : wholeMoney(t.buyin + t.fee)}</span>
        <span className="me-entrants"><NavGlyph name="people" size={16} />{(t.entrants || 0).toLocaleString()}</span>
      </span>
      <span className="me-prize"><small>Prize</small><b>{prizeLabel(t)}</b></span>
    </button>
  );
}

/** Phone Events tab: hero, format tiles, search + filter toggles, category rail and countdown rows. */
export function MobileEvents({ list, featured, heroArt, filters, onFilters, onReset, onOpen, emptyText }: Props) {
  const now = useNow();
  const [searchOpen, setSearchOpen] = useState(filters.search !== '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = tournamentFilterCount(filters);

  return (
    <div className="me">
      {featured && (
        <button type="button" className="me-hero" onClick={() => onOpen(featured)}>
          {heroArt && <img src={heroArt} alt="" />}
          <span className="me-hero-copy">
            <small>Tournament series</small>
            <b>{featured.name}</b>
            <strong>{money(featured.gtd, true)} <em>GTD</em></strong>
            <span>{startLabel(featured.start_at)} · Buy-in {featured.buyin === 0 ? 'Freeroll' : money(featured.buyin + featured.fee)}</span>
          </span>
        </button>
      )}

      <div className="me-tiles">
        {FORMAT_TILES.map((tile) => (
          <button key={tile.key} type="button" className={'me-tile tone-' + tile.tone + (filters.category === tile.key ? ' on' : '')} onClick={() => onFilters({ category: filters.category === tile.key ? 'all' : tile.key })}>
            <b>{tile.label}</b>
            <GameBadge name={tile.badge} size={52} />
          </button>
        ))}
      </div>

      <header className="me-head">
        <h1>Upcoming Events</h1>
        <button type="button" className={'me-tool' + (searchOpen ? ' on' : '')} aria-label="Search events" aria-pressed={searchOpen} onClick={() => setSearchOpen((v) => !v)}>
          <NavGlyph name="search" size={22} />
        </button>
        <button type="button" className={'me-tool' + (filtersOpen || activeFilters ? ' on' : '')} aria-label="Filter events" aria-pressed={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
          <NavGlyph name="filter" size={22} />
          {activeFilters > 0 && <i>{activeFilters}</i>}
        </button>
      </header>

      {searchOpen && (
        <input
          className="me-search"
          type="search"
          autoFocus
          aria-label="Search tournaments"
          placeholder="Search tournaments…"
          maxLength={TOURNAMENT_SEARCH_MAX}
          value={filters.search}
          onChange={(e) => onFilters({ search: e.target.value })}
        />
      )}
      {filtersOpen && <TournamentFilterBar filters={filters} onChange={onFilters} onReset={onReset} />}

      <TournamentCategoryRail active={filters.category} onChange={(category) => onFilters({ category })} />

      <div className="me-list">
        {list.map((t) => <EventRow key={t.id} t={t} now={now} onOpen={() => onOpen(t)} />)}
        {!list.length && <p className="me-empty">{emptyText}</p>}
      </div>
    </div>
  );
}
