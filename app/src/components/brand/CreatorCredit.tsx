import React, { useRef, useState } from 'react';
import { CREATOR_AVATAR, PROJECT_NAME, SWIPE_TAP_PX, creatorCredit, swipeOffset, swipeOpens } from '../../lib/creator';
import { CreatorNews } from './CreatorNews';
import '../../creator-credit.css';
import { SITE } from '../../lib/site';

interface CreatorCreditProps {
  readonly className?: string;
  /** When true the badge opens the creator's news card: slide the avatar across it, or tap it. */
  readonly withNews?: boolean;
}

type Drag = { readonly startX: number; readonly max: number; moved: boolean };

/** The creator's avatar with the project name and the "built free" credit line. */
export function CreatorCredit({ className = '', withNews = false }: CreatorCreditProps) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const drag = useRef<Drag | null>(null);
  const avatarRef = useRef<HTMLImageElement>(null);
  const sliding = offset > 0;
  const classes = `creator-credit ${withNews ? 'creator-credit-btn' : ''} ${sliding ? 'is-sliding' : ''} ${className}`.replace(/\s+/g, ' ').trim();

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const pill = e.currentTarget.getBoundingClientRect();
    const avatar = avatarRef.current?.getBoundingClientRect();
    const max = avatar ? pill.right - avatar.right - 6 : 0;
    drag.current = { startX: e.clientX, max, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > SWIPE_TAP_PX) d.moved = true;
    if (d.moved) setOffset(swipeOffset(dx, d.max));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const opens = !d.moved || swipeOpens(swipeOffset(e.clientX - d.startX, d.max), d.max);
    setOffset(0);
    if (opens) setOpen(true);
  };
  const onPointerCancel = () => { drag.current = null; setOffset(0); };

  const content = (
    <>
      <img
        ref={avatarRef}
        className="creator-credit-avatar"
        src={CREATOR_AVATAR}
        alt=""
        width={40}
        height={40}
        draggable={false}
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
      />
      <span>
        <b>{SITE.profile === 'portable' ? SITE.name : PROJECT_NAME}</b>
        <small>{creatorCredit()}</small>
      </span>
      {withNews && <i className="creator-credit-news" aria-hidden="true" style={offset ? { transform: `translateX(${offset}px)` } : undefined}>1</i>}
      {withNews && <em className="creator-credit-swipe" aria-hidden="true">›››</em>}
    </>
  );

  if (!withNews) return <div className={classes}>{content}</div>;
  return (
    <>
      <button
        type="button"
        className={classes}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
        aria-label={`${SITE.profile === 'portable' ? SITE.name : PROJECT_NAME}: slide or tap to read news from Dan`}
      >
        {content}
      </button>
      {open && <CreatorNews onClose={() => setOpen(false)} />}
    </>
  );
}
