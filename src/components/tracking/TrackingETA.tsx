import React from 'react';
import { Entrega } from '../../types';
import { Clock, Navigation, CheckCircle2, AlertTriangle, Package, Truck } from 'lucide-react';

interface TrackingETAProps {
  carga: Entrega;
}

export const TrackingETA: React.FC<TrackingETAProps> = ({ carga }) => {
  const getDynamicETA = () => {
    const status = (carga.status || '').toLowerCase().trim();

    if (status === 'entregue') {
      return {
        badge: 'ENTREGA CONCLUÍDA',
        badgeColor: 'bg-emerald-950/80 text-emerald-400 border-emerald-600/50',
        headline: 'Carga Entregue no Destino',
        subtext: 'Comprovante registrado e conferido com sucesso.',
        icon: CheckCircle2,
        iconColor: 'text-emerald-400',
        progressPercent: 100
      };
    }

    if (status === 'descarregando') {
      return {
        badge: 'CHEGOU AO DESTINO',
        badgeColor: 'bg-purple-950/80 text-purple-400 border-purple-600/50',
        headline: 'Descarregando no Destinatário',
        subtext: `Veículo posicionado na doca em ${carga.destino}.`,
        icon: Truck,
        iconColor: 'text-purple-400',
        progressPercent: 90
      };
    }

    if (status === 'parado') {
      return {
        badge: 'PARADA PROGRAMADA',
        badgeColor: 'bg-amber-950/80 text-amber-400 border-amber-600/50',
        headline: 'Pausa de Descanso / Fiscalização',
        subtext: 'Previsão mantida dentro do cronograma operacional.',
        icon: AlertTriangle,
        iconColor: 'text-amber-400',
        progressPercent: 60
      };
    }

    if (status === 'coletando') {
      return {
        badge: 'FASE DE COLETA',
        badgeColor: 'bg-blue-950/80 text-blue-400 border-blue-600/50',
        headline: 'Coleta em Andamento',
        subtext: `Conferência de mercadorias em ${carga.origem}.`,
        icon: Package,
        iconColor: 'text-blue-400',
        progressPercent: 15
      };
    }

    // Default: 'em_transito'
    // Calculate dynamic remaining days / proximity
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let daysDiff: number | null = null;
    if (carga.prazo) {
      const parts = carga.prazo.split('-');
      if (parts.length === 3) {
        const deadlineDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const timeDiff = deadlineDate.getTime() - today.getTime();
        daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
      }
    }

    let headline = 'Em Trânsito Rodoviário';
    let subtext = `Rota autorizada com destino a ${carga.destino}.`;
    let progress = 65;

    if (daysDiff !== null) {
      if (daysDiff < 0) {
        headline = 'Reta Final da Viagem';
        subtext = 'Veículo em aproximação final do destino.';
        progress = 85;
      } else if (daysDiff === 0) {
        headline = 'Chegada Estimada para Hoje';
        subtext = 'Veículo transitando no trecho final da rota.';
        progress = 80;
      } else if (daysDiff === 1) {
        headline = 'Chegada Estimada em 1 dia';
        subtext = `Previsão de entrega confirmada para amanhã em ${carga.destino}.`;
        progress = 60;
      } else {
        headline = `Chegada Estimada em ${daysDiff} dias`;
        subtext = `Viagem em andamento dentro do percurso monitorado.`;
        progress = Math.max(25, Math.min(75, 100 - (daysDiff * 15)));
      }
    }

    if (carga.km && carga.km <= 60) {
      headline = `Aproximação: a ${carga.km} km do destino`;
      subtext = 'Veículo no perímetro final de entrega.';
      progress = 88;
    }

    return {
      badge: 'PREVISÃO DINÂMICA (ETA)',
      badgeColor: 'bg-[#FFD700]/10 text-[#FFD700] border-[#FFD700]/30',
      headline,
      subtext,
      icon: Navigation,
      iconColor: 'text-[#FFD700]',
      progressPercent: progress
    };
  };

  const eta = getDynamicETA();
  const IconComponent = eta.icon;

  return (
    <div className="bg-gradient-to-r from-zinc-950 via-zinc-900/90 to-zinc-950 border border-zinc-900 rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden" id="dynamic-eta-section">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 shadow-inner flex items-center justify-center ${eta.iconColor}`}>
            <IconComponent className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded border ${eta.badgeColor}`}>
                {eta.badge}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                Cálculo em Tempo Real
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
              {eta.headline}
            </h3>
          </div>
        </div>

        {carga.prazo && (
          <div className="sm:text-right border-t sm:border-t-0 border-zinc-850 pt-2 sm:pt-0">
            <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 block">
              Data Limite Estipulada
            </span>
            <span className="text-sm font-extrabold text-[#FFD700] font-mono">
              {(() => {
                const parts = carga.prazo.split('-');
                return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : carga.prazo;
              })()}
            </span>
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-400 mb-3.5">
        {eta.subtext}
      </p>

      {/* Progress Bar of ETA completion */}
      <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden border border-zinc-800 relative">
        <div 
          className="h-full bg-gradient-to-r from-amber-500 via-[#FFD700] to-yellow-300 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(255,215,0,0.5)]"
          style={{ width: `${eta.progressPercent}%` }}
        />
      </div>
    </div>
  );
};
