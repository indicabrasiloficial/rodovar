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

    // Filter out delivered loads unless it's a single shipment detail view map
    const mapDeliveries = singleView 
      ? entregas 
      : entregas.filter(e => e.status !== 'entregue');

    // Clear previous map if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Set initial center in Brazil (or selected delivery)
    let center: [number, number] = [-14.2350, -51.9253]; // Central Brazil
    let zoom = 4;

    if (singleView && mapDeliveries.length === 1) {
      center = [mapDeliveries[0].lat, mapDeliveries[0].lng];
      zoom = 8;
    } else if (selectedId) {
      const selected = mapDeliveries.find(e => e.id === selectedId);
      if (selected) {
        center = [selected.lat, selected.lng];
        zoom = 6;
      }
    }

    // Create map instance
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false
    }).setView(center, zoom);

    mapInstanceRef.current = map;

    // Add beautiful dark tiles (OpenStreetMap styled via index.css rule)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(map);

    // Render Markers
    markersRef.current = [];
    
    mapDeliveries.forEach(entrega => {
      if (!entrega.lat || !entrega.lng) return;

      const color = getStatusColor(entrega.status);
      const isSelected = entrega.id === selectedId;

      // Custom HTML Marker using Tailwind styles
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

      const marker = L.marker([entrega.lat, entrega.lng], { icon: customIcon }).addTo(map);

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

      markersRef.current.push(marker);
    });

    // Fit map bounds to show all markers if not singleView
    if (!singleView && mapDeliveries.length > 1) {
      const group = L.featureGroup(markersRef.current);
      if (group.getBounds().isValid()) {
        map.fitBounds(group.getBounds().pad(0.15));
      }
    }

    // Leaflet styles reset fix for map containers
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [entregas, selectedId, singleView]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-zinc-800 dark-map">
      <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: '300px' }} />
      <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-[10px] text-gray-400 font-mono border border-zinc-800 z-[1000] pointer-events-none">
        OpenStreetMap • Leaflet.js
      </div>
    </div>
  );
}
