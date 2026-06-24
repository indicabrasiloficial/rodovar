import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Entrega } from '../types';
import { generateTrackerLink } from '../utils/generateTrackerLink';
import { useAllDriversTracking } from '../hooks/useAllDriversTracking';
import { createTruckIcon, getDriverPopupContent } from './MapDriverMarker';

interface DeliveryMapProps {
  entregas: Entrega[];
  selectedId?: string;
  onSelectDelivery?: (id: string) => void;
  singleView?: boolean; // If true, zoom in tightly to the only delivery location
}

// Colors maps according to status
const getStatusColor = (status: string) => {
  switch (status) {
    case 'em_transito':
      return '#FFD600'; // Yellow
    case 'parado':
      return '#EF4444'; // Red
    case 'coletando':
      return '#3B82F6'; // Blue
    case 'descarregando':
      return '#A855F7'; // Purple
    case 'entregue':
      return '#10B981'; // Green
    default:
      return '#6B7280'; // Gray
  }
};

export default function DeliveryMap({ entregas, selectedId, onSelectDelivery, singleView = false }: DeliveryMapProps) {
  const getActiveUserName = (): string => {
    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        const parsed = JSON.parse(active);
        if (parsed && parsed.displayName) {
          return parsed.displayName.split(' ')[0];
        }
      } catch {
        // Ignored
      }
    }
    return 'Jairo';
  };

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map());

  // Map Filter toggles (enabled/activated on the map dynamically)
  const [filterTransito, setFilterTransito] = useState(true);
  const [filterParado, setFilterParado] = useState(true); // "Bloqueadas" represented by "parado"
  const [filterColetando, setFilterColetando] = useState(true);
  const [filterEntregue, setFilterEntregue] = useState(false);

  // Consume live tracking positions using ONE single listener in real-time
  const liveTrackingData = useAllDriversTracking();

  // Compute active map deliveries based on filters
  const getFilteredDeliveries = () => {
    return entregas.filter(e => {
      if (singleView) return true; // Always show single view item details regardless of filters
      if (e.status === 'em_transito') return filterTransito;
      if (e.status === 'parado') return filterParado;
      if (e.status === 'coletando') return filterColetando;
      if (e.status === 'entregue') return filterEntregue;
      return true;
    });
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const mapDeliveries = getFilteredDeliveries();

    // 1. Create Leaflet Map Instance ONCE
    if (!mapInstanceRef.current) {
      let initialCenter: [number, number] = [-14.2350, -51.9253]; // Central Brazil
      let initialZoom = 4;

      // Reset markers cache when creating a brand new map instance to prevent stale detached markers
      markersMapRef.current.clear();

      if (singleView && mapDeliveries.length === 1) {
        const item = mapDeliveries[0];
        const latVal = (item.localizacaoAtual && item.localizacaoAtual.lat) ? Number(item.localizacaoAtual.lat) : Number(item.lat);
        const lngVal = (item.localizacaoAtual && item.localizacaoAtual.lng) ? Number(item.localizacaoAtual.lng) : Number(item.lng);
        initialCenter = [latVal, lngVal];
        initialZoom = 8;
      } else if (selectedId) {
        const selected = mapDeliveries.find(e => e.id === selectedId);
        if (selected) {
          const latVal = (selected.localizacaoAtual && selected.localizacaoAtual.lat) ? Number(selected.localizacaoAtual.lat) : Number(selected.lat);
          const lngVal = (selected.localizacaoAtual && selected.localizacaoAtual.lng) ? Number(selected.localizacaoAtual.lng) : Number(selected.lng);
          initialCenter = [latVal, lngVal];
          initialZoom = 6;
        }
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false
      }).setView(initialCenter, initialZoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(map);

      mapInstanceRef.current = map;

      // Fix render layout issues
      setTimeout(() => {
        map.invalidateSize();
      }, 150);
    }

    const map = mapInstanceRef.current;

    // 2. Render Markers with database economy & smooth setLatLng movement
    const activeKeys = new Set<string>();
    const activeMarkersList: L.Marker[] = [];
    const coordinatesSeen = new Set<string>();
    
    mapDeliveries.forEach(entrega => {
      let lat = Number(entrega.lat);
      let lng = Number(entrega.lng);
      let gpsAccuracy = 0;
      let lastGpsTimestamp = '';

      // Find if this specific delivery has an active live tracking session
      const liveData = liveTrackingData.find(track => track.cargoId === entrega.id);
      const isLiveGps = !!liveData;

      if (isLiveGps && liveData) {
        lat = Number(liveData.lat);
        lng = Number(liveData.lng);
        gpsAccuracy = Number(liveData.accuracy || 0);
        lastGpsTimestamp = liveData.timestamp || '';
      } else if (entrega.localizacaoAtual && entrega.localizacaoAtual.lat && entrega.localizacaoAtual.lng) {
        lat = Number(entrega.localizacaoAtual.lat);
        lng = Number(entrega.localizacaoAtual.lng);
      }

      if (!lat || !lng) return;
      
      // Slightly jitter close coordinates to prevent visual overlaps on map
      const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (coordinatesSeen.has(coordKey)) {
        const index = coordinatesSeen.size;
        const angle = index * 0.75;
        const radius = 0.012 + (index * 0.003);
        lat += Math.cos(angle) * radius;
        lng += Math.sin(angle) * radius;
      }
      coordinatesSeen.add(`${lat.toFixed(4)},${lng.toFixed(4)}`);

      const color = getStatusColor(entrega.status);
      const isSelected = entrega.id === selectedId;
      const val = entrega.valor_carga || 0;

      let customIcon: L.DivIcon;
      let popupContent = '';

      // Build specific Premium Icon and popup details based on GPS Status
      if (isLiveGps && liveData) {
        customIcon = createTruckIcon(liveData.liveStatus);
        popupContent = getDriverPopupContent(
          liveData.driver,
          liveData.route,
          liveData.client,
          liveData.liveStatus,
          liveData.ts
        );
      } else {
        // Fallback: Standard or GR High Risk Marker styling
        let markerHtml = '';
        if (val >= 100000) {
          const ringBg = val >= 1000000 ? 'bg-rose-500' : val >= 500000 ? 'bg-amber-500' : 'bg-indigo-500';
          const borderCol = val >= 1000000 ? 'border-rose-400' : val >= 500000 ? 'border-amber-400' : 'border-indigo-400';
          const ringStyle = val >= 1000000 ? 'rgba(244, 63, 94, 0.7)' : val >= 500000 ? 'rgba(245, 158, 11, 0.7)' : 'rgba(99, 102, 241, 0.7)';
          const symbol = val >= 1000000 ? '🚨' : val >= 500000 ? '🔥' : '💎';
          
          markerHtml = `
            <div class="relative flex items-center justify-center">
              <span class="absolute inline-flex h-8 w-8 rounded-full opacity-60 animate-ping ${ringBg}"></span>
              <div class="relative flex items-center justify-center rounded-full border-2 ${borderCol} shadow-2xl text-center font-extrabold text-[12px] bg-zinc-950 flex items-center justify-center ${isSelected ? 'scale-125' : ''}" style="width: 25px; height: 25px; box-shadow: 0 0 12px ${ringStyle};">
                <span>${symbol}</span>
              </div>
              <span class="absolute -top-1.5 -right-1.5 bg-red-600 font-mono font-black text-[7px] text-white w-3.5 h-3.5 rounded-full flex items-center justify-center shadow-lg border border-zinc-900">
                GR
              </span>
            </div>
          `;
        } else {
          markerHtml = `
            <div class="relative flex items-center justify-center">
              <span class="absolute inline-flex h-6 w-6 rounded-full opacity-40 animate-ping" style="background-color: ${color}"></span>
              <div class="relative flex items-center justify-center p-2 rounded-full border-2 ${isSelected ? 'border-white scale-125' : 'border-black'} shadow-lg text-black font-extrabold text-[10px]" style="background-color: ${color}; width: 22px; height: 22px;">
                🚚
              </div>
              ${isSelected ? '<div class="absolute -top-1 right-2 w-2 h-2 bg-white rounded-full"></div>' : ''}
            </div>
          `;
        }

        customIcon = L.divIcon({
          html: markerHtml,
          className: 'custom-leaflet-marker',
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        const telMot = entrega.tel_motorista.replace(/\D/g, '');
        const trackingLink = generateTrackerLink({
          cargoId: entrega.id,
          driver: entrega.motorista,
          route: `${entrega.origem} -> ${entrega.destino}`,
          client: entrega.cliente || 'Central'
        });
        const whatsMsg = `Olá, ${entrega.motorista}! Por favor, acesse o link abaixo para ativar o rastreamento GPS de sua viagem em tempo real: ${trackingLink}`;
        const waUrl = `https://wa.me/55${telMot}?text=${encodeURIComponent(whatsMsg)}`;

        const statusLabels: Record<string, string> = {
          coletando: 'Coletando 📦',
          em_transito: 'Trânsito 🚚',
          parado: 'Parado 🛑',
          descarregando: 'Descarregando 🏢',
          entregue: 'Entregue ✅'
        };

        popupContent = `
          <div class="text-xs font-sans text-gray-200 bg-[#121212] p-2.5 rounded border border-[#FFD600]/40" style="min-width: 190px;">
            <h4 class="font-bold text-[#FFD600] text-sm mb-1 uppercase tracking-tight">${entrega.destino}</h4>
            <p class="mb-1 text-[11px]"><strong>Motorista:</strong> ${entrega.motorista}</p>
            <p class="mb-1 text-[11px]"><strong>Origem:</strong> ${entrega.origem || 'Não informada'}</p>
            <p class="mb-1 text-[11px]"><strong>Destino:</strong> ${entrega.destino || 'Não informado'}</p>
            <p class="mb-1 text-[11px]"><strong>Valor do Frete:</strong> R$ ${Number(entrega.frete_empresa || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p class="mb-1 text-[11px]"><strong>Status:</strong> <span class="px-1.5 py-0.5 rounded text-[10px]" style="background-color: ${color}20; color: ${color}; font-weight: 600;">${statusLabels[entrega.status]}</span></p>
            <p class="mb-1 text-[11px]"><strong>Prazo:</strong> ${entrega.prazo}</p>
            ${val ? `
              <div class="my-1.5 border-t border-zinc-905 pt-1.5 text-[11px]">
                <span class="text-zinc-500 font-mono text-[9px] uppercase tracking-wider block">VALOR DA CARGA:</span>
                <span class="font-mono font-bold text-white uppercase tracking-tight block">R$ ${Math.round(val).toLocaleString('pt-BR')}</span>
                ${val >= 100000 ? `
                  <span class="bg-red-950/80 border border-red-500/30 text-red-400 font-mono text-[8px] font-black tracking-wide px-1 rounded block mt-1 text-center py-0.5 animate-pulse">
                    ⚠️ ALTO RISCO / GR
                  </span>
                ` : ''}
              </div>
            ` : ''}
            <div class="mt-2.5 flex flex-col gap-1">
              <a href="${waUrl}" target="_blank" class="block text-center py-1 bg-green-600 hover:bg-green-700 text-white font-semibold rounded text-[10px] no-underline">
                💬 WhatsApp Motorista
              </a>
              ${entrega.id && onSelectDelivery ? `
                <button id="btn-map-select-${entrega.id}" class="w-full text-center py-1 mt-1 bg-zinc-800 hover:bg-[#FFD600] hover:text-black text-gray-300 font-semibold rounded text-[10px] border border-zinc-700 transition">
                  🔍 Ver Carga
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }

      // Smooth Position updates without flickering or tearing
      const markerKey = entrega.id;
      activeKeys.add(markerKey);

      let existingMarker = markersMapRef.current.get(markerKey);
      if (existingMarker) {
        existingMarker.setLatLng([lat, lng]);
        existingMarker.setIcon(customIcon);
        existingMarker.setPopupContent(popupContent);
        // Ensure marker is present on the active map instance
        if (!map.hasLayer(existingMarker)) {
          existingMarker.addTo(map);
        }
        activeMarkersList.push(existingMarker);
      } else {
        const newMarker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
        newMarker.bindPopup(popupContent, {
          closeButton: false,
          className: 'dark-map-popup'
        });

        // Setup custom event handler on popup opens
        newMarker.on('popupopen', () => {
          const btn = document.getElementById(`btn-map-select-${entrega.id}`);
          if (btn && onSelectDelivery) {
            btn.onclick = () => {
              onSelectDelivery(entrega.id);
              map.closePopup();
            };
          }
        });

        markersMapRef.current.set(markerKey, newMarker);
        activeMarkersList.push(newMarker);
      }

      const activeMarker = markersMapRef.current.get(markerKey);
      if (activeMarker && isSelected && !singleView) {
        activeMarker.openPopup();
      }
    });

    // Cleanup and remove stale markers that are no longer filtered/active
    markersMapRef.current.forEach((marker, key) => {
      if (!activeKeys.has(key)) {
        marker.remove();
        markersMapRef.current.delete(key);
      }
    });

    markersRef.current = activeMarkersList;

    // 5. Instantly pan or zoom smoothly to selected elements
    if (singleView && mapDeliveries.length === 1) {
      const item = mapDeliveries[0];
      const liveData = liveTrackingData.find(track => track.cargoId === item.id);
      const latVal = liveData ? liveData.lat : (item.localizacaoAtual && item.localizacaoAtual.lat) ? Number(item.localizacaoAtual.lat) : Number(item.lat);
      const lngVal = liveData ? liveData.lng : (item.localizacaoAtual && item.localizacaoAtual.lng) ? Number(item.localizacaoAtual.lng) : Number(item.lng);
      const currentZoom = map.getZoom() || 8;
      map.setView([latVal, lngVal], currentZoom);
    } else if (selectedId) {
      const selected = mapDeliveries.find(e => e.id === selectedId);
      if (selected) {
        const liveData = liveTrackingData.find(track => track.cargoId === selected.id);
        const latVal = liveData ? liveData.lat : (selected.localizacaoAtual && selected.localizacaoAtual.lat) ? Number(selected.localizacaoAtual.lat) : Number(selected.lat);
        const lngVal = liveData ? liveData.lng : (selected.localizacaoAtual && selected.localizacaoAtual.lng) ? Number(selected.localizacaoAtual.lng) : Number(selected.lng);
        const currentZoom = map.getZoom() || 6;
        map.setView([latVal, lngVal], currentZoom);
      }
    } else if (activeMarkersList.length > 1) {
      const group = L.featureGroup(activeMarkersList);
      if (group.getBounds().isValid()) {
        map.fitBounds(group.getBounds().pad(0.15));
      }
    }

  }, [entregas, selectedId, singleView, filterTransito, filterParado, filterColetando, filterEntregue, liveTrackingData]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-zinc-800 dark-map">
      <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: '300px' }} />
      
      {/* Dynamic interactive map filter bar overlay */}
      {!singleView && (
        <div className="absolute top-2.5 left-2.5 z-[1000] bg-black/90 backdrop-blur-md border border-zinc-850 p-2 text-left rounded-xl shadow-2xl flex flex-col gap-1.5 max-w-[calc(100%-20px)] sm:w-64">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-1 px-1">
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FFD600]">ATIVAR NO MAPA</span>
            <span className="text-[8px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.2 rounded uppercase">Painel Mapas</span>
          </div>
          
          <div className="grid grid-cols-2 gap-1 mt-1">
            {/* Trânsito */}
            <button
              type="button"
              onClick={() => setFilterTransito(!filterTransito)}
              className={`px-1.5 py-1 rounded text-[10px] font-mono font-bold transition flex items-center gap-1 cursor-pointer border text-left ${
                filterTransito 
                  ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 shadow-[0_0_8px_rgba(255,214,0,0.05)]' 
                  : 'bg-zinc-950/40 text-zinc-650 border-transparent hover:text-zinc-500'
              }`}
              title="Ativar/desativar veículos em trânsito"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${filterTransito ? 'bg-yellow-400 animate-pulse' : 'bg-zinc-700'}`}></span>
              <span className="truncate">Trânsito ({entregas.filter(e => e.status === 'em_transito').length})</span>
            </button>

            {/* Parado / Bloqueadas */}
            <button
              type="button"
              onClick={() => setFilterParado(!filterParado)}
              className={`px-1.5 py-1 rounded text-[10px] font-mono font-bold transition flex items-center gap-1 cursor-pointer border text-left ${
                filterParado 
                  ? 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.05)]' 
                  : 'bg-zinc-950/40 text-zinc-650 border-transparent hover:text-zinc-500'
              }`}
              title="Ativar/desativar veículos bloqueados ou parados"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${filterParado ? 'bg-red-500 animate-pulse' : 'bg-zinc-700'}`}></span>
              <span className="truncate">Bloqueadas ({entregas.filter(e => e.status === 'parado').length})</span>
            </button>

            {/* Coletando */}
            <button
              type="button"
              onClick={() => setFilterColetando(!filterColetando)}
              className={`px-1.5 py-1 rounded text-[10px] font-mono font-bold transition flex items-center gap-1 cursor-pointer border text-left ${
                filterColetando 
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_8px_rgba(59,130,246,0.05)]' 
                  : 'bg-zinc-950/40 text-zinc-650 border-transparent hover:text-zinc-500'
              }`}
              title="Ativar/desativar veículos coletando"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${filterColetando ? 'bg-blue-400 animate-pulse' : 'bg-zinc-700'}`}></span>
              <span className="truncate">Coleta ({entregas.filter(e => e.status === 'coletando').length})</span>
            </button>

            {/* Entregue */}
            <button
              type="button"
              onClick={() => setFilterEntregue(!filterEntregue)}
              className={`px-1.5 py-1 rounded text-[10px] font-mono font-bold transition flex items-center gap-1 cursor-pointer border text-left ${
                filterEntregue 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.05)]' 
                  : 'bg-zinc-950/40 text-zinc-650 border-transparent hover:text-zinc-500'
              }`}
              title="Ativar/desativar veículos já entregues"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${filterEntregue ? 'bg-emerald-400' : 'bg-zinc-700'}`}></span>
              <span className="truncate">Entregue ({entregas.filter(e => e.status === 'entregue').length})</span>
            </button>
          </div>
        </div>
      )}

      <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-[10px] text-gray-400 font-mono border border-zinc-800 z-[1000] pointer-events-none">
        OpenStreetMap • Leaflet.js
      </div>
    </div>
  );
}
