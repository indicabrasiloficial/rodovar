import { useState, useEffect, useRef } from 'react';
import { dbAdapter } from '../db/databaseAdapter';
import { Entrega } from '../types';
import { extractCoordsFromLink } from '../db/storage';

export interface CargoTrackingResult {
  position: { lat: number; lng: number } | null;
  source: 'gps' | 'whatsapp' | 'none';
  isLive: boolean;
  lastSeenSeconds: number | null;
  connectionStatus: 'live' | 'weak' | 'offline' | 'local';
}

export function useCargoTracking(entrega: Entrega | null): CargoTrackingResult {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [source, setSource] = useState<'gps' | 'whatsapp' | 'none'>('none');
  const [isLive, setIsLive] = useState<boolean>(false);
  const [lastSeenSeconds, setLastSeenSeconds] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'live' | 'weak' | 'offline' | 'local'>('offline');
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!entrega) {
      setPosition(null);
      setSource('none');
      setIsLive(false);
      setLastSeenSeconds(null);
      setConnectionStatus('offline');
      lastTsRef.current = null;
      return;
    }

    const cargoId = entrega.id; // Mantém o case original para compatibilidade absoluta com os IDs do Firestore que são case-sensitive

    const handleSync = (rtdbVal: any) => {
      const now = Date.now();
      
      let rtdbLat = 0;
      let rtdbLng = 0;
      let rtdbTs = 0;
      let rtdbConnected = false;
      let rtdbLastSeen = 0;

      if (rtdbVal) {
        rtdbConnected = rtdbVal.connected === true;
        rtdbLastSeen = Number(rtdbVal.lastSeen ?? 0);
        
        if (rtdbVal.location) {
          rtdbLat = Number(rtdbVal.location.lat ?? 0);
          rtdbLng = Number(rtdbVal.location.lng ?? 0);
          rtdbTs = Number(rtdbVal.location.timestamp ?? rtdbVal.updatedAt ?? 0);
        } else {
          // Fallback support for legacy flat fields
          const current = rtdbVal.current || rtdbVal;
          rtdbLat = Number(current.lat ?? 0);
          rtdbLng = Number(current.lng ?? 0);
          rtdbTs = Number(current.ts ?? rtdbVal.ts ?? 0);
        }
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

      // Parse WhatsApp link coordinates if present
      const waCoords = entrega.link_localizacao ? extractCoordsFromLink(entrega.link_localizacao) : null;

      // Check if there is an active, fresh live GPS transmission right now
      const isActivelyLiveNow = rtdbConnected === true && (rtdbLat && rtdbLng) && (Date.now() - rtdbTs < 120000);

      if (waCoords && !isActivelyLiveNow) {
        // If there is a WhatsApp link and we do NOT have an active, fresh live transmission,
        // we always prioritize the WhatsApp link coordinates!
        selectedLat = waCoords.lat;
        selectedLng = waCoords.lng;
        selectedTs = 0;
        activeSource = 'whatsapp';
      } else {
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
      }

      if (selectedLat && selectedLng) {
        setPosition({ lat: selectedLat, lng: selectedLng });
        setSource(activeSource);
        lastTsRef.current = activeSource === 'whatsapp' ? null : selectedTs;

        // [RODOVAR FIX v3] CORREÇÃO 2 — Escutar connected e lastSeen em tempo real
        const lastSeen = rtdbLastSeen || selectedTs;
        const ageSeconds = lastSeen ? Math.max(0, Math.floor((now - lastSeen) / 1000)) : null;
        const minutosOffline = lastSeen ? (now - lastSeen) / 60000 : Infinity;

        let statusVal: 'live' | 'weak' | 'offline' | 'local' = 'offline';
        if (activeSource === 'whatsapp') {
          statusVal = 'local';
        } else if (rtdbConnected === true && minutosOffline < 2) {
          statusVal = 'live';
        } else if (minutosOffline < 5) {
          statusVal = 'weak';
        } else {
          statusVal = 'offline';
        }

        setConnectionStatus(statusVal);
        setIsLive(statusVal === 'live');
        setLastSeenSeconds(activeSource === 'whatsapp' ? null : ageSeconds);
        return true;
      }
      return false;
    };

    const applyFallbacks = () => {
      setIsLive(false);
      setLastSeenSeconds(null);
      lastTsRef.current = null;
      if (entrega.link_localizacao) {
        const waCoords = extractCoordsFromLink(entrega.link_localizacao);
        if (waCoords) {
          setPosition(waCoords);
          setSource('whatsapp');
          setConnectionStatus('local');
          return;
        }
      }

      if (entrega.lat && entrega.lng) {
        setPosition({ lat: Number(entrega.lat), lng: Number(entrega.lng) });
        const hasWaLink = !!entrega.link_localizacao;
        setSource(hasWaLink ? 'whatsapp' : 'none');
        setConnectionStatus(hasWaLink ? 'local' : 'offline');
      } else {
        setPosition(null);
        setSource('none');
        setConnectionStatus('offline');
      }
    };

    // 1. Run an immediate sync with Firestore/delivery data before RTDB responds or if RTDB fails
    const initialFound = handleSync(null);
    if (!initialFound) {
      applyFallbacks();
    }

    const unsubscribe = dbAdapter.inscreverTrackingCargo(cargoId, (val) => {
      const found = handleSync(val);
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
        const minutosOffline = ageSeconds / 60;
        
        let statusVal: 'live' | 'weak' | 'offline' = 'offline';
        if (minutosOffline < 2 && isLive) {
          statusVal = 'live';
        } else if (minutosOffline < 5) {
          statusVal = 'weak';
        } else {
          statusVal = 'offline';
        }
        
        setConnectionStatus(statusVal);
        setIsLive(statusVal === 'live');
        setLastSeenSeconds(ageSeconds);
      }
    }, 5000);

    return () => {
      unsubscribe();
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

  return { position, source, isLive, lastSeenSeconds, connectionStatus };
}
