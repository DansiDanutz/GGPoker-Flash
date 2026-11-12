import React from 'react';
import { LobbyTable, money, RushPool } from '../lib/api';
import { COLUMN_LABEL, ColumnId, columnsFor, promotionOf, VARIANT_LABEL } from '../lib/lobbyFilters';
import { playersLabel, poolAsGroup, poolVariant } from '../lib/rushPools';
import { GroupCardAction } from './GroupCardAction';

type RowProps = {
  pool: RushPool;
  /** Every lobby table, so Join can open the buy-in sheet for the pool's free table. */
  allTables: readonly LobbyTable[];
  isSelected: boolean;
  onSelect: (id: string) => void;
  onJoin: (table: LobbyTable) => void;
  onChanged: () => void;
};

type ListProps = Omit<RowProps, 'pool' | 'isSelected'> & { pools: readonly RushPool[]; selectedId: string | null };

const COLUMNS = columnsFor('rush');
// Promotion pill ≈108 px native; Action holds the 120 px Join button (same grid as Group View).
const GRID = { gridTemplateColumns: `112px repeat(${COLUMNS.length - 2}, minmax(0, 1fr)) 128px` };

function Cell({ column, pool, allTables, onJoin, onChanged }: Omit<RowProps, 'isSelected' | 'onSelect'> & { column: ColumnId }) {
  switch (column) {
    case 'promotion': return <span className="lob-promo">{promotionOf(pool)}</span>;
    case 'games': {
      const variant = poolVariant(pool);
      return <span className={`lob-game lob-game-${variant}`}>{VARIANT_LABEL[variant]}</span>;
    }
    case 'stakes': return <span className="lob-num">{money(pool.sb, true)} / {money(pool.bb, true)}</span>;
    case 'buyin': return <span className="lob-num">{money(pool.min_buyin, true)}</span>;
    case 'players': return (
      <span className="lob-players-cell">
        <span className="lob-players" aria-label={`${playersLabel(pool.players)} in ${pool.tables} tables`}>👤 {pool.players}</span>
        {pool.wait > 0 && <span className="lob-wait" aria-label={`${pool.wait} waiting`}>Wait {pool.wait}</span>}
      </span>
    );
    case 'pros': return <span className="lob-num">{pool.pros}</span>;
    case 'handsHr': return <span className="lob-num">{pool.handsPerHour}</span>;
    case 'action': return <GroupCardAction group={poolAsGroup(pool, allTables)} onJoin={onJoin} onChanged={onChanged} />;
    default: return null;
  }
}

/** One native Rush pool row (P0 slice R3): one row per pool, not per table. */
export function RushPoolRow({ pool, allTables, isSelected, onSelect, onJoin, onChanged }: RowProps) {
  const group = poolAsGroup(pool, allTables);
  const target = group.firstFree ?? group.tables[0];
  return (
    <div
      role="row"
      className={`lob-grow lob-acc-${poolVariant(pool)}` + (isSelected ? ' selected' : '')}
      style={GRID}
      onClick={() => { if (target) onSelect(target.id); }}
      onDoubleClick={() => { if (group.firstFree) onJoin(group.firstFree); }}
    >
      {COLUMNS.map((c) => (
        <div key={c} role="cell" className={`lob-c-${c}`} data-label={COLUMN_LABEL[c]}>
          <Cell column={c} pool={pool} allTables={allTables} onJoin={onJoin} onChanged={onChanged} />
        </div>
      ))}
    </div>
  );
}

/** The Rush tab list: native header and one {@link RushPoolRow} per visible pool. */
export function RushPoolRows({ pools, allTables, selectedId, onSelect, onJoin, onChanged }: ListProps) {
  return (
    <div className="lob-group rush-pools" role="table" aria-label="Fast Fold pools">
      <div className="lob-ghead" role="row" style={GRID}>
        {COLUMNS.map((c) => <div key={c} role="columnheader">{COLUMN_LABEL[c]}</div>)}
      </div>
      {pools.map((p) => (
        <RushPoolRow
          key={p.poolKey}
          pool={p}
          allTables={allTables}
          isSelected={allTables.some((t) => t.id === selectedId && `${t.game}:${t.sb}/${t.bb}` === p.poolKey)}
          onSelect={onSelect}
          onJoin={onJoin}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}
