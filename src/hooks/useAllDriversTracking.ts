import { useState, useEffect } from 'react';
import { dbAdapter } from '../db/databaseAdapter';

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
    const unsubscribe = dbAdapter.inscreverTrackingGeral((data) => {
      if (!data) {
        setTrackingData([]);
        return;
      }

      const activeDrivers: DriverTrackingData[] = [];
      const now = Date.now();

      Object.entries(data).forEach(([cargoId, val]: [string, any]) => {
        if (!val) return;

        let lat = 0;
        let lng = 0;
        let ts = 0;
        let accuracy = 0;
        let timestamp = '';
        const trackingStatus = val.status || 'tracking';
        const driverNameStr = val.driverName || val.driver || 'Motorista';

        if (val.location) {
          lat = Number(val.location.lat ?? 0);
          lng = Number(val.location.lng ?? 0);
          accuracy = Number(val.location.accuracy ?? 0);
          timestamp = val.location.timestamp ?? '';
          ts = Number(val.updatedAt ?? 0);
        } else {
          // Fallback parsing
          const current = val.current || val;
          lat = Number(current.lat ?? 0);
          lng = Number(current.lng ?? 0);
          accuracy = Number(current.accuracy ?? 0);
          timestamp = current.timestamp ?? val.timestamp ?? '';
          ts = Number(current.ts ?? val.ts ?? 0);
        }
        
        // Skip invalid zero-coordinates if not started yet
        if (!lat && !lng) return;

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
          driver: driverNameStr,
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
      unsubscribe();
      clearInterval(intervalId);
    };
  }, []);

  return trackingData;
}
