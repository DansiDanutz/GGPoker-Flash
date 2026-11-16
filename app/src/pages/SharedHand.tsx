import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PlayingCard } from '../components/Card';
import { handExportFileName, handExportLines } from '../lib/handDetail';
import { downloadBlob, renderHandPng } from '../lib/handPng';

export function SharedHand({ shareId }: { shareId: string }) {
  const [hand, setHand] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const result = await api.sharedHand(shareId);
      setHand(result.hand);
      setError('');
    } catch (reason: any) {
      setHand(null);
      setError(reason.message || 'This shared hand is unavailable.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [shareId]);

  const exportPng = async () => {
    setExporting(true);
    setError('');
    try {
      const model = {
        ...hand, id: hand.handId, handNo: hand.handId, created_at: hand.playedAt, pot: hand.result.pot,
        players: hand.players.map((player: any) => ({ ...player, cards: player.publicCards, stack: player.stackBefore, win: player.award })),
      };
      const lines = handExportLines(model, { unit: 'chips', viewerId: null, money: (value: number) => `${value.toLocaleString()} chips` });
      const blob = await renderHandPng(lines, `DanGG public shared hand · ${hand.playedAt?.slice(0, 16) || ''}`);
      downloadBlob(blob, handExportFileName(model));
    } catch (reason: any) { setError(reason.message || 'PNG export failed'); }
    finally { setExporting(false); }
  };

  return (
    <main className="shared-hand">
      <header className="shared-hand-header"><strong>DanGG</strong><span>Public shared hand · play money</span></header>
      {loading && <p role="status">Loading shared hand…</p>}
      {error && !hand && <section role="alert"><h1>Shared hand unavailable</h1><p>{error}</p><button className="btn btn-red" onClick={load}>Retry</button></section>}
      {hand && <>
        <div className="shared-hand-title"><div><small>{hand.game}</small><h1>{hand.tableName}</h1><p>{hand.playedAt}</p></div><button className="btn btn-ghost" disabled={exporting} onClick={exportPng}>{exporting ? 'Exporting…' : 'Export PNG'}</button></div>
        {error && <p role="alert">{error}</p>}
        <section className="shared-hand-board" aria-label={`Community cards ${hand.board || 'none'}`}>
          <h2>Community cards</h2>
          <div>{(hand.board || '').split(' ').filter(Boolean).map((card: string, index: number) => <PlayingCard key={index} card={card} />)}</div>
          <p>Pot {hand.result.pot.toLocaleString()} chips</p>
        </section>
        <section className="shared-hand-players" aria-labelledby="shared-players-title">
          <h2 id="shared-players-title">Players</h2>
          {hand.players.map((player: any) => <article key={player.seat}>
            <div><strong>{player.nick}</strong><span>Seat {player.seat + 1}</span></div>
            <div className="shared-hand-cards">{player.publicCards.length ? player.publicCards.map((card: string, index: number) => <PlayingCard key={index} card={card} size="mini" />) : <span>Cards not revealed</span>}</div>
            <dl><div><dt>Starting stack</dt><dd>{player.stackBefore.toLocaleString()}</dd></div><div><dt>Contribution</dt><dd>{player.contribution.toLocaleString()}</dd></div><div><dt>Award</dt><dd>{player.award.toLocaleString()}</dd></div></dl>
          </article>)}
        </section>
        <section className="shared-hand-actions" aria-labelledby="shared-actions-title"><h2 id="shared-actions-title">Actions</h2>
          {hand.actions.length ? <ol>{hand.actions.map((action: any, index: number) => <li key={index}><span>{action.street} · seat {action.seat + 1}</span><strong>{action.nick} {action.action}{action.amount != null ? ` ${action.amount.toLocaleString()}` : ''}</strong></li>)}</ol> : <p>No actions were recorded for this hand.</p>}
        </section>
        <p className="shared-hand-privacy">Only publicly revealed cards are shown. Account IDs, private cards, notes, sessions and draw data are not shared.</p>
      </>}
    </main>
  );
}
