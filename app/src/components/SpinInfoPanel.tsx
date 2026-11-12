import { useEffect, useState } from 'react';

type SpinPayout = { multiplier: number; prizePool: number; prizes: number[]; oneIn: number; blindUp: string };
type SpinInfo = { buyIn: number; seats: number; payouts: SpinPayout[]; blinds: { level: number; smallBlind: number; bigBlind: number }[] };
type Tab = 'info' | 'blinds' | 'payout';

type Props = { buyIn: number | null; formatChips: (n: number) => string };

/** Spin & Gold side panel: Info / Blind Structure / Payout for the selected stake. */
export function SpinInfoPanel({ buyIn, formatChips }: Props) {
  const [tab, setTab] = useState<Tab>('info');
  const [info, setInfo] = useState<SpinInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!buyIn) { setInfo(null); return; }
    const controller = new AbortController();
    setFailed(false);
    fetch(`/api/spin/info?buyin=${buyIn}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setInfo(d.info))
      .catch((e) => { if (e?.name !== 'AbortError') { setInfo(null); setFailed(true); } });
    return () => controller.abort();
  }, [buyIn]);

  if (!buyIn) return <div className="spin-info muted small">Select a Jackpot SNG table to see its rules.</div>;
  if (failed) return <div className="spin-info muted small">Jackpot SNG details are unavailable for this stake.</div>;
  if (!info) return <div className="spin-info muted small">Loading…</div>;
  const top = info.payouts[0];
  return (
    <div className="spin-info">
      <div className="spin-info-tabs" role="tablist">
        {([['info', 'Info'], ['blinds', 'Blind Structure'], ['payout', 'Payout']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'info' && (
        <div className="spin-info-body small">
          <p>{info.seats}-max hyper turbo. Buy-in {formatChips(info.buyIn)}; the wheel sets the prize pool from ×2 up to ×{top.multiplier.toLocaleString()}.</p>
          <p className="muted">×10 and above pay several places and raise blinds by hands; smaller multipliers are winner-takes-all with blinds every 1–3 minutes. Play money only.</p>
        </div>
      )}
      {tab === 'blinds' && (
        <table className="spin-info-table small">
          <thead><tr><th>Lvl</th><th>Blinds</th></tr></thead>
          <tbody>{info.blinds.map((b) => <tr key={b.level}><td>{b.level}</td><td>{b.smallBlind}/{b.bigBlind}</td></tr>)}</tbody>
        </table>
      )}
      {tab === 'payout' && (
        <table className="spin-info-table small">
          <thead><tr><th>×</th><th>Prize pool</th><th>1st / 2nd / 3rd</th><th>Odds</th><th>Blinds up</th></tr></thead>
          <tbody>{info.payouts.map((p) => (
            <tr key={p.multiplier}>
              <td>×{p.multiplier.toLocaleString()}</td>
              <td>{formatChips(p.prizePool)}</td>
              <td>{p.prizes.filter((x) => x > 0).map(formatChips).join(' / ')}</td>
              <td>1 in {p.oneIn.toLocaleString()}</td>
              <td>{p.blindUp}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
