import { money, type LobbyTable } from '../lib/api';
import { seatFlag } from '../lib/seatFlag';

/** Live seated players of the selected lobby table (reference 160/166/169 player panel). */
export function SeatedPlayersList({ table }: { table: LobbyTable | null }) {
  const seated = [...(table?.seated || [])].sort((a, b) => b.stack - a.stack);
  if (!table) return null;
  return (
    <section className="sp-list" aria-label={`Players at ${table.name}`}>
      <div className="sp-head"><span>Player</span><span>Stack</span></div>
      {seated.length ? seated.map((p) => (
        <div key={p.seat} className="sp-row">
          <span className="sp-flag" aria-hidden="true">{seatFlag(p.nick, p.country)}</span>
          <span className="sp-nick">{p.nick}</span>
          <span className="sp-stack">{money(p.stack, true)}</span>
        </div>
      )) : <p className="sp-empty">{table.running ? 'No one seated yet' : 'Table opens when the first player sits'}</p>}
    </section>
  );
}
