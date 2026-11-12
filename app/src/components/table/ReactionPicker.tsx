import { useEffect, useRef, useState } from 'react';
import { REACTIONS, type ReactionId } from '../../lib/tableChat';

// Artwork comes from the C2 asset pipeline (`/assets/reactions/<id>.png`, not committed).
// Until it is extracted, every reaction renders as a labelled CSS chip, never an emoji.
const artUrl = (id: ReactionId) => `/assets/reactions/${id}.png`;

let artProbe: Promise<boolean> | null = null;
function probeArtwork(): Promise<boolean> {
  if (!artProbe) {
    artProbe = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = artUrl(1);
    });
  }
  return artProbe;
}

/** True once the reaction artwork is known to be present; checked once per session. */
export function useReactionArtwork(): boolean {
  const [hasArt, setHasArt] = useState(false);
  useEffect(() => {
    let live = true;
    probeArtwork().then((ok) => { if (live) setHasArt(ok); });
    return () => { live = false; };
  }, []);
  return hasArt;
}

type ArtProps = { id: ReactionId; label: string; size?: 'seat' | 'grid' | 'inline' };

export function ReactionArt({ id, label, size = 'grid' }: ArtProps) {
  const hasArt = useReactionArtwork();
  if (hasArt) return <img className={`reaction-art reaction-art-${size}`} src={artUrl(id)} alt={label} draggable={false} />;
  return <span className={`reaction-chip reaction-chip-${id} reaction-art-${size}`}>{label}</span>;
}

type PickerProps = {
  onPick: (id: ReactionId) => void;
  onClose: () => void;
};

export function ReactionPicker({ onPick, onClose }: PickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: PointerEvent) => {
      // The wrapper holds the toggle button too, so pressing it doesn't close and reopen.
      const scope = ref.current?.parentElement || ref.current;
      if (scope && !scope.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="reaction-picker" role="menu" aria-label="Send a reaction">
      {REACTIONS.map((r) => (
        <button key={r.id} type="button" role="menuitem" title={r.label} aria-label={r.label}
          onClick={() => { onPick(r.id); onClose(); }}>
          <ReactionArt id={r.id} label={r.label} />
        </button>
      ))}
    </div>
  );
}
