import React from 'react';
import type { DockItem, DockKey } from '../../game/tableArt';

type Props = {
  items: DockItem[];
  active: Partial<Record<DockKey, boolean>>;
  disabled?: Partial<Record<DockKey, boolean>>;
  onPick: (key: DockKey) => void;
};

/** Round quick-control buttons beside the table: straddle, sit out, add chips, history. */
export function SeatDock({ items, active, disabled = {}, onPick }: Props) {
  if (!items.length) return null;
  return (
    <div className="seat-dock" role="toolbar" aria-label="Seat controls">
      {items.map((item) => {
        const toggle = item.key in active;
        return (
          <button
            key={item.key}
            type="button"
            className={'dock-btn' + (active[item.key] ? ' on' : '')}
            data-tip={item.label}
            aria-label={item.label}
            aria-pressed={toggle ? !!active[item.key] : undefined}
            disabled={!!disabled[item.key]}
            onClick={() => onPick(item.key)}
          >
            <img src={item.icon} alt="" draggable={false} />
          </button>
        );
      })}
    </div>
  );
}
