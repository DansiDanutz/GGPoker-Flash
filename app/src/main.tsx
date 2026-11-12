import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './lib/store';
import { WaitlistProvider } from './lib/waitlistState';
import { I18nProvider } from './lib/i18n';
import './styles.css';
import './design-v2.css';
import './responsive.css';
import './lobby-filters.css';
import './tournament-filters.css';

createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <AppProvider>
      <WaitlistProvider>
        <App />
      </WaitlistProvider>
    </AppProvider>
  </I18nProvider>
);

// Production only: the service worker makes the phone client installable and
// keeps the shell available on a weak connection. It stays out of the Vite dev
// server so HMR is never served from a cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* installable features stay optional */ });
  });
}
