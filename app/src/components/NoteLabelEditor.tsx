import { useEffect, useState } from 'react';
import { LABEL_MAX, NOTE_COLORS, noteColorTitle, normalizeLabels } from '../lib/noteColors';

type Props = {
  labels: readonly string[];
  onSaved: (labels: string[]) => void;
};

/** Ten private label titles, one per native note colour (draft, then Save). */
export function NoteLabelEditor({ labels, onSaved }: Props) {
  const [draft, setDraft] = useState<string[]>(() => [...labels]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => { setDraft([...labels]); }, [labels]);

  const dirty = draft.some((t, i) => t !== labels[i]);

  async function save() {
    setStatus('saving');
    try {
      const res = await fetch('/api/notes/labels', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` },
        body: JSON.stringify({ labels: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save labels');
      onSaved(normalizeLabels(data.labels));
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="card note-label-editor" style={{ marginTop: 14 }}>
      <div className="panel-title">Label titles</div>
      <p className="muted small">Name your note colours. Titles are private to your account.</p>
      <div className="note-label-grid">
        {draft.map((title, i) => (
          <label key={i} className="note-label-row">
            <span className="note-swatch" style={{ background: NOTE_COLORS[i] }} aria-hidden="true" />
            <input
              value={title}
              maxLength={LABEL_MAX}
              placeholder={noteColorTitle(`c${i}`, [])}
              aria-label={`Title for label ${i + 1}`}
              onChange={(e) => {
                const value = e.target.value.replace(/[\r\n]/g, ' ');
                setDraft((cur) => cur.map((t, j) => (j === i ? value : t)));
                setStatus('idle');
              }}
            />
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-red btn-sm" disabled={!dirty || status === 'saving'} onClick={save}>Save titles</button>
        <button className="btn btn-ghost btn-sm" disabled={!dirty} onClick={() => { setDraft([...labels]); setStatus('idle'); }}>Cancel</button>
        {status === 'saved' && <span className="muted small">Saved</span>}
        {status === 'error' && <span className="small" style={{ color: '#ff7b6b' }}>Could not save. Your edits are kept; try again.</span>}
      </div>
    </div>
  );
}
