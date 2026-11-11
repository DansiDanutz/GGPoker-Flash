import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './lib/store';
import { I18nProvider } from './lib/i18n';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <AppProvider>
      <App />
    </AppProvider>
  </I18nProvider>
);
