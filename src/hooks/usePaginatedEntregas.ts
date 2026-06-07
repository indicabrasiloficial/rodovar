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

  // Compile active query constraints based on filter values
  const buildQueryBase = () => {
    let q = query(collection(db, ENTREGAS_COLLECTION));
    
    // Exact match filters (Server-side optimized)
    if (filters.status && filters.status !== 'all') {
      q = query(q, where('status', '==', filters.status));
    }
    if (filters.dataColeta) {
      q = query(q, where('data_coleta', '==', filters.dataColeta));
    }

    // Range search options - Priority-route prefix matching
    const searchOrigem = filters.origem.toLowerCase().trim();
    const searchDestino = filters.destino.toLowerCase().trim();
    const searchCliente = filters.cliente.toLowerCase().trim();

    if (searchOrigem) {
      // Direct prefix query on helper field
      q = query(q, where('search_origem', '>=', searchOrigem), where('search_origem', '<=', searchOrigem + '\uf8ff'));
    } else if (searchDestino) {
      q = query(q, where('search_destino', '>=', searchDestino), where('search_destino', '<=', searchDestino + '\uf8ff'));
    } else if (searchCliente) {
      q = query(q, where('search_cliente', '>=', searchCliente), where('search_cliente', '<=', searchCliente + '\uf8ff'));
    }

    return q;
  };

  // Re-run whenever filters change
  useEffect(() => {
    // 1. Unsubscribe from all previous pages
    unsubscribesRef.current.forEach(unsub => unsub());
    unsubscribesRef.current = [];
    
    // 2. Clear state
    setPages({});
    lastVisibleDocsRef.current = {};
    activePageIndexRef.current = 0;
    setHasMore(true);
    setLoading(true);
    setIndexWarning(null);

    const loadInitialPage = async () => {
      try {
        const queryBase = buildQueryBase();
        
        // Fetch total count matching this query in real-time (Server-Side optimized!)
        try {
          const countSnap = await getCountFromServer(queryBase);
          setTotalCount(countSnap.data().count);
        } catch (err) {
          console.warn('Error fetching server-side matches count. Might require compound indexes:', err);
          // Fallback of total count is null
          setTotalCount(null);
        }

        // Standard sorted dynamic query
        const initialQuery = query(
          queryBase, 
          orderBy('created_at', 'desc'), 
          limit(PAGE_SIZE)
        );

        // Attach snapshot listener (Requirement 9: Realtime slice updates!)
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
          
          // DETECT MISSING INDEX (FAILED_PRECONDITION or is missing indices link in errors)
          if (error.message.includes('index') || error.message.includes('FAILED_PRECONDITION')) {
            setIndexWarning("O Firebase está se preparando para criar os índices necessários para sua combinação de filtros. Carregando em modo de segurança...");
            
            // Auto Fallback without compound sorting: query by creation sorted natively
            const fallbackQuery = query(
              collection(db, ENTREGAS_COLLECTION),
              orderBy('created_at', 'desc'),
              limit(100) // retrieve a healthy subset
            );

            const unsubFallback = onSnapshot(fallbackQuery, (snapshot) => {
              let items = snapshot.docs.map(parseFirestoreDocToEntrega);
              
              // Apply combined filters manually in memory to prevent complete white screen
              items = items.filter(e => {
                if (filters.status && filters.status !== 'all' && e.status !== filters.status) return false;
                if (filters.dataColeta && e.data_coleta !== filters.dataColeta) return false;
                if (filters.origem && !e.origem.toLowerCase().includes(filters.origem.toLowerCase())) return false;
                if (filters.destino && !e.destino.toLowerCase().includes(filters.destino.toLowerCase())) return false;
                if (filters.cliente && !e.cliente.toLowerCase().includes(filters.cliente.toLowerCase())) return false;
                return true;
              });

              setPages({ 0: items });
              setTotalCount(items.length);
              setHasMore(false);
              setLoading(false);
              setLoadingMore(false);
            });
            unsubscribesRef.current.push(unsubFallback);
          } else {
            // Standard error handler
            handleFirestoreError(error, OperationType.LIST, ENTREGAS_COLLECTION);
            setLoading(false);
          }
        });

        unsubscribesRef.current.push(unsubscribe);

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

  // Load next page function
  const loadMore = () => {
    if (loading || loadingMore || !hasMore || indexWarning) return;
    
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
