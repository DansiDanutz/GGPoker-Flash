import { useState } from 'react';
import { money, type TournamentDetail } from '../../lib/api';
import { ordinal, prizeText } from '../../lib/tournamentPrizes';
import { seatFlag } from '../../lib/seatFlag';
import { gameRules } from '../../lib/gameRules';
import { bigBlinds, infoRows, timeOf, type Explainer } from '../../lib/tournamentLobby';

/** ⓘ button that opens a short explainer pop-up. */
export function InfoTip({ explain }: { explain: Explainer }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="tl-tip">
      <button type="button" aria-label={`About ${explain.title}`} aria-expanded={open} onClick={() => setOpen(!open)}>ⓘ</button>
      {open && (
        <span className="tl-tip-pop" role="tooltip">
          <b>{explain.title}</b>{explain.body}
          <button type="button" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
        </span>
      )}
    </span>
  );
}

export function InfoPanel({ t, d }: { t: any; d: TournamentDetail | null }) {
  return (
    <table className="tl-info">
      <tbody>
        {infoRows(t, d).map((r) => (
          <tr key={r.label}><th>{r.label}{r.explain && <InfoTip explain={r.explain} />}</th><td>{r.value}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function StructurePanel({ d }: { d: TournamentDetail | null }) {
  if (!d) return <p className="tl-empty">Loading structure…</p>;
  const current = d.clock?.level;
  return (
    <table className="tl-grid">
      <thead><tr><th>Level</th><th>Blinds</th><th>Ante</th><th>Duration</th></tr></thead>
      <tbody>
        {d.structure.map((l) => (
          <tr key={l.level} className={l.level === current ? 'on' : l.level === d.lateReg.closesAtLevel ? 'late' : ''}>
            <td>{l.level}{l.level === d.lateReg.closesAtLevel && <small> late reg ends</small>}</td>
            <td>{l.sb.toLocaleString()} / {l.bb.toLocaleString()}</td>
            <td>{l.ante ? l.ante.toLocaleString() : '—'}</td>
            <td>{l.minutes} min</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PrizePanel({ d }: { d: TournamentDetail | null }) {
  if (!d) return <p className="tl-empty">Loading prizes…</p>;
  return (
    <>
      <div className="tl-prize-head"><span>Prize Pool</span><b>{money(d.prizePool)}</b><small>{d.placesPaid} {d.placesPaid === 1 ? 'place' : 'places'} paid</small></div>
      <table className="tl-grid">
        <thead><tr><th>Place</th><th>Prize</th></tr></thead>
        <tbody>
          {d.payouts.map((p) => <tr key={p.place}><td>{ordinal(p.place)}</td><td className="gold">{prizeText(p, (n) => money(n))}</td></tr>)}
        </tbody>
      </table>
    </>
  );
}

export function PlayersPanel({ t, d, meId, query }: { t: any; d: TournamentDetail | null; meId?: number; query: string }) {
  if (!d) return <p className="tl-empty">Loading players…</p>;
  const q = query.trim().toLowerCase();
  const rows = d.players.filter((p) => !q || p.nick.toLowerCase().includes(q));
  if (!d.players.length) return <p className="tl-empty">{t.status === 'completed' ? 'This tournament has finished.' : t.status === 'running' ? 'No one is seated right now.' : 'Registered accounts appear here.'}</p>;
  const bounty = t.mode === 'BOUNTY';
  return (
    <table className="tl-grid tl-players">
      <thead><tr><th>Rank</th><th aria-label="Country" /><th>Players</th>{bounty && <th>Bounty</th>}<th>Chips (BB)</th></tr></thead>
      <tbody>
        {rows.map((p) => (
          <tr key={`${p.id}-${p.rank}`} className={p.id === meId ? 'me' : ''}>
            <td>{p.rank}</td>
            <td className="tl-flag" aria-hidden="true">{seatFlag(p.nick, p.country)}</td>
            <td>{p.nick}{p.table != null && <small> · T{p.table}</small>}</td>
            {bounty && <td className="gold">{money(t.bounty || 0)}</td>}
            <td>{p.stack.toLocaleString()} <small>({bigBlinds(p.stack, d)})</small></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TablesPanel({ d, onWatch }: { d: TournamentDetail | null; onWatch: (tableId: string) => void }) {
  if (!d) return <p className="tl-empty">Loading tables…</p>;
  if (!d.tables.length) return <p className="tl-empty">Tables open when the tournament starts.</p>;
  return (
    <table className="tl-grid">
      <thead><tr><th>Table</th><th>Players</th><th>Largest</th><th>Smallest</th><th aria-label="Watch" /></tr></thead>
      <tbody>
        {d.tables.map((x) => (
          <tr key={x.id}>
            <td>#{x.index}</td><td>{x.players}/{x.seats}</td><td>{x.largest.toLocaleString()}</td><td>{x.smallest.toLocaleString()}</td>
            <td><button type="button" className="tl-watch" disabled={!x.players} onClick={() => onWatch(x.id)}>Watch</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RulesPanel({ t }: { t: any }) {
  const game = t.format === 'PLO' ? 'omaha' : t.format === 'Short Deck' ? 'shortdeck' : 'holdem';
  const rules = gameRules(game);
  return (
    <div className="tl-rules">
      <h4>{rules.rulesTitle}</h4>
      {rules.rulesText.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
      <h4>Tournament rules</h4>
      <p>Everyone starts with the same stack. Blinds rise on a clock, and a player who runs out of chips is out. Prizes go to the last players standing, in the order shown on the Prize Pool tab.</p>
      <p>Registered players are seated when the tournament starts. If you are not at your table, your hands are folded and your blinds are posted until you open it.</p>
      <p>Play money only: buy-ins and prizes are play chips with no cash value.</p>
    </div>
  );
}

export function SatellitesPanel({ t, all, onOpen }: { t: any; all: readonly any[]; onOpen: (s: any) => void }) {
  const name = String(t.name || '').toLowerCase();
  const feeders = all.filter((s) => s.mode === 'SATELLITE' && s.id !== t.id && s.ticket && name.includes(String(s.ticket).toLowerCase()));
  if (t.mode === 'SATELLITE') return <p className="tl-empty">This is a satellite: the winner gets a {t.ticket || 'seat'} ticket.</p>;
  if (!feeders.length) return <p className="tl-empty">No satellites feed into this tournament.</p>;
  return (
    <ul className="tl-list">
      {feeders.map((s) => (
        <li key={s.id}><button type="button" onClick={() => onOpen(s)}><b>{s.name}</b><span>{timeOf(s.start_at)} · {s.buyin + s.fee ? money(s.buyin + s.fee) : 'Free'}</span></button></li>
      ))}
    </ul>
  );
}

export function PropBetPanel({ registered, startsAt, onCreate }: { registered: boolean; startsAt: number; onCreate: () => void }) {
  const tooLate = startsAt - Date.now() < 3 * 60_000;
  return (
    <div className="tl-prop">
      <p><b>Last Longer</b> — bet other players in this tournament that you will outlast them. The player who busts last takes the pot.</p>
      {!registered && <p className="tl-note">Register first to create a Last Longer for this tournament.</p>}
      {registered && tooLate && <p className="tl-note">Last Longer bets close 3 minutes before the start.</p>}
      <button type="button" className="tl-go" disabled={!registered || tooLate} onClick={onCreate}>Create Last Longer</button>
    </div>
  );
}
