import React from 'react';
import '../../loading-screen.css';

interface LoadingScreenProps {
  readonly logo: string;
}

/** A single DanGG advert shown only while the existing startup gates resolve. */
export function LoadingScreen({ logo }: LoadingScreenProps) {
  return (
    <div className="ls" role="status" aria-live="polite" aria-label="DanGG is loading">
      <figure className="ls-ad">
        <img className="ls-ad-image" src="/assets/brand/og-card.jpg" alt="DanGG play-money poker with a trophy, cards and poker chips" />
        <figcaption className="ls-ad-caption">
          <img className="ls-ad-logo" src={logo} alt="" />
          <span>Featured on DanGG</span>
          <strong>Cash Table · Tournaments · Spin &amp; Go</strong>
          <small>Created by DansiDanutz · Powered by OpenPoker</small>
        </figcaption>
      </figure>
      <div className="ls-progress">
        <progress aria-label="Loading DanGG" />
        <span>Connecting to DanGG…</span>
      </div>
      <p className="ls-legal">18+ · Free Play Money testing · Demo and organizer balances stay separate</p>
    </div>
  );
}
