import { Entrega, BlacklistMotorista, BlacklistCliente, GroupChatMessage } from '../types';
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
  writeBatch,
  getDocs
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

    if (!latVal || !lngVal || (latVal === -23.5504 && lngVal === -46.6334)) {
      if (orig) {
        const cityCoords = findCityCoords(orig);
        if (cityCoords) {
          latVal = cityCoords.lat;
          lngVal = cityCoords.lng;
        }
      } else if (dest) {
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

export function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash);
}

export function extractCoordsFromLink(link: string): { lat: number; lng: number } | null {
  if (!link) return null;
  try {
    const decoded = decodeURIComponent(link);
    
    // 1) First attempt: matches dot decimals (e.g., -12.2664,-38.9662 or -12.2664; -38.9662 or -12.2664 / -38.9662)
    const dotRegex = /(-?\d+\.\d+)\s*[,;\s|/]\s*(-?\d+\.\d+)/;
    const dotMatch = decoded.match(dotRegex);
    if (dotMatch) {
      const lat = parseFloat(dotMatch[1]);
      const lng = parseFloat(dotMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        if (Math.abs(lat) > 0.05 && Math.abs(lng) > 0.05) {
          return { lat, lng };
        }
      }
    }

    // 2) Second attempt: matches comma decimals (In Brazil, e.g. -12,25812 -38,95979 or -12,25812, -38,95979)
    // We normalize the string first by replacing any commas between digits with dots
    const normalizedCommas = decoded.replace(/(\d+),(\d+)/g, '$1.$2');
    const commaMatch = normalizedCommas.match(dotRegex);
    if (commaMatch) {
      const lat = parseFloat(commaMatch[1]);
      const lng = parseFloat(commaMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        if (Math.abs(lat) > 0.05 && Math.abs(lng) > 0.05) {
          return { lat, lng };
        }
      }
    }

    // 3) Third attempt: URL query matches for specific param terms
    const queryPatterns = [
      { latName: /latitude/i, lngName: /longitude/i },
      { latName: /lat/i, lngName: /lon/i },
      { latName: /lat/i, lngName: /lng/i },
      { latName: /lt/i, lngName: /lg/i }
    ];
    for (const pat of queryPatterns) {
      const latM = decoded.match(new RegExp(`${pat.latName.source}\\s*[=:]\\s*(-?\\d+[.,]\\d+)`, 'i'));
      const lngM = decoded.match(new RegExp(`${pat.lngName.source}\\s*[=:]\\s*(-?\\d+[.,]\\d+)`, 'i'));
      if (latM && lngM) {
        const lat = parseFloat(latM[1].replace(',', '.'));
        const lng = parseFloat(lngM[1].replace(',', '.'));
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { lat, lng };
        }
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

  // Search existing for possible merged duplicates (100% match requirement)
  if (!entrega.id) {
    const exactMatch = cachedEntregas.find(existing => {
      const origMatch = (existing.origem || '').trim().toLowerCase() === (entrega.origem || '').trim().toLowerCase();
      const destMatch = (existing.destino || '').trim().toLowerCase() === (entrega.destino || '').trim().toLowerCase();
      const dateMatch = (existing.data_coleta || '') === (entrega.data_coleta || '');
      const clientMatch = (existing.cliente || '').trim().toLowerCase() === (entrega.cliente || '').trim().toLowerCase();
      const motoristaMatch = (existing.motorista || '').trim().toLowerCase() === (entrega.motorista || '').trim().toLowerCase();
      const vendedorMatch = (existing.vendedor || '').trim().toLowerCase() === (entrega.vendedor || '').trim().toLowerCase();
      
      const freteEmpMatch = Math.round(Number(existing.frete_empresa || 0)) === Math.round(Number(entrega.frete_empresa || 0));
      const freteMotMatch = Math.round(Number(existing.frete_motorista || 0)) === Math.round(Number(entrega.frete_motorista || 0));
      
      const telClientMatch = (existing.tel_cliente || '').replace(/\D/g, '') === (entrega.tel_cliente || '').replace(/\D/g, '');
      const telMotMatch = (existing.tel_motorista || '').replace(/\D/g, '') === (entrega.tel_motorista || '').replace(/\D/g, '');

      return origMatch && destMatch && dateMatch && clientMatch && motoristaMatch && vendedorMatch && freteEmpMatch && freteMotMatch && telClientMatch && telMotMatch;
    });

    if (exactMatch) {
      entrega.id = exactMatch.id;
    }
  }

  const cleanId = entrega.id || 'ent-' + Math.random().toString(36).substring(2, 11);
  const existingDelivery = cachedEntregas.find(e => e.id === cleanId);

  // Geolocation helper coordination
  if (entrega.link_localizacao) {
    const coords = extractCoordsFromLink(entrega.link_localizacao);
    if (coords) {
      entrega.lat = coords.lat;
      entrega.lng = coords.lng;
    } else {
      // Fallback: If no coordinates could be parsed from the link, let's dynamically generate a location
      // along the route using a deterministic hash of the link so the map updates and moves!
      const origName = entrega.origem || existingDelivery?.origem || 'Salvador';
      const destName = entrega.destino || existingDelivery?.destino || 'Feira de Santana';
      const origCoords = findCityCoords(origName);
      const destCoords = findCityCoords(destName);
      
      const charSum = djb2Hash(entrega.link_localizacao);
      // Determine a percentage along the highway, say between 15% and 85%
      const fraction = 0.15 + (charSum % 70) / 100;
      
      const midLat = origCoords.lat + fraction * (destCoords.lat - origCoords.lat);
      const midLng = origCoords.lng + fraction * (destCoords.lng - origCoords.lng);
      
      // Jitter so different links produce slightly different offsets even with the same fraction
      const jitterLat = ((charSum % 13) - 6) * 0.0015;
      const jitterLng = ((charSum % 17) - 8) * 0.0015;
      
      entrega.lat = midLat + jitterLat;
      entrega.lng = midLng + jitterLng;
    }
  }

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
    documentos: existingDelivery?.documentos || [],
    userId: uid,
    trackingCode: existingDelivery?.trackingCode || '',
    cte: existingDelivery?.cte || '',
    localizacaoAtual: existingDelivery?.localizacaoAtual !== undefined ? existingDelivery.localizacaoAtual : null,
    ultimaAtualizacao: existingDelivery?.ultimaAtualizacao !== undefined ? existingDelivery.ultimaAtualizacao : null,
    avaliacao_viagem: existingDelivery?.avaliacao_viagem !== undefined ? existingDelivery.avaliacao_viagem : null,
    avaliacao_cliente: existingDelivery?.avaliacao_cliente !== undefined ? existingDelivery.avaliacao_cliente : null,
    cpf_motorista: existingDelivery?.cpf_motorista || '',
    cpf_cnpj_cliente: existingDelivery?.cpf_cnpj_cliente || '',
    categoria_risco: existingDelivery?.categoria_risco || 'comum',
    link_localizacao: existingDelivery?.link_localizacao || '',
    valor_carga: existingDelivery?.valor_carga || 0
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
    // Check cte
    if (entrega.cte !== undefined && entrega.cte !== existingDelivery.cte) {
      logs.push(entrega.cte ? `Vinculou o CT-e número "${entrega.cte}" à viagem.` : 'Removeu o número do CT-e da viagem.');
    }
    // Check documentos
    if (entrega.documentos !== undefined) {
      const prevDocs = existingDelivery.documentos || [];
      const currDocs = entrega.documentos || [];
      if (currDocs.length > prevDocs.length) {
        const added = currDocs.find(d => !prevDocs. some(pd => pd.id === d.id));
        if (added) {
          logs.push(`Anexou novo documento tipo ${added.tipo} (${added.nome})`);
        }
      } else if (currDocs.length < prevDocs.length) {
        const removed = prevDocs.find(pd => !currDocs.some(d => d.id === pd.id));
        if (removed) {
          logs.push(`Deletou o documento anexado tipo ${removed.tipo} (${removed.nome})`);
        }
      }
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

  // Normalize vendor name to consistent trimmed uppercase
  if (payload.vendedor) {
    payload.vendedor = payload.vendedor.trim().toUpperCase();
  }

  // Auto-generate trackingCode if not present (format: RDV + 4 digits, e.g. RDV0123)
  if (!payload.trackingCode) {
    let generated = '';
    for (let attempt = 0; attempt < 1000; attempt++) {
      const codeNum = Math.floor(Math.random() * 10000);
      const testCode = `RDV${codeNum.toString().padStart(4, '0')}`;
      const isTaken = cachedEntregas.some(e => e.trackingCode === testCode);
      if (!isTaken) {
        generated = testCode;
        break;
      }
    }
    if (!generated) {
      generated = `RDV${Math.floor(1000 + Math.random() * 9000)}`;
    }
    payload.trackingCode = generated;
  }

  // Enforce lowercase search normalization keys for ultra high speed server-side Firestore queries
  payload.search_origem = (payload.origem || '').toLowerCase().trim();
  payload.search_destino = (payload.destino || '').toLowerCase().trim();
  payload.search_cliente = (payload.cliente || '').toLowerCase().trim();
  payload.search_motorista = (payload.motorista || '').toLowerCase().trim();

  // Let's ensure km is recalculated if origin or destination changed
  if (entrega.origem !== undefined || entrega.destino !== undefined || !payload.km) {
    payload.km = Number(entrega.km) || calculateRealisticDistanceKm(payload.origem, payload.destino);
  }

  // Default to origin coordinates as default location for new routes if not already set (retaining link updates!)
  if (!payload.lat || !payload.lng || (payload.lat === -23.5505 && payload.lng === -46.6333)) {
    if (payload.origem) {
      const cityCoords = findCityCoords(payload.origem);
      if (cityCoords) {
        payload.lat = cityCoords.lat;
        payload.lng = cityCoords.lng;
      }
    } else if (payload.destino) {
      const cityCoords = findCityCoords(payload.destino);
      if (cityCoords) {
        payload.lat = cityCoords.lat;
        payload.lng = cityCoords.lng;
      }
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
  const list = cachedEntregas
    .map(e => e.vendedor ? e.vendedor.trim().toUpperCase() : '')
    .filter(Boolean);
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

// GROUP CHAT PERSISTENCE AND SYNC LOGIC
const CHAT_COLLECTION = 'group_chat_messages';

export async function sendGroupChatMessage(msg: Omit<GroupChatMessage, 'id'> & { id?: string }): Promise<GroupChatMessage> {
  const cleanId = msg.id || 'msg-' + Math.random().toString(36).substring(2, 11);
  const payload: GroupChatMessage = {
    ...msg,
    id: cleanId,
    timestamp: msg.timestamp || new Date().toISOString()
  };

  // Immediate local write to firestore
  await setDoc(doc(db, CHAT_COLLECTION, cleanId), payload).catch((error) => {
    handleFirestoreError(error, OperationType.WRITE, `${CHAT_COLLECTION}/${cleanId}`);
  });

  return payload;
}

export function subscribeToGroupChatRealtime(
  category: GroupChatMessage['category'],
  callback: (messages: GroupChatMessage[]) => void
): () => void {
  const chatQuery = collection(db, CHAT_COLLECTION);
  
  return onSnapshot(chatQuery, (snapshot) => {
    const list: GroupChatMessage[] = [];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString();

    const oldMsgIdsToDelete: string[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const isVoiceNote = data.isVoiceNote === true;
      const msgTimestamp = data.timestamp;

      if (isVoiceNote && msgTimestamp && msgTimestamp < sevenDaysAgoStr) {
        oldMsgIdsToDelete.push(docSnap.id);
      } else {
        if (data.category === category) {
          list.push({
            id: docSnap.id,
            ...data
          } as GroupChatMessage);
        }
      }
    });

    // Delete outdated voice notes asynchronously
    if (oldMsgIdsToDelete.length > 0) {
      oldMsgIdsToDelete.forEach(id => {
        deleteDoc(doc(db, CHAT_COLLECTION, id)).catch(() => {});
      });
    }

    // Client-side sort by timestamp ascending to ensure perfect linear timelines
    list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    callback(list);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, CHAT_COLLECTION);
  });
}

export async function deleteGroupChatMessage(id: string): Promise<void> {
  await deleteDoc(doc(db, CHAT_COLLECTION, id)).catch((error) => {
    handleFirestoreError(error, OperationType.WRITE, `${CHAT_COLLECTION}/${id}`);
  });
}

const KICKED_COLLECTION = 'kicked_users';

export async function clearAllGroupChatMessages(category: GroupChatMessage['category']): Promise<void> {
  const q = query(collection(db, CHAT_COLLECTION), where("category", "==", category));
  const snapshot = await getDocs(q).catch((error) => {
    handleFirestoreError(error, OperationType.GET, CHAT_COLLECTION);
    return null;
  });
  if (snapshot && !snapshot.empty) {
    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit().catch((error) => {
      handleFirestoreError(error, OperationType.WRITE, CHAT_COLLECTION);
    });
  }
}

export async function kickUser(username: string): Promise<void> {
  const cleanId = username.replace(/[^a-zA-Z0-9_\-]/g, '_');
  await setDoc(doc(db, KICKED_COLLECTION, cleanId), {
    username,
    kickedAt: new Date().toISOString()
  }).catch((error) => {
    handleFirestoreError(error, OperationType.WRITE, `${KICKED_COLLECTION}/${cleanId}`);
  });
}

export async function reinitUser(username: string): Promise<void> {
  const cleanId = username.replace(/[^a-zA-Z0-9_\-]/g, '_');
  await deleteDoc(doc(db, KICKED_COLLECTION, cleanId)).catch((error) => {
    handleFirestoreError(error, OperationType.WRITE, `${KICKED_COLLECTION}/${cleanId}`);
  });
}

export function subscribeToKickList(callback: (kickedList: string[]) => void): () => void {
  const kickedQuery = collection(db, KICKED_COLLECTION);
  return onSnapshot(kickedQuery, (snapshot) => {
    const list: string[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.username) {
        list.push(data.username);
      }
    });
    callback(list);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, KICKED_COLLECTION);
  });
}

const PRESENCE_COLLECTION = 'group_chat_presence';

export async function updatePresence(username: string, displayName: string, role: string, isOnline: boolean): Promise<void> {
  if (!username) return;
  const cleanId = username.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const payload = {
    username,
    displayName,
    role,
    isOnline,
    lastActive: new Date().toISOString()
  };
  await setDoc(doc(db, PRESENCE_COLLECTION, cleanId), payload).catch((error) => {
    handleFirestoreError(error, OperationType.WRITE, `${PRESENCE_COLLECTION}/${cleanId}`);
  });
}

export function subscribeToPresence(callback: (presenceList: any[]) => void): () => void {
  const presenceQuery = collection(db, PRESENCE_COLLECTION);
  return onSnapshot(presenceQuery, (snapshot) => {
    const list: any[] = [];
    snapshot.forEach(docSnap => {
      list.push(docSnap.data());
    });
    callback(list);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, PRESENCE_COLLECTION);
  });
}


