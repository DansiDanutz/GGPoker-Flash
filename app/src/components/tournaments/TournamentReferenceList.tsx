import React, { useMemo, useState } from 'react';
import { money } from '../../lib/api';
import { Countdown } from '../PageShell';
import { phaseOf, PHASE_LABEL, type TournamentFilters } from '../../lib/tournamentFilters';

const CREATIVE = '/assets/gg-creatives';

const SERIES_TABS = [
  { key: 'all', label: 'Tournaments', art: 'series-tab-tournaments.jpg' },
  { key: 'all', label: 'GGMillion$ Festival', art: 'series-tab-0.jpg' },
  { key: 'all', label: 'PLO Series', art: 'series-tab-1.jpg' },
  { key: 'ggmasters', label: 'GGMasters', art: 'series-tab-2.jpg' },
  { key: 'wsop', label: 'WSOP Express', art: 'series-tab-3.jpg' },
  { key: 'spin', label: 'Spin & Gold', art: 'series-tab-4.jpg' },
  { key: 'mystery', label: 'Mystery Battle Royale', art: 'series-tab-5.jpg' },
  { key: 'quickflip', label: 'Flip & Go', art: 'series-tab-6.jpg' },
];

const CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'ggmasters', label: 'GGMasters' },
  { key: 'bounty', label: 'Bounty Hunters' },
  { key: 'mystery', label: 'Mystery Battle Royale' },
  { key: 'spin', label: 'Spin & Gold' },
  { key: 'quickflip', label: 'Flip & Go' },
  { key: 'satellites', label: 'Satellites' },
  { key: 'live', label: 'Live Series' },
];

const BUYIN_BANDS: { key: TournamentFilters['buyin']; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'free', label: 'Freeroll' },
  { key: 'micro', label: 'Low' },
  { key: 'low', label: 'Medium' },
  { key: 'mid', label: 'High' },
  { key: 'high', label: 'Super' },
];

const statusText = (t: any, now: number) => {
  const phase = phaseOf(t, now);
  if (phase === 'running') return 'Running';
  if (phase === 'late') return 'Late Reg.';
  if (phase === 'completed') return 'Finished';
  return 'Standby';
};

type Props = {
  list: readonly any[];
  registered: readonly string[];
  busy: string | null;
  filters: TournamentFilters;
  onChange: (patch: Partial<TournamentFilters>) => void;
  onReset: () => void;
  onLobby: (t: any) => void;
  onRegister: (t: any) => void;
  onPlay: (t: any) => void;
  balance: number;
};

export function TournamentReferenceList({ list, registered, busy, filters, onChange, onReset, onLobby, onRegister, onPlay, balance }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'filters' | 'details'>('filters');
  const now = Date.now();
  const selected = useMemo(() => list.find((t) => t.id === selectedId) || list[0] || null, [list, selectedId]);
  const isReg = selected ? registered.includes(selected.id) : false;
  const totalGtd = list.reduce((n, t) => n + (t.gtd || 0), 0);

  return (
    <div className="tref">
      <nav className="tref-series" aria-label="Tournament series">
        {SERIES_TABS.map((tab, i) => (
          <button
            key={tab.art}
            type="button"
            className={'tref-series-tab' + (i === 0 ? ' on' : '')}
            title={tab.label}
            aria-label={tab.label}
            onClick={() => onChange({ category: tab.key })}
          >
            <img src={`${CREATIVE}/${tab.art}`} alt="" />
          </button>
        ))}
      </nav>

      <div className="tref-chips" role="tablist" aria-label="Tournament filters">
        {CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            role="tab"
            aria-selected={filters.category === chip.key}
            className={'tref-chip' + (filters.category === chip.key ? ' on' : '')}
            onClick={() => onChange({ category: chip.key })}
          >{chip.label}</button>
        ))}
        <button type="button" className="tref-chip tref-chip-more" aria-label="More filters" onClick={() => onChange({ category: 'all' })}>›</button>
      </div>

      <div className="tref-body">
        <div className="tref-main">
          <div className="tref-head">
            <span>Start <i aria-hidden="true">▲</i></span>
            <span>Event Name</span>
            <span>Buy-in</span>
            <span>Players</span>
            <span>Prize</span>
            <label className="tref-search">
              <input
                type="search"
                value={filters.search}
                maxLength={60}
                placeholder="Search tournaments and players"
                onChange={(e) => onChange({ search: e.target.value })}
                aria-label="Search tournaments"
              />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </label>
          </div>

          <div className="tref-rows">
            {list.map((t) => {
              const phase = phaseOf(t, now);
              const reg = registered.includes(t.id);
              const rowSelected = selected?.id === t.id;
              return (
                <div
                  key={t.id}
                  className={'tref-row phase-' + phase + (rowSelected ? ' on' : '') + ' mode-' + String(t.mode || 'standard').toLowerCase()}
                  onClick={() => { setSelectedId(t.id); setPanel('details'); }}
                  onDoubleClick={() => onLobby(t)}
                >
                  <div className="tref-start">
                    <b>{statusText(t, now)}</b>
                    <small>{phase === 'registering' ? <Countdown to={t.start_at} /> : new Date(t.start_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</small>
                  </div>
                  <div className="tref-name">
                    <span className={'tref-dot ' + (String(t.mode).toLowerCase() === 'bounty' ? 'gold' : String(t.mode).toLowerCase() === 'mystery' ? 'purple' : 'green')} aria-hidden="true" />
                    <b>{t.name}</b>
                    {reg && <em>Registered</em>}
                  </div>
                  <div className="tref-buyin">{t.buyin === 0 ? 'Freeroll' : money(t.buyin + t.fee)}</div>
                  <div className="tref-players">{(t.entrants || 0).toLocaleString()}</div>
                  <div className="tref-prize">{money(t.gtd || 0, true)}</div>
                </div>
              );
            })}
            {!list.length && <div className="tref-empty">No tournaments match these filters. <button type="button" onClick={onReset}>Reset</button></div>}
          </div>
        </div>

        <aside className="tref-side">
          <div className="tref-side-tabs" role="tablist" aria-label="Tournament panel">
            <button type="button" role="tab" aria-selected={panel === 'filters'} className={panel === 'filters' ? 'on' : ''} onClick={() => setPanel('filters')}>Filters</button>
            <button type="button" role="tab" aria-selected={panel === 'details'} className={panel === 'details' ? 'on' : ''} onClick={() => { if (!selected && list[0]) setSelectedId(list[0].id); setPanel('details'); }}>Details</button>
          </div>

          {panel === 'filters' && (<>
          <div className="tref-side-card">
            <div className="tref-side-title">Filter</div>
            <div className="tref-side-sub"><span>Buy-in</span><button type="button" onClick={onReset}>Reset</button></div>
            <div className="tref-band-grid">
              {BUYIN_BANDS.map((b) => (
                <button key={b.key} type="button" className={filters.buyin === b.key ? 'on' : ''} onClick={() => onChange({ buyin: b.key })}>{b.label}</button>
              ))}
            </div>
          </div>

          <div className="tref-side-card">
            <div className="tref-side-title">Summary</div>
            <div className="tref-kv"><span>Events</span><b>{list.length}</b></div>
            <div className="tref-kv"><span>Guarantees</span><b className="gold">{money(totalGtd, true)}</b></div>
            <div className="tref-kv"><span>Balance</span><b>{money(balance)}</b></div>
          </div>

          <div className="tref-side-actions">
            <button type="button" className="tref-btn" disabled={!selected} onClick={() => selected && onLobby(selected)}>Tournament Lobby</button>
            {isReg ? (
              <button type="button" className="tref-btn primary" disabled={!selected || busy === selected.id} onClick={() => selected && onPlay(selected)}>Play</button>
            ) : (
              <button type="button" className="tref-btn primary" disabled={!selected || busy === selected?.id} onClick={() => selected && onRegister(selected)}>Register</button>
            )}
          </div>
          </>)}

          {panel === 'details' && (
            selected ? (
              <div className="tref-detail">
                <div className="tref-detail-kicker">{String(selected.mode || 'STANDARD').replace(/_/g, ' ')} · {selected.format}</div>
                <h3>{selected.name}</h3>
                <div className="tref-detail-tags">
                  <span>#{String(selected.mode || 'standard').toLowerCase()}</span>
                  <span>#{String(selected.format || 'nlh').toLowerCase()}</span>
                  {selected.buyin === 0 && <span>#freeroll</span>}
                  {(selected.late_reg || 0) > 45 && <span>#late-reg</span>}
                </div>
                <div className="tref-detail-status">{statusText(selected, now)} · starts {new Date(selected.start_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                <div className="tref-side-card">
                  <div className="tref-kv"><span>Buy-in</span><b>{selected.buyin === 0 ? 'Freeroll' : money(selected.buyin + selected.fee)}</b></div>
                  <div className="tref-kv"><span>Guarantee</span><b className="gold">{money(selected.gtd || 0, true)}</b></div>
                  <div className="tref-kv"><span>Prize pool</span><b>{money((selected.entrants || 0) * (selected.buyin || 0), true)}</b></div>
                  <div className="tref-kv"><span>Overlay</span><b>{money(Math.max(0, (selected.gtd || 0) - (selected.entrants || 0) * (selected.buyin || 0)), true)}</b></div>
                  <div className="tref-kv"><span>Players</span><b>{(selected.entrants || 0).toLocaleString()}</b></div>
                  <div className="tref-kv"><span>Starting chips</span><b>{(selected.starting_stack || 0).toLocaleString()}</b></div>
                  <div className="tref-kv"><span>Blind interval</span><b>{selected.blind_speed || 0} min</b></div>
                  <div className="tref-kv"><span>Late reg ends</span><b>{new Date(new Date(selected.start_at).getTime() + (selected.late_reg || 0) * 60000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b></div>
                </div>
                <div className="tref-side-actions">
                  {isReg ? (
                    <button type="button" className="tref-btn primary" disabled={busy === selected.id} onClick={() => onPlay(selected)}>Play</button>
                  ) : (
                    <button type="button" className="tref-btn primary" disabled={busy === selected.id} onClick={() => onRegister(selected)}>Register</button>
                  )}
                  <button type="button" className="tref-btn" onClick={() => onLobby(selected)}>Full lobby</button>
                  <button type="button" className="tref-detail-back" onClick={() => setPanel('filters')}>← Back to filters</button>
                </div>
              </div>
            ) : (
              <div className="tref-side-card"><div className="tref-side-sub"><span>Pick an event to see its details.</span></div></div>
            )
          )}
        </aside>
      </div>
    </div>
  );
}
