import React from 'react';

// DanGG's own phone-shell glyphs: drawn here, no third-party artwork.

const GOLD = (
  <linearGradient id="pi-gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor="#ffe9a8" />
    <stop offset=".55" stopColor="#d9a441" />
    <stop offset="1" stopColor="#8a5a17" />
  </linearGradient>
);

type GlyphProps = { size?: number };

/** Small stroke icons for the nav bar and toolbars. */
export function NavGlyph({ name, size = 26 }: GlyphProps & { name: 'poker' | 'events' | 'casino' | 'search' | 'filter' | 'wallet' | 'gift' | 'people' | 'back' | 'home' | 'tables' | 'rewards' }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'home':
      return <svg {...common}><path d="M4 11.4 12 4.8l8 6.6V19a1.6 1.6 0 0 1-1.6 1.6h-4V15H9.6v5.6H5.6A1.6 1.6 0 0 1 4 19z" fill="currentColor" stroke="none" /></svg>;
    case 'tables':
      return <svg {...common}><ellipse cx="12" cy="10" rx="8.4" ry="4.4" /><path d="M7 19.4h10" /><path d="M9.4 14.2v3.4M14.6 14.2v3.4" /></svg>;
    case 'rewards':
      return <svg {...common}><path d="M4 10h16v3.4H4z" fill="currentColor" stroke="none" /><path d="M5.4 13.4h13.2V19a1.4 1.4 0 0 1-1.4 1.4H6.8A1.4 1.4 0 0 1 5.4 19z" fill="currentColor" stroke="none" opacity=".85" /><path d="M10.4 10h3.2v10.4" /><path d="M12 10c-2.4-.6-4-2-3.4-3.6.6-1.6 3.4-1 3.4 2 0-3 2.8-3.6 3.4-2 .6 1.6-1 3-3.4 3.6z" /></svg>;
    case 'poker':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9.2" />
          <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
          <path d="M12 8.2c-1.6 1.6-3.3 2.6-3.3 4.2a1.7 1.7 0 0 0 3 1.1l-.6 2.3h1.8l-.6-2.3a1.7 1.7 0 0 0 3-1.1c0-1.6-1.7-2.6-3.3-4.2Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'events':
      return (
        <svg {...common}>
          <path d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z" />
          <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.4M17 6h2.5a2.5 2.5 0 0 1-2.6 3.4M12 13.5V17M8.5 20h7M9.5 17h5" />
          <path d="m12 5.6.8 1.6 1.7.2-1.3 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.3-1.2 1.7-.2Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'casino':
      return (
        <svg {...common}>
          <rect x="3.5" y="7" width="12" height="12" rx="2.5" />
          <path d="M8.5 7V6a2.5 2.5 0 0 1 2.5-2.5h7A2.5 2.5 0 0 1 20.5 6v7a2.5 2.5 0 0 1-2.5 2.5h-2.5" />
          <circle cx="7" cy="10.5" r=".9" fill="currentColor" /><circle cx="12" cy="15.5" r=".9" fill="currentColor" /><circle cx="9.5" cy="13" r=".9" fill="currentColor" />
        </svg>
      );
    case 'search':
      return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>;
    case 'filter':
      return <svg {...common}><path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="16" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></svg>;
    case 'wallet':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <defs>{GOLD}</defs>
          <rect x="2.5" y="6" width="19" height="13.5" rx="2.5" fill="url(#pi-gold)" />
          <path d="M5 6 15.5 3.2a1.5 1.5 0 0 1 1.8 1.1l.4 1.7" fill="none" stroke="#b67b22" strokeWidth="1.4" />
          <rect x="14" y="10.5" width="7.5" height="4.6" rx="1.4" fill="#7a4b10" />
          <circle cx="16.6" cy="12.8" r="1" fill="#ffe9a8" />
        </svg>
      );
    case 'gift':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <defs>{GOLD}</defs>
          <rect x="3.5" y="9.5" width="17" height="11" rx="1.6" fill="url(#pi-gold)" />
          <rect x="2.5" y="6.5" width="19" height="4" rx="1.2" fill="#f2c45c" />
          <path d="M12 6.5v14" stroke="#8a5a17" strokeWidth="2" />
          <path d="M12 6.5c-2-3.4-5.6-3-5-.6.4 1.3 3 1 5 .6Zm0 0c2-3.4 5.6-3 5-.6-.4 1.3-3 1-5 .6Z" fill="#f2c45c" stroke="#8a5a17" strokeWidth=".9" />
        </svg>
      );
    case 'people':
      return <svg {...common} fill="currentColor" stroke="none"><circle cx="9" cy="8" r="3.4" /><path d="M2.5 19.5c.4-3.6 3.1-5.6 6.5-5.6s6.1 2 6.5 5.6Z" /><circle cx="16.8" cy="9" r="2.6" opacity=".75" /><path d="M16.2 13.6c2.9.1 4.9 1.9 5.3 4.9h-4.3c-.2-1.9-.5-3.3-1-4.9Z" opacity=".75" /></svg>;
    case 'back':
      return <svg {...common}><path d="m15 5-7 7 7 7" /></svg>;
  }
}

type BadgeName = 'mystery' | 'aof' | 'holdem' | 'plo' | 'short' | 'rush' | 'spin' | 'slots' | 'roulette' | 'blackjack' | 'crash' | 'baccarat' | 'dragontiger' | 'sicbo' | 'casinoholdem';

const BADGE_TONE: Readonly<Record<BadgeName, readonly [string, string]>> = {
  mystery: ['#b36bff', '#3d1269'], aof: ['#ff6b3d', '#7a1408'], holdem: ['#3fbf6a', '#0f4a25'], plo: ['#4a8cff', '#0f2c66'], short: ['#b36bff', '#3d1269'],
  rush: ['#ffcf3d', '#7a4a00'], spin: ['#ffd76b', '#6b4300'], slots: ['#ff5a5a', '#650c12'], roulette: ['#2fbf71', '#0d3f25'],
  blackjack: ['#e9e9e9', '#4a4a4a'], crash: ['#38d0ff', '#0b3f5c'], baccarat: ['#ff8fb1', '#6b1734'], dragontiger: ['#ff9b3d', '#6b2a00'],
  sicbo: ['#f3f3f3', '#5a5a5a'], casinoholdem: ['#3fbf6a', '#0f4a25'],
};

function Card({ x, y, r, label, red }: { x: number; y: number; r: number; label: string; red?: boolean }) {
  return (
    <g transform={`rotate(${r} ${x + 9} ${y + 13})`}>
      <rect x={x} y={y} width="18" height="26" rx="2.6" fill="#fdfaf2" stroke="#2b2b2b" strokeWidth=".8" />
      <text x={x + 9} y={y + 17} textAnchor="middle" fontSize="11" fontWeight="800" fill={red ? '#d32f3f' : '#1d1d1d'} fontFamily="system-ui, sans-serif">{label}</text>
    </g>
  );
}

function BadgeArt({ name }: { name: BadgeName }) {
  switch (name) {
    case 'holdem': return <><Card x={14} y={14} r={-12} label="A" /><Card x={26} y={13} r={10} label="A" red /></>;
    case 'plo': return <><Card x={8} y={16} r={-20} label="A" /><Card x={17} y={13} r={-7} label="K" red /><Card x={27} y={13} r={7} label="A" red /><Card x={36} y={16} r={20} label="K" /></>;
    case 'casinoholdem': return <><Card x={14} y={14} r={-10} label="K" red /><Card x={26} y={14} r={10} label="Q" /></>;
    case 'blackjack': return <><Card x={13} y={14} r={-10} label="A" /><Card x={27} y={14} r={10} label="J" red /></>;
    case 'baccarat': return <><Card x={13} y={14} r={-10} label="9" red /><Card x={27} y={14} r={10} label="0" /></>;
    case 'short': return <text x="32" y="42" textAnchor="middle" fontSize="24" fontWeight="900" fill="#fff" stroke="#3d1269" strokeWidth="1.2" fontFamily="system-ui, sans-serif">6+</text>;
    case 'mystery': return <text x="32" y="44" textAnchor="middle" fontSize="30" fontWeight="900" fill="#fff" stroke="#3d1269" strokeWidth="1.2" fontFamily="system-ui, sans-serif">?</text>;
    case 'aof': return <text x="32" y="40" textAnchor="middle" fontSize="17" fontWeight="900" fill="#fff" stroke="#7a1408" strokeWidth="1" fontFamily="system-ui, sans-serif" fontStyle="italic">AoF</text>;
    case 'rush': return <path d="M36 10 20 35h10l-4 19 18-27H33l3-17Z" fill="#fff6c9" stroke="#7a4a00" strokeWidth="1.5" strokeLinejoin="round" />;
    case 'spin': return <><circle cx="32" cy="32" r="15" fill="#fff3c4" stroke="#6b4300" strokeWidth="1.5" /><path d="M32 17v30M17 32h30M21.4 21.4l21.2 21.2M42.6 21.4 21.4 42.6" stroke="#c98a1c" strokeWidth="1.4" /><circle cx="32" cy="32" r="4" fill="#6b4300" /></>;
    case 'slots': return <><rect x="12" y="18" width="40" height="28" rx="4" fill="#fdfaf2" stroke="#650c12" strokeWidth="1.5" /><text x="32" y="38" textAnchor="middle" fontSize="15" fontWeight="900" fill="#d32f3f" fontFamily="system-ui, sans-serif">777</text></>;
    case 'roulette': return <><circle cx="32" cy="32" r="16" fill="#1d1d1d" stroke="#e8c35a" strokeWidth="2" /><circle cx="32" cy="32" r="10" fill="none" stroke="#d32f3f" strokeWidth="5" strokeDasharray="3.1 3.1" /><circle cx="32" cy="32" r="3" fill="#e8c35a" /></>;
    case 'crash': return <><path d="M12 48 26 36l7 5 18-21" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d="m44 18 8 1-1 8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></>;
    case 'dragontiger': return <text x="32" y="40" textAnchor="middle" fontSize="17" fontWeight="900" fill="#fff" stroke="#6b2a00" strokeWidth="1" fontFamily="system-ui, sans-serif">D·T</text>;
    case 'sicbo': return <><rect x="14" y="20" width="18" height="18" rx="3.5" fill="#fff" stroke="#333" /><rect x="32" y="26" width="18" height="18" rx="3.5" fill="#fff" stroke="#333" /><circle cx="23" cy="29" r="2" fill="#d32f3f" /><circle cx="36.5" cy="30.5" r="1.6" fill="#222" /><circle cx="41" cy="35" r="1.6" fill="#222" /><circle cx="45.5" cy="39.5" r="1.6" fill="#222" /></>;
  }
}

/** Round 3D-style game badge used by the phone Poker and Casino lists. */
export function GameBadge({ name, size = 64 }: { name: BadgeName; size?: number }) {
  const [hi, lo] = BADGE_TONE[name];
  const id = `gb-${name}`;
  return (
    <svg className="game-badge" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id={id} cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor={hi} />
          <stop offset="1" stopColor={lo} />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="58" rx="22" ry="4" fill="#000" opacity=".45" />
      <circle cx="32" cy="32" r="27" fill={`url(#${id})`} stroke="rgba(255,255,255,.35)" strokeWidth="1.2" />
      <circle cx="32" cy="32" r="23" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1" />
      <BadgeArt name={name} />
    </svg>
  );
}

export type { BadgeName };
