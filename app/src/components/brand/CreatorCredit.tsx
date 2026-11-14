import React from 'react';
import { CREATOR_AVATAR, PROJECT_NAME, creatorCredit } from '../../lib/creator';
import '../../creator-credit.css';

interface CreatorCreditProps {
  readonly className?: string;
}

/** The creator's avatar with the project name and the "built free" credit line. */
export function CreatorCredit({ className = '' }: CreatorCreditProps) {
  return (
    <div className={`creator-credit ${className}`.trim()}>
      <img className="creator-credit-avatar" src={CREATOR_AVATAR} alt="" width={40} height={40} />
      <span>
        <b>{PROJECT_NAME}</b>
        <small>{creatorCredit()}</small>
      </span>
    </div>
  );
}
