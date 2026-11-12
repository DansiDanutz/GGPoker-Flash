// Cross-room leaderboard metrics: labels and value formatting. Pure, so Node can test it.

export type LeaderMetric = 'vip' | 'elo' | 'xp';

export interface LeaderRow {
  rank: number;
  nick: string;
  avatar: string | null;
  vip_level: number;
  value: number;
  vip_points: number;
  xp: number;
  elo: number;
}

export interface LeaderboardResponse {
  metric: LeaderMetric;
  leaders: LeaderRow[];
  me: { rank: number; value: number } | null;
}

interface MetricInfo {
  readonly key: LeaderMetric;
  readonly tab: string;
  readonly subtitle: string;
  readonly column: string;
  readonly unit: string;
}

export const LEADER_METRICS: readonly MetricInfo[] = Object.freeze([
  { key: 'vip', tab: 'VIP points', subtitle: 'Top players by VIP points across every room', column: 'VIP points', unit: 'pts' },
  { key: 'elo', tab: 'Elo', subtitle: 'Top players by cross-room Elo rating', column: 'Elo', unit: 'Elo' },
  { key: 'xp', tab: 'XP', subtitle: 'Top players by experience earned at the tables', column: 'XP', unit: 'XP' },
] as const);

/** Label and copy for a metric; unknown values fall back to VIP points. */
export function metricInfo(metric: string): MetricInfo {
  return LEADER_METRICS.find((m) => m.key === metric) ?? LEADER_METRICS[0];
}

/** Whole number with thousands separators; non-finite values read as 0. */
export function formatMetricValue(value: number | null | undefined): string {
  const n = Number(value);
  return (Number.isFinite(n) ? Math.trunc(n) : 0).toLocaleString('en-US');
}

/** The value with its unit, as the top-3 cards show it: `12,500 pts`, `1,240 Elo`, `900 XP`. */
export function metricValueLabel(metric: string, value: number | null | undefined): string {
  return `${formatMetricValue(value)} ${metricInfo(metric).unit}`;
}
