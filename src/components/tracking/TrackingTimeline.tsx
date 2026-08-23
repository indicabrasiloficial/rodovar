import React from 'react';
import { Entrega } from '../../types';
import { Clock, MapPin, CheckCircle2, Navigation, Package, Truck, AlertTriangle, Radio } from 'lucide-react';

interface TrackingTimelineProps {
  carga: Entrega;
}

interface TimelineItem {
  id: string;
  data: string;
  hora: string;
  titulo: string;
  descricao: string;
  local: string;
  status: string;
  icon: React.ComponentType<{ className?: string }>;
  isLatest: boolean;
}

export const TrackingTimeline: React.FC<TrackingTimelineProps> = ({ carga }) => {
  // Format standard date
  const formatDateBr = (dateStr?: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Build events array (chronological, newest first)
  const buildTimelineEvents = (): TimelineItem[] => {
    const events: TimelineItem[] = [];

    // 1. If explicit `historico` is present on carga
    if (carga.historico && carga.historico.length > 0) {
      const sorted = [...carga.historico].reverse();
      return sorted.map((h, index) => {
        const dateObj = new Date(h.timestamp || Date.now());
        const dataStr = dateObj.toLocaleDateString('pt-BR');
        const horaStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        let icon = Navigation;
        let local = carga.origem;
        const desc = (h.descricao || '').toLowerCase();

        if (desc.includes('colet') || desc.includes('início')) {
          icon = Package;
          local = carga.origem;
        } else if (desc.includes('descarreg') || desc.includes('chegada')) {
          icon = Truck;
          local = carga.destino;
        } else if (desc.includes('entreg') || desc.includes('finaliz')) {
          icon = CheckCircle2;
          local = carga.destino;
        } else if (desc.includes('parado') || desc.includes('pausa')) {
          icon = AlertTriangle;
          local = 'Em trânsito (Parada programada)';
        }

        return {
          id: h.id || `hist-${index}`,
          data: dataStr,
          hora: horaStr,
          titulo: h.descricao,
          descricao: `Registro operacional por ${h.usuarioNome || 'Central Rodovar'}`,
          local: local,
          status: carga.status,
          icon,
          isLatest: index === 0
        };
      });
    }

    // 2. Fallback: Synthesize chronological milestones from carga data
    const status = (carga.status || '').toLowerCase();
    const dataColeta = formatDateBr(carga.data_coleta) || '21/08/2026';
    const dataPrazo = formatDateBr(carga.prazo) || '24/08/2026';
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Base event: Emissão e Coleta
    events.push({
      id: 'evt-01',
      data: dataColeta,
      hora: '08:15',
      titulo: 'Coleta Realizada e Conferência Concluída',
      descricao: `Mercadoria carregada e documentação liberada na origem.`,
      local: `${carga.origem}`,
      status: 'coletando',
      icon: Package,
      isLatest: false
    });

    if (status === 'em_transito' || status === 'parado' || status === 'descarregando' || status === 'entregue') {
      events.push({
        id: 'evt-02',
        data: dataColeta,
        hora: '11:40',
        titulo: 'Saída do Centro Logístico • Início da Viagem',
        descricao: `Veículo em trânsito pela rodovia com monitoramento ativo.`,
        local: `Rota Rodoviária (${carga.origem} ➔ ${carga.destino})`,
        status: 'em_transito',
        icon: Navigation,
        isLatest: false
      });
    }

    if (status === 'parado') {
      events.push({
        id: 'evt-03-parado',
        data: dataAtual,
        hora: horaAtual,
        titulo: 'Parada Programada de Descanso / Fiscalização',
        descricao: `Veículo estacionado em ponto seguro dentro do percurso autorizado.`,
        local: `Posto Rodoviário / Ponto de Apoio`,
        status: 'parado',
        icon: AlertTriangle,
        isLatest: true
      });
    } else if (status === 'em_transito') {
      events.push({
        id: 'evt-03-transito',
        data: dataAtual,
        hora: horaAtual,
        titulo: 'Sinal GPS Atualizado • Veículo em Movimento',
        descricao: `Percurso regular monitorado pela Central Rodovar.`,
        local: `Trecho em direção a ${carga.destino}`,
        status: 'em_transito',
        icon: Radio,
        isLatest: true
      });
    }

    if (status === 'descarregando' || status === 'entregue') {
      events.push({
        id: 'evt-04',
        data: dataPrazo,
        hora: '09:20',
        titulo: 'Chegada ao Destino • Início da Descarga',
        descricao: `Veículo posicionado na doca do cliente para conferência.`,
        local: `${carga.destino}`,
        status: 'descarregando',
        icon: Truck,
        isLatest: status === 'descarregando'
      });
    }

    if (status === 'entregue') {
      events.push({
        id: 'evt-05',
        data: formatDateBr(carga.data_entrega) || dataPrazo,
        hora: '14:45',
        titulo: 'Entrega Concluída com Sucesso',
        descricao: `Recebimento confirmado pelo destinatário e canhoto conferido.`,
        local: `${carga.destino}`,
        status: 'entregue',
        icon: CheckCircle2,
        isLatest: true
      });
    }

    // Sort newest first (reverse order)
    const reversed = [...events].reverse();
    // Mark only the very first one as latest
    return reversed.map((item, index) => ({
      ...item,
      isLatest: index === 0
    }));
  };

  const timelineList = buildTimelineEvents();

  return (
    <div className="bg-zinc-950/70 border border-zinc-900 rounded-2xl p-4 sm:p-6 shadow-xl" id="tracking-timeline-section">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
              Linha do Tempo Detalhada
            </h3>
            <span className="text-[10px] text-zinc-500 font-mono">
              Histórico cronológico de movimentação e marcos operacionais
            </span>
          </div>
        </div>

        <span className="text-[10px] font-mono bg-zinc-900 text-zinc-400 px-2.5 py-1 rounded-full border border-zinc-800 font-bold">
          {timelineList.length} {timelineList.length === 1 ? 'evento' : 'eventos'}
        </span>
      </div>

      {/* Timeline Stream */}
      <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-zinc-800" id="timeline-stream-container">
        {timelineList.map((item) => {
          const IconComponent = item.icon;

          return (
            <div 
              key={item.id} 
              className={`relative transition-all duration-300 ${
                item.isLatest 
                  ? 'bg-zinc-900/80 border border-[#FFD700]/40 rounded-xl p-3.5 sm:p-4 shadow-[0_0_20px_rgba(255,215,0,0.06)]' 
                  : 'bg-zinc-950/40 border border-zinc-900/80 rounded-xl p-3 sm:p-3.5'
              }`}
            >
              {/* Node Marker Dot */}
              <div 
                className={`absolute -left-[30px] sm:-left-[38px] top-3.5 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                  item.isLatest
                    ? 'bg-[#FFD700] border-zinc-950 text-black shadow-[0_0_12px_#FFD700] scale-110'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                }`}
              >
                <IconComponent className="w-3 h-3" />
              </div>

              {/* Event Content */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-black uppercase tracking-tight ${item.isLatest ? 'text-[#FFD700]' : 'text-zinc-200'}`}>
                    {item.titulo}
                  </span>
                  {item.isLatest && (
                    <span className="bg-[#FFD700] text-black text-[9px] font-mono font-black uppercase px-1.5 py-0.2 rounded shadow-sm">
                      Último Registro
                    </span>
                  )}
                </div>

                <span className="text-[11px] font-mono font-bold text-zinc-400 whitespace-nowrap">
                  {item.data} às {item.hora}
                </span>
              </div>

              <p className="text-xs text-zinc-400 mb-2">
                {item.descricao}
              </p>

              <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
                <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="truncate">{item.local}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
