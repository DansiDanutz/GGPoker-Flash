import React, { useEffect, useState } from 'react';

export function BattleRoom({ room, userId, busy, onAction }: { room: any; userId: number | null; busy: boolean; onAction: (room: any, action: string, amount?: number) => void }) {
  const table = room.table;
  const me = table.players.find((player: any) => player.isMe);
  const myTurn = userId != null && table.actor === userId;
  const toCall = Math.max(0, (table.currentBet || 0) - (me?.bet || 0));
  const shootout = room.stage === 'shootout';
  const [raiseTo, setRaiseTo] = useState(table.maxRaiseTo || 0);
  useEffect(() => { setRaiseTo(Math.max(table.minRaise || 0, Math.min(table.maxRaiseTo || 0, me ? me.stack + me.bet : 0))); }, [table.handId, table.actor, table.currentBet, table.maxRaiseTo]);
  const seconds = room.clock ? Math.max(0, Math.ceil((room.clock.actionEndsAt - Date.now()) / 1000)) : null;
  return (
    <section className="battle-room" aria-labelledby={`battle-room-${room.roomId}`}>
      <div className="battle-room-heading">
        <div><small>{room.stage} · round {room.round}</small><h2 id={`battle-room-${room.roomId}`}>Hand {table.handNo}</h2></div>
        {seconds != null && <span className="battle-clock" role="timer" aria-label={`${seconds} seconds remaining`}>{seconds}s</span>}
      </div>
      <div className="battle-board" aria-label={table.board.length ? `Community cards ${table.board.join(', ')}` : 'No community cards yet'}>
        {table.board.length ? table.board.map((card: string, index: number) => <span className="battle-card-face" key={`${card}-${index}`}>{card}</span>) : <span>Waiting for the flop</span>}
      </div>
      <p className="battle-pot">Pot <strong>{table.pot.toLocaleString()}</strong> chips · {table.street}</p>
      <div className="battle-players">
        {table.players.filter((player: any) => !player.empty).map((player: any) => <article className={`battle-player${player.id === table.actor ? ' battle-player-active' : ''}`} key={player.id}>
          <div><strong>{player.nick}{player.isMe ? ' (you)' : ''}</strong><span>{player.stack.toLocaleString()} chips{player.folded ? ' · folded' : player.allIn ? ' · all-in' : ''}</span></div>
          <div className="battle-hole-cards" aria-label={player.isMe ? `Your cards ${player.cards.join(', ')}` : `${player.nick}'s hidden cards`}>
            {player.cards.map((card: string, index: number) => <span className={card === '??' ? 'battle-card-back' : 'battle-card-face'} key={index}>{card}</span>)}
          </div>
          {player.bet > 0 && <small>Bet {player.bet.toLocaleString()}</small>}
        </article>)}
      </div>
      {table.result?.winners?.length > 0 && <p className="battle-hand-result" role="status">{table.result.winners.map((winner: any) => `${winner.nick} won ${winner.amount.toLocaleString()}`).join(' · ')}</p>}
      {myTurn && me && <div className="battle-turn" aria-label="Your actions">
        <p role="status">Your turn{toCall ? ` · ${toCall.toLocaleString()} chips to call` : ''}{room.clock?.bankStartedAt ? ' · time bank active' : ''}</p>
        <div className="battle-turn-actions">
          <button className="btn btn-ghost" data-battle-action="fold" disabled={busy} onClick={() => onAction(room, 'fold')}>Fold</button>
          {!shootout && (toCall > 0
            ? <button className="btn btn-red" data-battle-action="call" disabled={busy} onClick={() => onAction(room, 'call')}>Call {toCall.toLocaleString()}</button>
            : <button className="btn btn-red" data-battle-action="check" disabled={busy} onClick={() => onAction(room, 'check')}>Check</button>)}
          <button className="btn btn-red" data-battle-action="allin" disabled={busy} onClick={() => onAction(room, 'allin')}>All-in {(me.stack + me.bet).toLocaleString()}</button>
        </div>
        {!shootout && table.maxRaiseTo > table.minRaise && <form className="battle-raise" onSubmit={(event) => { event.preventDefault(); onAction(room, 'raise', raiseTo); }}>
          <label htmlFor={`battle-raise-${room.roomId}`}>Raise to (chips)</label>
          <div><input id={`battle-raise-${room.roomId}`} type="number" min={table.minRaise} max={table.maxRaiseTo} step={table.bb} value={raiseTo} onChange={(event) => setRaiseTo(Number(event.target.value))} disabled={busy} />
            <button className="btn btn-ghost" type="submit" data-battle-action="raise" disabled={busy || !Number.isSafeInteger(raiseTo) || raiseTo < table.minRaise || raiseTo > table.maxRaiseTo}>Raise</button></div>
        </form>}
      </div>}
      {!myTurn && me && !me.folded && table.street !== 'ended' && <p className="battle-waiting" role="status">Waiting for the other player.</p>}
    </section>
  );
}
