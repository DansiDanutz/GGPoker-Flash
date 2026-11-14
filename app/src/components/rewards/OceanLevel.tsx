import React from 'react';
import { money } from '../../lib/api';

const TIERS = [
  { name: 'Fish', tp: 0, mult: 1.5, cashback: 16, rank: 0 },
  { name: 'Shrimp', tp: 10_000, mult: 2, cashback: 25, rank: 1 },
  { name: 'Crab', tp: 50_000, mult: 2.5, cashback: 30, rank: 2 },
  { name: 'Turtle', tp: 200_000, mult: 3, cashback: 40, rank: 3 },
  { name: 'Octopus', tp: 750_000, mult: 3.5, cashback: 50, rank: 4 },
  { name: 'Dolphin', tp: 2_000_000, mult: 4, cashback: 60, rank: 5 },
  { name: 'Whale', tp: 5_000_000, mult: 4.5, cashback: 70, rank: 6 },
  { name: 'Shark', tp: 10_000_000, mult: 5, cashback: 80, rank: 7 },
];

const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);

/** Ocean Rewards level (reference 048): fish hero, TP progress and the tier parchment. */
export function OceanLevel({ xp, gems, onAbout }: { xp: number; gems: number; onAbout: () => void }) {
  const idx = Math.max(0, TIERS.reduce((acc, t, i) => (xp >= t.tp ? i : acc), 0));
  const tier = TIERS[idx];
  const next = TIERS[Math.min(idx + 1, TIERS.length - 1)];
  const span = Math.max(1, next.tp - tier.tp);
  const into = Math.max(0, xp - tier.tp);
  const pct = Math.min(100, (into / span) * 100);
  const left = Math.max(0, next.tp - xp);

  return (
    <div className="ocean">
      <div className="ocean-hero">
        <div className="ocean-gems"><span className="ocean-gem" aria-hidden="true" />{gems.toLocaleString()}</div>
        <div className="ocean-bubble">Every journey<br />starts here</div>
        <img className="ocean-fish" src={`/assets/ocean/Ocean_Rewards_Rank_${tier.rank}.png`} alt={tier.name} />
        <div className="ocean-hero-copy">
          <h2>{tier.name}</h2>
          <p>Cashback : ~{tier.cashback}%</p>
        </div>
        <div className="ocean-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${tier.name} progress`}>
          <div className="ocean-progress-fill" style={{ width: `${pct}%` }} />
          <span>{into.toLocaleString()} / {next.tp.toLocaleString()} TP</span>
          <img src="/assets/ocean/Ocean_Rewards_Rank_1.png" alt="" />
        </div>
      </div>

      <p className="ocean-caption">
        {idx < TIERS.length - 1
          ? <>Rank up to <b>{next.name}</b> by collecting <b>{left.toLocaleString()} more TPs</b> until the end of the year!</>
          : <>You reached the top of the reef — <b>Shark</b>. Cashback ~{tier.cashback}% until the end of the year.</>}
      </p>

      <div className="ocean-tiers" role="table" aria-label="Ocean reward tiers">
        <div className="ocean-tier-row head" role="row">
          <span role="columnheader">Tier</span>
          {TIERS.map((t) => (
            <span key={t.name} role="columnheader" className={t.name === tier.name ? 'on' : ''}>{t.name}</span>
          ))}
        </div>
        <div className="ocean-tier-row icons" role="row">
          <span role="rowheader" />
          {TIERS.map((t) => (
            <span key={t.name} role="cell" className={t.name === tier.name ? 'on' : ''}>
              <img src={`/assets/ocean/Ocean_Rewards_Rank_${t.rank}.png`} alt="" />
            </span>
          ))}
        </div>
        <div className="ocean-tier-row" role="row">
          <span role="rowheader">TP<br />Milestone</span>
          {TIERS.map((t) => <span key={t.name} role="cell" className={t.name === tier.name ? 'on' : ''}>{t.tp === 0 ? '0TP' : `${fmt(t.tp)}TP`}</span>)}
        </div>
        <div className="ocean-tier-row" role="row">
          <span role="rowheader">GEM<br />Multiplier</span>
          {TIERS.map((t) => <span key={t.name} role="cell" className={t.name === tier.name ? 'on' : ''}>×{t.mult}</span>)}
        </div>
        <div className="ocean-tier-row" role="row">
          <span role="rowheader">Cashback</span>
          {TIERS.map((t) => <span key={t.name} role="cell" className={t.name === tier.name ? 'on' : ''}>~{t.cashback}%</span>)}
        </div>
      </div>

      <div className="ocean-more">
        <button type="button" onClick={onAbout}>More about Ocean Rewards ↗</button>
      </div>
    </div>
  );
}
