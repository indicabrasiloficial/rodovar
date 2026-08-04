import { useState, useEffect, useRef } from 'react';
import { db, OperationType, handleFirestoreError } from '../db/firebase';
import { Entrega, DeliveryStatus } from '../types';
import { calculateRealisticDistanceKm, findCityCoords } from '../utils/distance';
import { getEntregas, subscribeToRealtime, fetchEntregasFromServer } from '../db/storage';

const PAGE_SIZE = 20;

const getCleanedVendedorName = (name: string): string => {
  if (!name) return '';
  const parts = name.split(/[\/\-\\]/);
  let p = (parts[0] || '').trim().toUpperCase();
  if (p === 'MÔNICA') p = 'MONICA';
  return p;
};

const removeAccents = (str: string): string => {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

export const normalizeDateStr = (val?: string): string => {
  if (!val) return '';
  // Extract first clean token before any space, T, or comma
  const cleanToken = val.trim().split(/[T\s,]+/)[0];
  if (!cleanToken) return '';

  // ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = cleanToken.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Brazilian DD/MM/YYYY or DD-MM-YYYY
  const brMatch = cleanToken.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    let year = brMatch[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }

  // Short DD/MM or DD-MM
  const shortMatch = cleanToken.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (shortMatch) {
    const day = shortMatch[1].padStart(2, '0');
    const month = shortMatch[2].padStart(2, '0');
    const year = new Date().getFullYear();
    return `${year}-${month}-${day}`;
  }

  return cleanToken;
};

export function matchDelivery(e: Entrega, filters: PaginatedFilters): boolean {
  // 1. Status filter
  if (filters.status && filters.status !== 'all') {
    if (e.status !== filters.status) return false;
  }

  // 2. Collection / Delivery Date filter
  if (filters.dataColeta && filters.dataColeta.trim()) {
    const filterIso = normalizeDateStr(filters.dataColeta);
    const eColetaIso = normalizeDateStr(e.data_coleta);
    const eDataIso = normalizeDateStr(e.data);
    const ePrazoIso = normalizeDateStr(e.prazo);
    const eCreatedIso = e.created_at ? normalizeDateStr(e.created_at) : '';

    if (
      eColetaIso !== filterIso && 
      eDataIso !== filterIso && 
      ePrazoIso !== filterIso && 
      eCreatedIso !== filterIso
    ) {
      return false;
    }
  }

  // 3. Vendedor filter
  if (filters.vendedor?.trim()) {
    const v = removeAccents(getCleanedVendedorName(filters.vendedor));
    const ev = removeAccents(getCleanedVendedorName(e.vendedor || ''));
    if (ev !== v && !ev.includes(v)) return false;
  }

  // 4. Origin filter
  if (filters.origem?.trim()) {
    const o = removeAccents(filters.origem);
    if (!removeAccents(e.origem || '').includes(o)) return false;
  }

  // 5. Destino filter
  if (filters.destino?.trim()) {
    const d = removeAccents(filters.destino);
    if (!removeAccents(e.destino || '').includes(d)) return false;
  }

  // 6. Cliente filter
  if (filters.cliente?.trim()) {
    const c = removeAccents(filters.cliente);
    if (!removeAccents(e.cliente || '').includes(c)) return false;
  }

  // 7. General text & phone search
  if (filters.search && filters.search.trim()) {
    const s = removeAccents(filters.search);
    const digitsSearch = filters.search.replace(/\D/g, '');

    // Phone numbers (cliente or motorista)
    const telClienteClean = (e.tel_cliente || '').replace(/\D/g, '');
    const telMotoristaClean = (e.tel_motorista || '').replace(/\D/g, '');

    const matchTelClient = (
      (e.tel_cliente && removeAccents(e.tel_cliente).includes(s)) ||
      (digitsSearch.length >= 3 && telClienteClean.includes(digitsSearch))
    );

    const matchTelMot = (
      (e.tel_motorista && removeAccents(e.tel_motorista).includes(s)) ||
      (digitsSearch.length >= 3 && telMotoristaClean.includes(digitsSearch))
    );

    // Dates in text search
    const matchDates = (
      (e.data_coleta && removeAccents(e.data_coleta).includes(s)) ||
      (e.data && removeAccents(e.data).includes(s)) ||
      (e.prazo && removeAccents(e.prazo).includes(s))
    );

    // General fields
    const matchGeneralText = (
      removeAccents(e.motorista || '').includes(s) ||
      removeAccents(e.vendedor || '').includes(s) ||
      removeAccents(e.cliente || '').includes(s) ||
      removeAccents(e.origem || '').includes(s) ||
      removeAccents(e.destino || '').includes(s) ||
      removeAccents(e.observacoes || '').includes(s) ||
      removeAccents(e.id || '').includes(s)
    );

    if (!matchTelClient && !matchTelMot && !matchDates && !matchGeneralText) {
      return false;
    }
  }

  return true;
}

// High performance parsing helper identical to storage.ts (retained for backward compatibility / useVoice imports)
export function parseFirestoreDocToEntrega(docSnap: any): Entrega {
  const data = docSnap.data();
  const kmVal = data.km !== undefined && data.km > 0 
    ? Number(data.km) 
    : calculateRealisticDistanceKm(data.origem || '', data.destino || '');
  
  let latVal = data.lat !== undefined ? Number(data.lat) : 0;
  let lngVal = data.lng !== undefined ? Number(data.lng) : 0;
  const dest = data.destino || '';

  if ((!latVal || !lngVal || (latVal === -23.5505 && lngVal === -46.6333)) && dest && !dest.toLowerCase().includes('são paulo') && !dest.toLowerCase().includes('sao paulo')) {
    const cityCoords = findCityCoords(dest);
    latVal = cityCoords.lat;
    lngVal = cityCoords.lng;
  }

  let freteEmp = data.frete_empresa !== undefined ? Number(data.frete_empresa) : 0;
  let freteMot = data.frete_motorista !== undefined ? Number(data.frete_motorista) : 0;
  let valCarga = data.valor_carga !== undefined ? Number(data.valor_carga) : 0;

  return {
    id: docSnap.id,
    ...data,
    lat: latVal || -23.5505,
    lng: lngVal || -46.6333,
    km: kmVal,
    frete_empresa: freteEmp,
    frete_motorista: freteMot,
    valor_carga: valCarga
  } as Entrega;
}

export interface PaginatedFilters {
  status: string;
  origem: string;
  destino: string;
  dataColeta: string;
  cliente: string;
  search: string;
  vendedor?: string;
}

export function usePaginatedEntregas(initialFilters: PaginatedFilters) {
  const [filters, setFilters] = useState<PaginatedFilters>(initialFilters);
  const [pages, setPages] = useState<Record<number, Entrega[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [indexWarning] = useState<string | null>(null);

  const activePageIndexRef = useRef<number>(0);

  // Convert loaded pages to single contiguous flat list of unique items
  const loadedEntregas = Object.keys(pages)
    .map(Number)
    .sort((a, b) => a - b)
    .reduce<Entrega[]>((acc, pageIdx) => {
      const pageItems = pages[pageIdx] || [];
      return [...acc, ...pageItems];
    }, []);

  const loadedCount = loadedEntregas.length;

  const loadInitialPage = async () => {
    setLoading(true);
    try {
      let items = [...getEntregas()];

      // If database is empty on boot, await or attempt a soft refetch once to initialize
      if (items.length === 0 && (window as any).rodovar_quota_exceeded !== true) {
        await fetchEntregasFromServer(false);
        items = [...getEntregas()];
      }

      // Apply all filtering compound logic 100% in-memory over our fast local storage/TTL database
      const filtered = items.filter(e => matchDelivery(e, filters));

      // Slice page 0 locally (instantaneous and cost-free!)
      const page0 = filtered.slice(0, PAGE_SIZE);
      setPages({ 0: page0 });
      setTotalCount(filtered.length);
      setHasMore(filtered.length > PAGE_SIZE);
    } catch (err) {
      console.error("Local pagination error:", err);
      // Resilience fallback to localStorage
      try {
        const raw = localStorage.getItem('rodovar_cached_entregas_fallback');
        const fallbackItems: Entrega[] = raw ? JSON.parse(raw) : [];
        setPages({ 0: fallbackItems.slice(0, PAGE_SIZE) });
        setTotalCount(fallbackItems.length);
        setHasMore(fallbackItems.length > PAGE_SIZE);
      } catch {
        setPages({ 0: [] });
        setTotalCount(0);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Re-run whenever filter conditions change
  useEffect(() => {
    setPages({});
    activePageIndexRef.current = 0;
    setHasMore(true);

    loadInitialPage();

    // Listen to central cache updates (e.g., from save/delete mutations or 3-min automatic polls)
    // to dynamically refresh without issuing any redundant reads to Firestore!
    const unsubscribeFromStorage = subscribeToRealtime(() => {
      loadInitialPage();
    });

    return () => {
      unsubscribeFromStorage();
    };
  }, [filters]);

  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;

    setLoadingMore(true);
    const nextPageIndex = activePageIndexRef.current + 1;
    activePageIndexRef.current = nextPageIndex;

    try {
      const items = [...getEntregas()];
      
      const filtered = items.filter(e => matchDelivery(e, filters));

      const start = nextPageIndex * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      const pageItems = filtered.slice(start, end);

      setPages(prev => ({ ...prev, [nextPageIndex]: pageItems }));
      setHasMore(filtered.length > end);
    } catch (err) {
      console.error("Local pagination loadMore error:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  return {
    loadedEntregas,
    loading,
    loadingMore,
    hasMore,
    totalCount,
    loadedCount,
    filters,
    setFilters,
    loadMore,
    indexWarning
  };
}
