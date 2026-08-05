import React, { useState } from 'react';
import { Entrega } from '../types';
import { 
  buildMotoristaColetaMessage, 
  buildClienteColetaMessage, 
  getSaopauloGreeting, 
  getLoggedOperatorName, 
  sendWhatsAppMessage 
} from '../utils/coletaMessages';
import { 
  X, 
  Truck, 
  Building2, 
  Send, 
  Copy, 
  CheckCircle2, 
  MapPin, 
  AlertCircle, 
  MessageSquareText, 
  Sparkles,
  Clock,
  User,
  ExternalLink
} from 'lucide-react';

interface ColetaAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  entregas?: Entrega[];
}

export const ColetaAutomationModal: React.FC<ColetaAutomationModalProps> = ({
  isOpen,
  onClose,
  entregas = []
}) => {
  const [activeTab, setActiveTab] = useState<'motoristas' | 'clientes'>('motoristas');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');

  if (!isOpen) return null;

  const operatorName = getLoggedOperatorName();
  const currentGreeting = getSaopauloGreeting();

  const safeEntregas = Array.isArray(entregas) ? entregas : [];

  // Filter deliveries that are in status 'coletando'
  const coletasList = safeEntregas.filter(e => {
    if (!e) return false;
    const isColetando = e.status === 'coletando' || !e.status;
    const isNotDone = !e.etapasOperador?.e13;
    return isColetando && isNotDone;
  }).filter(e => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    const motorista = (e.motorista || '').toLowerCase();
    const cliente = (e.cliente || '').toLowerCase();
    const origem = (e.origem || '').toLowerCase();
    const destino = (e.destino || '').toLowerCase();
    return (
      motorista.includes(q) ||
      cliente.includes(q) ||
      origem.includes(q) ||
      destino.includes(q)
    );
  });

  const handleCopyMessage = (text: string, id: string) => {
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).catch(() => {
          fallbackCopyTextToClipboard(text);
        });
      } else {
        fallbackCopyTextToClipboard(text);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch (e) {
      console.error('Error copying text:', e);
    }
  };

  const fallbackCopyTextToClipboard = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
  };

  let currentHourStr = '00:00';
  try {
    currentHourStr = new Date().toLocaleTimeString('pt-BR', {
      timeZone: 'America_Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    const now = new Date();
    currentHourStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  return (
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border-b border-zinc-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD600]/10 border border-[#FFD600]/30 flex items-center justify-center text-[#FFD600]">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                Central de Automação de Coletas
                <span className="text-[10px] bg-[#FFD600] text-black font-extrabold px-2 py-0.5 rounded-full uppercase">
                  Somente Operador
                </span>
              </h2>
              <p className="text-xs text-zinc-400 font-mono flex items-center gap-2 mt-0.5">
                <span>Operador Logado: <strong className="text-white">{operatorName}</strong></span>
                <span className="text-zinc-600">•</span>
                <span className="flex items-center gap-1 text-[#FFD600]">
                  <Clock className="w-3 h-3" /> SP {currentHourStr} ({currentGreeting})
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition-all cursor-pointer border border-zinc-800"
            title="Fechar Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TABS SELECTOR */}
        <div className="p-3 bg-zinc-900/60 border-b border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('motoristas')}
              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                activeTab === 'motoristas'
                  ? 'bg-[#FFD600] text-black border-[#FFD600] shadow-md font-black'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              <Truck className="w-4 h-4" />
              1. Confirmar Coleta com Motoristas ({coletasList.length})
            </button>

            <button
              onClick={() => setActiveTab('clientes')}
              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                activeTab === 'clientes'
                  ? 'bg-cyan-400 text-black border-cyan-400 shadow-md font-black'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              <Building2 className="w-4 h-4" />
              2. Solicitar Endereço de Entrega ao Cliente ({coletasList.length})
            </button>
          </div>

          {/* Quick Search */}
          <input
            type="text"
            placeholder="Filtrar motorista, cliente ou rota..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full sm:w-64 bg-zinc-950 border border-zinc-800 text-xs font-mono rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-[#FFD600]"
          />
        </div>

        {/* INSTRUCTIONS BANNER */}
        <div className="p-3.5 bg-zinc-900/40 border-b border-zinc-850 px-5 text-xs text-zinc-300 font-mono">
          {activeTab === 'motoristas' ? (
            <div className="flex items-start gap-2.5 text-zinc-300">
              <span className="p-1 rounded-md bg-[#FFD600]/20 text-[#FFD600] mt-0.5">
                <Truck className="w-3.5 h-3.5" />
              </span>
              <div>
                <strong className="text-white block font-bold">Mensagem Automática para Motoristas em fase de Coleta:</strong>
                Saudação baseada no horário de São Paulo (<strong>{currentGreeting}</strong>), apresentação com o seu nome (<strong>{operatorName}</strong>) e solicitação de confirmação se a coleta da carga já foi concluída.
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 text-zinc-300">
              <span className="p-1 rounded-md bg-cyan-500/20 text-cyan-400 mt-0.5">
                <Building2 className="w-3.5 h-3.5" />
              </span>
              <div>
                <strong className="text-white block font-bold">Mensagem Automática para Clientes (Solicitação de Destino):</strong>
                Informa ao cliente que a equipe logística está recolhendo informações para iniciar a viagem e solicita o endereço completo de entrega ou pino de localização para o motorista.
              </div>
            </div>
          )}
        </div>

        {/* CARGOES LIST */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
          {coletasList.length === 0 ? (
            <div className="p-12 text-center bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3 opacity-60" />
              <p className="text-sm font-bold text-zinc-300 font-mono uppercase">
                Nenhuma carga em fase de coleta no momento!
              </p>
              <p className="text-xs text-zinc-500 font-mono mt-1">
                Todas as coletas ativas foram atualizadas ou não possuem filtros correspondentes.
              </p>
            </div>
          ) : (
            coletasList.map((entrega) => {
              const driverMessage = buildMotoristaColetaMessage(entrega, operatorName);
              const clientMessage = buildClienteColetaMessage(entrega, operatorName);
              const activeMessage = activeTab === 'motoristas' ? driverMessage : clientMessage;

              const rawTargetPhone = activeTab === 'motoristas' 
                ? (entrega.tel_motorista || entrega.telefone_motorista || '')
                : (entrega.tel_cliente || entrega.telefone_cliente || '');

              const targetPhone = String(rawTargetPhone || '');
              const cleanPhoneDigits = targetPhone.replace(/\D/g, '');
              const hasPhone = cleanPhoneDigits.length >= 8;

              return (
                <div 
                  key={entrega.id || Math.random()}
                  className="bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 transition-all shadow-lg flex flex-col gap-3"
                >
                  {/* CARGO CARD TOP HEADER */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md bg-blue-950 text-blue-400 border border-blue-800/60 font-mono text-[11px] font-black uppercase">
                        COLETA 📦
                      </span>
                      <h3 className="text-sm font-black text-white font-mono">
                        {entrega.origem || 'Origem'} ➔ {entrega.destino || 'Destino'}
                      </h3>
                      <span className="text-xs text-zinc-400 font-mono">
                        (Cliente: <strong className="text-zinc-200">{entrega.cliente || 'N/A'}</strong>)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
                      <span>Motorista: <strong className="text-white">{entrega.motorista || 'N/A'}</strong></span>
                    </div>
                  </div>

                  {/* DETAILS & MESSAGE PREVIEW */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    {/* LEFT MESSAGE BOX */}
                    <div className="md:col-span-8 bg-zinc-950 p-3 rounded-xl border border-zinc-850 relative group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold flex items-center gap-1">
                          <MessageSquareText className="w-3 h-3 text-[#FFD600]" /> Mensagem que será enviada:
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {activeTab === 'motoristas' ? `Para: ${entrega.motorista || 'Motorista'}` : `Para Cliente: ${entrega.cliente || 'Cliente'}`}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-zinc-200 whitespace-pre-wrap leading-relaxed line-clamp-4 group-hover:line-clamp-none transition-all">
                        {activeMessage}
                      </p>
                    </div>

                    {/* RIGHT ACTION BUTTONS */}
                    <div className="md:col-span-4 flex flex-col gap-2">
                      {hasPhone ? (
                        <button
                          onClick={() => sendWhatsAppMessage(targetPhone, activeMessage)}
                          className={`w-full py-2.5 px-3 rounded-xl font-mono text-xs font-black uppercase transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                            activeTab === 'motoristas'
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-950/40'
                              : 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-cyan-950/40'
                          }`}
                        >
                          <Send className="w-4 h-4 fill-current" />
                          Enviar via WhatsApp
                          <ExternalLink className="w-3 h-3 opacity-75" />
                        </button>
                      ) : (
                        <div className="bg-amber-950/40 border border-amber-800/50 p-2 rounded-xl text-center">
                          <span className="text-[10px] font-mono font-bold text-amber-300 flex items-center justify-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                            Telefone do {activeTab === 'motoristas' ? 'Motorista' : 'Cliente'} não informado
                          </span>
                        </div>
                      )}

                      <button
                        onClick={() => handleCopyMessage(activeMessage, `${entrega.id}-${activeTab}`)}
                        className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {copiedId === `${entrega.id}-${activeTab}` ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Mensagem Copiada!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copiar Texto da Mensagem
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* ADDRESS / LOCATION STATUS BADGE FOR CLIENT MESSAGES */}
                  {activeTab === 'clientes' && (
                    <div className="text-[11px] font-mono pt-1 flex items-center gap-2">
                      <span className="text-zinc-500 font-bold">Status do Endereço de Destino:</span>
                      {entrega.link_localizacao && entrega.link_localizacao.trim().startsWith('http') ? (
                        <span className="text-emerald-400 flex items-center gap-1 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-900/50 font-bold">
                          <CheckCircle2 className="w-3 h-3" /> Endereço/Link já registrado
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center gap-1 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-900/50 font-bold">
                          <MapPin className="w-3 h-3" /> Endereço de Destino Pendente (Aguardando resposta do cliente)
                        </span>
                      )}
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
          <div className="text-zinc-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Total de coletas ativas listadas: <strong className="text-white">{coletasList.length}</strong>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-all cursor-pointer border border-zinc-700"
          >
            Fechar Janela
          </button>
        </div>

      </div>
    </div>
  );
};
