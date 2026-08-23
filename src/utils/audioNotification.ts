/**
 * Utilitário de Notificação Sonora e Jingle Oficial Rodovar
 * Executa a música oficial de entrega da Rodovar na abertura da página
 */

export const ENTREGUE_AUDIO_URL = 'https://rodovar.com.br/wp-content/uploads/2026/08/WhatsApp-Audio-2026-08-20-at-14.08.07-online-audio-converter.com_.mp3';

// Armazena códigos/cargas que já tiveram o som reproduzido na sessão atual
const playedDeliveryKeys = new Set<string>();

let cachedAudioInstance: HTMLAudioElement | null = null;
let unlockTriggerRegistered = false;

/**
 * Pré-carregamento imediato do arquivo em memória
 */
export function preloadDeliveryAudio(): void {
  if (typeof window === 'undefined') return;
  if (!cachedAudioInstance) {
    try {
      cachedAudioInstance = new Audio(ENTREGUE_AUDIO_URL);
      cachedAudioInstance.preload = 'auto';
      cachedAudioInstance.volume = 1.0;
      cachedAudioInstance.load();
    } catch (e) {
      console.warn('Falha no pré-carregamento de áudio:', e);
    }
  }
}

// Inicializa o buffer logo no carregamento do script
if (typeof window !== 'undefined') {
  preloadDeliveryAudio();
}

/**
 * Executa a música oficial de entrega
 */
export function playEntregueAudio(identifier?: string, force = false): void {
  if (typeof window === 'undefined') return;

  const key = identifier ? String(identifier).toUpperCase().trim() : 'DEFAULT_ENTREGUE';

  if (!force && playedDeliveryKeys.has(key)) {
    return;
  }

  preloadDeliveryAudio();

  const audio = cachedAudioInstance || new Audio(ENTREGUE_AUDIO_URL);
  audio.volume = 1.0;
  audio.currentTime = 0;

  const playPromise = audio.play();

  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        playedDeliveryKeys.add(key);
        console.log('🎵 Jingle oficial Rodovar reproduzido com sucesso!');
      })
      .catch(() => {
        console.log('ℹ️ Navegador aguardando interação do usuário para áudio. Disparando no primeiro toque/clique/tecla.');

        if (!unlockTriggerRegistered) {
          unlockTriggerRegistered = true;

          const triggerPlayOnInteraction = () => {
            if (playedDeliveryKeys.has(key) && !force) return;

            const activeAudio = cachedAudioInstance || new Audio(ENTREGUE_AUDIO_URL);
            activeAudio.volume = 1.0;
            activeAudio.currentTime = 0;

            activeAudio
              .play()
              .then(() => {
                playedDeliveryKeys.add(key);
                console.log('🎵 Jingle oficial Rodovar iniciado na primeira interação!');
                removeUnlockListeners(triggerPlayOnInteraction);
                unlockTriggerRegistered = false;
              })
              .catch(() => {});
          };

          addUnlockListeners(triggerPlayOnInteraction);
        }
      });
  }
}

function addUnlockListeners(handler: () => void) {
  if (typeof window === 'undefined') return;
  const opts = { capture: true, passive: true };
  window.addEventListener('click', handler, { capture: true });
  window.addEventListener('touchstart', handler, opts);
  window.addEventListener('touchend', handler, opts);
  window.addEventListener('pointerdown', handler, { capture: true });
  window.addEventListener('scroll', handler, opts);
  window.addEventListener('wheel', handler, opts);
  window.addEventListener('keydown', handler, { capture: true });
}

function removeUnlockListeners(handler: () => void) {
  if (typeof window === 'undefined') return;
  window.removeEventListener('click', handler, { capture: true });
  window.removeEventListener('touchstart', handler);
  window.removeEventListener('touchend', handler);
  window.removeEventListener('pointerdown', handler, { capture: true });
  window.removeEventListener('scroll', handler);
  window.removeEventListener('wheel', handler);
  window.removeEventListener('keydown', handler, { capture: true });
}

// Expõe globalmente para teste no console
if (typeof window !== 'undefined') {
  (window as any).playEntregueAudio = (force = true) => playEntregueAudio('TEST', force);
}
