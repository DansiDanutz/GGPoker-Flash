import React from 'react';
import type { LobbyTable } from '../../lib/api';
import { gameSummaries, MOBILE_GAMES } from '../../lib/mobileLobby';
import { GameBadge, NavGlyph } from './PhoneIcons';

/** Phone Poker tab: one row per game type with live player counts; a tap opens that game's tables. */
export function MobileGameList({ tables, onPick }: { tables: readonly LobbyTable[]; onPick: (tab: string) => void }) {
  const players = Object.fromEntries(gameSummaries(tables).map((g) => [g.key, g.players]));
  return (
    <div className="mg">
      <h1 className="sr-only">Poker games</h1>
      {MOBILE_GAMES.map((g) => (
        <button key={g.key} type="button" className="mg-row" onClick={() => onPick(g.key)}>
          <span className="mg-top">
            <GameBadge name={g.icon} size={66} />
            <b>{g.label}</b>
          </span>
          <span className="mg-pills">
            <i className="mg-players"><NavGlyph name="people" size={18} />{(players[g.key] || 0).toLocaleString()}</i>
            <i className="mg-perk"><NavGlyph name="gift" size={18} />{g.perk}</i>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Back bar above a phone game's table list. */
export function MobileBackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="m-backbar">
      <button type="button" onClick={onBack} aria-label="Back to games"><NavGlyph name="back" size={22} /></button>
      <b>{title}</b>
    </div>
  );
}
