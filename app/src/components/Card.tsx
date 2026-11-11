import React from 'react';

const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function PlayingCard({ card, size = 'normal', dim = false, dealt = false, flip = false, style }: {
  card: string;
  size?: 'normal' | 'mini';
  dim?: boolean;
  dealt?: boolean;
  flip?: boolean;
  style?: React.CSSProperties;
}) {
  if (!card || card === '??') {
    return <div style={style} className={'pcard back' + (size === 'mini' ? ' mini' : '') + (dealt ? ' dealt' : '')} />;
  }
  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = card[1];
  const red = suit === 'h' || suit === 'd';
  return (
    <div style={style} className={`pcard s-${suit}${red ? ' red' : ''}${size === 'mini' ? ' mini' : ''}${dim ? ' dim' : ''}${dealt ? ' dealt' : ''}${flip ? ' flip' : ''}`}>
      <span className="rank">{rank}</span>
      <span className="suit">{SUIT[suit]}</span>
      <span className="big-suit">{SUIT[suit]}</span>
    </div>
  );
}
