/**
 * NavalCommand.io Browser Client Entrypoint
 */

import { NavalCommandApp } from './app.js';

declare global {
  interface Window {
    navalApp?: NavalCommandApp;
  }
}

async function bootstrap(): Promise<void> {
  const container = document.getElementById('app') ?? document.body;
  const app = new NavalCommandApp(container);
  window.navalApp = app;
  await app.init(container);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      bootstrap().catch((err) => console.error('[NavalCommand.io] Bootstrap error:', err));
    });
  } else {
    bootstrap().catch((err) => console.error('[NavalCommand.io] Bootstrap error:', err));
  }
}
