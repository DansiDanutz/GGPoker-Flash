import React from 'react';
import { GAME_LABEL, money, type LobbyTable } from '../../lib/api';
import { gameTone, maxLabel } from '../../lib/phoneTables';
import { NavGlyph } from './PhoneIcons';

/**
 * Phone cash-table list (mobile reference M31, M34–M36): a coloured game tag down the left edge,
 * format chips over the stakes, the minimum buy-in, and a seated-players pill. A tap opens the buy-in.
 */
export function MobileTableRows({ tables, onJoin }: { tables: readonly LobbyTable[]; onJoin: (t: LobbyTable) => void }) {
  return (
    <div className="mt-list" role="list">
      {tables.map((t) => {
        const tone = gameTone(t.game);
        const label = GAME_LABEL[t.game] || t.game;
        return (
          <button key={t.id} type="button" role="listitem" className={`mt-row tone-${tone}`} onClick={() => onJoin(t)} aria-label={`${t.name}, ${label}, ${money(t.sb, true)}/${money(t.bb, true)}, ${t.players} of ${t.seats} seated`}>
            <span className="mt-tag" aria-hidden="true"><i>{label}</i></span>
            <span className="mt-main">
              <span className="mt-chips">
                <i className="mt-chip">{t.name}</i>
                <i className="mt-chip mt-max">{maxLabel(t.seats)}</i>
                {t.ante > 0 && <i className="mt-chip">Ante {money(t.ante, true)}</i>}
              </span>
              <b className="mt-stakes">{money(t.sb, true)} / {money(t.bb, true)}</b>
            </span>
            <span className="mt-buyin"><small>Buy-in</small><b>{money(t.min_buyin, true)}</b></span>
            <span className={'mt-seats' + (t.players >= t.seats ? ' full' : '')}>
              <NavGlyph name="people" size={16} />
              {t.players}
              {t.wait > 0 && <em>+{t.wait}</em>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
