import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  Volume2, 
  VolumeX, 
  X, 
  ChevronRight, 
  CheckCircle2, 
  Truck, 
  MessageCircle, 
  Sparkles,
  AlertCircle,
  HelpCircle,
  Play,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { getEntregas, saveEntrega } from '../db/storage';
import { Entrega } from '../types';
import { formatDateBR } from '../utils/date';

interface FiscalMascotProps {
  userName?: string;
  isSpeechMutedGlobal?: boolean;
  entregasProp?: Entrega[];
}

export const FiscalMascot: React.FC<FiscalMascotProps> = ({
  userName = 'Operador',
  isSpeechMutedGlobal = false,
  entregasProp
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(isSpeechMutedGlobal);
  const [currentDeliveryIndex, setCurrentDeliveryIndex] = useState<number>(0);
  const [recentDeliveries, setRecentDeliveries] = useState<Entrega[]>([]);
  const [spokenText, setSpokenText] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Determina a saudação com base na hora atual
  const getGreeting = useCallback(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }, []);

  // Falar texto via SpeechSynthesis
  const speakText = useCallback((textToSpeak: string) => {
    if (isMuted || isSpeechMutedGlobal || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel(); // Para qualquer fala anterior
      const cleanText = textToSpeak.replace(/[*_#➔]/g, ' ');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      // Selecionar voz em português se disponível
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang.includes('pt-BR') || v.lang.includes('pt'));
      if (ptVoice) {
        utterance.voice = ptVoice;
      }

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[Fiscal Rodovinho] Erro na síntese de voz:', e);
    }
  }, [isMuted, isSpeechMutedGlobal]);

  // Atualizar cargas para fiscalização (Apenas da memória do storage/props - 0 consumo de cota Firebase)
  const loadDeliveries = useCallback(() => {
    const all = (Array.isArray(entregasProp) && entregasProp.length > 0) ? entregasProp : getEntregas();
    // Prioriza cargas recentes que ainda não foram entregues ou que foram adicionadas por último
    const sorted = [...all].sort((a, b) => {
      const timeA = new Date(a.created_at || a.data_coleta || 0).getTime();
      const timeB = new Date(b.created_at || b.data_coleta || 0).getTime();
      return timeB - timeA;
    });
    setRecentDeliveries(sorted);
  }, [entregasProp]);

  useEffect(() => {
    loadDeliveries();
    const interval = setInterval(loadDeliveries, 60000); // 60s
    return () => clearInterval(interval);
  }, [loadDeliveries]);

  // Monta a pergunta da fiscalização para a carga atual
  const auditCurrentDelivery = useCallback((index: number) => {
    const greeting = getGreeting();
    const userFirstName = userName ? userName.split(' ')[0] : 'Operador';

    if (!recentDeliveries || recentDeliveries.length === 0) {
      const text = `${greeting}, ${userFirstName}! Sou o Fiscal Rodovinho. Não há cargas cadastradas no momento para fiscalização. Registre um novo frete!`;
      setSpokenText(text);
      speakText(text);
      return;
    }

    const targetIndex = index % recentDeliveries.length;
    const item = recentDeliveries[targetIndex];
    if (!item) return;

    const statusNorm = (item.status || 'Pendente').toLowerCase();
    const isEntregue = statusNorm === 'entregue';
    const origenDestino = `${item.origem || 'Origem'} para ${item.destino || 'Destino'}`;
    const motorista = item.motorista || 'Motorista não informado';
    const cliente = item.cliente || 'Cliente não informado';

    let msg = '';
    if (isEntregue) {
      msg = `${greeting}, ${userFirstName}! 👮 Inspecting: A carga #${item.id.slice(0, 5)} da rota ${origenDestino} para o cliente ${cliente} consta como ENTREGUE. O canhoto assinado já está conferido no sistema?`;
    } else {
      msg = `${greeting}, ${userFirstName}! 🚨 FISCALIZAÇÃO RODOVAR: A carga #${item.id.slice(0, 5)} de ${origenDestino} (Motorista: ${motorista}) está com status '${item.status || 'Em Andamento'}'. Essa carga já foi entregue ou tem novidades?`;
    }

    setSpokenText(msg);
    speakText(msg);
  }, [getGreeting, userName, recentDeliveries, speakText]);

  // Dispara a fala e fiscalização inicial
  useEffect(() => {
    if (recentDeliveries.length > 0) {
      auditCurrentDelivery(currentDeliveryIndex);
    }
  }, [recentDeliveries, currentDeliveryIndex, auditCurrentDelivery]);

  // Ação de marcar como entregue
  const handleMarkAsDelivered = () => {
    const item = recentDeliveries[currentDeliveryIndex];
    if (!item) return;

    saveEntrega({
      ...item,
      status: 'entregue',
      data_entrega: new Date().toISOString()
    });

    setStatusMessage(`Carga #${item.id.slice(0, 5)} confirmada como ENTREGUE! 🏆`);
    setTimeout(() => setStatusMessage(''), 4000);

    // Fala de confirmação da fiscalização
    const confirmMsg = `Excelente! Carga #${item.id.slice(0, 5)} foi atualizada para ENTREGUE pelo Fiscal Rodovinho. Avançando para a próxima!`;
    setSpokenText(confirmMsg);
    speakText(confirmMsg);

    // Próxima carga
    setTimeout(() => {
      loadDeliveries();
      setCurrentDeliveryIndex(prev => prev + 1);
    }, 1500);
  };

  const handleNextDelivery = () => {
    setCurrentDeliveryIndex(prev => (prev + 1) % Math.max(1, recentDeliveries.length));
  };

  const currentItem = recentDeliveries[currentDeliveryIndex] || null;

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true);
          setIsMinimized(false);
        }}
        className="fixed bottom-5 left-5 z-[1050] bg-[#FFD600] hover:bg-yellow-400 text-black font-extrabold font-mono text-xs px-3.5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer border-2 border-black"
        title="Abrir Fiscal Rodovinho"
        id="btn-open-fiscal-rodovinho"
      >
        <span className="text-base">👮‍♂️</span>
        <span className="uppercase tracking-wider">FISCAL RODOVINHO</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 left-5 z-[1050] max-w-sm w-full font-sans select-none animate-fadeIn">
      <div className="relative bg-[#121212] border-2 border-[#FFD600] rounded-2xl shadow-2xl overflow-hidden text-white flex flex-col">
        
        {/* Header do Mascote */}
        <div className="bg-zinc-950 px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#FFD600] text-black flex items-center justify-center font-black text-sm shadow-inner shrink-0">
              👮‍♂️
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-black uppercase font-mono text-[#FFD600] leading-none m-0">
                  FISCAL RODOVINHO
                </h4>
                <span className="px-1.5 py-0.2 bg-red-950/80 border border-red-800 text-red-400 text-[9px] font-mono font-bold rounded">
                  AUDITORIA
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono mt-0.5 mb-0">
                Fiscalizando todas as entradas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 text-zinc-400 hover:text-[#FFD600] transition-colors rounded hover:bg-zinc-900 cursor-pointer"
              title={isMuted ? "Ativar som do fiscal" : "Mutar som do fiscal"}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 text-zinc-400 hover:text-white transition-colors rounded hover:bg-zinc-900 cursor-pointer"
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-zinc-400 hover:text-red-400 transition-colors rounded hover:bg-zinc-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corpo Expandido */}
        {!isMinimized && (
          <div className="p-4 space-y-3 bg-[#121212]">
            
            {/* Speech Bubble (Balão de Fala do Mascote) */}
            <div className="relative bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 text-xs text-zinc-200 leading-relaxed shadow-inner">
              <div className="absolute -top-2 left-6 w-3 h-3 bg-zinc-900 border-t border-l border-zinc-800 rotate-45"></div>
              
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-[#FFD600] shrink-0 mt-0.5 animate-pulse" />
                <p className="m-0 font-sans text-xs text-zinc-100">
                  {spokenText || `${getGreeting()}! Fiscalizando fretes ativos...`}
                </p>
              </div>

              {/* Botão de Re-falar síntese */}
              <button
                onClick={() => speakText(spokenText)}
                className="mt-2 text-[10px] font-mono text-[#FFD600] hover:underline flex items-center gap-1 cursor-pointer font-bold"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Ouvir novamente</span>
              </button>
            </div>

            {/* Carga sob Fiscalização */}
            {currentItem && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 border-b border-zinc-800/80 pb-1.5">
                  <span className="font-bold text-[#FFD600]">
                    CARGA #{currentItem.id.slice(0, 6)}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold uppercase">
                    {currentItem.status || 'Pendente'}
                  </span>
                </div>

                <div className="text-xs space-y-1">
                  <div className="font-bold text-white font-mono flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-[#FFD600]" />
                    <span>{currentItem.origem || 'Origem'} ➔ {currentItem.destino || 'Destino'}</span>
                  </div>
                  <div className="text-zinc-400 text-[11px]">
                    👤 Cliente: <strong className="text-zinc-200">{currentItem.cliente || 'N/I'}</strong>
                  </div>
                  <div className="text-zinc-400 text-[11px]">
                    🚛 Motorista: <strong className="text-zinc-200">{currentItem.motorista || 'N/I'}</strong>
                  </div>
                </div>

                {/* Mensagem de confirmação de ação */}
                {statusMessage && (
                  <div className="p-2 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-[11px] font-mono rounded font-bold text-center animate-fadeIn">
                    {statusMessage}
                  </div>
                )}

                {/* Ações Rápidas da Fiscalização */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={handleMarkAsDelivered}
                    className="p-2 bg-emerald-600 hover:bg-emerald-500 text-black font-extrabold font-mono text-[10px] uppercase rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer shadow active:scale-95"
                    title="Confirmar entrega desta carga"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Já Entregou</span>
                  </button>

                  <button
                    onClick={handleNextDelivery}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold font-mono text-[10px] uppercase rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-95"
                    title="Auditar próxima carga"
                  >
                    <span>Próxima</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#FFD600]" />
                  </button>
                </div>
              </div>
            )}

            {/* Counter bar */}
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 px-1 pt-1 border-t border-zinc-900">
              <span>Fiscalizando {recentDeliveries.length} entradas</span>
              <span>
                {currentDeliveryIndex + 1} de {Math.max(1, recentDeliveries.length)}
              </span>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
