import React from 'react';
import { pillsFor } from '../lib/lobbyFilters';

type LobbyPillsProps = {
  tab: string;
  value: string;
  onChange: (pillId: string) => void;
};

/** Native pill filters (All / Hold'em / PLO …) under the game tab; renders nothing on tabs without pills. */
export function LobbyPills({ tab, value, onChange }: LobbyPillsProps) {
  const pills = pillsFor(tab);
  if (!pills.length) return null;
  return (
    <div className="lob-pills" role="radiogroup" aria-label="Game filter">
      {pills.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          className={'lob-pill' + (value === p.id ? ' on' : '')}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
