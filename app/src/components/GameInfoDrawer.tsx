import { useEffect, useRef } from 'react';
import type { LobbyTable } from '../lib/api';
import { gameRules } from '../lib/gameRules';

/** The lobby's per-game Information (rules) panel, sliding over the table list. */
export function GameInfoDrawer({ game, table, onClose }: { game: string; table: LobbyTable | null; onClose: () => void }) {
  const rules = gameRules(game, table);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="gi-drawer" role="dialog" aria-label={rules.title}>
      <header className="gi-head">
        <h2>{rules.title}{table ? <small> · {table.name}</small> : null}</h2>
        <button ref={closeRef} type="button" aria-label="Close information" onClick={onClose}>✕</button>
      </header>
      <div className="gi-scroll">
        <dl className="gi-rows">
          {rules.rows.map((r) => (
            <div key={r.label} className="gi-row">
              <div className="gi-bar"><dt>{r.label}</dt><dd>{r.value}</dd></div>
              {r.note && <p>{r.note}</p>}
            </div>
          ))}
        </dl>
        <dl className="gi-rows gi-features">
          {rules.features.map((f) => (
            <div key={f.label} className="gi-row">
              <div className="gi-bar"><dt><span className="gi-ico" aria-hidden="true">{f.icon}</span>{f.label}</dt><dd>{f.value}</dd></div>
              {f.note && <p>{f.note}</p>}
            </div>
          ))}
        </dl>
        <section className="gi-rules">
          <h3>{rules.rulesTitle}</h3>
          {rules.rulesText.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
          {rules.handRanks && (
            <>
              <h4>Hand ranking (high to low)</h4>
              <ol className="gi-ranks">{rules.handRanks.map((h) => <li key={h}>{h}</li>)}</ol>
            </>
          )}
        </section>
      </div>
    </aside>
  );
}
