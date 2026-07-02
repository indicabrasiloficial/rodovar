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
    // Se for link de redirecionamento de mensagem direta (wa.me ou api.whatsapp.com/send),
    // usamos '_blank' para abrir em uma nova aba e evitar que o navegador sobrescreva
    // ou feche a aba ativa que o usuário já tem aberta com o WhatsApp Web.
    const isDirectSendLink = urlStr.includes('wa.me/') || urlStr.includes('api.whatsapp.com/send');
    const finalTarget = isDirectSendLink ? '_blank' : 'whatsapp';

    const w = originalWindowOpen.call(window, urlStr, finalTarget, features);
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
