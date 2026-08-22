import React, { useState, useEffect } from 'react';
import { Entrega } from '../types';
import { TrackingProgressBar } from './TrackingProgressBar';
import { Calendar, MapPin, Milestone, Sparkles } from 'lucide-react';
import { useCargoTracking } from '../hooks/useCargoTracking';
import { playEntregueAudio } from '../utils/audioNotification';

interface TrackingCardProps {
  carga: Entrega;
}

export const TrackingCard: React.FC<TrackingCardProps> = ({ carga }) => {
  const { position, source, isLive, lastSeenSeconds, connectionStatus } = useCargoTracking(carga);
  const [resolvedAddress, setResolvedAddress] = useState<string>('');
  const [isResolvingAddress, setIsResolvingAddress] = useState<boolean>(false);

  // Reproduz o som de entrega 1 vez ao carregar a página ou mudar para status Entregue
  useEffect(() => {
    if (!carga) return;
    const currentStatus = (carga.status || '').toLowerCase().trim();
    if (currentStatus === 'entregue' || currentStatus.includes('entregue') || currentStatus.includes('concluid')) {
      playEntregueAudio(carga.trackingCode || carga.id);
    }
  }, [carga?.status, carga?.trackingCode, carga?.id]);

  useEffect(() => {
    if (!position || !position.lat || !position.lng) {
      setResolvedAddress('');
      return;
    }

    let isMounted = true;
    const fetchAddress = async () => {
      setIsResolvingAddress(true);
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
      } finally {
        if (isMounted) setIsResolvingAddress(false);
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
      case 'entregue': return 'Entregue';
      default: return status;
    }
  };

  const getLiveIndicator = () => {
    if (source === 'none') {
      return {
        text: 'Sem monitoramento ativo',
        color: 'bg-zinc-900 border-zinc-800 text-zinc-500',
        dotClass: 'bg-zinc-600'
      };
    }

    if (source === 'whatsapp') {
      return {
        text: '📍 Localização Local (WhatsApp)',
        color: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
        dotClass: 'bg-amber-500'
      };
    }

    if (connectionStatus === 'live') {
      return {
        text: '🟢 AO VIVO',
        color: 'bg-green-500/10 border-green-500/30 text-green-400 animate-pulse',
        dotClass: 'bg-green-400 animate-ping'
      };
    } else if (connectionStatus === 'weak') {
      return {
        text: '🟡 SINAL FRACO',
        color: 'bg-yellow-500/10 border-yellow-500/20 text-amber-500',
        dotClass: 'bg-amber-500 animate-pulse'
      };
    } else {
      const min = lastSeenSeconds ? Math.floor(lastSeenSeconds / 60) : 0;
      return {
        text: `🔴 DESCONECTADO ${min > 0 ? `(${min}m)` : ''}`,
        color: 'bg-red-500/10 border-red-500/20 text-red-500',
        dotClass: 'bg-red-500'
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

  return (
    <div 
      className="w-full bg-[#121212]/95 border border-[#FFD700]/25 rounded-2xl p-4 sm:p-6 shadow-[0_0_25px_rgba(255,215,0,0.08)] relative overflow-hidden transition-all duration-300"
      id="public-tracking-card-root"
    >
      {/* Visual background lighting */}
      <div className="absolute -top-12 -left-12 w-32 h-32 bg-[#FFD700]/5 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-zinc-500/5 blur-3xl rounded-full pointer-events-none" />
      
      {/* Top action rail */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-4" id="tracking-card-header">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-widest text-[#FFD700] block font-bold mb-0.5">RODOVAR RASTREIO CLIENTE</span>
          <h2 className="text-xl sm:text-2xl font-black font-sans text-white tracking-tight flex items-center gap-2">
            {carga.trackingCode}
          </h2>
        </div>
        
        {/* Live indicator only shown when actively AO VIVO */}
        {indicator.text === '🟢 AO VIVO' && (
          <div 
            className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-full text-xs font-bold font-mono shadow-sm ${indicator.color}`}
            id="live-indicator-pill"
          >
            <span className={`w-2 h-2 rounded-full inline-block ${indicator.dotClass}`} />
            <span className="text-[10px] uppercase tracking-wider font-extrabold">{indicator.text}</span>
          </div>
        )}
      </div>

      {/* Progress Bar Component integrated */}
      <div className="my-4 sm:my-6 bg-zinc-950/60 rounded-xl p-2.5 sm:p-4 border border-zinc-900" id="progress-bar-wrapper">
        <TrackingProgressBar status={carga.status} />
      </div>

      {/* Route mapping */}
      <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-4.5 mb-6" id="route-display-section">
        <span className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider block mb-2">Percurso Autorizado</span>
        
        <div className="flex items-center justify-between gap-2 flex-wrap" id="origin-destination-grid">
          <div className="flex items-center gap-3" id="tracking-city-origin">
            <div className="bg-zinc-900/90 border border-zinc-800 p-2.5 rounded-xl text-zinc-400 flex items-center justify-center shadow-inner">
              <MapPin className="w-5 h-5 text-[#FFD700]" />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block">Origem</span>
              <span className="font-bold text-zinc-100 text-sm">{carga.origem}</span>
            </div>
          </div>

          <div className="flex-1 min-w-[20px] h-[1px] border-b border-dashed border-zinc-700/60 mx-4 hidden sm:block" id="dash-connector" />

          <div className="flex items-center gap-3 sm:text-right sm:flex-row-reverse" id="tracking-city-destination">
            <div className="bg-zinc-900/90 border border-zinc-800 p-2.5 rounded-xl text-zinc-400 flex items-center justify-center shadow-inner">
              <MapPin className="w-5 h-5 text-zinc-400" />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block">Destino</span>
              <span className="font-bold text-zinc-100 text-sm">{carga.destino}</span>
            </div>
          </div>
        </div>
      </div>



      {/* Specific public fields (NO SENSITIVE info allowed) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="tracking-card-fields-grid">
        <div className="bg-zinc-950/20 border border-zinc-900 p-3.5 rounded-xl" id="field-status">
          <span className="text-[10px] uppercase text-zinc-500 font-bold block mb-1">Status Atual</span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${carga.status === 'entregue' ? 'bg-green-400 animate-pulse' : 'bg-[#FFD700]'}`} />
            <span className="text-sm font-black text-white">{formatStatus(carga.status)}</span>
          </div>
        </div>

        <div className="bg-zinc-950/20 border border-zinc-900 p-3.5 rounded-xl" id="field-coleta">
          <span className="text-[10px] uppercase text-zinc-500 font-bold block mb-1">Data de Coleta</span>
          <div className="flex items-center gap-2 text-white">
            <Calendar className="w-4 h-4 text-[#FFD700] shrink-0" />
            <span className="text-sm font-bold">{formatDate(carga.data_coleta)}</span>
          </div>
        </div>

        <div className="bg-zinc-950/20 border border-zinc-900 p-3.5 rounded-xl" id="field-prazo">
          <span className="text-[10px] uppercase text-zinc-500 font-bold block mb-1">Prazo Estimado</span>
          <div className="flex items-center gap-2 text-white">
            <Calendar className="w-4 h-4 text-[#FFD700] shrink-0" />
            <span className="text-sm font-bold">{formatDate(carga.prazo)}</span>
          </div>
        </div>

        <div className="bg-zinc-950/20 border border-zinc-900 p-3.5 rounded-xl" id="field-km">
          <span className="text-[10px] uppercase text-zinc-500 font-bold block mb-1">Distância Total</span>
          <div className="flex items-center gap-2 text-white">
            <Milestone className="w-4 h-4 text-[#FFD700] shrink-0" />
            <span className="text-sm font-extrabold">{carga.km || '---'} KM</span>
          </div>
        </div>

        {carga.cte && (
          <div className="bg-zinc-950/30 border border-zinc-900 p-3.5 rounded-xl font-mono col-span-1 md:col-span-4" id="field-cte-display">
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

      {/* Safety message */}
      <p className="text-[10px] font-mono text-zinc-600 text-center mt-6 uppercase tracking-wider" id="disclaimer-safety">
        🛡️ ROUBO/FURTO E METAS OPERACIONAIS SÃO RIGOROSAMENTE MONITORADOS DE ACORDO COM LEI GERAL DE PROTEÇÃO DE DADOS.
      </p>
    </div>
  );
};
