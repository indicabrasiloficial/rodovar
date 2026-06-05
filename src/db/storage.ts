import { Entrega } from '../types';
import { db, auth, OperationType, handleFirestoreError } from './firebase';
import { calculateRealisticDistanceKm, findCityCoords } from '../utils/distance';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  writeBatch
} from 'firebase/firestore';

const ENTREGAS_COLLECTION = 'entregas';
const MESSAGES_COLLECTION = 'scheduled_messages';

// Memory caches
let cachedEntregas: Entrega[] = [];
let cachedScheduledMessages: any[] = [];

// Custom events matching original design
const REALTIME_EVENT = 'rodovar_realtime_event';
const SCHEDULED_REALTIME_EVENT = 'rodovar_scheduled_realtime_event';

// SEED DATA
const SEED_ENTREGAS: Omit<Entrega, 'userId'>[] = [];

const SEED_MESSAGES: any[] = [];

// Setup real-time listeners upon auth state change (Optimized to always run for unauthenticated workspace)
const uid = 'system_operator';

// Listen to entregas (entire collection for shared multi-user workspace)
const entregasQuery = collection(db, ENTREGAS_COLLECTION);
onSnapshot(entregasQuery, async (snapshot) => {
  if (snapshot.empty) {
    cachedEntregas = [];
    window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: { action: 'SYNC' } }));
    return;
  }

  cachedEntregas = [];
  snapshot.forEach(docSnap => {
    // Actively purge any preset seed IDs created automatically in previous versions
    const seedIds = ['ent-1', 'ent-2', 'ent-3', 'ent-4', 'ent-5'];
    if (seedIds.includes(docSnap.id)) {
      deleteDoc(doc(db, ENTREGAS_COLLECTION, docSnap.id)).catch(() => {});
      return; // skip caching
    }

    const data = docSnap.data();
    const kmVal = data.km !== undefined && data.km > 0 
      ? Number(data.km) 
      : calculateRealisticDistanceKm(data.origem || '', data.destino || '');
    
    // Auto-heal coordinates if they were incorrectly reset/cleared or set to default São Paulo coordinates for other destinations
    let latVal = data.lat !== undefined ? Number(data.lat) : 0;
    let lngVal = data.lng !== undefined ? Number(data.lng) : 0;
    const dest = data.destino || '';

    if ((!latVal || !lngVal || (latVal === -23.5505 && lngVal === -46.6333)) && dest && !dest.toLowerCase().includes('são paulo') && !dest.toLowerCase().includes('sao paulo')) {
      const cityCoords = findCityCoords(dest);
      latVal = cityCoords.lat;
      lngVal = cityCoords.lng;
    }

    cachedEntregas.push({
      id: docSnap.id,
      ...data,
      lat: latVal || -23.5505,
      lng: lngVal || -46.6333,
      km: kmVal
    } as Entrega);
  });

  // Sort by updated_at or created_at descending
  cachedEntregas.sort((a, b) => new Date(b.created_at || b.updated_at).getTime() - new Date(a.created_at || a.updated_at).getTime());

  // Trigger standard local Custom Event so React re-renders synchronously
  window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: { action: 'SYNC' } }));
}, (error) => {
  handleFirestoreError(error, OperationType.GET, ENTREGAS_COLLECTION);
});

// Listen to scheduled messages (entire collection for shared multi-user workspace)
const messagesQuery = collection(db, MESSAGES_COLLECTION);
onSnapshot(messagesQuery, (snapshot) => {
  cachedScheduledMessages = [];
  snapshot.forEach(docSnap => {
    // Actively purge preset seed messages
    const seedMsgIds = ['sch-1', 'sch-2'];
    if (seedMsgIds.includes(docSnap.id)) {
      deleteDoc(doc(db, MESSAGES_COLLECTION, docSnap.id)).catch(() => {});
      return; // skip caching
    }

    cachedScheduledMessages.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  cachedScheduledMessages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Trigger standard local Custom Event
  window.dispatchEvent(new CustomEvent(SCHEDULED_REALTIME_EVENT, { detail: { action: 'SYNC' } }));
}, (error) => {
  handleFirestoreError(error, OperationType.GET, MESSAGES_COLLECTION);
});

// Sync data retrievers
export function getEntregas(): Entrega[] {
  return cachedEntregas;
}

export function getEntregaById(id: string): Entrega | undefined {
  return cachedEntregas.find(e => e.id === id);
}

export function extractCoordsFromLink(link: string): { lat: number; lng: number } | null {
  if (!link) return null;
  try {
    const decoded = decodeURIComponent(link);
    const regex = /(-?\d+\.\d+)\s*[,;\s]\s*(-?\d+\.\d+)/g;
    let match;
    while ((match = regex.exec(decoded)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
  } catch (e) {
    console.error('Error parsing coordinates from link:', e);
  }
  return null;
}

function getSimilarity(s1: string, s2: string): number {
  const u1 = (s1 || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const u2 = (s2 || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!u1 || !u2) return 0;
  if (u1 === u2) return 1.0;
  if (u1.includes(u2) || u2.includes(u1)) return 0.8;
  const w1 = u1.split(/\s+/);
  const w2 = u2.split(/\s+/);
  const common = w1.filter(w => w.length > 2 && w2.includes(w));
  if (common.length > 0) return 0.5;
  return 0;
}

// Write/Delete functions - Return Synchronously with Optimistic caching, syncing asynchronously in background
export function saveEntrega(entrega: Partial<Entrega> & { id?: string }): Entrega {
  const uid = auth.currentUser?.uid || 'system_operator';

  // Geolocation helper coordination
  if (entrega.link_localizacao) {
    const coords = extractCoordsFromLink(entrega.link_localizacao);
    if (coords) {
      entrega.lat = coords.lat;
      entrega.lng = coords.lng;
    }
  }

  // Search existing for possible merged duplicates (fuzzy matching)
  if (!entrega.id) {
    let bestMatch: Entrega | null = null;
    let highestScore = 0;

    for (const existing of cachedEntregas) {
      let score = 0;
      const origSim = getSimilarity(existing.origem, entrega.origem || '');
      const destSim = getSimilarity(existing.destino, entrega.destino || '');
      const dateMatch = existing.data_coleta === entrega.data_coleta;

      if (origSim >= 0.8 && destSim >= 0.8 && dateMatch) {
        score += 3.0;
        const vendSim = getSimilarity(existing.vendedor, entrega.vendedor || '');
        if (vendSim >= 0.5) score += vendSim * 1.5;

        const clientSim = getSimilarity(existing.cliente, entrega.cliente || '');
        if (clientSim >= 0.5) score += clientSim * 1.5;

        const motoristaSim = getSimilarity(existing.motorista, entrega.motorista || '');
        if (motoristaSim >= 0.5) score += motoristaSim * 1.5;

        const oldTelClient = (existing.tel_cliente || '').replace(/\D/g, '');
        const newTelClient = (entrega.tel_cliente || '').replace(/\D/g, '');
        if (oldTelClient && newTelClient && oldTelClient === newTelClient) {
          score += 2.0;
        }

        const oldTelMot = (existing.tel_motorista || '').replace(/\D/g, '');
        const newTelMot = (entrega.tel_motorista || '').replace(/\D/g, '');
        if (oldTelMot && newTelMot && oldTelMot === newTelMot) {
          score += 2.0;
        }

        if (score > highestScore) {
          highestScore = score;
          bestMatch = existing;
        }
      }
    }

    if (bestMatch && highestScore >= 3.2) {
      entrega.id = bestMatch.id;
    }
  }

  const cleanId = entrega.id || 'ent-' + Math.random().toString(36).substring(2, 11);
  const existingDelivery = cachedEntregas.find(e => e.id === cleanId);

  // Merge previous fields cleanly to support safe partial updates (e.g. status-only or location-link-only updates)
  const basePayload = {
    id: cleanId,
    created_at: existingDelivery?.created_at || new Date().toISOString(),
    data_coleta: existingDelivery?.data_coleta || new Date().toISOString().split('T')[0],
    vendedor: existingDelivery?.vendedor || '',
    cliente: existingDelivery?.cliente || '',
    tel_cliente: existingDelivery?.tel_cliente || '',
    motorista: existingDelivery?.motorista || '',
    tel_motorista: existingDelivery?.tel_motorista || '',
    origem: existingDelivery?.origem || '',
    destino: existingDelivery?.destino || '',
    frete_empresa: existingDelivery?.frete_empresa || 0,
    frete_motorista: existingDelivery?.frete_motorista || 0,
    prazo: existingDelivery?.prazo || new Date().toISOString().split('T')[0],
    status: existingDelivery?.status || 'coletando',
    observacoes: existingDelivery?.observacoes || '',
    lat: existingDelivery?.lat || -23.5505,
    lng: existingDelivery?.lng || -46.6333,
    canhoto_solicitado: !!existingDelivery?.canhoto_solicitado,
    km: existingDelivery?.km || 0,
    userId: uid
  };

  const payload: Entrega = {
    ...basePayload,
    ...entrega,
    updated_at: new Date().toISOString()
  } as Entrega;

  // Let's ensure km is recalculated if origin or destination changed
  if (entrega.origem !== undefined || entrega.destino !== undefined || !payload.km) {
    payload.km = Number(entrega.km) || calculateRealisticDistanceKm(payload.origem, payload.destino);
  }

  // Ensure lat/lng are correct and updated if base values were default and they can be resolved based on destination
  if (payload.destino && (payload.lat === -23.5505 && payload.lng === -46.6333) && !payload.destino.toLowerCase().includes('são paulo') && !payload.destino.toLowerCase().includes('sao paulo')) {
    const cityCoords = findCityCoords(payload.destino);
    if (cityCoords) {
      payload.lat = cityCoords.lat;
      payload.lng = cityCoords.lng;
    }
  }

  // Set explicit conversion of string values if passed via forms
  if (entrega.frete_empresa !== undefined) payload.frete_empresa = Number(entrega.frete_empresa) || 0;
  if (entrega.frete_motorista !== undefined) payload.frete_motorista = Number(entrega.frete_motorista) || 0;

  // Optimistic local update
  const index = cachedEntregas.findIndex(e => e.id === cleanId);
  if (index !== -1) {
    cachedEntregas[index] = payload;
  } else {
    cachedEntregas.push(payload);
  }
  window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: { action: 'UPSERT', payload } }));

  // Firestore update (Background)
  setDoc(doc(db, ENTREGAS_COLLECTION, cleanId), payload).catch((error) => {
    handleFirestoreError(error, OperationType.WRITE, `${ENTREGAS_COLLECTION}/${cleanId}`);
  });

  return payload;
}

export function deleteEntrega(id: string): boolean {
  const index = cachedEntregas.findIndex(e => e.id === id);
  if (index !== -1) {
    // Optimistic local update
    cachedEntregas.splice(index, 1);
    window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: { action: 'DELETE', payload: { id } } }));

    // Firestore update (Background)
    deleteDoc(doc(db, ENTREGAS_COLLECTION, id)).catch((error) => {
      handleFirestoreError(error, OperationType.DELETE, `${ENTREGAS_COLLECTION}/${id}`);
    });

    // Cascade delete related scheduled messages
    const relatedMsgs = cachedScheduledMessages.filter(m => m.deliveryId === id);
    relatedMsgs.forEach(m => {
      deleteDoc(doc(db, MESSAGES_COLLECTION, m.id)).catch(() => {});
    });

    return true;
  }
  return false;
}

export function deleteEntregasBulk(ids: string[]): boolean {
  const initialLength = cachedEntregas.length;
  cachedEntregas = cachedEntregas.filter(e => !ids.includes(e.id));
  if (cachedEntregas.length !== initialLength) {
    window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: { action: 'DELETE_BULK', payload: { ids } } }));

    // Firestore update (Background)
    const batch = writeBatch(db);
    ids.forEach(id => {
      batch.delete(doc(db, ENTREGAS_COLLECTION, id));
    });
    batch.commit().catch((error) => {
      handleFirestoreError(error, OperationType.DELETE, ENTREGAS_COLLECTION);
    });

    // Cascade delete related scheduled messages
    const relatedMsgs = cachedScheduledMessages.filter(m => ids.includes(m.deliveryId));
    if (relatedMsgs.length > 0) {
      const msgBatch = writeBatch(db);
      relatedMsgs.forEach(m => {
        msgBatch.delete(doc(db, MESSAGES_COLLECTION, m.id));
      });
      msgBatch.commit().catch(() => {});
    }

    return true;
  }
  return false;
}

export function subscribeToRealtime(callback: (payload: { action: string; payload: any }) => void) {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent;
    callback(customEvent.detail);
  };
  window.addEventListener(REALTIME_EVENT, handler);
  return () => {
    window.removeEventListener(REALTIME_EVENT, handler);
  };
}

export function getScheduledMessages(): any[] {
  return cachedScheduledMessages;
}

export function saveScheduledMessage(msg: any): any {
  const uid = auth.currentUser?.uid || 'system_operator';

  const cleanId = msg.id || 'sch-' + Math.random().toString(36).substring(2, 11);
  const existingMsg = cachedScheduledMessages.find(m => m.id === cleanId);

  const payload = {
    id: cleanId,
    deliveryId: msg.deliveryId || '',
    deliveryDriver: msg.deliveryDriver || '',
    deliveryDestiny: msg.deliveryDestiny || '',
    recipientName: msg.recipientName || '',
    recipientPhone: msg.recipientPhone || '',
    recipientType: msg.recipientType || 'motorista',
    scheduledTime: msg.scheduledTime || new Date().toISOString().substring(0, 16),
    messageText: msg.messageText || '',
    status: msg.status || 'pendente',
    createdAt: existingMsg?.createdAt || new Date().toISOString(),
    ...msg,
    userId: uid
  };

  // Optimistic local update
  const index = cachedScheduledMessages.findIndex(m => m.id === cleanId);
  if (index !== -1) {
    cachedScheduledMessages[index] = payload;
  } else {
    cachedScheduledMessages.push(payload);
  }
  window.dispatchEvent(new CustomEvent(SCHEDULED_REALTIME_EVENT, { detail: { action: 'UPSERT', payload } }));

  // Firestore update (Background)
  setDoc(doc(db, MESSAGES_COLLECTION, cleanId), payload).catch((error) => {
    handleFirestoreError(error, OperationType.WRITE, `${MESSAGES_COLLECTION}/${cleanId}`);
  });

  return payload;
}

export function deleteScheduledMessage(id: string): boolean {
  const index = cachedScheduledMessages.findIndex(m => m.id === id);
  if (index !== -1) {
    // Optimistic local update
    cachedScheduledMessages.splice(index, 1);
    window.dispatchEvent(new CustomEvent(SCHEDULED_REALTIME_EVENT, { detail: { action: 'DELETE', payload: { id } } }));

    // Firestore update (Background)
    deleteDoc(doc(db, MESSAGES_COLLECTION, id)).catch((error) => {
      handleFirestoreError(error, OperationType.DELETE, `${MESSAGES_COLLECTION}/${id}`);
    });
    return true;
  }
  return false;
}

export function subscribeToScheduledRealtime(callback: (payload: { action: string; payload: any }) => void) {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent;
    callback(customEvent.detail);
  };
  window.addEventListener(SCHEDULED_REALTIME_EVENT, handler);
  return () => {
    window.removeEventListener(SCHEDULED_REALTIME_EVENT, handler);
  };
}

// Helpers for Auto-complete
export function getUniqueVendedores(): string[] {
  const list = cachedEntregas.map(e => e.vendedor).filter(Boolean);
  return Array.from(new Set(list));
}

export function getUniqueClientes(): { nome: string; tel: string }[] {
  const list = cachedEntregas.map(e => ({ nome: e.cliente, tel: e.tel_cliente }));
  const seen = new Set<string>();
  const res: { nome: string; tel: string }[] = [];
  for (const item of list) {
    if (item.nome && !seen.has(item.nome)) {
      seen.add(item.nome);
      res.push(item);
    }
  }
  return res;
}

export function getUniqueMotoristas(): { nome: string; tel: string }[] {
  const list = cachedEntregas.map(e => ({ nome: e.motorista, tel: e.tel_motorista }));
  const seen = new Set<string>();
  const res: { nome: string; tel: string }[] = [];
  for (const item of list) {
    if (item.nome && !seen.has(item.nome)) {
      seen.add(item.nome);
      res.push(item);
    }
  }
  return res;
}
