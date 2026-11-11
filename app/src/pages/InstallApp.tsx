import React, { useEffect, useReducer, useState } from 'react';
import { useApp } from '../lib/store';
import {
  detectPlatform,
  installPromptAvailable,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from '../lib/install';

function PhoneGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <rect x="7" y="2.5" width="10" height="19" rx="2.4" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M10.5 5.2h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="18.4" r="1" fill="currentColor" />
    </svg>
  );
}

function BoltGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M13 2.5 5.5 13.2h5.2L10.6 21.5 18.5 10.6h-5.3z" fill="currentColor" />
    </svg>
  );
}

function CardsGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <rect x="3.2" y="6.2" width="8.6" height="12.2" rx="1.6" transform="rotate(-12 7.5 12.3)" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <rect x="10.4" y="5.2" width="8.6" height="12.2" rx="1.6" transform="rotate(9 14.7 11.3)" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="share-glyph">
      <path d="M12 3v11" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M8.5 6.5 12 3l3.5 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function InstallApp() {
  const { brand, user, finishInstall, dismissInstall } = useApp();
  const [platform] = useState(detectPlatform);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [manual, setManual] = useState(false);
  const [iosSteps, setIosSteps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => subscribeInstall(() => {
    bump();
    if (isStandalone()) setInstalled(true);
  }), []);

  const promptReady = installPromptAvailable();
  const isAndroid = platform === 'android';
  const isIos = platform === 'ios';
  const download = async () => {
    if (isStandalone()) { finishInstall(); return; }
    if (isIos) { setIosSteps(true); return; }
    if (isAndroid && promptReady) {
      setBusy(true);
      const outcome = await promptInstall();
      setBusy(false);
      if (outcome === 'accepted') {
        setInstalled(true);
        window.setTimeout(() => finishInstall(), 900);
      } else {
        // Dismissed or unavailable: Chrome still allows the manual menu path.
        setManual(true);
      }
      return;
    }
    setManual(true);
  };

  return (
    <div className="install-screen">
      <div className="install-glow" aria-hidden="true" />
      <div className="install-card">
        <img className="install-logo" src={brand.logo} alt="DanGG.ro" />
        <p className="install-kicker">ONE LAST STEP</p>
        <h1 className="install-title">Get the DanGG.ro app</h1>
        <p className="install-sub">
          {user ? `${user.nick}, install` : 'Install'} the app on your phone to play full-screen:
          home-screen icon, one-tap launch and faster loading than the browser tab.
        </p>

        <ul className="install-features">
          <li><PhoneGlyph /> Home-screen icon</li>
          <li><BoltGlyph /> Faster start</li>
          <li><CardsGlyph /> Full-screen tables</li>
        </ul>

        {installed ? (
          <div className="install-done" role="status">
            <b>App installed</b>
            <span>Open DanGG.ro from your home screen — see you at the tables.</span>
            <button className="btn btn-red btn-block install-primary" onClick={finishInstall}>Continue</button>
          </div>
        ) : (
          <>
            <button
              className="btn btn-red btn-block install-primary"
              onClick={download}
              disabled={busy}
            >
              {busy ? 'Opening installer…' : 'Download App'}
            </button>
            <p className="install-platform">
              {isIos && 'iPhone / iPad · adds the app to your Home Screen'}
              {isAndroid && (promptReady ? 'Android · one-tap install' : 'Android · install from the browser menu')}
              {!isIos && !isAndroid && 'Install this site as an app from your browser menu'}
            </p>
          </>
        )}

        {iosSteps && !installed && (
          <ol className="install-steps" aria-label="Add to Home Screen on iPhone">
            <li>
              Tap the <ShareGlyph /> <b>Share</b> button in your browser's toolbar.
            </li>
            <li>Scroll the share sheet and tap <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b> — the DanGG.ro icon appears on your Home Screen.</li>
          </ol>
        )}

        {manual && !installed && (
          <ol className="install-steps" aria-label="Install from the browser menu">
            {isAndroid && <li>Open the <b>⋮</b> menu in Chrome.</li>}
            {!isAndroid && <li>Open your browser menu.</li>}
            <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
            <li>Confirm — DanGG.ro opens in its own full-screen window.</li>
          </ol>
        )}

        {isIos && iosSteps && !installed && (
          <button className="btn btn-dark btn-block install-secondary" onClick={finishInstall}>
            I added it — continue
          </button>
        )}

        <button className="install-skip" onClick={dismissInstall}>
          Continue in browser
        </button>

        <p className="install-note">
          Play money only · no real-money deposits or cash value.
        </p>
      </div>
    </div>
  );
}
