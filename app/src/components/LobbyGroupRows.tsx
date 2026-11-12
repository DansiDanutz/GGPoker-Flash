import React from 'react';
import { LobbyTable, money } from '../lib/api';
import {
  COLUMN_LABEL, ColumnId, columnsFor, promotionOf, tableSizeChip, VARIANT_LABEL, variantOf,
} from '../lib/lobbyFilters';
import { GroupCardAction } from './GroupCardAction';

type LobbyGroupRowsProps = {
  tab: string;
  tables: readonly LobbyTable[];
  allTables: readonly LobbyTable[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onJoin: (table: LobbyTable) => void;
  onChanged: () => void;
};

type CellProps = Omit<LobbyGroupRowsProps, 'tab' | 'tables' | 'selectedId' | 'onSelect'> & { table: LobbyTable };

function Cell({ column, table, allTables, onJoin, onChanged }: CellProps & { column: ColumnId }) {
  switch (column) {
    case 'promotion': return <span className="lob-promo">{promotionOf(table)}</span>;
    case 'tableSize': {
      const chip = tableSizeChip(table.seats);
      return <span className={`lob-size lob-size-${chip.tone}`}>{chip.label}</span>;
    }
    case 'games': {
      const variant = variantOf(table);
      return <span className={`lob-game lob-game-${variant}`}>{VARIANT_LABEL[variant]}</span>;
    }
    case 'stakes': return <span className="lob-num">{money(table.sb, true)} / {money(table.bb, true)}</span>;
    case 'buyin': return <span className="lob-num">{money(table.min_buyin, true)}</span>;
    case 'players': return <span className="lob-players" aria-label={`${table.players} of ${table.seats} players`}>👤 {table.players}</span>;
    case 'pros': return <span className="lob-num">{table.pro ? 1 : 0}</span>;
    case 'handsHr': return <span className="lob-num">{table.handsPerHour}</span>;
    case 'action': return <GroupCardAction table={table} allTables={allTables} onJoin={onJoin} onChanged={onChanged} />;
  }
}

/**
 * Group View list with the native per-tab column set (P0 slice W5a). One row per table for
 * now; folding tables into stake groups is slice F2.
 */
export function LobbyGroupRows({ tab, tables, allTables, selectedId, onSelect, onJoin, onChanged }: LobbyGroupRowsProps) {
  const columns = columnsFor(tab);
  // Promotion pill is ≈108 px native (brief §1.1); Action holds the 120 px Join button.
  const grid = { gridTemplateColumns: `112px repeat(${columns.length - 2}, minmax(0, 1fr)) 128px` };
  return (
    <div className="lob-group" role="table" aria-label="Tables">
      <div className="lob-ghead" role="row" style={grid}>
        {columns.map((c) => <div key={c} role="columnheader">{COLUMN_LABEL[c]}</div>)}
      </div>
      {tables.map((t) => (
        <div
          key={t.id}
          role="row"
          className={`lob-grow lob-acc-${variantOf(t)}` + (selectedId === t.id ? ' selected' : '')}
          style={grid}
          onClick={() => onSelect(t.id)}
          onDoubleClick={() => onJoin(t)}
        >
          {columns.map((c) => (
            <div key={c} role="cell" className={`lob-c-${c}`} data-label={COLUMN_LABEL[c]}>
              <Cell column={c} table={t} allTables={allTables} onJoin={onJoin} onChanged={onChanged} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
