import React, { useState, useEffect } from 'react';
import { Entrega } from '../types';
import { TrackingProgressBar } from './TrackingProgressBar';
import { Calendar, MapPin, Milestone, Sparkles, Navigation2 } from 'lucide-react';
import DeliveryMap from './DeliveryMap';

interface TrackingCardProps {
  carga: Entrega;
}

export const TrackingCard: React.FC<TrackingCardProps> = ({ carga }) => {
  const [resolvedAddress, setResolvedAddress] = useState<string>('');
  const [isResolvingAddress, setIsResolvingAddress] = useState<boolean>(false);

  useEffect(() => {
    if (!carga.localizacaoAtual || !carga.localizacaoAtual.lat || !carga.localizacaoAtual.lng) {
      setResolvedAddress('');
      return;
    }

    let isMounted = true;
    const fetchAddress = async () => {
      setIsResolvingAddress(true);
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${carga.localizacaoAtual!.lat}&lon=${carga.localizacaoAtual!.lng}`;
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
  }, [carga.localizacaoAtual?.lat, carga.localizacaoAtual?.lng, carga.trackingCode]);

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
    if (!carga.localizacaoAtual || !carga.ultimaAtualizacao) {
      return {
        text: 'Sem sinal de GPS',
        color: 'bg-zinc-900 border-zinc-800 text-zinc-500',
        dotClass: 'bg-zinc-600'
      };
    }

    try {
      const now = new Date();
      const lastUpdate = new Date(carga.ultimaAtualizacao);
      const diffMs = now.getTime() - lastUpdate.getTime();
      const diffMin = Math.floor(diffMs / (1000 * 60));

      if (diffMin < 5) {
        return {
          text: '🟢 AO VIVO',
          color: 'bg-green-500/10 border-green-500/30 text-green-400 animate-pulse',
          dotClass: 'bg-green-400 animate-ping'
        };
      } else {
        return {
          text: `Última localização há ${diffMin} min`,
          color: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
          dotClass: 'bg-amber-500'
        };
      }
    } catch {
      return {
        text: 'Sem sinal',
        color: 'bg-zinc-550/10 border-zinc-800 text-zinc-500',
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

  return (
    <div 
      className="w-full bg-[#121212]/95 border border-[#FFD700]/25 rounded-2xl p-6 shadow-[0_0_25px_rgba(255,215,0,0.08)] relative overflow-hidden transition-all duration-300"
      id="public-tracking-card-root"
    >
      {/* Visual background lighting */}
      <div className="absolute -top-12 -left-12 w-32 h-32 bg-[#FFD700]/5 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-zinc-500/5 blur-3xl rounded-full pointer-events-none" />
      
      {/* Top action rail */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-4" id="tracking-card-header">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-widest text-[#FFD700] block font-bold mb-0.5">RODOVAR RASTREIO CLIENTE</span>
          <h2 className="text-2xl font-black font-sans text-white tracking-tight flex items-center gap-2">
            {carga.trackingCode}
          </h2>
        </div>
        
        {/* Live indicator as requested by instructions */}
        <div 
          className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-full text-xs font-bold font-mono shadow-sm ${indicator.color}`}
          id="live-indicator-pill"
        >
          <span className={`w-2 h-2 rounded-full inline-block ${indicator.dotClass}`} />
          <span className="text-[10px] uppercase tracking-wider font-extrabold">{indicator.text}</span>
        </div>
      </div>

      {/* Progress Bar Component integrated */}
      <div className="my-6 bg-zinc-950/60 rounded-xl p-4 border border-zinc-900" id="progress-bar-wrapper">
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

      {/* Rastreamento Ativo por Satélite (Mapa e Endereço Físico) */}
      {carga.localizacaoAtual && (
        <div className="space-y-4 mb-6" id="realtime-satellite-tracking-section">
          {/* Mapa ao Vivo */}
          <div className="w-full h-[280px] rounded-xl overflow-hidden border border-[#FFD700]/20 shadow-inner relative" id="client-realtime-map">
            <DeliveryMap entregas={[carga]} selectedId={carga.id} singleView={true} />
          </div>

          {/* Endereço por Satélite */}
          <div className="bg-[#121212] border border-[#FFD700]/15 rounded-xl p-4 relative overflow-hidden" id="active-address-section">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFD700]/5 blur-lg rounded-full pointer-events-none" />
            
            <span className="text-[10px] uppercase font-mono tracking-widest text-[#FFD700] block font-bold mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFD700] animate-pulse" />
              Localização Próxima do Motorista (Rastreamento via Satélite)
            </span>
            
            <div className="flex items-start gap-3">
              <div className="bg-[#FFD700]/10 border border-[#FFD700]/15 p-2 rounded-xl text-[#FFD700] flex items-center justify-center shrink-0">
                <Navigation2 className="w-4 h-4 animate-bounce" />
              </div>
              <div className="min-w-0 flex-1">
                {resolvedAddress ? (
                  <p className="text-xs font-semibold text-zinc-200 leading-relaxed text-wrap">{resolvedAddress}</p>
                ) : isResolvingAddress ? (
                  <p className="text-xs text-zinc-500 font-mono animate-pulse">Obtendo endereço exato do satélite...</p>
                ) : (
                  <p className="text-xs text-zinc-400 font-mono">
                    Latitude: {carga.localizacaoAtual.lat.toFixed(6)} | Longitude: {carga.localizacaoAtual.lng.toFixed(6)}
                  </p>
                )}
                {carga.ultimaAtualizacao && (
                  <span className="text-[9px] font-mono text-zinc-500 block mt-1.5">
                    Sincronizado há {Math.max(0, Math.floor((new Date().getTime() - new Date(carga.ultimaAtualizacao).getTime()) / (1000 * 60)))} min às {new Date(carga.ultimaAtualizacao).toLocaleTimeString('pt-BR')} (Horário de Brasília)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Specific public fields (NO SENSITIVE info allowed) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="tracking-card-fields-grid">
        <div className="bg-zinc-950/20 border border-zinc-900 p-3.5 rounded-xl" id="field-status">
          <span className="text-[10px] uppercase text-zinc-500 font-bold block mb-1">Status Atual</span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${carga.status === 'entregue' ? 'bg-green-400' : 'bg-[#FFD700]'}`} />
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
            <span className="text-[10px] uppercase text-zinc-500 font-bold font-sans block mb-1">CT-e Vinculado</span>
            <div className="text-white text-xs select-all break-all selection:bg-[#FFD700] selection:text-black">
              {carga.cte}
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
