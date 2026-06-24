import { useState, useEffect, useRef } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { database } from '../db/firebase';
import { Entrega } from '../types';
import { extractCoordsFromLink } from '../db/storage';

export interface CargoTrackingResult {
  position: { lat: number; lng: number } | null;
  source: 'gps' | 'whatsapp' | 'none';
  isLive: boolean;
  lastSeenSeconds: number | null;
}

export function useCargoTracking(entrega: Entrega | null): CargoTrackingResult {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [source, setSource] = useState<'gps' | 'whatsapp' | 'none'>('none');
  const [isLive, setIsLive] = useState<boolean>(false);
  const [lastSeenSeconds, setLastSeenSeconds] = useState<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!entrega) {
      setPosition(null);
      setSource('none');
      setIsLive(false);
      setLastSeenSeconds(null);
      lastTsRef.current = null;
      return;
    }

    const cargoId = entrega.id.toLowerCase();
    const trackingRef = ref(database, `localizacoes/${cargoId}`);

    const handleSync = (rtdbSnap: any) => {
      const now = Date.now();
      
      let rtdbLat = 0;
      let rtdbLng = 0;
      let rtdbTs = 0;

      if (rtdbSnap && rtdbSnap.exists()) {
        const val = rtdbSnap.val();
        // Support both direct flat fields and nested current object
        const current = val.current || val;
        rtdbLat = Number(current.lat ?? 0);
        rtdbLng = Number(current.lng ?? 0);
        rtdbTs = Number(current.ts ?? val.ts ?? 0);
      }

      let fsLat = 0;
      let fsLng = 0;
      let fsTs = 0;

      if (entrega.localizacaoAtual && entrega.localizacaoAtual.lat && entrega.localizacaoAtual.lng) {
        fsLat = Number(entrega.localizacaoAtual.lat);
        fsLng = Number(entrega.localizacaoAtual.lng);
        if (entrega.ultimaAtualizacao) {
          fsTs = Date.parse(entrega.ultimaAtualizacao) || 0;
        }
      }

      // Determine which source is newer and valid
      let selectedLat = 0;
      let selectedLng = 0;
      let selectedTs = 0;
      let activeSource: 'gps' | 'whatsapp' | 'none' = 'none';

      if (rtdbLat && rtdbLng && fsLat && fsLng) {
        if (rtdbTs >= fsTs) {
          selectedLat = rtdbLat;
          selectedLng = rtdbLng;
          selectedTs = rtdbTs;
          activeSource = 'gps';
        } else {
          selectedLat = fsLat;
          selectedLng = fsLng;
          selectedTs = fsTs;
          activeSource = 'gps';
        }
      } else if (rtdbLat && rtdbLng) {
        selectedLat = rtdbLat;
        selectedLng = rtdbLng;
        selectedTs = rtdbTs;
        activeSource = 'gps';
      } else if (fsLat && fsLng) {
        selectedLat = fsLat;
        selectedLng = fsLng;
        selectedTs = fsTs;
        activeSource = 'gps';
      }

      if (selectedLat && selectedLng) {
        setPosition({ lat: selectedLat, lng: selectedLng });
        setSource(activeSource);
        lastTsRef.current = selectedTs;
        const ageSeconds = selectedTs ? Math.max(0, Math.floor((now - selectedTs) / 1000)) : null;
        setIsLive(ageSeconds !== null ? ageSeconds < 150 : false);
        setLastSeenSeconds(ageSeconds);
        return true;
      }
      return false;
    };

    const applyFallbacks = () => {
      if (entrega.link_localizacao) {
        const waCoords = extractCoordsFromLink(entrega.link_localizacao);
        if (waCoords) {
          setPosition(waCoords);
          setSource('whatsapp');
          setIsLive(false);
          setLastSeenSeconds(null);
          lastTsRef.current = null;
          return;
        }
      }

      if (entrega.lat && entrega.lng) {
        setPosition({ lat: Number(entrega.lat), lng: Number(entrega.lng) });
        setSource(entrega.link_localizacao ? 'whatsapp' : 'none');
        setIsLive(false);
        setLastSeenSeconds(null);
        lastTsRef.current = null;
      } else {
        setPosition(null);
        setSource('none');
        setIsLive(false);
        setLastSeenSeconds(null);
        lastTsRef.current = null;
      }
    };

    // 1. Run an immediate sync with Firestore/delivery data before RTDB responds or if RTDB fails
    const initialFound = handleSync(null);
    if (!initialFound) {
      applyFallbacks();
    }

    const unsubscribe = onValue(trackingRef, (snap) => {
      const found = handleSync(snap);
      if (!found) {
        applyFallbacks();
      }
    }, (error) => {
      console.warn("Realtime DB tracking listener failed/denied, falling back to Firestore: ", error);
      // Run fallback sync with Firestore directly when Realtime DB fails
      const found = handleSync(null);
      if (!found) {
        applyFallbacks();
      }
    });

    // Setup an interval to recalculate active/offline status locally (every 5s)
    const interval = setInterval(() => {
      const now = Date.now();
      const selectedTs = lastTsRef.current;
      if (selectedTs) {
        const ageSeconds = Math.max(0, Math.floor((now - selectedTs) / 1000));
        setIsLive(ageSeconds < 150);
        setLastSeenSeconds(ageSeconds);
      }
    }, 5000);

    return () => {
      off(trackingRef, 'value', unsubscribe);
      clearInterval(interval);
    };
  }, [
    entrega?.id, 
    entrega?.link_localizacao, 
    entrega?.lat, 
    entrega?.lng,
    entrega?.localizacaoAtual?.lat,
    entrega?.localizacaoAtual?.lng,
    entrega?.ultimaAtualizacao
  ]);

  return { position, source, isLive, lastSeenSeconds };
}
