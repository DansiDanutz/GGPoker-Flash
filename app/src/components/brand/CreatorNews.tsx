import React, { useEffect, useRef } from 'react';
import { CREATOR_AVATAR_LARGE, CREATOR_NEWS, PROJECT_NAME } from '../../lib/creator';

interface CreatorNewsProps {
  readonly onClose: () => void;
}

/** News card from the creator: DanGG is going open source. Closes on the button, backdrop or Escape. */
export function CreatorNews({ onClose }: CreatorNewsProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cn-backdrop" onClick={onClose}>
      <article
        className="cn-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cn-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cn-head">
          <img className="cn-avatar" src={CREATOR_AVATAR_LARGE} alt="Dan" width={88} height={88} />
          <div>
            <small className="cn-kicker">{CREATOR_NEWS.kicker}</small>
            <h2 id="cn-title">{CREATOR_NEWS.title}</h2>
            <span className="cn-badge"><GitHubMark />{CREATOR_NEWS.badge}</span>
          </div>
        </div>
        <div className="cn-body">
          {CREATOR_NEWS.paragraphs.map((p) => <p key={p}>{p}</p>)}
          <p className="cn-sign">{CREATOR_NEWS.signature} · {PROJECT_NAME}</p>
        </div>
        <button ref={closeRef} type="button" className="cn-close" onClick={onClose}>{CREATOR_NEWS.close}</button>
      </article>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 0 0-2.53 15.6c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0z" />
    </svg>
  );
}
