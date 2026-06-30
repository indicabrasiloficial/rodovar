import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './utils/speech.ts';

// Interceptor global do window.open para reutilizar a mesma aba do WhatsApp
const originalWindowOpen = window.open;

// @ts-ignore
window.open = function(url?: string | URL, target?: string, features?: string) {
  const urlStr = url ? String(url) : '';
  const isWhatsApp = target === 'whatsapp' || 
                     urlStr.includes('whatsapp.com') || 
                     urlStr.includes('wa.me/');

  if (isWhatsApp && urlStr) {
    // Usamos o target 'whatsapp' para que o navegador reutilize a mesma aba nativamente.
    // Mantemos a URL original (ex: wa.me ou api.whatsapp.com) para evitar conflitos de múltiplas instâncias do Web Client e fechamento inesperado de abas.
    const w = originalWindowOpen.call(window, urlStr, 'whatsapp', features);
    if (w) {
      try {
        w.focus();
      } catch (e) {
        console.warn("Could not focus WhatsApp tab:", e);
      }
    }
    return w;
  }
  return originalWindowOpen.call(window, url || '', target || '', features || '');
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
