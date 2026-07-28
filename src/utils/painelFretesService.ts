import { db } from '../db/firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  serverTimestamp 
} from 'firebase/firestore';

export interface ComentarioVisitante {
  id?: string;
  texto: string;
  uid: string;
  autorNome: string;
  autorRole: string;
  criadoEm: string;
}

export interface FretePainelVisitante {
  id: string;
  origem: string;
  destino: string;
  km?: number;
  cliente: string; // Ex: "AG Recuperação" (sem telefone)
  motorista: string; // Ex: "Uberlan Figueiredo dos Santos Junior" (sem telefone)
  status: 'coletando' | 'em_transito' | 'parado' | 'entregue' | 'descarregando';
  data_coleta: string;
  prazo: string;
  updated_at: string;
  created_at: string;
  vendedor: string; // Atendente responsável pelo cadastro do frete
  observacoes?: string; // Comentários do cadastro
  comentarios_visitantes?: ComentarioVisitante[];
}

const ENTREGAS_COLLECTION = 'entregas';

/**
 * Busca ultra-otimizada de fretes para o Painel de Visitantes (Comercial / Expedição).
 * Filtra no Firestore por data específica (padrão: HOJE) para carregar em milissegundos.
 * Utiliza sessionStorage para cache instantâneo e Promise.all para carregar comentários em paralelo.
 */
export async function fetchFretesPainel(
  selectedDateIso?: string,
  forceRefresh: boolean = false
): Promise<FretePainelVisitante[]> {
  const targetDateIso = selectedDateIso || new Date().toISOString().split('T')[0];
  const cacheKey = `rodovar_painel_cache_${targetDateIso}`;

  // 1. Tentar recuperar do sessionStorage se não for forceRefresh
  if (!forceRefresh) {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Valida se o cache tem menos de 3 minutos
        if (parsed && Array.isArray(parsed.data) && (Date.now() - parsed.timestamp < 180000)) {
          return parsed.data;
        }
      }
    } catch {
      // Ignora erro de quota/acesso do sessionStorage
    }
  }

  try {
    const entregasRef = collection(db, ENTREGAS_COLLECTION);

    // Formata a data para formato BR (DD/MM/YYYY) também
    const parts = targetDateIso.split('-');
    const targetDateBR = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : targetDateIso;

    // Queries simultâneas filtradas no Firestore
    const qColetaIso = query(entregasRef, where('data_coleta', '==', targetDateIso), limit(100));
    const qColetaBR = query(entregasRef, where('data_coleta', '==', targetDateBR), limit(100));
    const qDataIso = query(entregasRef, where('data', '==', targetDateIso), limit(100));
    const qDataBR = query(entregasRef, where('data', '==', targetDateBR), limit(100));
    const qPrazoIso = query(entregasRef, where('prazo', '==', targetDateIso), limit(100));
    const qPrazoBR = query(entregasRef, where('prazo', '==', targetDateBR), limit(100));

    // Range ISO por created_at do dia
    const startOfDay = `${targetDateIso}T00:00:00.000Z`;
    const endOfDay = `${targetDateIso}T23:59:59.999Z`;
    const qCreated = query(entregasRef, where('created_at', '>=', startOfDay), where('created_at', '<=', endOfDay), limit(100));

    // Executa as buscas em paralelo
    const [snap1, snap2, snap3, snap4, snap5, snap6, snap7] = await Promise.all([
      getDocs(qColetaIso).catch(() => ({ docs: [] })),
      getDocs(qColetaBR).catch(() => ({ docs: [] })),
      getDocs(qDataIso).catch(() => ({ docs: [] })),
      getDocs(qDataBR).catch(() => ({ docs: [] })),
      getDocs(qPrazoIso).catch(() => ({ docs: [] })),
      getDocs(qPrazoBR).catch(() => ({ docs: [] })),
      getDocs(qCreated).catch(() => ({ docs: [] }))
    ]);

    let rawDocs = [
      ...snap1.docs,
      ...snap2.docs,
      ...snap3.docs,
      ...snap4.docs,
      ...snap5.docs,
      ...snap6.docs,
      ...snap7.docs
    ];

    // Deduplicação por ID do documento
    const docMap = new Map<string, any>();
    rawDocs.forEach(d => {
      if (!docMap.has(d.id)) {
        docMap.set(d.id, d);
      }
    });

    const uniqueDocs = Array.from(docMap.values());

    // 2. Busca os comentários das subcoleções EM PARALELO (Promise.all)
    const fretesPromises = uniqueDocs.map(async (docSnap) => {
      const data = docSnap.data();

      let comentariosList: ComentarioVisitante[] = [];
      try {
        const comentariosRef = collection(db, ENTREGAS_COLLECTION, docSnap.id, 'comentarios_visitantes');
        const comQuery = query(comentariosRef, orderBy('criadoEm', 'asc'));
        const comSnap = await getDocs(comQuery);

        comentariosList = comSnap.docs.map(cDoc => {
          const cData = cDoc.data();
          return {
            id: cDoc.id,
            texto: cData.texto || '',
            uid: cData.uid || '',
            autorNome: cData.autorNome || 'Anônimo',
            autorRole: cData.autorRole || 'Comercial',
            criadoEm: cData.criadoEm?.toDate ? cData.criadoEm.toDate().toISOString() : (cData.criadoEm || new Date().toISOString())
          };
        });
      } catch (e) {
        // Ignora falhas pontuais de subcoleção
      }

      return {
        id: docSnap.id,
        origem: data.origem || 'Origem não informada',
        destino: data.destino || 'Destino não informado',
        km: Number(data.km || 0),
        cliente: data.cliente || 'Cliente não informado',
        motorista: data.motorista || 'Motorista não informado',
        status: data.status || 'coletando',
        data_coleta: data.data_coleta || '',
        prazo: data.prazo || '',
        updated_at: data.updated_at || data.created_at || new Date().toISOString(),
        created_at: data.created_at || new Date().toISOString(),
        vendedor: data.vendedor || 'Atendente não informado',
        observacoes: data.observacoes || '',
        comentarios_visitantes: comentariosList
      } as FretePainelVisitante;
    });

    const fretes = await Promise.all(fretesPromises);

    // Ordenação por created_at desc
    fretes.sort((a, b) => new Date(b.created_at || b.updated_at).getTime() - new Date(a.created_at || a.updated_at).getTime());

    // 3. Salvar no sessionStorage para navegações rápidas
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        data: fretes
      }));
    } catch {}

    return fretes;
  } catch (error) {
    console.error('Erro ao buscar fretes do painel:', error);
    throw error;
  }
}

/**
 * Registra um novo comentário de visitante na subcoleção isolada:
 * cargas/{freteId}/comentarios_visitantes/{comentarioId}
 */
export async function adicionarComentarioVisitante(
  freteId: string,
  texto: string,
  usuario: { uid: string; nome: string; role: string }
): Promise<ComentarioVisitante> {
  const textoLimpo = texto.trim();
  if (!textoLimpo) {
    throw new Error('O comentário não pode ser vazio.');
  }
  if (textoLimpo.length > 500) {
    throw new Error('O comentário excede o limite máximo de 500 caracteres.');
  }
  if (!usuario || !usuario.uid) {
    throw new Error('Usuário não autenticado ou UID ausente.');
  }

  const comentariosRef = collection(db, ENTREGAS_COLLECTION, freteId, 'comentarios_visitantes');
  
  const payload = {
    texto: textoLimpo,
    uid: usuario.uid,
    autorNome: usuario.nome || 'Operador',
    autorRole: usuario.role || 'Comercial',
    criadoEm: serverTimestamp()
  };

  const docRef = await addDoc(comentariosRef, payload);

  return {
    id: docRef.id,
    texto: textoLimpo,
    uid: usuario.uid,
    autorNome: usuario.nome || 'Operador',
    autorRole: usuario.role || 'Comercial',
    criadoEm: new Date().toISOString()
  };
}
