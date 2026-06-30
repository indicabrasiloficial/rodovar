import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './utils/speech.ts';

// Interceptor global do window.open para reutilizar a mesma aba do WhatsApp
const originalWindowOpen = window.open;
let whatsappWindowRef: Window | null = null;

// @ts-ignore
window.open = function(url?: string | URL, target?: string, features?: string) {
  if (target === 'whatsapp' && url) {
    if (whatsappWindowRef && !whatsappWindowRef.closed) {
      try {
        // Altera a URL da aba já aberta em vez de criar uma nova
        whatsappWindowRef.location.href = String(url);
        whatsappWindowRef.focus();
        return whatsappWindowRef;
      } catch (e) {
        // Fallback caso a aba tenha sido fechada ou bloqueada por segurança
        whatsappWindowRef = originalWindowOpen.call(window, url, 'whatsapp', features);
        return whatsappWindowRef;
      }
    } else {
      whatsappWindowRef = originalWindowOpen.call(window, url, 'whatsapp', features);
      return whatsappWindowRef;
    }
  }
  return originalWindowOpen.call(window, url || '', target || '', features || '');
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
