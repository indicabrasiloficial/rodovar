/**
 * Utilitário de Notificação Sonora para Cargas Entregues
 * Toca o áudio de confirmação de entrega 1 vez ao entrar na página ou ao mudar para o status entregue.
 */

export const ENTREGUE_AUDIO_URL = 'https://rodovar.com.br/wp-content/uploads/2026/08/WhatsApp-Audio-2026-08-20-at-14.08.07-online-audio-converter.com_.mp3';

// Armazena códigos/cargas que já tiveram o som reproduzido na sessão atual
const playedDeliveryKeys = new Set<string>();

let pendingAudioTrigger: (() => void) | null = null;
let cachedAudioInstance: HTMLAudioElement | null = null;

// Pré-carrega o áudio
if (typeof window !== 'undefined') {
  try {
    cachedAudioInstance = new Audio(ENTREGUE_AUDIO_URL);
    cachedAudioInstance.preload = 'auto';
  } catch (e) {}
}

export function playEntregueAudio(identifier?: string, force = false): void {
  if (typeof window === 'undefined') return;

  const key = identifier ? String(identifier).toUpperCase().trim() : 'DEFAULT_ENTREGUE';

  if (!force && playedDeliveryKeys.has(key)) {
    return;
  }

  // Tenta reproduzir diretamente
  const audio = cachedAudioInstance || new Audio(ENTREGUE_AUDIO_URL);
  audio.volume = 1.0;
  audio.currentTime = 0;

  const playPromise = audio.play();

  if (playPromise !== undefined) {
    playPromise.then(() => {
      playedDeliveryKeys.add(key);
      console.log('✅ Áudio de entrega reproduzido com sucesso!');
    }).catch((err) => {
      console.log('ℹ️ Autoplay suspenso pelo navegador. O áudio tocará no seu primeiro clique/toque na tela.', err);

      // Limpa listeners anteriores
      if (pendingAudioTrigger) {
        removeInteractionListeners(pendingAudioTrigger);
      }

      pendingAudioTrigger = () => {
        const retryAudio = new Audio(ENTREGUE_AUDIO_URL);
        retryAudio.volume = 1.0;
        retryAudio.play().then(() => {
          playedDeliveryKeys.add(key);
          console.log('✅ Áudio de entrega reproduzido na interação do usuário!');
        }).catch(() => {});

        if (pendingAudioTrigger) {
          removeInteractionListeners(pendingAudioTrigger);
          pendingAudioTrigger = null;
        }
      };

      addInteractionListeners(pendingAudioTrigger);
    });
  }
}

function addInteractionListeners(handler: () => void) {
  window.addEventListener('click', handler, { once: true, capture: true });
  window.addEventListener('touchstart', handler, { once: true, capture: true });
  window.addEventListener('pointerdown', handler, { once: true, capture: true });
  window.addEventListener('keydown', handler, { once: true, capture: true });
}

function removeInteractionListeners(handler: () => void) {
  window.removeEventListener('click', handler, { capture: true });
  window.removeEventListener('touchstart', handler, { capture: true });
  window.removeEventListener('pointerdown', handler, { capture: true });
  window.removeEventListener('keydown', handler, { capture: true });
}

// Expõe globalmente para testes
if (typeof window !== 'undefined') {
  (window as any).playEntregueAudio = (force = true) => playEntregueAudio('TEST', force);
}
