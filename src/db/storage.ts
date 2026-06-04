import { Entrega } from '../types';
import { db, auth, OperationType, handleFirestoreError } from './firebase';
import { calculateRealisticDistanceKm } from '../utils/distance';
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
const SEED_ENTREGAS: Omit<Entrega, 'userId'>[] = [
  {
    id: 'ent-1',
    created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    data_coleta: '2026-05-30',
    vendedor: 'Carlos Souza',
    cliente: 'JV Alimentos Ltda',
    tel_cliente: '98981223344',
    motorista: 'João Silva',
    tel_motorista: '98991443322',
    origem: 'Camaçari-BA',
    destino: 'São Luís-MA',
    frete_empresa: 8500,
    frete_motorista: 6800,
    prazo: '2026-06-08',
    status: 'em_transito',
    observacoes: 'Carga refrigerada de laticínios. Monitoramento térmico ativado.',
    link_localizacao: 'https://maps.google.com/?q=-2.5307,-44.3068',
    lat: -2.5307,
    lng: -44.3068,
    canhoto_solicitado: false,
    updated_at: new Date().toISOString()
  },
  {
    id: 'ent-2',
    created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    data_coleta: '2026-06-01',
    vendedor: 'Ana Lima',
    cliente: 'Metalúrgica Gerdau',
    tel_cliente: '21971234567',
    motorista: 'Marcos Roberto',
    tel_motorista: '21981112233',
    origem: 'São Paulo-SP',
    destino: 'Rio de Janeiro-RJ',
    frete_empresa: 3200,
    frete_motorista: 2400,
    prazo: '2026-06-04',
    status: 'entregue',
    observacoes: 'Perfilados de aço de 12 metros. Canhoto assinado e enviado.',
    link_localizacao: 'https://maps.google.com/?q=-22.9068,-43.1729',
    lat: -22.9068,
    lng: -43.1729,
    canhoto_solicitado: true,
    updated_at: new Date().toISOString()
  },
  {
    id: 'ent-3',
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    data_coleta: '2026-06-02',
    vendedor: 'Bruno Rocha',
    cliente: 'Ambev Distribuidora',
    tel_cliente: '51982223333',
    motorista: 'Claudinho Ferreira',
    tel_motorista: '51993334444',
    origem: 'Curitiba-PR',
    destino: 'Porto Alegre-RS',
    frete_empresa: 4500,
    frete_motorista: 3600,
    prazo: '2026-06-05',
    status: 'parado',
    observacoes: 'Carga de engradados de bebidas. Parado no Posto Humaitá aguardando liberação fiscal.',
    link_localizacao: 'https://maps.google.com/?q=-30.0346,-51.2177',
    lat: -30.0346,
    lng: -51.2177,
    canhoto_solicitado: false,
    updated_at: new Date().toISOString()
  },
  {
    id: 'ent-4',
    created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    data_coleta: '2026-06-03',
    vendedor: 'Carlos Souza',
    cliente: 'Carrefour Logística',
    tel_cliente: '62985556666',
    motorista: 'Jeferson Santos',
    tel_motorista: '62998887777',
    origem: 'Belo Horizonte-MG',
    destino: 'Goiânia-GO',
    frete_empresa: 5100,
    frete_motorista: 4100,
    prazo: '2026-06-07',
    status: 'coletando',
    observacoes: 'Carga seca diversificada de mercearia. Carregamento pátio de BH.',
    link_localizacao: 'https://maps.google.com/?q=-16.6869,-49.2648',
    lat: -16.6869,
    lng: -49.2648,
    canhoto_solicitado: false,
    updated_at: new Date().toISOString()
  },
  {
    id: 'ent-5',
    created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    data_coleta: '2026-05-25',
    vendedor: 'Ana Lima',
    cliente: 'Bahia Distribuidora',
    tel_cliente: '71991223344',
    motorista: 'Marcio Oliveira',
    tel_motorista: '75988112233',
    origem: 'Salvador-BA',
    destino: 'Feira de Santana-BA',
    frete_empresa: 1800,
    frete_motorista: 1300,
    prazo: '2026-05-26',
    status: 'entregue',
    observacoes: 'Paletes de fardos plásticos. Entregue sem intercorrências.',
    link_localizacao: 'https://maps.google.com/?q=-12.2664,-38.9662',
    lat: -12.2664,
    lng: -38.9662,
    canhoto_solicitado: true,
    updated_at: new Date().toISOString()
  }
];

const SEED_MESSAGES: any[] = [
  {
    id: 'sch-1',
    deliveryId: 'ent-1',
    deliveryDriver: 'João Silva',
    deliveryDestiny: 'São Luís-MA',
    recipientName: 'João Silva',
    recipientPhone: '98991443322',
    recipientType: 'motorista',
    scheduledTime: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString().substring(0, 16),
    messageText: 'Olá João Silva! Agente Rodovar na escuta. Por favor, nos envie sua localização em tempo real no link do mapa para nosso boletim periódico. Boa viagem!',
    status: 'pendente',
    createdAt: new Date().toISOString()
  },
  {
    id: 'sch-2',
    deliveryId: 'ent-3',
    deliveryDriver: 'Claudinho Ferreira',
    deliveryDestiny: 'Porto Alegre-RS',
    recipientName: 'Ambev Distribuidora',
    recipientPhone: '51982223333',
    recipientType: 'cliente',
    scheduledTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().substring(0, 16),
    messageText: 'Olá! Aqui é o Agente Rodovar com um boletim de viagem. Informamos que o carregamento do motorista Claudinho com destino a Porto Alegre está atualmente parado para trâmites fiscais regulamentares.',
    status: 'pendente',
    createdAt: new Date().toISOString()
  }
];

// Setup real-time listeners upon auth state change
auth.onAuthStateChanged((user) => {
  if (user) {
    const uid = user.uid;

    // Listen to entregas
    const entregasQuery = query(collection(db, ENTREGAS_COLLECTION), where('userId', '==', uid));
    onSnapshot(entregasQuery, async (snapshot) => {
      // If collection is empty, seed it on firestore if the user hasn't initialized yet
      if (snapshot.empty) {
        const seedKey = `rodovar_seeded_${uid}`;
        if (localStorage.getItem(seedKey) === 'true') {
          cachedEntregas = [];
          window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: { action: 'SYNC' } }));
          return;
        }

        try {
          const settingsRef = doc(db, 'user_settings', uid);
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists() && settingsSnap.data()?.seeded) {
            localStorage.setItem(seedKey, 'true');
            cachedEntregas = [];
            window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: { action: 'SYNC' } }));
            return;
          }

          console.log('Seeding initial dataset to Firestore for UID:', uid);
          localStorage.setItem(seedKey, 'true');
          await setDoc(settingsRef, { seeded: true, userId: uid });

          const batch = writeBatch(db);
          SEED_ENTREGAS.forEach(ent => {
            const uniqueId = `${ent.id}_${uid}`;
            const docRef = doc(db, ENTREGAS_COLLECTION, uniqueId);
            batch.set(docRef, { ...ent, id: uniqueId, userId: uid });
          });
          SEED_MESSAGES.forEach(msg => {
            const uniqueId = `${msg.id}_${uid}`;
            const uniqueDeliveryId = `${msg.deliveryId}_${uid}`;
            const docRef = doc(db, MESSAGES_COLLECTION, uniqueId);
            batch.set(docRef, { ...msg, id: uniqueId, deliveryId: uniqueDeliveryId, userId: uid });
          });
          await batch.commit();
        } catch (e) {
          console.error('Error seeding initial data to Firestore:', e);
        }
        return;
      }

      cachedEntregas = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const kmVal = data.km !== undefined && data.km > 0 
          ? Number(data.km) 
          : calculateRealisticDistanceKm(data.origem || '', data.destino || '');
        cachedEntregas.push({
          id: docSnap.id,
          ...data,
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

    // Listen to scheduled messages
    const messagesQuery = query(collection(db, MESSAGES_COLLECTION), where('userId', '==', uid));
    onSnapshot(messagesQuery, (snapshot) => {
      cachedScheduledMessages = [];
      snapshot.forEach(docSnap => {
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

  } else {
    // Logged out
    cachedEntregas = [];
    cachedScheduledMessages = [];
    window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: { action: 'SYNC' } }));
    window.dispatchEvent(new CustomEvent(SCHEDULED_REALTIME_EVENT, { detail: { action: 'SYNC' } }));
  }
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
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Usuário precisa estar autenticado para realizar salvamentos.');
  }

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

  const calcKm = Number(entrega.km) || calculateRealisticDistanceKm(entrega.origem || '', entrega.destino || '');

  const payload: Entrega = {
    id: cleanId,
    created_at: existingDelivery?.created_at || new Date().toISOString(),
    data_coleta: entrega.data_coleta || new Date().toISOString().split('T')[0],
    vendedor: entrega.vendedor || '',
    cliente: entrega.cliente || '',
    tel_cliente: entrega.tel_cliente || '',
    motorista: entrega.motorista || '',
    tel_motorista: entrega.tel_motorista || '',
    origem: entrega.origem || '',
    destino: entrega.destino || '',
    frete_empresa: Number(entrega.frete_empresa) || 0,
    frete_motorista: Number(entrega.frete_motorista) || 0,
    prazo: entrega.prazo || new Date().toISOString().split('T')[0],
    status: entrega.status || 'coletando',
    observacoes: entrega.observacoes || '',
    lat: Number(entrega.lat) || -23.5505,
    lng: Number(entrega.lng) || -46.6333,
    canhoto_solicitado: !!entrega.canhoto_solicitado,
    updated_at: new Date().toISOString(),
    km: calcKm,
    ...entrega,
    userId: uid
  } as Entrega;

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
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Usuário precisa estar autenticado para salvar mensagens agendadas.');
  }

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
