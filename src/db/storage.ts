import { Entrega, BlacklistMotorista, BlacklistCliente } from '../types';
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
const BLACKLIST_COLLECTION = 'blacklist_motoristas';
const BLACKLIST_CLIENTS_COLLECTION = 'blacklist_clientes';

// Memory caches
let cachedEntregas: Entrega[] = [];
let cachedScheduledMessages: any[] = [];
let cachedBlacklist: BlacklistMotorista[] = [];
let cachedBlacklistClientes: BlacklistCliente[] = [];

// Custom events matching original design
const REALTIME_EVENT = 'rodovar_realtime_event';
const SCHEDULED_REALTIME_EVENT = 'rodovar_scheduled_realtime_event';
const BLACKLIST_REALTIME_EVENT = 'rodovar_blacklist_realtime_event';
const BLACKLIST_CLIENTS_REALTIME_EVENT = 'rodovar_blacklist_clientes_realtime_event';

// SEED DATA
const SEED_ENTREGAS: Omit<Entrega, 'userId'>[] = [];

const SEED_MESSAGES: any[] = [];

// Setup real-time listeners upon auth state change (Optimized to always run for unauthenticated workspace)
const uid = 'system_operator';

// Listen to recent entregas to keep Dashboard metrics and caches fast and responsive without freezing on large datasets
import { limit as firestoreLimit, orderBy as firestoreOrderBy } from 'firebase/firestore';
const entregasQuery = query(collection(db, ENTREGAS_COLLECTION), firestoreOrderBy('created_at', 'desc'), firestoreLimit(250));
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
    
    // Auto-heal coordinates if they were incorrectly reset/cleared or set to default São Paulo coordinates for other origins/destinations
    let latVal = data.lat !== undefined ? Number(data.lat) : 0;
    let lngVal = data.lng !== undefined ? Number(data.lng) : 0;
    const orig = data.origem || '';
    const dest = data.destino || '';

    if (!latVal || !lngVal || (latVal === -23.5505 && lngVal === -46.6333)) {
      if (orig && !orig.toLowerCase().includes('são paulo') && !orig.toLowerCase().includes('sao paulo')) {
        const cityCoords = findCityCoords(orig);
        if (cityCoords) {
          latVal = cityCoords.lat;
          lngVal = cityCoords.lng;
        }
      } else if (dest && !dest.toLowerCase().includes('são paulo') && !dest.toLowerCase().includes('sao paulo')) {
        const cityCoords = findCityCoords(dest);
        if (cityCoords) {
          latVal = cityCoords.lat;
          lngVal = cityCoords.lng;
        }
      }
    }

    // Align with real registration inputs for freight and cargo values
    let freteEmp = data.frete_empresa !== undefined ? Number(data.frete_empresa) : 0;
    let freteMot = data.frete_motorista !== undefined ? Number(data.frete_motorista) : 0;
    let valCarga = data.valor_carga !== undefined ? Number(data.valor_carga) : 0;

    cachedEntregas.push({
      id: docSnap.id,
      ...data,
      lat: latVal || -23.5505,
      lng: lngVal || -46.6333,
      km: kmVal,
      frete_empresa: freteEmp,
      frete_motorista: freteMot,
      valor_carga: valCarga
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

// Listen to blacklist motoristas
const blacklistQuery = collection(db, BLACKLIST_COLLECTION);
onSnapshot(blacklistQuery, (snapshot) => {
  cachedBlacklist = [];
  snapshot.forEach(docSnap => {
    cachedBlacklist.push({
      id: docSnap.id,
      ...docSnap.data()
    } as BlacklistMotorista);
  });
  // Sort by created_at descending
  cachedBlacklist.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  // Trigger standard local Custom Event
  window.dispatchEvent(new CustomEvent(BLACKLIST_REALTIME_EVENT, { detail: { action: 'SYNC' } }));
}, (error) => {
  handleFirestoreError(error, OperationType.GET, BLACKLIST_COLLECTION);
});

// Listen to blacklist clientes
const blacklistClientesQuery = collection(db, BLACKLIST_CLIENTS_COLLECTION);
onSnapshot(blacklistClientesQuery, (snapshot) => {
  cachedBlacklistClientes = [];
  snapshot.forEach(docSnap => {
    cachedBlacklistClientes.push({
      id: docSnap.id,
      ...docSnap.data()
    } as BlacklistCliente);
  });
  // Sort by created_at descending
  cachedBlacklistClientes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  // Trigger standard local Custom Event
  window.dispatchEvent(new CustomEvent(BLACKLIST_CLIENTS_REALTIME_EVENT, { detail: { action: 'SYNC' } }));
}, (error) => {
  handleFirestoreError(error, OperationType.GET, BLACKLIST_CLIENTS_COLLECTION);
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
    historico: existingDelivery?.historico || [],
    userId: uid
  };

  // Compile difference list
  const logs: string[] = [];

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      coletando: 'Coletando 📦',
      em_transito: 'Trânsito 🚚',
      parado: 'Parado 🛑',
      entregue: 'Entregue ✅'
    };
    return labels[status] || status;
  };

  if (!existingDelivery) {
    const isImport = (entrega.observacoes && entrega.observacoes.includes('de texto copiado')) || 
                     (entrega.observacoes && entrega.observacoes.includes('MONITORAMENTO'));
    logs.push(isImport ? 'Importou esta carga em lote de dados' : 'Cadastrou uma nova carga no sistema.');
  } else {
    // Check status
    if (entrega.status && entrega.status !== existingDelivery.status) {
      logs.push(`Alterou o status de "${getStatusLabel(existingDelivery.status)}" para "${getStatusLabel(entrega.status)}"`);
    }
    // Check link_localizacao
    if (entrega.link_localizacao !== undefined && entrega.link_localizacao !== existingDelivery.link_localizacao) {
      if (!existingDelivery.link_localizacao && entrega.link_localizacao) {
        logs.push('Iniciou rastreamento ao vivo (adicionou o Link de Localização)');
      } else if (existingDelivery.link_localizacao && !entrega.link_localizacao) {
        logs.push('Removeu o link de localização');
      } else {
        logs.push('Atualizou o link de localização do rastreio ao vivo');
      }
    }
    // Check canhoto_solicitado
    if (entrega.canhoto_solicitado !== undefined && entrega.canhoto_solicitado !== existingDelivery.canhoto_solicitado) {
      if (entrega.canhoto_solicitado) {
        logs.push('Solicitou o envio do canhoto assinado pelo WhatsApp do motorista');
      } else {
        logs.push('Cancelou ou reiniciou a solicitação de canhoto');
      }
    }
    // Check motorista
    if (entrega.motorista !== undefined && entrega.motorista !== existingDelivery.motorista) {
      logs.push(`Alterou o motorista de "${existingDelivery.motorista || 'Sem registro'}" para "${entrega.motorista}"`);
    }
    // Check tel_motorista
    if (entrega.tel_motorista !== undefined && entrega.tel_motorista !== existingDelivery.tel_motorista) {
      logs.push(`Alterou o telefone do motorista de "${existingDelivery.tel_motorista || 'Sem registro'}" para "${entrega.tel_motorista}"`);
    }
    // Check cliente
    if (entrega.cliente !== undefined && entrega.cliente !== existingDelivery.cliente) {
      logs.push(`Alterou o cliente de "${existingDelivery.cliente || 'Sem registro'}" para "${entrega.cliente}"`);
    }
    // Check tel_cliente
    if (entrega.tel_cliente !== undefined && entrega.tel_cliente !== existingDelivery.tel_cliente) {
      logs.push(`Alterou o telefone do cliente de "${existingDelivery.tel_cliente || 'Sem registro'}" para "${entrega.tel_cliente}"`);
    }
    // Check origem
    if (entrega.origem !== undefined && entrega.origem !== existingDelivery.origem) {
      logs.push(`Modificou a origem de "${existingDelivery.origem}" para "${entrega.origem}"`);
    }
    // Check destino
    if (entrega.destino !== undefined && entrega.destino !== existingDelivery.destino) {
      logs.push(`Modificou o destino de "${existingDelivery.destino}" para "${entrega.destino}"`);
    }
    // Check vendedor
    if (entrega.vendedor !== undefined && entrega.vendedor !== existingDelivery.vendedor) {
      logs.push(`Alterou o vendedor de "${existingDelivery.vendedor || 'Sem registro'}" para "${entrega.vendedor}"`);
    }
    // Check frete_empresa
    if (entrega.frete_empresa !== undefined && Number(entrega.frete_empresa) !== existingDelivery.frete_empresa) {
      logs.push(`Alterou frete empresa de R$ ${existingDelivery.frete_empresa.toFixed(2)} para R$ ${Number(entrega.frete_empresa).toFixed(2)}`);
    }
    // Check frete_motorista
    if (entrega.frete_motorista !== undefined && Number(entrega.frete_motorista) !== existingDelivery.frete_motorista) {
      logs.push(`Alterou frete motorista de R$ ${existingDelivery.frete_motorista.toFixed(2)} para R$ ${Number(entrega.frete_motorista).toFixed(2)}`);
    }
    // Check valor_carga
    if (entrega.valor_carga !== undefined && Number(entrega.valor_carga) !== (existingDelivery.valor_carga || 0)) {
      logs.push(`Alterou o valor da carga de R$ ${Number(existingDelivery.valor_carga || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para R$ ${Number(entrega.valor_carga).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    }
    // Check prazo
    if (entrega.prazo !== undefined && entrega.prazo !== existingDelivery.prazo) {
      logs.push(`Alterou o prazo de "${existingDelivery.prazo}" para "${entrega.prazo}"`);
    }
    // Check observacoes
    if (entrega.observacoes !== undefined && entrega.observacoes !== existingDelivery.observacoes) {
      logs.push('Atualizou as observações de entrega');
    }
  }

  // Retrieve current logged-in user details
  let activeUser = { username: 'sistema', displayName: 'Sistema', role: 'Operador Rodovar' };
  const userStored = localStorage.getItem('rodovar_active_login_v2');
  if (userStored) {
    try {
      activeUser = JSON.parse(userStored);
    } catch {
      // Ignored
    }
  }

  const newEvents = logs.map(desc => ({
    id: 'evt-' + Math.random().toString(36).substring(2, 11),
    timestamp: new Date().toISOString(),
    usuario: activeUser.username,
    usuarioNome: activeUser.displayName,
    cargo: activeUser.role,
    descricao: desc
  }));

  const rawHistoryList = [...(basePayload.historico || []), ...newEvents];
  // Limit history messages to a standard safe threshold of 40 entries to prevent unbounded storage
  const limitedHistoryList = rawHistoryList.slice(-40);

  const payload: any = {
    ...basePayload,
    ...entrega,
    historico: limitedHistoryList,
    updated_at: new Date().toISOString()
  };

  // Enforce lowercase search normalization keys for ultra high speed server-side Firestore queries
  payload.search_origem = (payload.origem || '').toLowerCase().trim();
  payload.search_destino = (payload.destino || '').toLowerCase().trim();
  payload.search_cliente = (payload.cliente || '').toLowerCase().trim();
  payload.search_motorista = (payload.motorista || '').toLowerCase().trim();

  // Let's ensure km is recalculated if origin or destination changed
  if (entrega.origem !== undefined || entrega.destino !== undefined || !payload.km) {
    payload.km = Number(entrega.km) || calculateRealisticDistanceKm(payload.origem, payload.destino);
  }

  // Ensure lat/lng are correct and updated if base values were default and they can be resolved based on origin first
  if (payload.origem && (payload.lat === -23.5505 && payload.lng === -46.6333) && !payload.origem.toLowerCase().includes('são paulo') && !payload.origem.toLowerCase().includes('sao paulo')) {
    const cityCoords = findCityCoords(payload.origem);
    if (cityCoords) {
      payload.lat = cityCoords.lat;
      payload.lng = cityCoords.lng;
    }
  } else if (payload.destino && (payload.lat === -23.5505 && payload.lng === -46.6333) && !payload.destino.toLowerCase().includes('são paulo') && !payload.destino.toLowerCase().includes('sao paulo')) {
    const cityCoords = findCityCoords(payload.destino);
    if (cityCoords) {
      payload.lat = cityCoords.lat;
      payload.lng = cityCoords.lng;
    }
  }

  // Set explicit conversion of string values if passed via forms
  let freteEmp = entrega.frete_empresa !== undefined ? Number(entrega.frete_empresa) : (payload.frete_empresa || 0);
  let freteMot = entrega.frete_motorista !== undefined ? Number(entrega.frete_motorista) : (payload.frete_motorista || 0);
  let valCarga = entrega.valor_carga !== undefined ? Number(entrega.valor_carga) : (payload.valor_carga || 0);

  payload.frete_empresa = freteEmp;
  payload.frete_motorista = freteMot;
  payload.valor_carga = valCarga;

  if (valCarga >= 500000) {
    payload.categoria_risco = 'critico';
  } else if (valCarga >= 100000) {
    payload.categoria_risco = 'alto';
  } else if (valCarga >= 50000) {
    payload.categoria_risco = 'medio';
  } else {
    payload.categoria_risco = 'comum';
  }

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

export function setEditLock(id: string, nome: string, usuario: string): void {
  saveEntrega({
    id,
    editando_por: {
      nome,
      usuario,
      timestamp: new Date().toISOString()
    }
  });
}

export function clearEditLock(id: string): void {
  const existing = getEntregaById(id);
  if (!existing) return;
  
  if (existing.editando_por) {
    saveEntrega({
      id,
      editando_por: null
    });
  }
}

export function getBlacklist(): BlacklistMotorista[] {
  return cachedBlacklist;
}

export function saveToBlacklist(driver: Omit<BlacklistMotorista, 'id'> & { id?: string }): BlacklistMotorista {
  const uid = auth.currentUser?.uid || 'system_operator';
  const cleanId = driver.id || 'bl-' + Math.random().toString(36).substring(2, 11);
  const existingItem = cachedBlacklist.find(b => b.id === cleanId);

  const payload: BlacklistMotorista = {
    id: cleanId,
    nome: driver.nome || '',
    cpf: driver.cpf || '',
    telefone: driver.telefone || '',
    observacao: driver.observacao || '',
    created_at: existingItem?.created_at || driver.created_at || new Date().toISOString(),
    usuarioNome: driver.usuarioNome || '',
    userId: uid
  };

  // Optimistic update
  const index = cachedBlacklist.findIndex(b => b.id === cleanId);
  if (index !== -1) {
    cachedBlacklist[index] = payload;
  } else {
    cachedBlacklist.push(payload);
  }
  window.dispatchEvent(new CustomEvent(BLACKLIST_REALTIME_EVENT, { detail: { action: 'UPSERT', payload } }));

  // Firestore update
  setDoc(doc(db, BLACKLIST_COLLECTION, cleanId), payload).catch((error) => {
    handleFirestoreError(error, OperationType.WRITE, `${BLACKLIST_COLLECTION}/${cleanId}`);
  });

  return payload;
}

export function removeFromBlacklist(id: string): boolean {
  const index = cachedBlacklist.findIndex(b => b.id === id);
  if (index !== -1) {
    cachedBlacklist.splice(index, 1);
    window.dispatchEvent(new CustomEvent(BLACKLIST_REALTIME_EVENT, { detail: { action: 'DELETE', payload: { id } } }));

    // Firestore deletion
    deleteDoc(doc(db, BLACKLIST_COLLECTION, id)).catch((error) => {
      handleFirestoreError(error, OperationType.DELETE, `${BLACKLIST_COLLECTION}/${id}`);
    });
    return true;
  }
  return false;
}

export function subscribeToBlacklistRealtime(callback: (payload: { action: string; payload: any }) => void) {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent;
    callback(customEvent.detail);
  };
  window.addEventListener(BLACKLIST_REALTIME_EVENT, handler);
  return () => {
    window.removeEventListener(BLACKLIST_REALTIME_EVENT, handler);
  };
}

export interface DriverRatingStats {
  boas: number;
  ruins: number;
  total: number;
  indice: number; // 0 to 100 percentage
}

export function getDriverRatingStats(driverName: string): DriverRatingStats {
  if (!driverName) {
    return { boas: 0, ruins: 0, total: 0, indice: 100 };
  }
  const nameNorm = driverName.toLowerCase().trim();
  const driverDeliveries = cachedEntregas.filter(e => e.motorista && e.motorista.toLowerCase().trim() === nameNorm);
  
  let boas = 0;
  let ruins = 0;
  driverDeliveries.forEach(e => {
    if (e.avaliacao_viagem === 'boa') boas++;
    else if (e.avaliacao_viagem === 'ruim') ruins++;
  });
  
  const total = boas + ruins;
  const indice = total > 0 ? Math.round((boas / total) * 100) : 100; // Default to 100% positive if no ratings
  return { boas, ruins, total, indice };
}

export function getClientRatingStats(clientName: string): DriverRatingStats {
  if (!clientName) {
    return { boas: 0, ruins: 0, total: 0, indice: 100 };
  }
  const nameNorm = clientName.toLowerCase().trim();
  const clientDeliveries = cachedEntregas.filter(e => e.cliente && e.cliente.toLowerCase().trim() === nameNorm);
  
  let boas = 0;
  let ruins = 0;
  clientDeliveries.forEach(e => {
    if (e.avaliacao_cliente === 'boa') boas++;
    else if (e.avaliacao_cliente === 'ruim') ruins++;
  });
  
  const total = boas + ruins;
  const indice = total > 0 ? Math.round((boas / total) * 100) : 100; // Default to 100% positive if no ratings
  return { boas, ruins, total, indice };
}

export function getBlacklistClientes(): BlacklistCliente[] {
  return cachedBlacklistClientes;
}

export function saveToBlacklistClientes(client: Omit<BlacklistCliente, 'id'> & { id?: string }): BlacklistCliente {
  const uid = auth.currentUser?.uid || 'system_operator';
  const cleanId = client.id || 'blc-' + Math.random().toString(36).substring(2, 11);
  const existingItem = cachedBlacklistClientes.find(b => b.id === cleanId);

  const payload: BlacklistCliente = {
    id: cleanId,
    nome: client.nome || '',
    cpf_cnpj: client.cpf_cnpj || '',
    telefone: client.telefone || '',
    observacao: client.observacao || '',
    created_at: existingItem?.created_at || client.created_at || new Date().toISOString(),
    usuarioNome: client.usuarioNome || '',
    userId: uid
  };

  // Optimistic update
  const index = cachedBlacklistClientes.findIndex(b => b.id === cleanId);
  if (index !== -1) {
    cachedBlacklistClientes[index] = payload;
  } else {
    cachedBlacklistClientes.push(payload);
  }
  window.dispatchEvent(new CustomEvent(BLACKLIST_CLIENTS_REALTIME_EVENT, { detail: { action: 'UPSERT', payload } }));

  // Firestore update
  setDoc(doc(db, BLACKLIST_CLIENTS_COLLECTION, cleanId), payload).catch((error) => {
    handleFirestoreError(error, OperationType.WRITE, `${BLACKLIST_CLIENTS_COLLECTION}/${cleanId}`);
  });

  return payload;
}

export function removeFromBlacklistClientes(id: string): boolean {
  const index = cachedBlacklistClientes.findIndex(b => b.id === id);
  if (index !== -1) {
    cachedBlacklistClientes.splice(index, 1);
    window.dispatchEvent(new CustomEvent(BLACKLIST_CLIENTS_REALTIME_EVENT, { detail: { action: 'DELETE', payload: { id } } }));

    // Firestore deletion
    deleteDoc(doc(db, BLACKLIST_CLIENTS_COLLECTION, id)).catch((error) => {
      handleFirestoreError(error, OperationType.DELETE, `${BLACKLIST_CLIENTS_COLLECTION}/${id}`);
    });
    return true;
  }
  return false;
}

export function subscribeToBlacklistClientesRealtime(callback: (payload: { action: string; payload: any }) => void) {
  const handler = (evt: Event) => {
    callback((evt as CustomEvent).detail);
  };
  window.addEventListener(BLACKLIST_CLIENTS_REALTIME_EVENT, handler);
  return () => {
    window.removeEventListener(BLACKLIST_CLIENTS_REALTIME_EVENT, handler);
  };
}
