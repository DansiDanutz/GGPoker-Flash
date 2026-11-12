import React from 'react';
import {
  BUYIN_OPTIONS, CATEGORIES, GAME_OPTIONS, SPEED_OPTIONS, STATUS_OPTIONS, TOURNAMENT_SEARCH_MAX,
  tournamentFilterCount, TournamentFilters,
} from '../lib/tournamentFilters';

type Option = { readonly value: string; readonly label: string };

type SelectProps = {
  label: string;
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
};

function FilterSelect({ label, options, value, onChange }: SelectProps) {
  return (
    <label className={'tf-select' + (value !== 'all' ? ' on' : '')}>
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

type CategoryRailProps = { active: string; onChange: (key: string) => void };

/** Native-style category rail; replaces the old series chips with the same look. */
export function TournamentCategoryRail({ active, onChange }: CategoryRailProps) {
  return (
    <div className="series-bar" role="tablist" aria-label="Tournament categories">
      {CATEGORIES.map((c) => (
        <button
          key={c.key}
          type="button"
          role="tab"
          aria-selected={active === c.key}
          className={'series-chip' + (active === c.key ? ' on' : '')}
          onClick={() => onChange(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

type FilterBarProps = {
  filters: TournamentFilters;
  onChange: (patch: Partial<TournamentFilters>) => void;
  onReset: () => void;
};

/** Game, buy-in band, status, speed, Registered only, search, active count and Reset. */
export function TournamentFilterBar({ filters, onChange, onReset }: FilterBarProps) {
  const count = tournamentFilterCount(filters);
  return (
    <div className="tf-bar" role="group" aria-label="Tournament filters">
      <FilterSelect label="Game" options={GAME_OPTIONS} value={filters.game} onChange={(v) => onChange({ game: v as TournamentFilters['game'] })} />
      <FilterSelect label="Buy-in" options={BUYIN_OPTIONS} value={filters.buyin} onChange={(v) => onChange({ buyin: v as TournamentFilters['buyin'] })} />
      <FilterSelect label="Status" options={STATUS_OPTIONS} value={filters.status} onChange={(v) => onChange({ status: v as TournamentFilters['status'] })} />
      <FilterSelect label="Speed" options={SPEED_OPTIONS} value={filters.speed} onChange={(v) => onChange({ speed: v as TournamentFilters['speed'] })} />
      <label className={'tf-check' + (filters.registeredOnly ? ' on' : '')}>
        <input
          type="checkbox"
          checked={filters.registeredOnly}
          onChange={(e) => onChange({ registeredOnly: e.target.checked })}
        />
        Registered only
      </label>
      <input
        className="admin-input tf-search"
        type="search"
        aria-label="Search tournaments"
        placeholder="Search tournaments…"
        maxLength={TOURNAMENT_SEARCH_MAX}
        value={filters.search}
        onChange={(e) => onChange({ search: e.target.value })}
      />
      <span className="tf-count" aria-live="polite">
        Filters{count > 0 && <> · <b>{count}</b></>}
      </span>
      <button type="button" className="tf-reset" disabled={count === 0} onClick={onReset}>Reset</button>
    </div>
  );
}
