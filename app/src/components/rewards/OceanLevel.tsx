import React from 'react';

const TIERS = [
  { name: 'Fish', tp: 0, rank: 0 },
  { name: 'Shrimp', tp: 10_000, rank: 1 },
  { name: 'Crab', tp: 50_000, rank: 2 },
  { name: 'Turtle', tp: 200_000, rank: 3 },
  { name: 'Octopus', tp: 750_000, rank: 4 },
  { name: 'Dolphin', tp: 2_000_000, rank: 5 },
  { name: 'Whale', tp: 5_000_000, rank: 6 },
  { name: 'Shark', tp: 10_000_000, rank: 7 },
];

const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);

/** DanGG Rewards level (reference 048): fish hero, TP progress and the tier parchment. */
export function OceanLevel({ xp, gems, onAbout }: { xp: number; gems: number; onAbout: () => void }) {
  const idx = Math.max(0, TIERS.reduce((acc, t, i) => (xp >= t.tp ? i : acc), 0));
  const tier = TIERS[idx];
  const next = TIERS[Math.min(idx + 1, TIERS.length - 1)];
  const span = Math.max(1, next.tp - tier.tp);
  const into = Math.max(0, xp - tier.tp);
  const pct = idx === TIERS.length - 1 ? 100 : Math.min(100, (into / span) * 100);
  const left = Math.max(0, next.tp - xp);

  return (
    <div className="ocean">
      <div className="ocean-hero">
        <div className="ocean-gems"><span className="ocean-gem" aria-hidden="true" />{gems.toLocaleString()}</div>
        <div className="ocean-bubble">Every journey<br />starts here</div>
        <img className="ocean-fish" src={`/assets/ocean/Ocean_Rewards_Rank_${tier.rank}.png`} alt={tier.name} />
        <div className="ocean-hero-copy">
          <h2>{tier.name}</h2>
          <p>{xp.toLocaleString()} XP</p>
        </div>
        <div className="ocean-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${tier.name} progress`}>
          <div className="ocean-progress-fill" style={{ width: `${pct}%` }} />
          <span>{idx === TIERS.length - 1 ? 'Top rank' : `${xp.toLocaleString()} / ${next.tp.toLocaleString()} XP`}</span>
          <img src="/assets/ocean/Ocean_Rewards_Rank_1.png" alt="" />
        </div>
      </div>

      <p className="ocean-caption">
        {idx < TIERS.length - 1
          ? <>Rank up to <b>{next.name}</b> by collecting <b>{left.toLocaleString()} more XP</b>.</>
          : <>You reached the top of the reef — <b>Shark</b>.</>}
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
          <span role="rowheader">XP<br />Milestone</span>
          {TIERS.map((t) => <span key={t.name} role="cell" className={t.name === tier.name ? 'on' : ''}>{t.tp === 0 ? '0 XP' : `${fmt(t.tp)} XP`}</span>)}
        </div>

      </div>

      <div className="ocean-more">
        <button type="button" onClick={onAbout}>More about DanGG Rewards ↗</button>
      </div>
    </div>
  );
}
