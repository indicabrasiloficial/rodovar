/**
 * Utilitário de Notificação Sonora e Jingle Oficial Rodovar
 * Carregamento Ultra-Rápido com Armazenamento em Cache Permanente (Mobile e Desktop)
 */

export const ENTREGUE_AUDIO_URL = 'https://rodovar.com.br/wp-content/uploads/2026/08/WhatsApp-Audio-2026-08-20-at-14.08.07-online-audio-converter.com_.mp3';

const CACHE_NAME = 'rodovar-jingle-permanent-cache-v1';
const DB_NAME = 'rodovar_audio_store';
const STORE_NAME = 'jingle_blobs';

// Armazena códigos/cargas que já tiveram o som reproduzido na sessão atual
const playedDeliveryKeys = new Set<string>();

let cachedAudioInstance: HTMLAudioElement | null = null;
let cachedBlobUrl: string | null = null;
let isPreloading = false;
let isPreloadDone = false;
let unlockTriggerRegistered = false;

/**
 * Abre o banco IndexedDB para armazenamento persistente de áudio
 */
function openAudioDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB não suportado'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Salva o Blob do áudio no IndexedDB
 */
async function saveBlobToIndexedDB(blob: Blob): Promise<void> {
  try {
    const db = await openAudioDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(blob, 'entregue_jingle');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  } catch (e) {
    // Silencioso em caso de restrição de storage
  }
}

/**
 * Recupera o Blob do áudio do IndexedDB
 */
async function getBlobFromIndexedDB(): Promise<Blob | null> {
  try {
    const db = await openAudioDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('entregue_jingle');
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Pré-carregamento imediato com persistência total em Cache Storage e IndexedDB
 */
export async function preloadDeliveryAudio(): Promise<void> {
  if (typeof window === 'undefined' || isPreloading || isPreloadDone) return;
  isPreloading = true;

  try {
    // 1. Tenta recuperar do IndexedDB local (0ms de latência)
    let audioBlob = await getBlobFromIndexedDB();

    // 2. Se não estiver no IndexedDB, tenta no CacheStorage da Web API
    if (!audioBlob && 'caches' in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(ENTREGUE_AUDIO_URL);
        if (cachedResponse) {
          audioBlob = await cachedResponse.blob();
        }
      } catch (cErr) {
        // Silencioso se caches não permitido
      }
    }

    // 3. Se ainda não houver cache local, busca com prioridade alta e armazena permanentemente
    if (!audioBlob) {
      const response = await fetch(ENTREGUE_AUDIO_URL, {
        cache: 'force-cache',
        priority: 'high'
      } as RequestInit);

      if (response.ok) {
        const clonedResponse = response.clone();
        audioBlob = await response.blob();

        // Salva nos dois mecanismos de cache para redundância máxima
        if ('caches' in window) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(ENTREGUE_AUDIO_URL, clonedResponse);
          } catch {}
        }
        if (audioBlob) {
          saveBlobToIndexedDB(audioBlob);
        }
      }
    }

    // 4. Cria URL local em memória a partir do Blob
    if (audioBlob) {
      cachedBlobUrl = URL.createObjectURL(audioBlob);
    }

    // 5. Instancia o objeto Audio pré-carregado
    const audioSrc = cachedBlobUrl || ENTREGUE_AUDIO_URL;
    cachedAudioInstance = new Audio(audioSrc);
    cachedAudioInstance.preload = 'auto';
    cachedAudioInstance.volume = 1.0;
    cachedAudioInstance.load();

    isPreloadDone = true;
  } catch (err) {
    console.warn('Fallback de inicialização direta de áudio:', err);
    if (!cachedAudioInstance) {
      cachedAudioInstance = new Audio(ENTREGUE_AUDIO_URL);
      cachedAudioInstance.preload = 'auto';
      cachedAudioInstance.volume = 1.0;
    }
  } finally {
    isPreloading = false;
  }
}

// Inicia o pré-carregamento imediato no momento em que o módulo é importado
if (typeof window !== 'undefined') {
  preloadDeliveryAudio();
}

/**
 * Executa a música oficial de entrega instantaneamente
 */
export function playEntregueAudio(identifier?: string, force = false): void {
  if (typeof window === 'undefined') return;

  const key = identifier ? String(identifier).toUpperCase().trim() : 'DEFAULT_ENTREGUE';

  if (!force && playedDeliveryKeys.has(key)) {
    return;
  }

  // Garante que o áudio seja inicializado caso ainda não tenha sido
  const audioSrc = cachedBlobUrl || ENTREGUE_AUDIO_URL;
  const audio = cachedAudioInstance || new Audio(audioSrc);
  audio.volume = 1.0;
  audio.currentTime = 0;

  const playPromise = audio.play();

  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        playedDeliveryKeys.add(key);
        console.log('🎵 Jingle oficial Rodovar reproduzido instantaneamente!');
      })
      .catch(() => {
        // Se a política de autoplay do navegador exigir interação do usuário,
        // aciona instantaneamente na primeira ação/toque/rolagem na tela
        if (!unlockTriggerRegistered) {
          unlockTriggerRegistered = true;

          const triggerPlayOnInteraction = () => {
            if (playedDeliveryKeys.has(key) && !force) return;

            const activeAudio = cachedAudioInstance || new Audio(cachedBlobUrl || ENTREGUE_AUDIO_URL);
            activeAudio.volume = 1.0;
            activeAudio.currentTime = 0;

            activeAudio
              .play()
              .then(() => {
                playedDeliveryKeys.add(key);
                console.log('🎵 Jingle oficial Rodovar reproduzido na primeira interação!');
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
