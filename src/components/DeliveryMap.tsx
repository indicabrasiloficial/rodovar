import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Entrega } from '../types';

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
    case 'entregue':
      return '#10B981'; // Green
    default:
      return '#6B7280'; // Gray
  }
};

export default function DeliveryMap({ entregas, selectedId, onSelectDelivery, singleView = false }: DeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // 1. Create Leaflet Map Instance ONCE
    if (!mapInstanceRef.current) {
      let initialCenter: [number, number] = [-14.2350, -51.9253]; // Central Brazil
      let initialZoom = 4;

      const mapDeliveries = singleView 
        ? entregas 
        : entregas.filter(e => e.status !== 'entregue');

      if (singleView && mapDeliveries.length === 1) {
        initialCenter = [mapDeliveries[0].lat, mapDeliveries[0].lng];
        initialZoom = 8;
      } else if (selectedId) {
        const selected = mapDeliveries.find(e => e.id === selectedId);
        if (selected) {
          initialCenter = [selected.lat, selected.lng];
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

    // 2. Filter out delivered loads unless it's a single shipment detail view map
    const mapDeliveries = singleView 
      ? entregas 
      : entregas.filter(e => e.status !== 'entregue');

    // 3. Clear existing markers safely
    markersRef.current.forEach(marker => {
      marker.remove();
    });
    markersRef.current = [];

    // 4. Render Markers
    const activeMarkers: L.Marker[] = [];
    const coordinatesSeen = new Set<string>();
    
    mapDeliveries.forEach(entrega => {
      if (!entrega.lat || !entrega.lng) return;

      let lat = Number(entrega.lat);
      let lng = Number(entrega.lng);
      
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
      let markerHtml = '';
      if (val >= 100000) {
        // High risk cargo (R$ 100k+)
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
        // Standard cargo
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

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-leaflet-marker',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

      // Simple WhatsApp links
      const telMot = entrega.tel_motorista.replace(/\D/g, '');
      const whatsMsg = `Olá ${entrega.motorista}! Tudo bem? Sou o Jairo da Rodovar. Me envia o link de localização dessa viagem para ${entrega.destino}?`;
      const waUrl = `https://wa.me/55${telMot}?text=${encodeURIComponent(whatsMsg)}`;

      // Create Popup
      const statusLabels: Record<string, string> = {
        coletando: 'Coletando 📦',
        em_transito: 'Trânsito 🚚',
        parado: 'Parado 🛑',
        entregue: 'Entregue ✅'
      };

      const popupContent = `
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

      marker.bindPopup(popupContent, {
        closeButton: false,
        className: 'dark-map-popup'
      });

      // Handle popup select button listener
      marker.on('popupopen', () => {
        const btn = document.getElementById(`btn-map-select-${entrega.id}`);
        if (btn && onSelectDelivery) {
          btn.onclick = () => {
            onSelectDelivery(entrega.id);
            map.closePopup();
          };
        }
      });

      if (isSelected && !singleView) {
        marker.openPopup();
      }

      activeMarkers.push(marker);
    });

    markersRef.current = activeMarkers;

    // 5. Instantly pan or zoom smoothly to selected elements
    if (singleView && mapDeliveries.length === 1) {
      map.setView([mapDeliveries[0].lat, mapDeliveries[0].lng], 8);
    } else if (selectedId) {
      const selected = mapDeliveries.find(e => e.id === selectedId);
      if (selected) {
        map.setView([selected.lat, selected.lng], 6);
      }
    } else if (activeMarkers.length > 1) {
      const group = L.featureGroup(activeMarkers);
      if (group.getBounds().isValid()) {
        map.fitBounds(group.getBounds().pad(0.15));
      }
    }

  }, [entregas, selectedId, singleView]);

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
      <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-[10px] text-gray-400 font-mono border border-zinc-800 z-[1000] pointer-events-none">
        OpenStreetMap • Leaflet.js
      </div>
    </div>
  );
}
