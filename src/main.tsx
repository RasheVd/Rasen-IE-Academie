import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource/anton';
import './styles/app.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { boot, logError } from './store';
import { applyTheme } from './domain/theme';

applyTheme(undefined);
boot();
// Galat di browser pengguna dicatat ke Pusat data admin (maks 30 per 10 menit per akun).
window.addEventListener('error', (e) => logError(e.message || 'Galat skrip', `${e.filename ?? ''}:${e.lineno ?? ''}\n${(e.error as Error | undefined)?.stack ?? ''}`));
window.addEventListener('unhandledrejection', (e) => { const r = e.reason as Error | undefined; if (r?.name !== 'AppError') logError(r?.message ?? String(e.reason), r?.stack ?? ''); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
