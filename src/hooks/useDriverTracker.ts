import { useState, useEffect } from 'react';
import { dbAdapter } from '../db/databaseAdapter';

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

    const unsubscribe = dbAdapter.inscreverTrackingCargo(cargoId, (data) => {
      if (data) {
        let position = null;
        if (data.location) {
          position = {
            lat: Number(data.location.lat),
            lng: Number(data.location.lng),
            accuracy: Number(data.location.accuracy || 0),
            timestamp: data.location.timestamp || '',
            ts: Number(data.updatedAt || 0)
          };
        } else if (data.lat !== undefined) {
          position = {
            lat: Number(data.lat),
            lng: Number(data.lng),
            accuracy: Number(data.accuracy || 0),
            timestamp: data.timestamp || '',
            ts: Number(data.ts || 0)
          };
        } else if (data.current) {
          position = {
            lat: Number(data.current.lat),
            lng: Number(data.current.lng),
            accuracy: Number(data.current.accuracy || 0),
            timestamp: data.current.timestamp || '',
            ts: Number(data.current.ts || 0)
          };
        }

        setTrackerState({
          position,
          status: data.status || 'tracking',
          startedAt: data.startedAt || (data.updatedAt ? new Date(data.updatedAt).toISOString() : null),
          driver: data.driverName || data.driver || null,
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
    });

    return () => {
      unsubscribe();
    };
  }, [cargoId]);

  // Command the driver tracker to finish as delivered
  const markAsDelivered = async () => {
    if (!cargoId) return;
    try {
      await dbAdapter.atualizarTrackingCargo(cargoId, {
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
      await dbAdapter.atualizarTrackingCargo(cargoId, {
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
