import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './utils/speech.ts';

// Interceptor global do window.open para reutilizar a mesma aba do WhatsApp
const originalWindowOpen = window.open;

function getDirectWhatsAppWebUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    let phone = '';
    let text = '';

    if (url.hostname === 'wa.me' || url.hostname.endsWith('.wa.me')) {
      phone = url.pathname.replace(/^\//, '');
      text = url.searchParams.get('text') || '';
    } else if (url.hostname === 'api.whatsapp.com' || url.hostname.endsWith('.api.whatsapp.com')) {
      phone = url.searchParams.get('phone') || '';
      text = url.searchParams.get('text') || '';
    } else if (url.hostname === 'web.whatsapp.com' || url.hostname.endsWith('.web.whatsapp.com')) {
      phone = url.searchParams.get('phone') || '';
      text = url.searchParams.get('text') || '';
    } else {
      return urlStr;
    }

    const newUrl = new URL('https://web.whatsapp.com/send/');
    if (phone) {
      newUrl.searchParams.set('phone', phone);
    }
    if (text) {
      newUrl.searchParams.set('text', text);
    }
    return newUrl.toString();
  } catch (err) {
    if (typeof urlStr === 'string') {
      if (urlStr.includes('wa.me/')) {
        const match = urlStr.match(/wa\.me\/([^?#\s]+)/);
        const phone = match ? match[1] : '';
        const textMatch = urlStr.match(/[?&]text=([^&#\s]+)/);
        const text = textMatch ? decodeURIComponent(textMatch[1]) : '';
        const newUrl = new URL('https://web.whatsapp.com/send/');
        if (phone) newUrl.searchParams.set('phone', phone);
        if (text) newUrl.searchParams.set('text', text);
        return newUrl.toString();
      }
      if (urlStr.includes('api.whatsapp.com/send')) {
        const phoneMatch = urlStr.match(/[?&]phone=([^&#\s]+)/);
        const phone = phoneMatch ? phoneMatch[1] : '';
        const textMatch = urlStr.match(/[?&]text=([^&#\s]+)/);
        const text = textMatch ? decodeURIComponent(textMatch[1]) : '';
        const newUrl = new URL('https://web.whatsapp.com/send/');
        if (phone) newUrl.searchParams.set('phone', phone);
        if (text) newUrl.searchParams.set('text', text);
        return newUrl.toString();
      }
    }
    return urlStr;
  }
}

// @ts-ignore
window.open = function(url?: string | URL, target?: string, features?: string) {
  const urlStr = url ? String(url) : '';
  const isWhatsApp = target === 'whatsapp' || 
                     urlStr.includes('whatsapp.com') || 
                     urlStr.includes('wa.me/');

  if (isWhatsApp && urlStr) {
    const rewrittenUrl = getDirectWhatsAppWebUrl(urlStr);
    // Usamos um nome de janela fixo para que o navegador reutilize nativamente a mesma aba
    const w = originalWindowOpen.call(window, rewrittenUrl, 'whatsapp_shared_tab', features);
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
