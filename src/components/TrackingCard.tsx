import React, { useState, useEffect } from 'react';
import { Entrega } from '../types';
import { TrackingProgressBar } from './TrackingProgressBar';
import { TrackingLiveMap } from './tracking/TrackingLiveMap';
import { TrackingETA } from './tracking/TrackingETA';
import { DeliveryCompletionSection } from './tracking/DeliveryCompletionSection';
import { Calendar, MapPin, Milestone, Sparkles, Navigation, ShieldCheck } from 'lucide-react';
import { useCargoTracking } from '../hooks/useCargoTracking';
import { playEntregueAudio } from '../utils/audioNotification';

interface TrackingCardProps {
  carga: Entrega;
}

export const TrackingCard: React.FC<TrackingCardProps> = ({ carga }) => {
  const trackingResult = useCargoTracking(carga);
  const { position, source, isLive, lastSeenSeconds, connectionStatus } = trackingResult;
  
  const [resolvedAddress, setResolvedAddress] = useState<string>('');

  // Reproduz áudio de confirmação ao atingir o status entregue
  useEffect(() => {
    if (!carga) return;
    const currentStatus = (carga.status || '').toLowerCase().trim();
    if (currentStatus === 'entregue' || currentStatus.includes('entregue') || currentStatus.includes('concluid')) {
      playEntregueAudio(carga.trackingCode || carga.id);
    }
  }, [carga?.status, carga?.trackingCode, carga?.id]);

  // Reverse geocoding for precise live city street address
  useEffect(() => {
    if (!position || !position.lat || !position.lng) {
      setResolvedAddress('');
      return;
    }

    let isMounted = true;
    const fetchAddress = async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${position.lat}&lon=${position.lng}`;
        const res = await fetch(url, {
          headers: {
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'User-Agent': `RodovarMonitoraClient/${carga.trackingCode}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data && data.display_name) {
            setResolvedAddress(data.display_name);
          }
        }
      } catch (err) {
        console.error('Error fetching address via Nominatim:', err);
      }
    };

    fetchAddress();

    return () => {
      isMounted = false;
    };
  }, [position?.lat, position?.lng, carga.trackingCode]);

  const formatStatus = (status: string) => {
    switch (status) {
      case 'coletando': return 'Coletando';
      case 'em_transito': return 'Em Trânsito';
      case 'parado': return 'Parado';
      case 'descarregando': return 'Descarregando';
      case 'entregue': return 'Entregue';
      default: return status;
    }
  };

  const getLiveIndicator = () => {
    if (source === 'none') {
      return {
        text: 'MONITORADO',
        color: 'bg-zinc-900 border-zinc-800 text-zinc-400',
        dotClass: 'bg-[#FFD700]'
      };
    }

    if (source === 'whatsapp') {
      return {
        text: 'LOCALIZAÇÃO INFORMADA',
        color: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        dotClass: 'bg-amber-400'
      };
    }

    if (connectionStatus === 'live') {
      return {
        text: 'SINAL GPS AO VIVO',
        color: 'bg-emerald-950/80 border-emerald-600/50 text-emerald-400 animate-pulse',
        dotClass: 'bg-emerald-400 animate-ping'
      };
    } else if (connectionStatus === 'weak') {
      return {
        text: 'SINAL EM ATUALIZAÇÃO',
        color: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        dotClass: 'bg-amber-400 animate-pulse'
      };
    } else {
      const min = lastSeenSeconds ? Math.floor(lastSeenSeconds / 60) : 0;
      return {
        text: `ÚLTIMA POSIÇÃO ${min > 0 ? `(${min}m)` : ''}`,
        color: 'bg-zinc-900 border-zinc-800 text-zinc-400',
        dotClass: 'bg-zinc-500'
      };
    }
  };

  const indicator = getLiveIndicator();

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Não definida';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const isDelivered = (carga.status || '').toLowerCase().trim() === 'entregue';

  return (
    <div 
      className="w-full bg-[#121212]/95 border border-[#FFD700]/30 rounded-3xl p-4 sm:p-7 shadow-[0_0_35px_rgba(255,215,0,0.08)] relative overflow-hidden transition-all duration-300 space-y-6"
      id="public-tracking-card-root"
    >
      {/* Background Ambience */}
      <div className="absolute -top-16 -left-16 w-44 h-44 bg-[#FFD700]/5 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute -bottom-16 -right-16 w-44 h-44 bg-zinc-500/5 blur-3xl rounded-full pointer-events-none" />
      
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4" id="tracking-card-header">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-widest text-[#FFD700] block font-bold mb-0.5">
            RODOVAR RASTREIO CLIENTE
          </span>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl sm:text-3xl font-black font-sans text-white tracking-tight">
              {carga.trackingCode || carga.id}
            </h2>
            <div 
              className={`flex items-center gap-1.5 border px-2.5 py-1 rounded-full text-[10px] font-bold font-mono shadow-sm ${indicator.color}`}
              id="live-indicator-pill"
            >
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${indicator.dotClass}`} />
              <span className="uppercase tracking-wider font-black">{indicator.text}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 1. Stepper Visual de 5 Etapas (Strictly Maintained) */}
      <div className="bg-zinc-950/70 rounded-2xl p-3 sm:p-5 border border-zinc-900" id="progress-bar-wrapper">
        <TrackingProgressBar status={carga.status} />
      </div>

      {/* 2. Mapa ao Vivo (Live Map) */}
      <div id="tracking-live-map-wrapper">
        <TrackingLiveMap carga={carga} trackingResult={trackingResult} />
      </div>

      {/* 3. Previsão Dinâmica de Chegada (ETA) */}
      <div id="tracking-eta-wrapper">
        <TrackingETA carga={carga} />
      </div>

      {/* 4. Percurso Autorizado */}
      <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-4 sm:p-5" id="route-display-section">
        <span className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-wider block mb-3">
          PERCURSO AUTORIZADO
        </span>
        
        <div className="flex items-center justify-between gap-3 flex-wrap" id="origin-destination-grid">
          <div className="flex items-center gap-3" id="tracking-city-origin">
            <div className="bg-zinc-900/90 border border-zinc-800 p-2.5 rounded-xl text-zinc-400 flex items-center justify-center shadow-inner">
              <MapPin className="w-5 h-5 text-[#FFD700]" />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 font-mono block">Cidade de Origem</span>
              <span className="font-black text-zinc-100 text-sm sm:text-base">{carga.origem}</span>
            </div>
          </div>

          <div className="flex-1 min-w-[20px] h-[1px] border-b border-dashed border-zinc-700/60 mx-4 hidden sm:block" id="dash-connector" />

          <div className="flex items-center gap-3 sm:text-right sm:flex-row-reverse" id="tracking-city-destination">
            <div className="bg-zinc-900/90 border border-zinc-800 p-2.5 rounded-xl text-zinc-400 flex items-center justify-center shadow-inner">
              <MapPin className="w-5 h-5 text-[#FFD700]" />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 font-mono block">Cidade de Destino</span>
              <span className="font-black text-zinc-100 text-sm sm:text-base">{carga.destino}</span>
            </div>
          </div>
        </div>

        {resolvedAddress && (
          <div className="mt-3 pt-3 border-t border-zinc-900/80 flex items-center gap-2 text-xs text-zinc-400">
            <Navigation className="w-3.5 h-3.5 text-[#FFD700] shrink-0" />
            <span className="truncate">Última aproximação viária: <strong className="text-zinc-300 font-medium">{resolvedAddress}</strong></span>
          </div>
        )}
      </div>

      {/* Informações Complementares da Carga */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4" id="tracking-card-fields-grid">
        <div className="bg-zinc-950/40 border border-zinc-900 p-3.5 rounded-xl" id="field-status">
          <span className="text-[10px] uppercase text-zinc-500 font-mono font-bold block mb-1">Status Operacional</span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${carga.status === 'entregue' ? 'bg-emerald-400 animate-pulse' : 'bg-[#FFD700]'}`} />
            <span className="text-sm font-black text-white">{formatStatus(carga.status)}</span>
          </div>
        </div>

        <div className="bg-zinc-950/40 border border-zinc-900 p-3.5 rounded-xl" id="field-coleta">
          <span className="text-[10px] uppercase text-zinc-500 font-mono font-bold block mb-1">Data de Coleta</span>
          <div className="flex items-center gap-2 text-white">
            <Calendar className="w-4 h-4 text-[#FFD700] shrink-0" />
            <span className="text-sm font-bold">{formatDate(carga.data_coleta)}</span>
          </div>
        </div>

        <div className="bg-zinc-950/40 border border-zinc-900 p-3.5 rounded-xl" id="field-prazo">
          <span className="text-[10px] uppercase text-zinc-500 font-mono font-bold block mb-1">Prazo Contratual</span>
          <div className="flex items-center gap-2 text-white">
            <Calendar className="w-4 h-4 text-[#FFD700] shrink-0" />
            <span className="text-sm font-bold">{formatDate(carga.prazo)}</span>
          </div>
        </div>

        <div className="bg-zinc-950/40 border border-zinc-900 p-3.5 rounded-xl" id="field-km">
          <span className="text-[10px] uppercase text-zinc-500 font-mono font-bold block mb-1">Distância da Rota</span>
          <div className="flex items-center gap-2 text-white">
            <Milestone className="w-4 h-4 text-[#FFD700] shrink-0" />
            <span className="text-sm font-extrabold">{carga.km || '---'} KM</span>
          </div>
        </div>

        {carga.cte && (
          <div className="bg-zinc-950/50 border border-zinc-900 p-3.5 rounded-xl font-mono col-span-1 sm:col-span-2 md:col-span-4" id="field-cte-display">
            <span className="text-[10px] uppercase text-zinc-500 font-bold font-sans block mb-2 flex items-center gap-1.5">
              <span>{carga.cte.includes(',') || carga.cte.includes(';') ? 'CT-es Vinculados' : 'CT-e Vinculado'}</span>
              <span className="bg-[#FFD700]/10 text-[#FFD700] px-1.5 py-0.5 rounded text-[8px] font-mono leading-none border border-[#FFD700]/20 font-bold">
                {carga.cte.split(/[,;]+/).filter(Boolean).length}
              </span>
            </span>
            <div className="flex flex-wrap gap-2 text-white text-xs">
              {carga.cte.split(/[,;]+/).map(c => c.trim()).filter(Boolean).map((item, idx) => (
                <span 
                  key={idx} 
                  className="bg-[#121212] border border-[#FFD700]/25 text-zinc-200 px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono tracking-tight shadow-sm hover:border-[#FFD700]/50 transition-colors cursor-text select-all"
                  title="Clique para selecionar/copiar"
                >
                  📄 {item}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 7. Seção de Entrega Concluída (Comprovante + Jingle + Avaliação) */}
      {isDelivered && (
        <div id="delivery-completion-container">
          <DeliveryCompletionSection carga={carga} />
        </div>
      )}

      {/* 8. Safety & LGPD Disclaimer (Preserved) */}
      <p className="text-[10px] font-mono text-zinc-600 text-center mt-6 uppercase tracking-wider leading-relaxed" id="disclaimer-safety">
        🛡️ ROUBO/FURTO E METAS OPERACIONAIS SÃO RIGOROSAMENTE MONITORADOS DE ACORDO COM LEI GERAL DE PROTEÇÃO DE DADOS.
      </p>
    </div>
  );
};
