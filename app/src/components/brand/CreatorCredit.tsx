import React, { useState } from 'react';
import { CREATOR_AVATAR, PROJECT_NAME, creatorCredit } from '../../lib/creator';
import { CreatorNews } from './CreatorNews';
import '../../creator-credit.css';

interface CreatorCreditProps {
  readonly className?: string;
  /** When true the badge is a button that opens the creator's news card. */
  readonly withNews?: boolean;
}

/** The creator's avatar with the project name and the "built free" credit line. */
export function CreatorCredit({ className = '', withNews = false }: CreatorCreditProps) {
  const [open, setOpen] = useState(false);
  const classes = `creator-credit ${withNews ? 'creator-credit-btn' : ''} ${className}`.replace(/\s+/g, ' ').trim();
  const content = (
    <>
      <img className="creator-credit-avatar" src={CREATOR_AVATAR} alt="" width={40} height={40} />
      <span>
        <b>{PROJECT_NAME}</b>
        <small>{creatorCredit()}</small>
      </span>
      {withNews && <i className="creator-credit-news" aria-hidden="true">1</i>}
    </>
  );

  if (!withNews) return <div className={classes}>{content}</div>;
  return (
    <>
      <button type="button" className={classes} onClick={() => setOpen(true)} aria-label={`${PROJECT_NAME}: news from Dan`}>
        {content}
      </button>
      {open && <CreatorNews onClose={() => setOpen(false)} />}
    </>
  );
}
