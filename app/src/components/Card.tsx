import React from 'react';

const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_INDEX: Record<string, number> = { '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7, 'T': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12 };
const SUIT_INDEX: Record<string, number> = { c: 0, d: 1, h: 2, s: 3 };

export function PlayingCard({ card, size = 'normal', dim = false, dealt = false, flip = false, style, className = '' }: {
  card: string;
  /** Extra state classes, e.g. the showdown best-five focus. */
  className?: string;
  size?: 'normal' | 'mini';
  dim?: boolean;
  dealt?: boolean;
  flip?: boolean;
  style?: React.CSSProperties;
}) {
  if (!card || card === '??') {
    return <div style={style} className={'pcard back' + (size === 'mini' ? ' mini' : '') + (dealt ? ' dealt' : '') + (className ? ' ' + className : '')} />;
  }
  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = card[1];
  const red = suit === 'h' || suit === 'd';
  const front = typeof localStorage !== 'undefined' ? (localStorage.getItem('ggpoker.cardFront') || 'official') : 'official';
  const official = front.startsWith('official');
  const artStyle = official ? { ...style, '--col': RANK_INDEX[card[0]] ?? 0, '--row': SUIT_INDEX[suit] ?? 0 } as React.CSSProperties : style;
  return (
    <div style={artStyle} aria-label={`${rank} of ${SUIT[suit]}`} className={`pcard s-${suit}${red ? ' red' : ''}${size === 'mini' ? ' mini' : ''}${dim ? ' dim' : ''}${dealt ? ' dealt' : ''}${flip ? ' flip' : ''}${official ? ' art-face art-' + front : ''}${className ? ' ' + className : ''}`}>
      <span className="rank">{rank}</span>
      <span className="suit">{SUIT[suit]}</span>
      <span className="big-suit">{SUIT[suit]}</span>
    </div>
  );
}
