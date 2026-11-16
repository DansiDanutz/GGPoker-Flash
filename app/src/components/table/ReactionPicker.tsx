import { useEffect, useRef, useState } from 'react';
import { REACTIONS, type ReactionId } from '../../lib/tableChat';

// Sticker art lives at `/assets/reactions/<id>.webp`. Each reaction is probed on its own, so a
// partly delivered set still shows what exists; a missing one renders as a labelled chip.
const artUrl = (id: ReactionId) => `/assets/reactions/${id}.webp`;

const probes = new Map<ReactionId, Promise<boolean>>();
function probeArtwork(id: ReactionId): Promise<boolean> {
  let probe = probes.get(id);
  if (!probe) {
    probe = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = artUrl(id);
    });
    probes.set(id, probe);
  }
  return probe;
}

/** True once this reaction's artwork is known to be present; checked once per session. */
export function useReactionArtwork(id: ReactionId): boolean {
  const [hasArt, setHasArt] = useState(false);
  useEffect(() => {
    let live = true;
    probeArtwork(id).then((ok) => { if (live) setHasArt(ok); });
    return () => { live = false; };
  }, [id]);
  return hasArt;
}

type ArtProps = { id: ReactionId; label: string; size?: 'seat' | 'grid' | 'inline' };

export function ReactionArt({ id, label, size = 'grid' }: ArtProps) {
  const hasArt = useReactionArtwork(id);
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
