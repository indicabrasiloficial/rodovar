import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../db/firebase';
import { Entrega } from '../types';
import { getEntregas } from '../db/storage';

const CACHE_KEY = 'rodovar_automacao_transito_cache_v2';
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos de TTL para dados sempre atualizados

interface CacheStructure {
  timestamp: number;
  data: Entrega[];
}

export function useAutomacaoTransito() {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

    // 2. Busca no Firestore sem restrição artificial de limite de 30 itens
    try {
      const snapshot = await getDocs(collection(db, 'entregas'));
      const fetched: Entrega[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Entrega));

      if (fetched.length > 0) {
        setEntregas(fetched);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: fetched
          }));
        } catch (e) {
          console.warn('Erro ao salvar no sessionStorage:', e);
        }
      } else {
        // Fallback para storage local
        const localData = getEntregas();
        setEntregas(localData);
      }
    } catch (err) {
      console.error('Erro ao buscar fretes para Automação Trânsito:', err);
      setError('Não foi possível conectar ao servidor. Exibindo dados em cache local.');
      const localData = getEntregas();
      setEntregas(localData);
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
