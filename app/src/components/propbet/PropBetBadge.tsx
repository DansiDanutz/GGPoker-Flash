import type { PropBetType } from '../../lib/api';

export const PROP_TYPES: { key: PropBetType; label: string; blurb: string }[] = [
  { key: 'last_longer', label: 'Last Longer', blurb: 'The player who lasts the longest in the tournament wins the bet.' },
  { key: 'bankroll', label: 'Bankroll Challenge', blurb: 'Reach your bankroll goal from settled game results before the end time. Bettors take the other side.' },
  { key: 'elo', label: 'ELO Challenge', blurb: 'Raise your ELO rating by the goal before the end time. Bettors take the other side.' },
];

export const propLabel = (type: PropBetType) => PROP_TYPES.find((t) => t.key === type)?.label ?? type;

const TONES: Record<PropBetType, [string, string, string]> = {
  last_longer: ['#7c3cc4', '#3a1663', '#d9b8ff'],
  bankroll: ['#7f9a2c', '#334312', '#e6f5a8'],
  elo: ['#c08a2a', '#4d330c', '#ffe1a0'],
};

function Glyph({ type, color }: { type: PropBetType; color: string }) {
  if (type === 'last_longer') {
    // Trophy with a stopwatch: the longest to last takes it.
    return (
      <g fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M27 22h20v8a10 10 0 0 1-20 0z" />
        <path d="M27 25h-5a5 5 0 0 0 5 7M47 25h5a5 5 0 0 1-5 7M37 40v6M31 50h12" />
        <circle cx="47" cy="47" r="8" fill="#00000055" />
        <path d="M47 43v4l3 2" />
      </g>
    );
  }
  if (type === 'bankroll') {
    // Rising chip stacks.
    return (
      <g fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="30" cy="48" rx="7" ry="3" /><path d="M23 48v-5m14 5v-5" /><ellipse cx="30" cy="43" rx="7" ry="3" />
        <ellipse cx="45" cy="46" rx="7" ry="3" /><path d="M38 46v-9m14 9v-9" /><ellipse cx="45" cy="37" rx="7" ry="3" />
        <path d="M24 33l8-8 5 5 11-11m0 0h-6m6 0v6" />
      </g>
    );
  }
  return (
    <text x="37" y="44" textAnchor="middle" fontFamily="var(--head-font)" fontWeight="900" fontSize="17" fill={color} letterSpacing=".5">ELO</text>
  );
}

/** A hexagon medal for a prop bet type, drawn in SVG (no bitmap art). */
export function PropBetBadge({ type, size = 64, glow = false }: { type: PropBetType; size?: number; glow?: boolean }) {
  const [edge, deep, ink] = TONES[type];
  const id = `pb-${type}`;
  return (
    <svg className={'pb-badge' + (glow ? ' glow' : '')} width={size} height={size} viewBox="0 0 74 74" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={edge} />
          <stop offset="1" stopColor={deep} />
        </linearGradient>
      </defs>
      <path d="M37 3l29 16.5v35L37 71 8 54.5v-35z" fill={`url(#${id}-fill)`} stroke={ink} strokeOpacity=".55" strokeWidth="2" />
      <path d="M37 10l23 13v28L37 64 14 51V23z" fill="none" stroke="#ffffff" strokeOpacity=".14" strokeWidth="1.5" />
      <Glyph type={type} color={ink} />
    </svg>
  );
}
