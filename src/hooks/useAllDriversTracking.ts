import { useState, useEffect } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { database } from '../db/firebase';

export interface DriverTrackingData {
  cargoId: string;
  driver: string;
  route: string;
  client: string;
  lat: number;
  lng: number;
  accuracy: number;
  ts: number;
  timestamp: string;
  trackingStatus: 'tracking' | 'delivered' | 'finished';
  liveStatus: 'live' | 'offline' | 'delivered';
}

export function useAllDriversTracking() {
  const [trackingData, setTrackingData] = useState<DriverTrackingData[]>([]);

  useEffect(() => {
    const trackingRef = ref(database, 'localizacoes');

    const unsubscribe = onValue(trackingRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setTrackingData([]);
        return;
      }

      const activeDrivers: DriverTrackingData[] = [];
      const now = Date.now();

      Object.entries(data).forEach(([cargoId, val]: [string, any]) => {
        if (!val) return;

        // Support flat coordinates or nested current
        const current = val.current || val;
        
        const lat = Number(current.lat ?? 0);
        const lng = Number(current.lng ?? 0);
        
        // Skip invalid zero-coordinates if not started yet
        if (!lat && !lng) return;

        const accuracy = Number(current.accuracy ?? 0);
        const ts = Number(current.ts ?? val.ts ?? 0);
        const timestamp = current.timestamp ?? val.timestamp ?? '';
        const trackingStatus = val.status || 'tracking';

        // Filters out delivered/finished drivers if last update is more than 5 minutes ago (300,000ms)
        const isDelivered = trackingStatus === 'delivered' || trackingStatus === 'finished';
        if (isDelivered && (now - ts > 300000)) {
          return; // omit from the live list
        }

        // Determine liveStatus
        let liveStatus: 'live' | 'offline' | 'delivered' = 'offline';
        if (isDelivered) {
          liveStatus = 'delivered';
        } else if (now - ts < 60000) {
          liveStatus = 'live';
        }

        activeDrivers.push({
          cargoId,
          driver: val.driver || 'Motorista',
          route: val.route || '',
          client: val.client || '',
          lat,
          lng,
          accuracy,
          ts,
          timestamp,
          trackingStatus,
          liveStatus
        });
      });

      setTrackingData(activeDrivers);
    }, (error) => {
      console.error("Error reading driver tracking list from Realtime DB:", error);
    });

    // Run interval every 15 seconds to recalculate "live" / "offline" status
    // without executing a new fetch on Firebase (using values already in memory)
    const intervalId = setInterval(() => {
      setTrackingData((prev) => {
        const now = Date.now();
        return prev
          .map((driver) => {
            const isDelivered = driver.trackingStatus === 'delivered' || driver.trackingStatus === 'finished';
            
            // Omit if delivered more than 5 minutes ago
            if (isDelivered && (now - driver.ts > 300000)) {
              return null;
            }

            let newLiveStatus: 'live' | 'offline' | 'delivered' = 'offline';
            if (isDelivered) {
              newLiveStatus = 'delivered';
            } else if (now - driver.ts < 60000) {
              newLiveStatus = 'live';
            }

            if (driver.liveStatus === newLiveStatus) {
              return driver;
            }

            return {
              ...driver,
              liveStatus: newLiveStatus
            };
          })
          .filter((d): d is DriverTrackingData => d !== null);
      });
    }, 15000);

    return () => {
      off(trackingRef, 'value', unsubscribe);
      clearInterval(intervalId);
    };
  }, []);

  return trackingData;
}
