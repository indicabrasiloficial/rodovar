import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, limit, orderBy } from 'firebase/firestore';
import { db } from '../db/firebase';
import { Entrega } from '../types';
import { getEntregas } from '../db/storage';

const CACHE_KEY = 'rodovar_automacao_transito_cache_v1';
const CACHE_TTL_MS = 4 * 60 * 1000; // 4 minutos de TTL para rigoroso controle de cota no plano Spark do Firebase

interface CacheStructure {
  timestamp: number;
  data: Entrega[];
}

export function useAutomacaoTransito() {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * ECONOMIA DE COTA FIREBASE (PLANO SPARK):
   * 1. Usamos getDocs() em vez de listener em tempo real (onSnapshot), evitando leituras contínuas desnecessárias.
   * 2. Armazenamos o resultado em sessionStorage com tempo de expiração (TTL) de 4 minutos.
   * 3. Aplicamos limit(30) na consulta inicial ao Firestore para garantir no máximo 30 leituras por requisição.
   * 4. A filtragem por status ('em_transito', 'parado', 'descarregando', 'entregue') é feita 100% em memória local.
   * 5. Nenhuma escrita é efetuada no banco (Zero escritas / 0 escritas).
   */
  const fetchEntregas = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);

    // 1. Verificar cache em sessionStorage (se não for atualização forçada)
    if (!forceRefresh) {
      try {
        const cachedRaw = sessionStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
          const cached: CacheStructure = JSON.parse(cachedRaw);
          const isExpired = Date.now() - cached.timestamp > CACHE_TTL_MS;
          if (!isExpired && Array.isArray(cached.data) && cached.data.length > 0) {
            setEntregas(cached.data);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Erro ao ler cache do sessionStorage:', err);
      }
    }

    // 2. Busca pontual no Firestore com limit(30)
    try {
      const q = query(
        collection(db, 'entregas'),
        limit(30)
      );
      const snapshot = await getDocs(q);
      const fetched: Entrega[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Entrega));

      // Se a busca no Firestore trouxer resultados, mescla com os fretes da memória local (de-duplicando)
      const localData = getEntregas();
      const combinedMap = new Map<string, Entrega>();
      
      localData.forEach(e => {
        if (e && e.id) combinedMap.set(e.id, e);
      });
      fetched.forEach(e => {
        if (e && e.id) combinedMap.set(e.id, e);
      });

      const combinedList = Array.from(combinedMap.values());

      if (combinedList.length > 0) {
        setEntregas(combinedList);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: combinedList
          }));
        } catch (e) {
          console.warn('Erro ao salvar no sessionStorage:', e);
        }
      } else {
        setEntregas(localData);
      }
    } catch (err) {
      console.error('Erro ao buscar fretes para Automação Trânsito:', err);
      setError('Não foi possível conectar ao servidor. Exibindo dados em cache local.');
      // Fallback para o storage local em caso de erro de rede ou quota
      const localData = getEntregas();
      setEntregas(localData.slice(0, 30));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntregas(false);
  }, [fetchEntregas]);

  return {
    entregas,
    loading,
    error,
    refresh: () => fetchEntregas(true)
  };
}
