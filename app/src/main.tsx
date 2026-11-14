import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './lib/store';
import { WaitlistProvider } from './lib/waitlistState';
import { I18nProvider } from './lib/i18n';
import { VersionGate } from './components/VersionGate';
import './styles.css';
import './design-v2.css';
import './vivid.css';
import './responsive.css';
import './lobby-filters.css';
import './tournament-filters.css';
import './table-chat.css';
import './phone-shell.css';
import './slots.css';
import './tournaments-ref.css';
import './home-feed.css';
import './mypage.css';
import './ocean.css';
import './game-tabs.css';
import './cashier.css';

createRoot(document.getElementById('root')!).render(
  <VersionGate>
    <I18nProvider>
      <AppProvider>
        <WaitlistProvider>
          <App />
        </WaitlistProvider>
      </AppProvider>
    </I18nProvider>
  </VersionGate>
);

// Production only: the service worker makes the phone client installable and
// keeps the shell available on a weak connection. It stays out of the Vite dev
// server so HMR is never served from a cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Only reload when an existing worker is replaced, not on the first install.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    // A new worker means a new app build; reload once so the phone leaves the
    // old cached bundle behind.
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => registration.update().catch(() => undefined))
      .catch(() => { /* installable features stay optional */ });
  });
}
