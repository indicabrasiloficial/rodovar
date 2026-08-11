import React, { useState, useMemo } from 'react';
import { 
  X, 
  Truck, 
  Send, 
  Copy, 
  CheckCircle2, 
  MapPin, 
  Clock, 
  AlertTriangle, 
  Sparkles, 
  RefreshCw,
  Calendar,
  Building2,
  FileText,
  UserCheck
} from 'lucide-react';
import { Entrega } from '../types';
import { useAutomacaoTransito } from '../hooks/useAutomacaoTransito';
import { getLoggedOperatorName } from '../utils/coletaMessages';
import { formatDateBR } from '../utils/date';

interface TransitoAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  entregasFallback?: Entrega[];
}

type TabStatus = 'em_transito' | 'parado' | 'descarregando' | 'entregue';

export const TransitoAutomationModal: React.FC<TransitoAutomationModalProps> = ({
  isOpen,
  onClose,
  entregasFallback = []
}) => {
  const { entregas: hookEntregas, loading, error, refresh } = useAutomacaoTransito();
  
  // Combinar dados do hook + fallback fornecido pela lista (sem duplicar por ID)
  const allEntregas = useMemo(() => {
    const map = new Map<string, Entrega>();
    
    // Adicionar fallback primeiro (todas as cargas da lista do app)
    if (Array.isArray(entregasFallback)) {
      entregasFallback.forEach(e => {
        if (e && e.id) map.set(e.id, e);
      });
    }

    // Adicionar do hook
    if (Array.isArray(hookEntregas)) {
      hookEntregas.forEach(e => {
        if (e && e.id) map.set(e.id, e);
      });
    }

    return Array.from(map.values());
  }, [hookEntregas, entregasFallback]);

  const [activeTab, setActiveTab] = useState<TabStatus>('em_transito');
  const [selectedEntregaId, setSelectedEntregaId] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Campos manuais para status PARADO
  const [localizacaoAtual, setLocalizacaoAtual] = useState<string>('');
  const [motivo, setMotivo] = useState<string>('Descanso obrigatório');
  const [prazoAtualizado, setPrazoAtualizado] = useState<string>('');

  // Campos manuais para status ENTREGUE
  const [dataEntrega, setDataEntrega] = useState<string>(() => {
    try {
      return new Date().toLocaleDateString('pt-BR');
    } catch {
      return '';
    }
  });

  if (!isOpen) return null;

  // Filtragem local por aba de status
  const filteredEntregas = allEntregas.filter(e => {
    if (!e) return false;
    const currentStatus = (e.status || '').toLowerCase().trim();
    let matchesStatus = false;

    if (activeTab === 'em_transito') {
      matchesStatus = 
        currentStatus.includes('transito') || 
        currentStatus.includes('trânsito') || 
        currentStatus.includes('caminho') || 
        currentStatus.includes('andamento') ||
        currentStatus === 'em_transito' || 
        currentStatus === 'transito' ||
        currentStatus === 'coletando' ||
        currentStatus === 'pendente' ||
        !currentStatus; // Se status estiver em branco, padrão em trânsito
    } else if (activeTab === 'parado') {
      matchesStatus = currentStatus.includes('parado') || currentStatus.includes('parada');
    } else if (activeTab === 'descarregando') {
      matchesStatus = currentStatus.includes('descarreg');
    } else if (activeTab === 'entregue') {
      matchesStatus = currentStatus.includes('entregue') || currentStatus.includes('conclui') || currentStatus.includes('finaliz');
    }

    if (!matchesStatus) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const cli = (e.cliente || '').toLowerCase();
      const mot = (e.motorista || '').toLowerCase();
      const ori = (e.origem || '').toLowerCase();
      const des = (e.destino || '').toLowerCase();
      return cli.includes(q) || mot.includes(q) || ori.includes(q) || des.includes(q);
    }

    return true;
  });

  // Carga selecionada no momento
  const selectedEntrega = allEntregas.find(e => e.id === selectedEntregaId) || filteredEntregas[0] || null;

  // Gerador de mensagem formatada com base no status selecionado
  const buildWhatsAppMessage = (entrega: Entrega | null): string => {
    if (!entrega) return '';

    const cliente = (entrega.cliente || 'Cliente').trim();
    const origem = (entrega.origem || 'Origem').trim();
    const destino = (entrega.destino || 'Destino').trim();
    const motorista = (entrega.motorista || 'Motorista').trim();
    const dataColeta = entrega.data_coleta ? formatDateBR(entrega.data_coleta) : 'Não informada';
    const prazo = entrega.prazo ? formatDateBR(entrega.prazo) : 'Em breve';
    const atendente = (entrega.vendedor || getLoggedOperatorName() || 'Atendimento').trim();

    if (activeTab === 'em_transito') {
      return `Olá, *${cliente}* 👋\nTudo certo! A carga da rota *${origem} → ${destino}* já está a caminho.\n\n🚛 Motorista: *${motorista}*\n📦 Coleta: *${dataColeta}*\n📅 Previsão de entrega: *${prazo}*\n\nQualquer dúvida, estamos à disposição! 😊\n*RODOVAR Transportes*`;
    }

    if (activeTab === 'parado') {
      const loc = localizacaoAtual.trim() || '[LOCALIZAÇÃO ATUAL]';
      const mot = motivo.trim() || '[MOTIVO]';
      const novaPrev = prazoAtualizado.trim() || '[PRAZO ATUALIZADO]';

      return `Olá, *${cliente}* 👋\nInformamos que a carga da rota *${origem} → ${destino}* está momentaneamente parada em *${loc}*.\n\n⚠️ Motivo: *${mot}*\n🚛 Motorista: *${motorista}*\n📅 Nova previsão: *${novaPrev}*\n\nEstamos monitorando e te avisamos assim que retomar. 💪\n*RODOVAR Transportes*`;
    }

    if (activeTab === 'descarregando') {
      return `Olá, *${cliente}* 👋\nBoa notícia! A carga da rota *${origem} → ${destino}* chegou ao destino e está sendo descarregada agora.\n\n📦 Local: *${destino}*\n🚛 Motorista: *${motorista}*\n⏳ Em breve a entrega será concluída!\n\nQualquer informação adicional, estamos aqui. 😊\n*RODOVAR Transportes*`;
    }

    if (activeTab === 'entregue') {
      const dtEnt = dataEntrega.trim() || '[DATA DE ENTREGA]';

      return `Olá, *${cliente}* 👋\n✅ Entrega concluída com sucesso!\n\nA carga da rota *${origem} → ${destino}* foi entregue em *${destino}* no dia *${dtEnt}*.\n\n🚛 Motorista: *${motorista}*\n🏢 Atendente: *${atendente}*\n\nFoi um prazer atender vocês! Qualquer necessidade futura, conte com a RODOVAR. 🤝🚛\n*RODOVAR Transportes*`;
    }

    return '';
  };

  // Verificação de habilitação do botão de envio WhatsApp
  const isSendEnabled = (): boolean => {
    if (!selectedEntrega) return false;

    if (activeTab === 'parado') {
      return (
        localizacaoAtual.trim().length > 0 &&
        motivo.trim().length > 0 &&
        prazoAtualizado.trim().length > 0
      );
    }

    if (activeTab === 'entregue') {
      return dataEntrega.trim().length > 0;
    }

    return true; // Para 'em_transito' e 'descarregando'
  };

  const handleOpenWhatsApp = () => {
    if (!selectedEntrega || !isSendEnabled()) return;

    const rawPhone = selectedEntrega.tel_cliente || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');

    if (!cleanPhone) {
      alert('Telefone do cliente não cadastrado nesta carga.');
      return;
    }

    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const message = buildWhatsAppMessage(selectedEntrega);
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${fullPhone}?text=${encoded}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyMessage = () => {
    if (!selectedEntrega) return;
    const msg = buildWhatsAppMessage(selectedEntrega);
    try {
      navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Não foi possível copiar o texto automaticamente.');
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#121212] border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-zinc-100">
        
        {/* Modal Header */}
        <div className="bg-zinc-950 border-b border-zinc-800 p-4 sm:p-5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#FFD600]/10 border border-[#FFD600]/30 rounded-xl text-[#FFD600]">
              <Sparkles className="w-5 h-5 fill-current animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black uppercase font-mono tracking-wider text-white">
                  ⚡ AUTOMAÇÃO TRÂNSITO
                </h2>
                <span className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-[10px] font-mono font-bold text-[#FFD600] rounded-full">
                  RODOVAR MONITORA
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-sans mt-0.5">
                Envio rápido de notificações de status para clientes via WhatsApp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refresh()}
              disabled={loading}
              className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-xl text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5"
              title="Atualizar dados (Cache TTL 4 min)"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#FFD600] ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline font-bold">Atualizar</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-zinc-900 hover:bg-red-950/60 hover:text-red-400 border border-zinc-800 hover:border-red-800 text-zinc-400 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Tabs */}
        <div className="bg-zinc-950/50 border-b border-zinc-800 px-4 pt-3 flex items-center gap-2 overflow-x-auto scrollbar-thin shrink-0">
          {(
            [
              { id: 'em_transito', label: '🚚 Trânsito', color: 'border-blue-500 text-blue-400' },
              { id: 'parado', label: '⚠️ Parado', color: 'border-amber-500 text-amber-400' },
              { id: 'descarregando', label: '📦 Descarregando', color: 'border-purple-500 text-purple-400' },
              { id: 'entregue', label: '✅ Entregue', color: 'border-emerald-500 text-emerald-400' },
            ] as const
          ).map(tab => {
            const isActive = activeTab === tab.id;
            const count = allEntregas.filter(e => {
              const st = (e.status || '').toLowerCase();
              if (tab.id === 'em_transito') return st === 'em_transito' || st === 'transito' || st === 'em trânsito';
              return st === tab.id;
            }).length;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedEntregaId(null);
                }}
                className={`px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
                  isActive
                    ? `bg-[#121212] border-[#FFD600] text-[#FFD600] shadow-md`
                    : `border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/40`
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-2 py-0.2 text-[10px] rounded-full ${
                  isActive ? 'bg-[#FFD600] text-black font-black' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Modal Main Content: Split View (List | Preview + Form) */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800">
          
          {/* Left Panel: Freights List (5 cols) */}
          <div className="lg:col-span-5 p-4 flex flex-col gap-3 overflow-y-auto max-h-[350px] lg:max-h-none bg-zinc-950/20">
            {/* Search Input */}
            <input
              type="text"
              placeholder="Filtrar por cliente, motorista, rota..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 rounded-xl px-3 py-2 font-mono focus:outline-none focus:border-[#FFD600]"
            />

            {loading ? (
              <div className="p-8 text-center text-zinc-500 font-mono text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 text-[#FFD600] animate-spin" />
                <span>Carregando fretes...</span>
              </div>
            ) : filteredEntregas.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 font-mono text-xs border border-dashed border-zinc-800 rounded-xl">
                Nenhum frete encontrado com status <strong className="text-zinc-300 uppercase">{activeTab.replace('_', ' ')}</strong>.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEntregas.map(e => {
                  const isSelected = selectedEntrega?.id === e.id;
                  return (
                    <div
                      key={e.id}
                      onClick={() => setSelectedEntregaId(e.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-zinc-900 border-[#FFD600] shadow-lg shadow-[#FFD600]/5'
                          : 'bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-bold text-white font-mono flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#FFD600]" />
                          {e.origem || 'Origem'} ➔ {e.destino || 'Destino'}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded font-bold">
                          #{e.id.slice(0, 6)}
                        </span>
                      </div>

                      <div className="text-[11px] text-zinc-400 font-sans space-y-0.5">
                        <div className="flex items-center gap-1 text-zinc-300">
                          <Building2 className="w-3 h-3 text-zinc-500 shrink-0" />
                          <span className="font-semibold truncate">{e.cliente || 'Cliente não informado'}</span>
                        </div>
                        <div className="flex items-center gap-1 text-zinc-400">
                          <Truck className="w-3 h-3 text-zinc-500 shrink-0" />
                          <span className="truncate">Motorista: {e.motorista || 'A definir'}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-1">
                          <span>Prazo: {e.prazo ? formatDateBR(e.prazo) : 'S/P'}</span>
                          <span className="text-[#FFD600] font-bold">
                            {e.tel_cliente ? '📱 Tem WhatsApp' : '⚠️ Sem Tel.'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Panel: Form + Preview (7 cols) */}
          <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col gap-4 overflow-y-auto bg-[#121212]">
            {!selectedEntrega ? (
              <div className="p-12 text-center text-zinc-500 font-mono text-xs flex flex-col items-center justify-center gap-2 h-full">
                <Truck className="w-8 h-8 text-zinc-700" />
                <span>Selecione uma carga na lista ao lado para gerar a mensagem</span>
              </div>
            ) : (
              <>
                {/* Header info of selected Freight */}
                <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold tracking-wider">Carga Selecionada</span>
                    <h3 className="text-sm font-bold text-white font-mono flex items-center gap-1.5 mt-0.5">
                      <span>{selectedEntrega.origem}</span>
                      <span className="text-[#FFD600]">➔</span>
                      <span>{selectedEntrega.destino}</span>
                    </h3>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <span className="text-zinc-400 block text-[10px]">Cliente:</span>
                    <span className="text-zinc-200 font-bold">{selectedEntrega.cliente || 'N/I'}</span>
                  </div>
                </div>

                {/* Form fields for status PARADO */}
                {activeTab === 'parado' && (
                  <div className="bg-amber-950/20 border border-amber-900/40 p-4 rounded-xl space-y-3">
                    <div className="flex items-center gap-1.5 text-amber-400 font-mono text-xs font-bold uppercase">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Informações Obrigatórias do Status Parado</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-mono text-zinc-400 mb-1 font-bold">
                          LOCALIZAÇÃO ATUAL *
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Posto Graal - KM 120 BR-116"
                          value={localizacaoAtual}
                          onChange={e => setLocalizacaoAtual(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded-lg px-3 py-2 font-sans focus:outline-none focus:border-[#FFD600]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-zinc-400 mb-1 font-bold">
                          MOTIVO *
                        </label>
                        <select
                          value={motivo}
                          onChange={e => setMotivo(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded-lg px-3 py-2 font-sans focus:outline-none focus:border-[#FFD600]"
                        >
                          <option value="Descanso obrigatório">Descanso obrigatório</option>
                          <option value="Trânsito intenso">Trânsito intenso</option>
                          <option value="Aguardando janela de descarga">Aguardando janela de descarga</option>
                          <option value="Problema mecânico">Problema mecânico</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-mono text-zinc-400 mb-1 font-bold">
                          PRAZO ATUALIZADO *
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Amanhã às 14:00 ou 12/08/2026"
                          value={prazoAtualizado}
                          onChange={e => setPrazoAtualizado(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded-lg px-3 py-2 font-sans focus:outline-none focus:border-[#FFD600]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Form fields for status ENTREGUE */}
                {activeTab === 'entregue' && (
                  <div className="bg-emerald-950/20 border border-emerald-900/40 p-4 rounded-xl space-y-3">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-xs font-bold uppercase">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Data de Conclusão da Entrega</span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-zinc-400 mb-1 font-bold">
                        DATA DE ENTREGA *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 11/08/2026 às 16:30"
                        value={dataEntrega}
                        onChange={e => setDataEntrega(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded-lg px-3 py-2 font-sans focus:outline-none focus:border-[#FFD600]"
                      />
                    </div>
                  </div>
                )}

                {/* Message Box Preview */}
                <div className="space-y-1.5 flex-1 flex flex-col">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#FFD600]" />
                      Prévia da Mensagem (WhatsApp)
                    </label>
                    <button
                      onClick={handleCopyMessage}
                      className="text-[11px] font-mono text-zinc-400 hover:text-[#FFD600] flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
                    </button>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800/90 rounded-xl p-4 font-sans text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed shadow-inner flex-1">
                    {buildWhatsAppMessage(selectedEntrega)}
                  </div>
                </div>

                {/* Action Button: Open WhatsApp */}
                <div className="pt-2">
                  <button
                    onClick={handleOpenWhatsApp}
                    disabled={!isSendEnabled()}
                    className={`w-full h-11 rounded-xl font-mono text-xs uppercase font-black tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                      isSendEnabled()
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-950/40 active:scale-[0.98]'
                        : 'bg-zinc-800 text-zinc-500 border border-zinc-700/50 cursor-not-allowed'
                    }`}
                  >
                    <Send className="w-4 h-4 fill-current" />
                    <span>📲 Enviar WhatsApp para {selectedEntrega.cliente || 'Cliente'}</span>
                  </button>

                  {!isSendEnabled() && (
                    <p className="text-[10px] font-mono text-amber-400 text-center mt-2">
                      ⚠️ Preencha os campos obrigatórios acima para habilitar o envio.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
