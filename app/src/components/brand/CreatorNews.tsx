import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CREATOR_AVATAR_LARGE, CREATOR_NEWS, PROJECT_NAME, sourceRepository } from '../../lib/creator';

interface CreatorNewsProps {
  readonly onClose: () => void;
}

/**
 * News card from the creator: DanGG is going open source. Closes on the button, backdrop or Escape.
 * Rendered into <body> so no page layer (the login footer) can sit over the card and swallow taps.
 */
export function CreatorNews({ onClose }: CreatorNewsProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const authorizationRef = useRef<AbortController | null>(null);
  function cancelStar() {
    authorizationRef.current?.abort();
    setBusy(false);
    setAsking(false);
  }
  useEffect(() => () => authorizationRef.current?.abort(), []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') asking ? cancelStar() : onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, asking]);

  async function authorizeStar() {
    setBusy(true);
    setError('');
    const controller = new AbortController();
    authorizationRef.current = controller;
    try {
      const response = await fetch('/api/github-star/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true }), signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || 'GitHub authorization could not start. Please try again.');
      window.location.assign(data.url);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'GitHub authorization could not start. Please try again.');
      setBusy(false);
    }
  }

  return createPortal(
    <div className="cn-backdrop" onClick={() => asking ? cancelStar() : onClose()}>
      <article
        className="cn-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cn-title"
        onClick={(e) => e.stopPropagation()}
      >
        {asking ? <>
          <div className="cn-star-emblem" aria-hidden="true">★</div>
          <h2 id="cn-title">Give OpenPoker a star?</h2>
          <div className="cn-body">
            <p>Your star helps others discover the open-source platform behind DanGG.</p>
            <p>Choose your GitHub account and authorize DanGG to add one star to <strong>OpenPoker4all/OpenPoker</strong>. This is optional and free.</p>
            {error && <p role="alert">{error} <a href={sourceRepository(__APP_SOURCE_URL__)} target="_blank" rel="noopener noreferrer">Open GitHub</a></p>}
          </div>
          <button type="button" className="cn-star-yes" disabled={busy} onClick={authorizeStar}>{busy ? 'Opening GitHub…' : 'Yes, authorize GitHub'}</button>
          <button ref={closeRef} type="button" className="cn-star-no" onClick={cancelStar}>No thanks</button>
        </> : <><div className="cn-head">
          <img className="cn-avatar" src={CREATOR_AVATAR_LARGE} alt="Dan" width={88} height={88} />
          <div>
            <small className="cn-kicker">{CREATOR_NEWS.kicker}</small>
            <h2 id="cn-title">{CREATOR_NEWS.title}</h2>
            <button type="button" className="cn-badge cn-star-button" onClick={() => { setError(''); setAsking(true); }}>
              <span className="cn-star-icon" aria-hidden="true">★</span><GitHubMark />{CREATOR_NEWS.badge}
            </button>
          </div>
        </div>
        <div className="cn-body">
          {CREATOR_NEWS.paragraphs.map((p) => <p key={p}>{p}</p>)}
          <p><a href="/openpoker">See how the OpenPoker business model works</a></p>
          <p className="cn-sign">{CREATOR_NEWS.signature} · {PROJECT_NAME}</p>
        </div>
        <button ref={closeRef} type="button" className="cn-close" onClick={onClose}>{CREATOR_NEWS.close}</button></>}
      </article>
    </div>,
    document.body,
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 0 0-2.53 15.6c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0z" />
    </svg>
  );
}
