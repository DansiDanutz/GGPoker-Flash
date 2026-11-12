import React, { useEffect, useId, useRef, useState } from 'react';
import { activeFilterCount, SEARCH_MAX, TabFilters } from '../lib/lobbyFilters';

type Option = { readonly value: string; readonly label: string; readonly title?: string };

const STAKE_CHOICES: readonly Option[] = [
  { value: 'all', label: 'All' },
  { value: 'low', label: 'Low', title: 'Micro / low ($0–$2 BB)' },
  { value: 'mid', label: 'Mid', title: 'Mid ($2–$20 BB)' },
  { value: 'high', label: 'High', title: 'High ($20+ BB)' },
];
const SEAT_CHOICES: readonly Option[] = [
  { value: 'all', label: 'All' }, { value: '6', label: '6-max' }, { value: '9', label: '9-max' }, { value: '3', label: '3-max' },
];
const SPEED_CHOICES: readonly Option[] = [
  { value: 'all', label: 'All' }, { value: 'Normal', label: 'Normal' }, { value: 'Fast', label: 'Fast' },
];

type Toggle = { readonly key: 'hideFull' | 'hasSeats' | 'favOnly'; readonly label: string; readonly hint: string };

const TOGGLES: readonly Toggle[] = [
  { key: 'hideFull', label: 'Hide full', hint: 'Hide tables with every seat taken' },
  { key: 'hasSeats', label: 'Has seats', hint: 'Only tables with a free seat and nobody waiting' },
  { key: 'favOnly', label: '★ Favorites', hint: 'Only tables you starred' },
];

type SegmentProps = {
  label: string;
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
};

function Segment({ label, options, value, onChange }: SegmentProps) {
  return (
    <div className="lob-fgroup">
      <div className="lob-flabel">{label}</div>
      <div className="lob-fseg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            title={o.title}
            className={'lob-pill' + (value === o.value ? ' on' : '')}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type LobbyFiltersPopoverProps = {
  filters: TabFilters;
  tableCount: number;
  onChange: (patch: Partial<TabFilters>) => void;
  onReset: () => void;
};

/**
 * "Filters" button at the right of the pill row and its popover (P0 slice W5b, visual
 * brief §1.5): stakes, seats, speed, search, Hide full, Has seats and ★ Favorites, with
 * Reset and the table count in the footer. The button shows how many are active.
 */
export function LobbyFiltersPopover({ filters, tableCount, onChange, onReset }: LobbyFiltersPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const titleId = useId();
  const active = activeFilterCount(filters);

  // Close on Esc (focus returns to the button) and on a click outside; focus the first control on open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    popoverRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [isOpen]);

  return (
    <div className="lob-filters-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={'lob-pill lob-filters-btn' + (isOpen ? ' open' : '')}
        aria-expanded={isOpen}
        aria-controls={popoverId}
        aria-label={active ? `Filters, ${active} active` : 'Filters'}
        onClick={() => setIsOpen((v) => !v)}
      >
        Filters{active > 0 && <> · <b>{active}</b></>}
      </button>
      {isOpen && (
        <div ref={popoverRef} id={popoverId} className="lob-filters-pop" role="dialog" aria-labelledby={titleId}>
          <div id={titleId} className="sr-only">Table filters</div>
          <Segment label="Stakes" options={STAKE_CHOICES} value={filters.stake} onChange={(stake) => onChange({ stake })} />
          <Segment label="Seats" options={SEAT_CHOICES} value={filters.seats} onChange={(seats) => onChange({ seats })} />
          <Segment label="Speed" options={SPEED_CHOICES} value={filters.speed} onChange={(speed) => onChange({ speed })} />
          <input
            className="lob-fsearch"
            type="search"
            value={filters.search}
            maxLength={SEARCH_MAX}
            aria-label="Search tables"
            placeholder="Search tables…"
            onChange={(e) => onChange({ search: e.target.value })}
          />
          <div className="lob-fchecks">
            {TOGGLES.map((t) => (
              <label key={t.key} className="lob-fcheck" title={t.hint}>
                <input type="checkbox" checked={filters[t.key]} onChange={(e) => onChange({ [t.key]: e.target.checked })} />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
          <div className="lob-ffoot">
            <button type="button" className="lob-link" disabled={active === 0} onClick={onReset}>Reset</button>
            <span className="lob-fcount" aria-live="polite">{tableCount} {tableCount === 1 ? 'table' : 'tables'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
