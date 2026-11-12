import React, { useMemo } from 'react';
import { LobbyTable, money } from '../lib/api';
import {
  COLUMN_LABEL, ColumnId, columnsFor, groupTables, promotionOf, TableGroup, tableGroupKey, tableSizeChip,
  VARIANT_LABEL, variantOf,
} from '../lib/lobbyFilters';
import { useWaitlist } from '../lib/waitlistState';
import { GroupCardAction } from './GroupCardAction';

type LobbyGroupRowsProps = {
  tab: string;
  /** The filtered list: decides which stake rows show. */
  tables: readonly LobbyTable[];
  /** Every lobby table: each row sums and seats across its whole group, not just the filtered tables. */
  allTables: readonly LobbyTable[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onJoin: (table: LobbyTable) => void;
  onChanged: () => void;
};

type CellProps = { group: TableGroup; wait: number; onJoin: (table: LobbyTable) => void; onChanged: () => void };

const sum = (tables: readonly LobbyTable[], pick: (t: LobbyTable) => number) => tables.reduce((n, t) => n + pick(t), 0);

function Cell({ column, group, wait, onJoin, onChanged }: CellProps & { column: ColumnId }) {
  const [first] = group.tables;
  switch (column) {
    case 'promotion': return <span className="lob-promo">{promotionOf({ featured: group.tables.some((t) => t.featured), category: first.category })}</span>;
    case 'tableSize': {
      const chip = tableSizeChip(group.seats);
      return <span className={`lob-size lob-size-${chip.tone}`}>{chip.label}</span>;
    }
    case 'games': {
      const variant = variantOf(first);
      return <span className={`lob-game lob-game-${variant}`}>{VARIANT_LABEL[variant]}</span>;
    }
    case 'stakes': return <span className="lob-num">{money(group.sb, true)} / {money(group.bb, true)}</span>;
    case 'buyin': return <span className="lob-num">{money(first.min_buyin, true)}</span>;
    case 'players': return (
      <span className="lob-players-cell">
        <span className="lob-players" aria-label={`${group.players} players at ${group.tables.length} tables`}>👤 {group.players}</span>
        {wait > 0 && <span className="lob-wait" aria-label={`${wait} waiting`}>Wait {wait}</span>}
      </span>
    );
    case 'pros': return <span className="lob-num">{sum(group.tables, (t) => (t.pro ? 1 : 0))}</span>;
    case 'handsHr': return <span className="lob-num">{Math.round(sum(group.tables, (t) => t.handsPerHour) / group.tables.length)}</span>;
    case 'action': return <GroupCardAction group={group} onJoin={onJoin} onChanged={onChanged} />;
  }
}

/**
 * Group View as native stake rows (P0 slice F2): one row per `game + sb + bb + seats`,
 * ordered by stakes descending, with summed players, the real wait and a group Join.
 * Private tables never fold into a group.
 */
export function LobbyGroupRows({ tab, tables, allTables, selectedId, onSelect, onJoin, onChanged }: LobbyGroupRowsProps) {
  const { queues } = useWaitlist();
  const columns = columnsFor(tab);
  const groups = useMemo(() => {
    const visible = new Set(tables.map(tableGroupKey));
    return groupTables(allTables).filter((g) => visible.has(g.key));
  }, [tables, allTables]);
  // The group queue is only visible once you are in it; then its size joins the table queues.
  const groupQueueSize = (key: string) => queues.find((q) => q.kind === 'group' && q.groupKey === key)?.size ?? 0;
  // Promotion pill is ≈108 px native (brief §1.1); Action holds the 120 px Join button.
  const grid = { gridTemplateColumns: `112px repeat(${columns.length - 2}, minmax(0, 1fr)) 128px` };
  return (
    <div className="lob-group" role="table" aria-label="Stakes">
      <div className="lob-ghead" role="row" style={grid}>
        {columns.map((c) => <div key={c} role="columnheader">{COLUMN_LABEL[c]}</div>)}
      </div>
      {groups.map((g) => {
        const target = g.firstFree ?? g.tables[0];
        const isSelected = g.tables.some((t) => t.id === selectedId);
        return (
          <div
            key={g.key}
            role="row"
            className={`lob-grow lob-acc-${variantOf(g.tables[0])}` + (isSelected ? ' selected' : '')}
            style={grid}
            onClick={() => onSelect(target.id)}
            onDoubleClick={() => { if (g.firstFree) onJoin(g.firstFree); }}
          >
            {columns.map((c) => (
              <div key={c} role="cell" className={`lob-c-${c}`} data-label={COLUMN_LABEL[c]}>
                <Cell column={c} group={g} wait={g.wait + groupQueueSize(g.key)} onJoin={onJoin} onChanged={onChanged} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
