import React, { useEffect, useMemo, useState } from 'react';
import { money } from '../lib/api';
import { PlayingCard } from './Card';
import { showdownFocus, focusClass } from '../game/eval';
import { anonymizeHand, formatHandAmount, handExportFileName, handExportLines, handStreetColumns, STREET_BOARD_CARDS, type AmountUnit } from '../lib/handDetail';
import { downloadBlob, renderHandPng } from '../lib/handPng';

const REPLAY_STEP_MS = 700;
const BOARD_SIZE = 5;

/** Recorded hand detail: board replay, positions, winning five highlight and per-street actions. */
type HandDetailModalProps = {
  hand: any;
  userId?: number;
  onClose: () => void;
  /** Hide or unhide this hand in the player's history; omitted where hiding does not apply. */
  onSetHidden?: (hidden: boolean) => void;
};

export function HandDetailModal({ hand: stored, userId, onClose, onSetHidden }: HandDetailModalProps) {
  const [replay, setReplay] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [unit, setUnit] = useState<AmountUnit>('chips');
  const [anonymous, setAnonymous] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const hand = useMemo(() => (anonymous ? anonymizeHand(stored, userId) : stored), [anonymous, stored, userId]);
  const board = useMemo(() => (hand.board || '').split(' ').filter(Boolean), [hand.board]);
  const focus = useMemo(() => showdownFocus(hand.result, board, hand.game), [hand.result, board, hand.game]);
  const columns = useMemo(() => handStreetColumns(hand.actions), [hand.actions]);
  const players: any[] = hand.players || [];
  const canShowBlinds = Number(hand.blinds?.bb) > 0;
  const amount = (v: number) => formatHandAmount(v, unit, hand.blinds?.bb, money);

  const exportPng = async () => {
    setExporting(true);
    setExportError('');
    try {
      const lines = handExportLines(hand, { unit, viewerId: userId, money });
      const blob = await renderHandPng(lines, `DanGG play-money hand history · ${hand.created_at?.slice(0, 16) ?? ''}`);
      downloadBlob(blob, handExportFileName(hand));
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : 'PNG export failed');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!playing || replay >= BOARD_SIZE) return;
    const timer = setTimeout(() => setReplay((r) => Math.min(BOARD_SIZE, r + 1)), REPLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, replay]);

  /** Winner's best five stay lit; everything else dims. Losers without a focus entry dim too. */
  const holeClass = (seat: number, index: number) => {
    if (!focus) return '';
    const selected = focus.hole[seat];
    return selected ? focusClass(selected, index) : 'focus-off';
  };
  const boardClass = (index: number) => (focus ? focusClass(focus.board, index) : '');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{hand.tableName} · hand #{hand.handNo}</h3><button className="title-icon" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="row hh-tools" style={{ marginBottom: 12, gap: 6, flexWrap: 'wrap' }}>
            <div className="row" role="group" aria-label="Amounts in" style={{ gap: 2 }}>
              <button className={'btn btn-sm ' + (unit === 'chips' ? 'btn-red' : 'btn-ghost')} aria-pressed={unit === 'chips'} onClick={() => setUnit('chips')}>Chips</button>
              <button className={'btn btn-sm ' + (unit === 'bb' ? 'btn-red' : 'btn-ghost')} aria-pressed={unit === 'bb'} disabled={!canShowBlinds}
                title={canShowBlinds ? 'Show amounts in big blinds' : 'This hand has no recorded blinds'} onClick={() => setUnit('bb')}>BB</button>
            </div>
            <label className="row small" style={{ gap: 4 }}>
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />Anonymise
            </label>
            {onSetHidden && (
              <button className="btn btn-ghost btn-sm" onClick={() => onSetHidden(!stored.hidden)}>{stored.hidden ? 'Unhide hand' : 'Hide hand'}</button>
            )}
            <button className="btn btn-ghost btn-sm" disabled={exporting} onClick={exportPng}>{exporting ? 'Exporting…' : 'Export PNG'}</button>
            {exportError && <span className="small" role="alert" style={{ color: '#e08a8a' }}>{exportError}</span>}
          </div>
          <div className="between" style={{ marginBottom: 12 }}>
            <span className="muted">Pot</span><b className="gold">{amount(hand.pot)}</b>
          </div>
          {hand.blinds && (
            <div className="between" style={{ marginBottom: 12 }}>
              <span className="muted">Blinds</span>
              <span>{amount(hand.blinds.sb)} / {amount(hand.blinds.bb)}{hand.blinds.ante ? ` · Ante ${amount(hand.blinds.ante)}` : ''}</span>
            </div>
          )}
          <div className="board" style={{ marginBottom: 14 }}>
            {board.map((c: string, i: number) => (
              <PlayingCard key={i} card={i < replay ? c : '??'} className={i < replay ? boardClass(i) : ''} />
            ))}
          </div>
          <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Player</th><th>Position</th><th>Cards</th><th>Stack</th><th>Won</th></tr></thead>
            <tbody>
              {players.map((p: any, i: number) => (
                <tr key={i} style={p.id === userId ? { background: '#2a2311' } : undefined}>
                  <td>{p.nick}{p.id === userId ? ' (you)' : ''}</td>
                  <td>{p.position ?? '—'}</td>
                  <td>
                    {p.cards?.length
                      ? <div className="row" style={{ gap: 3 }}>{p.cards.map((c: string, j: number) => (
                        <PlayingCard key={j} card={c} size="mini" className={holeClass(p.seat, j)} />
                      ))}</div>
                      : '—'}
                  </td>
                  <td>{amount(p.stack)}</td>
                  <td className="gold">{p.win ? amount(p.win) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setReplay(0); setPlaying(true); }}>Replay</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPlaying((v) => !v)}>{playing ? 'Pause' : 'Play'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setReplay(BOARD_SIZE)}>Show all</button>
            <span className="muted small">Board revealed {replay}/{BOARD_SIZE}</span>
            {focus && <span className="muted small">Winning five highlighted</span>}
          </div>
          {!!hand.actions?.length && (
            <>
              <div className="panel-title" style={{ marginTop: 16 }}>Action</div>
              <div className="hh-streets">
                {columns.map((col) => {
                  const reached = STREET_BOARD_CARDS[col.street] <= replay;
                  return (
                    <div key={col.street} className={'hh-street-col' + (reached ? ' on' : '')}>
                      <div className="hh-street">{col.title}</div>
                      {col.rows.length
                        ? col.rows.map((r, i) => (
                          <div key={i} className="hh-action-row">
                            <b>{r.nick}</b>
                            <span>{r.action}{r.amount ? ` · ${amount(r.amount)}` : ''}</span>
                          </div>
                        ))
                        : <span className="muted small">—</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
