import { useState, useEffect } from 'react';
import { database } from '../db/firebase';
import { ref, onValue, set, update, off } from 'firebase/database';

export interface TrackerLocation {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: string;
  ts: number;
}

export interface TrackerState {
  position: TrackerLocation | null;
  status: 'idle' | 'tracking' | 'finished' | 'delivered' | string;
  startedAt: string | null;
  driver: string | null;
  route: string | null;
  client: string | null;
  error: string | null;
}

export function useDriverTracker(cargoId: string | undefined) {
  const [trackerState, setTrackerState] = useState<TrackerState>({
    position: null,
    status: 'idle',
    startedAt: null,
    driver: null,
    route: null,
    client: null,
    error: null,
  });

  useEffect(() => {
    if (!cargoId) {
      setTrackerState(prev => ({ ...prev, status: 'idle', position: null }));
      return;
    }

    const trackerRef = ref(database, `localizacoes/${cargoId}`);
    
    const unsubscribe = onValue(trackerRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTrackerState({
          position: data.current || (data.lat !== undefined ? {
            lat: Number(data.lat),
            lng: Number(data.lng),
            accuracy: Number(data.accuracy || 0),
            timestamp: data.timestamp || '',
            ts: Number(data.ts || 0)
          } : null),
          status: data.status || 'tracking',
          startedAt: data.startedAt || null,
          driver: data.driver || null,
          route: data.route || null,
          client: data.client || null,
          error: null,
        });
      } else {
        setTrackerState(prev => ({
          ...prev,
          position: null,
          status: 'idle',
          startedAt: null,
          error: null,
        }));
      }
    }, (err) => {
      console.error("useDriverTracker error:", err);
      setTrackerState(prev => ({ ...prev, error: err.message }));
    });

    return () => {
      off(trackerRef);
    };
  }, [cargoId]);

  // Command the driver tracker to finish as delivered
  const markAsDelivered = async () => {
    if (!cargoId) return;
    try {
      const trackerRef = ref(database, `localizacoes/${cargoId}`);
      await update(trackerRef, {
        status: 'delivered',
        finishedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("Failed to mark cargo tracker as delivered:", err);
      setTrackerState(prev => ({ ...prev, error: err.message }));
    }
  };

  // Stop tracking manually
  const stopTracking = async () => {
    if (!cargoId) return;
    try {
      const trackerRef = ref(database, `localizacoes/${cargoId}`);
      await update(trackerRef, {
        status: 'finished',
        finishedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("Failed to stop cargo tracker:", err);
      setTrackerState(prev => ({ ...prev, error: err.message }));
    }
  };

  return {
    ...trackerState,
    markAsDelivered,
    stopTracking,
  };
}
