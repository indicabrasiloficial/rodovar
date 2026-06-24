import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (!entrega) {
      setPosition(null);
      setSource('none');
      setIsLive(false);
      setLastSeenSeconds(null);
      return;
    }

    const cargoId = entrega.id;
    const trackingRef = ref(database, `tracking/${cargoId}/current`);

    const handleGpsUpdate = (snap: any): boolean => {
      const now = Date.now();
      if (snap.exists()) {
        const val = snap.val();
        const lat = Number(val.lat);
        const lng = Number(val.lng);
        const ts = Number(val.ts || 0);

        if (lat && lng) {
          setPosition({ lat, lng });
          setSource('gps');
          const ageSeconds = Math.max(0, Math.floor((now - ts) / 1000));
          setIsLive(ageSeconds < 60);
          setLastSeenSeconds(ageSeconds);
          return true;
        }
      }
      return false;
    };

    const unsubscribe = onValue(trackingRef, (snap) => {
      const foundGps = handleGpsUpdate(snap);
      if (!foundGps) {
        // Fallback 1: Link WhatsApp coordinates
        if (entrega.link_localizacao) {
          const waCoords = extractCoordsFromLink(entrega.link_localizacao);
          if (waCoords) {
            setPosition(waCoords);
            setSource('whatsapp');
            setIsLive(false);
            setLastSeenSeconds(null);
            return;
          }
        }

        // Fallback 2: General coordinates from delivery object
        if (entrega.lat && entrega.lng) {
          setPosition({ lat: Number(entrega.lat), lng: Number(entrega.lng) });
          // If they entered a link_localizacao but it couldn't be parsed, it's still shown as none/whatsapp
          setSource(entrega.link_localizacao ? 'whatsapp' : 'none');
          setIsLive(false);
          setLastSeenSeconds(null);
        } else {
          setPosition(null);
          setSource('none');
          setIsLive(false);
          setLastSeenSeconds(null);
        }
      }
    }, (error) => {
      console.error("Error reading specific cargo tracking from Realtime DB:", error);
    });

    // Setup an interval to recalculate active/offline status (every 10s)
    const interval = setInterval(() => {
      // Re-evaluate live state based on last seen timestamp
      onValue(trackingRef, (snap) => {
        handleGpsUpdate(snap);
      }, { onlyOnce: true });
    }, 10000);

    return () => {
      off(trackingRef, 'value', unsubscribe);
      clearInterval(interval);
    };
  }, [entrega?.id, entrega?.link_localizacao, entrega?.lat, entrega?.lng]);

  return { position, source, isLive, lastSeenSeconds };
}
