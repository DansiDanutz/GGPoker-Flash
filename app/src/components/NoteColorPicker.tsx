import { NOTE_COLOR_IDS, noteColorHex, noteColorTitle } from '../lib/noteColors';

type Props = {
  value: string;
  labels: readonly string[];
  onChange: (id: string) => void;
};

/** Eleven native note colours; hovering or selecting shows the owner's private title. */
export function NoteColorPicker({ value, labels, onChange }: Props) {
  return (
    <div className="note-colors" role="radiogroup" aria-label="Note label">
      {NOTE_COLOR_IDS.map((id) => {
        const title = noteColorTitle(id, labels);
        const selected = noteColorHex(value) === noteColorHex(id);
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={title}
            title={title}
            className={'note-swatch' + (selected ? ' selected' : '')}
            style={{ background: noteColorHex(id) }}
            onClick={() => onChange(id)}
          />
        );
      })}
      <span className="note-color-name">{noteColorTitle(value, labels)}</span>
    </div>
  );
}
