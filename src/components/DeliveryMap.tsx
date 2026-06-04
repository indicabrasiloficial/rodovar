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

      const customIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center">
            <span class="absolute inline-flex h-6 w-6 rounded-full opacity-40 animate-ping" style="background-color: ${color}"></span>
            <div class="relative flex items-center justify-center p-2 rounded-full border-2 ${isSelected ? 'border-white scale-125' : 'border-black'} shadow-lg text-black font-extrabold text-[10px]" style="background-color: ${color}; width: 22px; height: 22px;">
              🚚
            </div>
            ${isSelected ? '<div class="absolute -top-1 right-2 w-2 h-2 bg-white rounded-full"></div>' : ''}
          </div>
        `,
        className: 'custom-leaflet-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
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
        <div class="text-xs font-sans text-gray-200 bg-[#121212] p-2 rounded border border-[#FFD600]/40" style="min-width: 180px;">
          <h4 class="font-bold text-[#FFD600] text-sm mb-1">${entrega.destino}</h4>
          <p class="mb-1"><strong>Motorista:</strong> ${entrega.motorista}</p>
          <p class="mb-1"><strong>Status:</strong> <span class="px-1.5 py-0.5 rounded text-[10px]" style="background-color: ${color}20; color: ${color}; font-weight: 600;">${statusLabels[entrega.status]}</span></p>
          <p class="mb-2"><strong>Prazo:</strong> ${entrega.prazo}</p>
          <div class="mt-2 flex flex-col gap-1">
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
