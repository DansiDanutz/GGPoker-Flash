import React from 'react';
import { useApp } from '../lib/store';

export function FirstLaunch() {
  const { user, brand, dismissFirstLaunch, navigate } = useApp();

  const seeRewards = () => {
    dismissFirstLaunch();
    navigate('/rewards');
  };

  return (
    <div className="welcome-screen" role="dialog" aria-modal="true" aria-label="Welcome to the app">
      <div className="welcome-card">
        <button className="welcome-close" aria-label="Close" onClick={dismissFirstLaunch}>✕</button>
        <img className="welcome-logo" src={brand.logo} alt="DanGG.ro" />
        <p className="install-kicker">YOU&apos;RE IN</p>
        <h1 className="welcome-title">{user ? `Welcome, ${user.nick}` : 'Welcome to DanGG.ro'}</h1>
        <p className="welcome-sub">The app is ready. Three things worth knowing:</p>
        <ul className="welcome-tips">
          <li>
            <b>1</b>
            <span><b>Pick a table</b> in the Lobby — tap any table to open the buy-in sheet.</span>
          </li>
          <li>
            <b>2</b>
            <span><b>Stay in the game</b> — the app keeps you signed in and remembers your table settings.</span>
          </li>
          <li>
            <b>3</b>
            <span><b>Collect as you play</b> — daily missions, tickets and the leaderboard live under Rewards.</span>
          </li>
        </ul>
        <button className="btn btn-red btn-block install-primary" onClick={dismissFirstLaunch}>Start playing</button>
        <button className="install-skip" onClick={seeRewards}>See rewards first</button>
      </div>
    </div>
  );
}
