import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Entrega } from '../types';
import { useCargoTracking } from '../hooks/useCargoTracking';
import { MapPin, Navigation, Signal, SignalZero, Wifi, WifiOff } from 'lucide-react';

interface LiveMapProps {
  entrega: Entrega | null;
}

// Custom live pulse icon creator
function createLiveIcon(status: 'live' | 'weak' | 'offline' | 'local' | 'idle') {
  const color = 
    status === 'live' ? '#22c55e' : 
    status === 'weak' ? '#fbbf24' : 
    status === 'local' ? '#3b82f6' : 
    status === 'offline' ? '#ef4444' : 
    '#a1a1aa';

  const label = 
    status === 'live' ? 'AO VIVO' : 
    status === 'weak' ? 'SINAL FRACO' : 
    status === 'local' ? 'LOCAL' : 
    status === 'offline' ? 'DESCONECTADO' : 
    'AGUARD.';

  const pulse = status === 'live' ? `
    <style>
      @keyframes rip { 0%{transform:scale(1);opacity:.8} 100%{transform:scale(2.2);opacity:0} }
      .rip { animation: rip 1.5s infinite; }
    </style>
    <div class="rip" style="position:absolute;top:4px;left:4px;width:40px;height:40px;
      border-radius:50%;border:3px solid #22c55e;"></div>` : '';

  const textColor = (status === 'live' || status === 'weak') ? '#000000' : '#ffffff';

  return L.divIcon({
    className: 'custom-live-marker',
    iconSize: [48, 60],
    iconAnchor: [24, 60],
    popupAnchor: [0, -60],
    html: `
      <div style="position:relative;width:48px;height:56px;">
        ${pulse}
        <div style="
          position:relative;z-index:2;
          width:48px;height:48px;border-radius:50%;
          background:${color}22;border:3px solid ${color};
          display:flex;align-items:center;justify-content:center;
          font-size:22px;box-shadow: 0 0 10px ${color}55;">🚛</div>
        <div style="
          position:absolute;bottom:-4px;left:50%;
          transform:translateX(-50%);
          background:${color};color:${textColor};
          font-size:8px;font-weight:900;
          padding:2px 6px;border-radius:100px;
          white-space:nowrap;font-family:monospace;box-shadow: 0 2px 4px rgba(0,0,0,0.5);">
          ${label}
        </div>
      </div>`
  });
}

export default function LiveMap({ entrega }: LiveMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [liveMode, setLiveMode] = useState(true);
  const [isMapReady, setIsMapReady] = useState(false);

  // Load live position tracking
  const { position, source, isLive, lastSeenSeconds, connectionStatus } = useCargoTracking(entrega);

  // Initialize Map
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;

    const initialLat = position?.lat || (entrega?.lat ? Number(entrega.lat) : -12.97);
    const initialLng = position?.lng || (entrega?.lng ? Number(entrega.lng) : -38.50);

    const map = L.map(divRef.current, {
      center: [initialLat, initialLng],
      zoom: 14,
      zoomControl: true,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(map);

    const initialStatus = source === 'whatsapp' ? 'local' : (connectionStatus === 'live' ? 'live' : connectionStatus === 'weak' ? 'weak' : 'offline');
    const icon = createLiveIcon(initialStatus);
    const marker = L.marker([initialLat, initialLng], { icon }).addTo(map);

    mapRef.current = map;
    markerRef.current = marker;
    setIsMapReady(true);

    // Fix render layout issues
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
      setIsMapReady(false);
    };
  }, []);

  // Update marker position and map panning dynamically based on tracking position
  useEffect(() => {
    if (!position || !mapRef.current || !markerRef.current) return;

    const { lat, lng } = position;

    // Move marker smoothly
    markerRef.current.setLatLng([lat, lng]);

    // Update icon status
    const iconStatus = source === 'whatsapp' ? 'local' : connectionStatus;
    markerRef.current.setIcon(createLiveIcon(iconStatus));

    // Pan to position if liveMode is active and status is local or not offline
    const shouldPan = liveMode && (source === 'whatsapp' || connectionStatus !== 'offline');
    if (shouldPan) {
      mapRef.current.panTo([lat, lng], { animate: true, duration: 0.8 });
    }
  }, [position, connectionStatus, source, liveMode, isMapReady]);

  // Handle map resizing if toggle shifts
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.invalidateSize();
    }
  }, [liveMode]);

  // Source badges config
  const getBadgeConfig = () => {
    if (source === 'gps') {
      if (connectionStatus === 'live') {
        return { 
          label: 'LOCALIZAÇÃO AO VIVO', 
          color: 'bg-emerald-950/90 text-emerald-400 border-emerald-500/50',
          dotClass: 'bg-emerald-400 animate-pulse'
        };
      } else if (connectionStatus === 'weak') {
        return { 
          label: 'SINAL FRACO (GPS)', 
          color: 'bg-yellow-950/90 text-amber-400 border-yellow-500/50',
          dotClass: 'bg-amber-400'
        };
      } else {
        const timeText = lastSeenSeconds !== null ? ` (${lastSeenSeconds}s)` : '';
        return { 
          label: `GPS DESCONECTADO${timeText}`, 
          color: 'bg-red-950/90 text-red-400 border-red-500/60 animate-pulse',
          dotClass: 'bg-red-500 animate-ping'
        };
      }
    } else if (source === 'whatsapp') {
      return { 
        label: 'LOCALIZAÇÃO LOCAL', 
        color: 'bg-blue-950/90 text-blue-400 border-blue-500/50',
        dotClass: 'bg-blue-400'
      };
    }
    return { 
      label: 'SEM LOCALIZAÇÃO ATIVA', 
      color: 'bg-zinc-950/90 text-zinc-400 border-zinc-800',
      dotClass: 'bg-zinc-500'
    };
  };

  const badge = getBadgeConfig();

  return (
    <div className={`relative w-full h-full rounded-xl overflow-hidden border transition-all duration-300 ${
      liveMode ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-zinc-800'
    }`}>
      {/* Map Container */}
      <div ref={divRef} className="w-full h-full" style={{ minHeight: '300px' }} />

      {/* Floating Status & Source Badge (Same size, design, and style as the top-right action button) */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5 pointer-events-none">
        <span className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-black tracking-wider border backdrop-blur-md shadow-lg flex items-center gap-1.5 ${badge.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dotClass}`}></span>
          <span>{badge.label}</span>
        </span>
      </div>

      {/* Floating Interactive Live Action Controller */}
      <div className="absolute top-3 right-3 z-[1000]">
        <button
          type="button"
          onClick={() => setLiveMode(prev => !prev)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-lg border backdrop-blur-md ${
            liveMode 
              ? 'bg-emerald-950/90 text-emerald-400 border-emerald-500/50 hover:bg-emerald-900/90 animate-pulse' 
              : 'bg-zinc-950/90 text-zinc-400 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
          }`}
        >
          {liveMode ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-ping"></span>
              <span>🟢 MONITORANDO AO VIVO</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0"></span>
              <span>⚫ ATIVAR AO VIVO</span>
            </>
          )}
        </button>
      </div>

      {/* Lat/Lng display inside map footer */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-black/90 border border-zinc-850 px-2.5 py-1 rounded-lg text-[9px] font-mono text-gray-400 shadow-xl flex gap-3">
        <span>LAT: <span id="map-lat" className="text-zinc-200 font-bold">{position?.lat ? position.lat.toFixed(5) : entrega?.lat ? Number(entrega.lat).toFixed(5) : '-12.97370'}</span></span>
        <span className="text-zinc-700">|</span>
        <span>LNG: <span id="map-lng" className="text-zinc-200 font-bold">{position?.lng ? position.lng.toFixed(5) : entrega?.lng ? Number(entrega.lng).toFixed(5) : '-38.50900'}</span></span>
      </div>

      {/* Attribution overlay */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-black/80 px-2 py-0.5 rounded text-[8px] text-zinc-500 font-mono border border-zinc-900 pointer-events-none">
        OpenStreetMap • Leaflet.js
      </div>
    </div>
  );
}
