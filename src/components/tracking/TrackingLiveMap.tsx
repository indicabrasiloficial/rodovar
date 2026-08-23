import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Entrega } from '../../types';
import { MapPin, Navigation, RefreshCw, Crosshair, Sparkles } from 'lucide-react';
import { CargoTrackingResult } from '../../hooks/useCargoTracking';

interface TrackingLiveMapProps {
  carga: Entrega;
  trackingResult: CargoTrackingResult;
}

export const TrackingLiveMap: React.FC<TrackingLiveMapProps> = ({ carga, trackingResult }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const truckMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isCentering, setIsCentering] = useState(false);

  const { position, isLive, connectionStatus, source } = trackingResult;

  // Approximate default coordinates if origin/destination need plotting
  const originCoords: [number, number] = [
    Number(carga.lat) || -8.1189, // Default Vitória de Santo Antão approx or saved lat
    Number(carga.lng) || -35.2928
  ];

  // If vehicle has position, use it; otherwise fallback to origin
  const currentPos: [number, number] = position && position.lat && position.lng
    ? [position.lat, position.lng]
    : originCoords;

  // Determine status color
  const getStatusColor = (status: string) => {
    switch ((status || '').toLowerCase()) {
      case 'em_transito': return '#FFD700';
      case 'parado': return '#EF4444';
      case 'coletando': return '#3B82F6';
      case 'descarregando': return '#A855F7';
      case 'entregue': return '#10B981';
      default: return '#FFD700';
    }
  };

  const statusColor = getStatusColor(carga.status);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
        dragging: true,
        touchZoom: true
      }).setView(currentPos, 11);

      // Dark theme OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        minZoom: 3
      }).addTo(map);

      // Add Zoom Control at bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = map;
      setIsMapReady(true);

      // Invalidate size after mounting for pristine rendering
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setIsMapReady(false);
      }
    };
  }, []);

  // Update Markers & Truck Position smoothly
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady) return;
    const map = mapInstanceRef.current;

    // 1. Truck Custom Icon
    const truckIconHtml = `
      <div class="relative flex items-center justify-center">
        <span class="absolute inline-flex h-9 w-9 rounded-full opacity-60 animate-ping" style="background-color: ${statusColor}"></span>
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-[0_0_15px_rgba(255,215,0,0.6)] text-black font-extrabold text-sm" style="background-color: ${statusColor}">
          <span style="transform: scaleX(-1); display: inline-block;">🚛</span>
        </div>
        <span class="absolute -bottom-5 bg-zinc-950/90 text-white font-mono font-bold text-[9px] px-1.5 py-0.5 rounded border border-zinc-800 shadow uppercase tracking-wider whitespace-nowrap">
          ${carga.status === 'entregue' ? 'Entregue' : isLive ? 'Ao Vivo' : 'Localização'}
        </span>
      </div>
    `;

    const truckIcon = L.divIcon({
      html: truckIconHtml,
      className: 'truck-live-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    if (truckMarkerRef.current) {
      truckMarkerRef.current.setLatLng(currentPos);
      truckMarkerRef.current.setIcon(truckIcon);
    } else {
      const marker = L.marker(currentPos, { icon: truckIcon }).addTo(map);
      truckMarkerRef.current = marker;
    }

    // Popup content for the truck
    const popupContent = `
      <div class="bg-zinc-950 text-white p-2.5 rounded-xl border border-[#FFD700]/30 font-sans text-xs min-w-[170px]">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="font-mono font-bold text-[#FFD700] text-[11px]">${carga.trackingCode || 'RODOVAR'}</span>
          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase" style="background-color: ${statusColor}25; color: ${statusColor}">
            ${carga.status.toUpperCase()}
          </span>
        </div>
        <p class="text-zinc-300 text-[11px] mb-1 font-semibold">${carga.origem} ➔ ${carga.destino}</p>
        <p class="text-[10px] text-zinc-500 font-mono">
          ${isLive ? '🟢 Transmissão GPS em tempo real' : source === 'whatsapp' ? '📍 Localização informada' : '📡 Última posição registrada'}
        </p>
      </div>
    `;

    truckMarkerRef.current.bindPopup(popupContent, {
      className: 'dark-map-popup',
      closeButton: false
    });

  }, [currentPos, carga.status, statusColor, isLive, source, isMapReady, carga.origem, carga.destino, carga.trackingCode]);

  // Center on Vehicle action
  const handleCenterOnVehicle = () => {
    if (!mapInstanceRef.current) return;
    setIsCentering(true);
    mapInstanceRef.current.flyTo(currentPos, 13, {
      duration: 1.2
    });
    setTimeout(() => {
      setIsCentering(false);
      if (truckMarkerRef.current) {
        truckMarkerRef.current.openPopup();
      }
    }, 1300);
  };

  return (
    <div className="w-full bg-zinc-950/80 border border-zinc-900 rounded-2xl overflow-hidden shadow-2xl relative" id="tracking-live-map-card">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20">
            <Navigation className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#FFD700] font-bold block leading-none">
              MAPA DE ACOMPANHAMENTO AO VIVO
            </span>
            <span className="text-xs text-zinc-400 font-medium">
              {isLive ? 'Sinal GPS ativo em tempo real' : 'Posicionamento operacional do veículo'}
            </span>
          </div>
        </div>

        {/* Live / Status Pill */}
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 bg-emerald-950/80 border border-emerald-600/50 text-emerald-400 text-[10px] font-mono font-black uppercase px-2.5 py-1 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              GPS AO VIVO
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFD700]"></span>
              MONITORADO
            </span>
          )}

          {/* Quick Center Button */}
          <button
            type="button"
            onClick={handleCenterOnVehicle}
            disabled={isCentering}
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-[#FFD700]/40 text-zinc-300 hover:text-[#FFD700] rounded-lg transition-all cursor-pointer shadow-sm active:scale-95"
            title="Centralizar no Caminhão"
          >
            <Crosshair className={`w-4 h-4 ${isCentering ? 'animate-spin text-[#FFD700]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative w-full h-[260px] sm:h-[320px] dark-map">
        <div ref={mapContainerRef} className="w-full h-full" />
        
        {/* Subtle Map Watermark / Overlay */}
        <div className="absolute bottom-2 left-2 pointer-events-none z-[1000] bg-black/70 backdrop-blur-sm border border-zinc-800 px-2 py-0.5 rounded text-[9px] font-mono text-zinc-400">
          Rodovar Telemetria • Atualização Contínua
        </div>
      </div>
    </div>
  );
};
