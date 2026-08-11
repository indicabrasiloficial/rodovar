import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  serverTimestamp,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { db } from '../db/firebase';
import { Anotacao } from '../types';

const CACHE_KEY = 'rodovar_anotacoes_cache_v1';
const CACHE_TTL_MS = 4 * 60 * 1000; // 4 minutos de TTL para economizar cotas do Spark (max 50k leituras/dia)
const PAGE_SIZE = 30;

interface CacheData {
  timestamp: number;
  notes: Anotacao[];
  hasMore: boolean;
}

export function useAnotacoes() {
  const [notes, setNotes] = useState<Anotacao[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  
  // Ref para guardar o último documento consultado para paginação com startAfter
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  
  // Timer para debounce de salvamento automático
  const debounceTimerRef = useRef<{ [id: string]: NodeJS.Timeout }>({});

  /**
   * Salva o estado atual das notas no sessionStorage
   */
  const saveToCache = (notesToCache: Anotacao[], moreAvailable: boolean) => {
    try {
      const cachePayload: CacheData = {
        timestamp: Date.now(),
        notes: notesToCache,
        hasMore: moreAvailable
      };
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cachePayload));
    } catch (e) {
      console.warn('Rodovar Anotações: Erro ao gravar cache em sessionStorage:', e);
    }
  };

  /**
   * Tenta carregar as notas do cache sessionStorage se estiver dentro do TTL de 4 minutos
   */
  const loadFromCache = (): boolean => {
    try {
      const cachedRaw = sessionStorage.getItem(CACHE_KEY);
      if (!cachedRaw) return false;

      const cacheData: CacheData = JSON.parse(cachedRaw);
      const isExpired = Date.now() - cacheData.timestamp > CACHE_TTL_MS;

      if (isExpired) {
        sessionStorage.removeItem(CACHE_KEY);
        return false;
      }

      setNotes(cacheData.notes || []);
      setHasMore(!!cacheData.hasMore);
      setLoading(false);
      return true;
    } catch (e) {
      return false;
    }
  };

  /**
   * Busca as notas ativas no Firestore usando getDocs (1 requisição controlada)
   * Respeita limit(30) e ordenação desc por atualizadoEm
   */
  const fetchNotes = useCallback(async (forceRefresh = false) => {
    // 1. Tentar ler do cache se não for forçado
    if (!forceRefresh) {
      const loadedFromCache = loadFromCache();
      if (loadedFromCache) return;
    }

    setLoading(true);
    setError(null);

    try {
      const colRef = collection(db, 'anotacoes');
      const q = query(
        colRef,
        where('status', '==', 'ativa'),
        orderBy('atualizadoEm', 'desc'),
        limit(PAGE_SIZE)
      );

      // USO ESTRITO DE getDocs() — PROIBIDO usar onSnapshot para economizar cotas do Spark
      const snap = await getDocs(q);
      
      const fetchedNotes: Anotacao[] = snap.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          texto: data.texto || '',
          tag: data.tag || 'observacao',
          fixada: !!data.fixada,
          fretId: data.fretId || null,
          autorNome: data.autorNome || 'Anônimo',
          autorUsername: data.autorUsername || '',
          autorRole: data.autorRole || 'operador',
          status: data.status || 'ativa',
          criadoEm: data.criadoEm?.toDate ? data.criadoEm.toDate().toISOString() : (data.criadoEm || new Date().toISOString()),
          atualizadoEm: data.atualizadoEm?.toDate ? data.atualizadoEm.toDate().toISOString() : (data.atualizadoEm || new Date().toISOString())
        };
      });

      lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
      const moreExist = snap.docs.length >= PAGE_SIZE;

      setNotes(fetchedNotes);
      setHasMore(moreExist);

      // Gravar no cache local para evitar re-leituras desnecessárias nos próximos 4min
      saveToCache(fetchedNotes, moreExist);
    } catch (err: any) {
      console.error('Erro ao buscar anotações no Firestore:', err);
      setError(err?.message || 'Falha ao carregar anotações. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Carrega mais 30 notas (paginação com startAfter)
   */
  const loadMore = async () => {
    if (!hasMore || !lastDocRef.current || loadingMore) return;

    setLoadingMore(true);
    try {
      const colRef = collection(db, 'anotacoes');
      const q = query(
        colRef,
        where('status', '==', 'ativa'),
        orderBy('atualizadoEm', 'desc'),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE)
      );

      const snap = await getDocs(q);
      const newFetched: Anotacao[] = snap.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          texto: data.texto || '',
          tag: data.tag || 'observacao',
          fixada: !!data.fixada,
          fretId: data.fretId || null,
          autorNome: data.autorNome || 'Anônimo',
          autorUsername: data.autorUsername || '',
          autorRole: data.autorRole || 'operador',
          status: data.status || 'ativa',
          criadoEm: data.criadoEm?.toDate ? data.criadoEm.toDate().toISOString() : (data.criadoEm || new Date().toISOString()),
          atualizadoEm: data.atualizadoEm?.toDate ? data.atualizadoEm.toDate().toISOString() : (data.atualizadoEm || new Date().toISOString())
        };
      });

      lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
      const moreExist = snap.docs.length >= PAGE_SIZE;

      setNotes(prev => {
        const combined = [...prev, ...newFetched];
        saveToCache(combined, moreExist);
        return combined;
      });
      setHasMore(moreExist);
    } catch (err: any) {
      console.error('Erro ao carregar mais anotações:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  /**
   * Cria uma nova nota (1 única escrita via addDoc)
   */
  const createNote = async (dataPayload: {
    texto: string;
    tag: 'urgente' | 'lembrete' | 'observacao';
    fixada: boolean;
    fretId: string | null;
    autorNome: string;
    autorUsername?: string;
    autorRole: string;
  }): Promise<boolean> => {
    try {
      const colRef = collection(db, 'anotacoes');
      const nowIso = new Date().toISOString();

      const docRef = await addDoc(colRef, {
        texto: dataPayload.texto.trim(),
        tag: dataPayload.tag,
        fixada: dataPayload.fixada,
        fretId: dataPayload.fretId ? dataPayload.fretId.trim() : null,
        autorNome: dataPayload.autorNome,
        autorUsername: dataPayload.autorUsername || '',
        autorRole: dataPayload.autorRole,
        status: 'ativa',
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      });

      const newNote: Anotacao = {
        id: docRef.id,
        texto: dataPayload.texto.trim(),
        tag: dataPayload.tag,
        fixada: dataPayload.fixada,
        fretId: dataPayload.fretId ? dataPayload.fretId.trim() : null,
        autorNome: dataPayload.autorNome,
        autorUsername: dataPayload.autorUsername || '',
        autorRole: dataPayload.autorRole,
        status: 'ativa',
        criadoEm: nowIso,
        atualizadoEm: nowIso
      };

      setNotes(prev => {
        const updated = [newNote, ...prev];
        saveToCache(updated, hasMore);
        return updated;
      });

      return true;
    } catch (err: any) {
      console.error('Erro ao criar anotação:', err);
      throw err;
    }
  };

  /**
   * Atualiza uma nota existente (1 única escrita via updateDoc)
   */
  const updateNote = async (id: string, updates: Partial<Anotacao>): Promise<boolean> => {
    try {
      const noteRef = doc(db, 'anotacoes', id);
      const payload: any = {
        ...updates,
        atualizadoEm: serverTimestamp()
      };

      delete payload.id;
      delete payload.criadoEm;

      await updateDoc(noteRef, payload);

      const nowIso = new Date().toISOString();
      setNotes(prev => {
        const updated = prev.map(n => n.id === id ? { ...n, ...updates, atualizadoEm: nowIso } : n);
        saveToCache(updated, hasMore);
        return updated;
      });

      return true;
    } catch (err: any) {
      console.error('Erro ao atualizar anotação:', err);
      throw err;
    }
  };

  /**
   * Atualização com Debounce de 1.5s para campos de texto digitados
   * Evita chamadas contínuas ao Firestore a cada tecla pressionada
   */
  const debouncedUpdateText = (id: string, newText: string) => {
    // Atualização otimista no estado local
    setNotes(prev => prev.map(n => n.id === id ? { ...n, texto: newText } : n));

    if (debounceTimerRef.current[id]) {
      clearTimeout(debounceTimerRef.current[id]);
    }

    debounceTimerRef.current[id] = setTimeout(() => {
      updateNote(id, { texto: newText });
      delete debounceTimerRef.current[id];
    }, 1500);
  };

  /**
   * Arquiva uma nota (status = 'arquivada')
   */
  const archiveNote = async (id: string): Promise<boolean> => {
    try {
      const noteRef = doc(db, 'anotacoes', id);
      await updateDoc(noteRef, {
        status: 'arquivada',
        atualizadoEm: serverTimestamp()
      });

      setNotes(prev => {
        const updated = prev.filter(n => n.id !== id);
        saveToCache(updated, hasMore);
        return updated;
      });

      return true;
    } catch (err: any) {
      console.error('Erro ao arquivar anotação:', err);
      throw err;
    }
  };

  // Carrega notas ao montar o hook
  useEffect(() => {
    fetchNotes(false);
  }, [fetchNotes]);

  return {
    notes,
    loading,
    loadingMore,
    error,
    hasMore,
    refetch: () => fetchNotes(true), // botão "Atualizar" força nova busca no Firestore
    loadMore,
    createNote,
    updateNote,
    debouncedUpdateText,
    archiveNote
  };
}
