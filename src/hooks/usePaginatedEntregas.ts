import { useState, useEffect, useRef } from 'react';
import { db, OperationType, handleFirestoreError } from '../db/firebase';
import { Entrega, DeliveryStatus } from '../types';
import { calculateRealisticDistanceKm, findCityCoords } from '../utils/distance';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  onSnapshot, 
  getCountFromServer,
  DocumentData,
  QueryDocumentSnapshot,
  getDocs
} from 'firebase/firestore';

const ENTREGAS_COLLECTION = 'entregas';
const PAGE_SIZE = 20;

// High performance parsing helper identical to storage.ts
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
  const [indexWarning, setIndexWarning] = useState<string | null>(null);

  // Keep tracks of document snapshot cursors for pagination
  const lastVisibleDocsRef = useRef<Record<number, QueryDocumentSnapshot<DocumentData>>>({});
  const unsubscribesRef = useRef<(() => void)[]>([]);
  const activePageIndexRef = useRef<number>(0);

  // Convert loaded pages to single contiguous flat list of unique items
  const loadedEntregas = Object.keys(pages)
    .map(Number)
    .sort((a, b) => a - b)
    .reduce<Entrega[]>((acc, pageIdx) => {
      const pageItems = pages[pageIdx] || [];
      return [...acc, ...pageItems];
    }, []);

  // Compute number of actually loaded items
  const loadedCount = loadedEntregas.length;

  // Compile active query constraints based on filter values (safe, exact equality matches only)
  const buildQueryBase = () => {
    let q = query(collection(db, ENTREGAS_COLLECTION));
    
    // exact match status
    if (filters.status && filters.status !== 'all') {
      q = query(q, where('status', '==', filters.status));
    }
    // exact match collection date
    if (filters.dataColeta) {
      q = query(q, where('data_coleta', '==', filters.dataColeta));
    }

    return q;
  };

  // Re-run whenever filters change
  useEffect(() => {
    // 1. Unsubscribe from all previous snapshots
    unsubscribesRef.current.forEach(unsub => unsub());
    unsubscribesRef.current = [];
    
    // 2. Clear state
    setPages({});
    lastVisibleDocsRef.current = {};
    activePageIndexRef.current = 0;
    setHasMore(true);
    setLoading(true);
    setIndexWarning(null);

    const hasSearchFilters = !!(
      filters.search.trim() || 
      filters.origem.trim() || 
      filters.destino.trim() || 
      filters.cliente.trim() ||
      filters.vendedor?.trim()
    );

    const loadInitialPage = async () => {
      try {
        const queryBase = buildQueryBase();

        if (hasSearchFilters) {
          // If advanced filters are active, query up to 500 entries of the specific status/date category,
          // and apply advanced in-memory compound filters to circumvent Firestore indexing constraints.
          const searchQuery = query(
            queryBase,
            orderBy('created_at', 'desc'),
            limit(500)
          );

          const unsubscribe = onSnapshot(searchQuery, (snapshot) => {
            const rawItems = snapshot.docs.map(parseFirestoreDocToEntrega);
            
            // Apply all filters in-memory
            const filtered = rawItems.filter(e => {
              // Vendedor filter
              if (filters.vendedor?.trim()) {
                const v = filters.vendedor.toLowerCase().trim();
                if (!(e.vendedor || '').toLowerCase().includes(v)) return false;
              }
              // Origin filter
              if (filters.origem.trim()) {
                const o = filters.origem.toLowerCase().trim();
                if (!(e.origem || '').toLowerCase().includes(o)) return false;
              }
              // Destino filter
              if (filters.destino.trim()) {
                const d = filters.destino.toLowerCase().trim();
                if (!(e.destino || '').toLowerCase().includes(d)) return false;
              }
              // Cliente filter
              if (filters.cliente.trim()) {
                const c = filters.cliente.toLowerCase().trim();
                if (!(e.cliente || '').toLowerCase().includes(c)) return false;
              }
              // Text Search filter (vendedor, cliente, motorista, origem, destino, observacoes, id)
              if (filters.search.trim()) {
                const s = filters.search.toLowerCase().trim();
                const matches = 
                  (e.motorista || '').toLowerCase().includes(s) ||
                  (e.vendedor || '').toLowerCase().includes(s) ||
                  (e.cliente || '').toLowerCase().includes(s) ||
                  (e.origem || '').toLowerCase().includes(s) ||
                  (e.destino || '').toLowerCase().includes(s) ||
                  (e.observacoes || '').toLowerCase().includes(s) ||
                  (e.id || '').toLowerCase().includes(s);
                if (!matches) return false;
              }
              return true;
            });

            setPages({ 0: filtered });
            setTotalCount(filtered.length);
            setHasMore(false);
            setLoading(false);
            setLoadingMore(false);
          }, (error) => {
            console.error("Firestore advanced search error:", error);
            handleFirestoreError(error, OperationType.LIST, ENTREGAS_COLLECTION);
            setLoading(false);
          });

          unsubscribesRef.current.push(unsubscribe);
        } else {
          // No search filters active: Standard cursor paging
          try {
            const countSnap = await getCountFromServer(queryBase);
            setTotalCount(countSnap.data().count);
          } catch (err) {
            console.warn('Error fetching server-side matches count:', err);
            setTotalCount(null);
          }

          const initialQuery = query(
            queryBase, 
            orderBy('created_at', 'desc'), 
            limit(PAGE_SIZE)
          );

          const unsubscribe = onSnapshot(initialQuery, (snapshot) => {
            const items = snapshot.docs.map(parseFirestoreDocToEntrega);
            
            setPages(prev => ({ ...prev, [0]: items }));
            setLoading(false);
            setLoadingMore(false);

            if (snapshot.docs.length > 0) {
              lastVisibleDocsRef.current[0] = snapshot.docs[snapshot.docs.length - 1];
            }
            
            if (snapshot.docs.length < PAGE_SIZE) {
              setHasMore(false);
            } else {
              setHasMore(true);
            }
          }, (error) => {
            console.error("Firestore page 1 snapshot error:", error);
            handleFirestoreError(error, OperationType.LIST, ENTREGAS_COLLECTION);
            setLoading(false);
          });

          unsubscribesRef.current.push(unsubscribe);
        }
      } catch (err) {
        console.error("Error setting up paginated data fetch:", err);
        setLoading(false);
      }
    };

    loadInitialPage();

    return () => {
      unsubscribesRef.current.forEach(u => u());
    };
  }, [filters]);

  // Load next page function (only applicable when search filters are empty)
  const loadMore = () => {
    const hasSearchFilters = !!(
      filters.search.trim() || 
      filters.origem.trim() || 
      filters.destino.trim() || 
      filters.cliente.trim()
    );

    if (loading || loadingMore || !hasMore || indexWarning || hasSearchFilters) return;
    
    const nextPageIndex = activePageIndexRef.current + 1;
    const lastVisibleDoc = lastVisibleDocsRef.current[nextPageIndex - 1];
    
    if (!lastVisibleDoc) {
      setHasMore(false);
      return;
    }

    setLoadingMore(true);
    activePageIndexRef.current = nextPageIndex;

    const queryBase = buildQueryBase();
    const nextQuery = query(
      queryBase,
      orderBy('created_at', 'desc'),
      startAfter(lastVisibleDoc),
      limit(PAGE_SIZE)
    );

    const unsubscribe = onSnapshot(nextQuery, (snapshot) => {
      const items = snapshot.docs.map(parseFirestoreDocToEntrega);
      
      setPages(prev => ({ ...prev, [nextPageIndex]: items }));
      setLoadingMore(false);

      if (snapshot.docs.length > 0) {
        lastVisibleDocsRef.current[nextPageIndex] = snapshot.docs[snapshot.docs.length - 1];
      }
      
      if (snapshot.docs.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
    }, (error) => {
      console.error(`Page ${nextPageIndex} load snapshot error:`, error);
      setLoadingMore(false);
      setHasMore(false);
    });

    unsubscribesRef.current.push(unsubscribe);
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
