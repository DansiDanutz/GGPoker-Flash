import React from 'react';
import { money } from '../../lib/api';

export function BattleRules({ config }: { config: any }) {
  return (
    <section className="battle-rules" aria-labelledby="battle-rules-title">
      <h2 id="battle-rules-title">Event rules</h2>
      <dl>
        <div><dt>Entry</dt><dd>{money(config.entry)}</dd></div>
        <div><dt>Starting chips</dt><dd>{config.startingChips.toLocaleString()}</dd></div>
        <div><dt>Capacity</dt><dd>{config.capacity} players</dd></div>
        <div><dt>Final table</dt><dd>{config.finalSeats} seats</dd></div>
        <div><dt>Rush duration</dt><dd>{config.rushMinutes} minutes, or until {config.finalSeats} remain</dd></div>
        <div><dt>Blinds</dt><dd>{config.smallBlind}/{config.bigBlind}</dd></div>
        <div><dt>Table size</dt><dd>{config.tableSize} players</dd></div>
        <div><dt>Prize shares</dt><dd>{config.prizeShares.join(' / ')}%</dd></div>
        <div><dt>Bounty items</dt><dd>{config.bountyItems.length} configured</dd></div>
      </dl>
      <p>When more than {config.finalSeats} survive, the top {config.finalSeats - 1} stacks advance directly. Remaining contenders enter all-in shootouts for the last seat. Equal stacks use registration order.</p>
    </section>
  );
}
