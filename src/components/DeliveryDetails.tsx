import React, { useState, useEffect } from 'react';
import { Entrega, DeliveryStatus } from '../types';
import { saveEntrega, getEntregaById } from '../db/storage';
import { getDeliveryKm } from '../utils/distance';
import { 
  ArrowLeft,
  Calendar, 
  MapPin, 
  Phone, 
  DollarSign, 
  Clock, 
  FileCheck, 
  MessageSquare, 
  Edit3, 
  Navigation,
  Globe,
  User,
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Save,
  CheckCircle2,
  Trash2,
  Lock,
  Check,
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  Coins
} from 'lucide-react';
import DeliveryMap from './DeliveryMap';

const formatTimestamp = (isoString: string) => {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    return isoString;
  }
};

interface DeliveryDetailsProps {
  entregaId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDeleted: () => void;
  onNavigateToManager?: (id: string) => void;
}

const statusLabels: Record<DeliveryStatus, string> = {
  coletando: 'Coletando 📦',
  em_transito: 'Trânsito 🚚',
  parado: 'Parado 🛑',
  entregue: 'Entregue ✅'
};

const statusColors: Record<DeliveryStatus, string> = {
  coletando: 'text-blue-400 bg-blue-950/40 border-blue-950',
  em_transito: 'text-[#FFD600] bg-yellow-950/40 border-yellow-900/30',
  parado: 'text-red-400 bg-red-950/40 border-red-900/30',
  entregue: 'text-emerald-400 bg-emerald-950/40 border-emerald-900/30'
};

export default function DeliveryDetails({ entregaId, onBack, onEdit, onDeleted, onNavigateToManager }: DeliveryDetailsProps) {
  const [entrega, setEntrega] = useState<Entrega | null>(null);
  const [locLinkInput, setLocLinkInput] = useState('');
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [clickedScripts, setClickedScripts] = useState<string[]>([]);

  // Load latest values
  useEffect(() => {
    const details = getEntregaById(entregaId);
    if (details) {
      setEntrega(details);
      setLocLinkInput(details.link_localizacao || '');
    }

    // Load clicked scripts for this delivery
    const stored = localStorage.getItem(`clicked_scripts_${entregaId}`);
    if (stored) {
      try {
        setClickedScripts(JSON.parse(stored));
      } catch (e) {
        setClickedScripts([]);
      }
    } else {
      setClickedScripts([]);
    }
  }, [entregaId]);

  const markScriptAsClicked = (scriptKey: string) => {
    const stored = localStorage.getItem(`clicked_scripts_${entregaId}`);
    let list: string[] = [];
    if (stored) {
      try {
        list = JSON.parse(stored);
      } catch (e) {
        list = [];
      }
    }
    if (!list.includes(scriptKey)) {
      list.push(scriptKey);
      setClickedScripts(list);
      localStorage.setItem(`clicked_scripts_${entregaId}`, JSON.stringify(list));
    }
  };

  if (!entrega) {
    return (
      <div className="bg-[#121212] border border-zinc-800 p-8 rounded-xl text-center text-gray-500">
        <p className="text-sm font-semibold">Carga não encontrada ou apagada.</p>
        <button onClick={onBack} className="mt-4 px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs transition">
          Voltar para a Lista
        </button>
      </div>
    );
  }

  // Save Link
  const handleSaveLocationLink = () => {
    setIsSavingLink(true);
    setTimeout(() => {
      const updated = saveEntrega({
        id: entrega.id,
        link_localizacao: locLinkInput
      });
      setEntrega(updated);
      setIsSavingLink(false);
      setShowSaveSuccess(true);

      if (window.falarRodovar) {
        window.falarRodovar(`Rastreamento ao vivo ativado para o motorista ${entrega.motorista}.`);
      }

      setTimeout(() => setShowSaveSuccess(false), 3000);
    }, 450);
  };

  const handleUpdateStatus = (newStatus: DeliveryStatus) => {
    const updated = saveEntrega({
      id: entrega.id,
      status: newStatus
    });
    setEntrega(updated);

    if (window.falarRodovar) {
      const statusLabels: Record<string, string> = {
        coletando: 'carregando em fase de coleta',
        em_transito: 'em trânsito acelerando',
        parado: 'parada no acostamento',
        entregue: 'concluída e entregue com sucesso!'
      };
      window.falarRodovar(`Viagem do motorista ${entrega.motorista} atualizada para o status de: ${statusLabels[newStatus] || newStatus}`);
    }
  };

  // WhatsApp Trigger helpers
  const clickWhatsApp = (phone: string, text: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noreferrer,noopener');
  };

  // Preset WhatsApp templates
  const waTemplates = {
    apresentar: `Olá ${entrega.motorista}! Aqui é o Jairo Bahia, representante da Rodovar Transportadora. Estarei acompanhando sua viagem de ${entrega.origem} até ${entrega.destino} até o término. Poderia me enviar seu link de localização em tempo real pelo WhatsApp? Obrigado!`,
    solicitarLoc: `Olá ${entrega.motorista}! Tudo bem? Poderia me enviar sua localização em tempo real agora? Preciso informar ao cliente o status da carga. Grato!`,
    informarCliente: `Olá! Aqui é o Jairo Bahia da Rodovar Transportadora. Sua carga está a caminho! O motorista ${entrega.motorista} está em deslocamento e chegará até ${entrega.prazo}. Qualquer dúvida estou à disposição.`,
    solicitarCanhoto: `Olá ${entrega.motorista}! Após a entrega, por favor solicite o canhoto assinado e nos envie uma foto. Obrigado pela parceria!`,
    confirmarEntrega: `Olá! Confirmamos a entrega da sua carga realizada pelo motorista ${entrega.motorista}. Foi um prazer atendê-lo! Rodovar Transportadora.`,
    prazoMotorista: `Olá ${entrega.motorista}! Como está a viagem para ${entrega.destino}? Gostaríamos de alinhar sobre o tempo de percurso: o prazo limite de recebimento da carga é ${entrega.prazo}. Está tudo correndo de forma segura dentro deste planejado? Qualquer contratempo nos comunique de imediato. Obrigado! Rodovar.`,
    prazoCliente: `Olá! Aqui é o Jairo Bahia da Rodovar. Tudo bem? Referente à carga com destino a vocês, gostaríamos de confirmar que o prazo estimado/limite para a entrega é ${entrega.prazo}. O motorista ${entrega.motorista} está sob monitoramento e qualquer alteração de rota avisamos no mesmo instante!`
  };

  const handleSolicitarCanhotoClick = () => {
    // 1. Update database flag
    const updated = saveEntrega({
      id: entrega.id,
      canhoto_solicitado: true
    });
    setEntrega(updated);

    if (window.falarRodovar) {
      window.falarRodovar(`Iniciando solicitação de comprovante e canhoto com o motorista ${entrega.motorista}.`);
    }
    
    // 2. Fire WhatsApp template
    clickWhatsApp(entrega.tel_motorista, waTemplates.solicitarCanhoto);
  };

  const renderScriptButton = (
    key: string,
    title: string,
    phone: string,
    templateText: string,
    previewText: string,
    isCanhoto = false
  ) => {
    const isClicked = clickedScripts.includes(key) || (isCanhoto && entrega.canhoto_solicitado);

    const handleAction = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isCanhoto) {
        handleSolicitarCanhotoClick();
      } else {
        clickWhatsApp(phone, templateText);
      }
      markScriptAsClicked(key);
    };

    const toggleMarkOnly = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isClicked) {
        const updated = clickedScripts.filter(k => k !== key);
        setClickedScripts(updated);
        localStorage.setItem(`clicked_scripts_${entregaId}`, JSON.stringify(updated));
        if (isCanhoto) {
          const updatedEntrega = saveEntrega({
            id: entrega.id,
            canhoto_solicitado: false
          });
          setEntrega(updatedEntrega);
        }
      } else {
        markScriptAsClicked(key);
      }
    };

    return (
      <div
        onClick={handleAction}
        className={`w-full text-left p-3 rounded-lg border transition group cursor-pointer flex flex-col gap-1 relative overflow-hidden select-none ${
          isClicked
            ? 'bg-emerald-950/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/25'
            : 'bg-zinc-950/40 hover:bg-[#FFD600]/10 border-zinc-900 hover:border-[#FFD600]/40 text-white'
        }`}
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5 min-w-0">
            <span 
              onClick={toggleMarkOnly}
              className={`p-0.5 rounded cursor-pointer border transition-colors flex items-center justify-center shrink-0 w-4.5 h-4.5 ${
                isClicked
                  ? 'bg-emerald-500/20 border-emerald-400/80 text-emerald-400'
                  : 'bg-zinc-900 border-zinc-800 text-transparent group-hover:border-[#FFD600]'
              }`}
              title={isClicked ? "Desmarcar esta etapa" : "Marcar como enviada manualmente"}
            >
              <Check className="w-3 h-3 stroke-[3px]" />
            </span>
            <span className={`font-bold text-[11px] truncate ${isClicked ? 'text-emerald-400' : 'text-[#FFD600]'}`}>
              {title}
            </span>
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            {isClicked && (
              <span className="text-[8px] font-mono px-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded uppercase font-extrabold tracking-wider">
                Enviado
              </span>
            )}
            <ExternalLink className={`w-3 h-3 transition ${isClicked ? 'text-emerald-400/60 group-hover:text-emerald-400' : 'text-zinc-650 group-hover:text-[#FFD600]'}`} />
          </div>
        </div>

        <p className={`text-[10px] line-clamp-2 leading-relaxed transition ${isClicked ? 'text-emerald-300/70' : 'text-gray-400'}`}>
          "{previewText}"
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header navigations */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition cursor-pointer font-mono"
          id="details-back-btn"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Monitoramento
        </button>

        <button
          onClick={() => onEdit(entrega.id)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] text-gray-300 hover:text-white text-xs font-mono font-bold uppercase rounded-lg transition-all cursor-pointer"
          id="details-edit-btn"
        >
          <Edit3 className="w-4 h-4 text-[#FFD600]" />
          Editar Dados da Carga
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Core Delivery Data */}
        <div className="lg:col-span-8 space-y-6">

          {/* Core Info Panel structure */}
          <div className="bg-[#121212] border border-zinc-800 rounded-xl p-6 space-y-6 shadow-sm">
            
            {/* Delivery banner destination */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-900">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">ROTA MONITORADA</span>
                <h1 className="text-2xl font-black font-sans text-white tracking-tight flex items-center gap-2 mt-0.5">
                  {entrega.origem}
                  <span className="text-[#FFD600] text-lg font-light">➔</span>
                  <span className="text-[#FFD600] font-black">{entrega.destino}</span>
                </h1>
                <p className="text-xs text-gray-400 font-mono mt-1">
                  Distância estimada: <span className="text-[#FFD600] font-bold">{getDeliveryKm(entrega).toLocaleString('pt-BR')} km</span>
                </p>
              </div>

              <div className="flex flex-col sm:items-end gap-1.5">
                <span className="text-[10px] font-mono text-[#FFD600] uppercase font-bold flex items-center gap-1.5">
                  STATUS DA CARGA
                </span>
                <select
                  value={entrega.status}
                  onChange={(e) => handleUpdateStatus(e.target.value as DeliveryStatus)}
                  className={`px-3 py-1.5 text-xs font-bold font-sans rounded-lg border-2 focus:ring-1 focus:ring-[#FFD600] focus:outline-none cursor-pointer transition-all hover:scale-[1.02] active:scale-95 duration-150 ${statusColors[entrega.status]}`}
                  id="details-status-selector"
                >
                  <option value="coletando" className="bg-zinc-950 text-white">Coletando 📦</option>
                  <option value="em_transito" className="bg-zinc-950 text-[#FFD600]">Trânsito 🚚</option>
                  <option value="parado" className="bg-zinc-950 text-red-400">Parado 🛑</option>
                  <option value="entregue" className="bg-zinc-950 text-emerald-400">Entregue ✅</option>
                </select>
              </div>
            </div>

            {/* Grid structure for details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              
              {/* Box Driver */}
              <div className="bg-zinc-950/50 p-4 border border-zinc-900 rounded-xl space-y-3">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] flex items-center gap-1.5 font-bold">
                  <User className="w-4 h-4" />
                  Motorista Credenciado
                </span>
                <div className="space-y-1 font-sans">
                  <p className="text-sm font-bold text-gray-200">{entrega.motorista}</p>
                  <p className="text-xs text-gray-400 font-mono flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-gray-500" />
                    +55 {entrega.tel_motorista}
                  </p>
                </div>
              </div>

              {/* Box Client */}
              <div className="bg-zinc-950/50 p-4 border border-zinc-900 rounded-xl space-y-3">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] flex items-center gap-1.5 font-bold">
                  <ShoppingBag className="w-4 h-4" />
                  Cliente Destinatário
                </span>
                <div className="space-y-1 font-sans">
                  <p className="text-sm font-bold text-gray-200">{entrega.cliente}</p>
                  <p className="text-xs text-gray-400 font-mono flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-gray-500" />
                    +55 {entrega.tel_cliente}
                  </p>
                </div>
              </div>

              {/* Box Dates */}
              <div className="bg-zinc-950/50 p-4 border border-zinc-900 rounded-xl space-y-3">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] flex items-center gap-1.5 font-bold">
                  <Calendar className="w-4 h-4" />
                  Datas e Agendamento
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500 font-mono block uppercase text-[9px]">DATA COLETA</span>
                    <span className="text-gray-300 font-mono font-bold text-sm block mt-0.5">{entrega.data_coleta}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-mono block uppercase text-[9px]">PRAZO LIMITE</span>
                    <span className="text-[#FFD600] font-mono font-bold text-sm block mt-0.5">{entrega.prazo}</span>
                  </div>
                </div>
              </div>

              {/* Box Sales Rep */}
              <div className="bg-zinc-950/50 p-4 border border-zinc-900 rounded-xl space-y-3">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] flex items-center gap-1.5 font-bold">
                  <User className="w-3.5 h-3.5" />
                  VENDEDOR RESPONSÁVEL
                </span>
                <div className="space-y-1">
                  <span className="text-gray-350 font-sans font-bold text-sm block">{entrega.vendedor || 'Sem registro'}</span>
                  <span className="text-[9px] text-gray-550 font-mono block">RESPONSÁVEL COMERCIAL</span>
                </div>
              </div>

              {/* Box Freight Values & Cargo Risk Assessment */}
              <div className="bg-zinc-950/50 p-5 border border-zinc-900 rounded-xl space-y-4 sm:col-span-2">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-[#FFD600]" />
                    Valores, Custos e Gerenciamento de Risco
                  </span>
                  {entrega.valor_carga && entrega.valor_carga >= 100000 && (
                    <span className="bg-red-950 text-red-400 border border-red-500/30 font-mono text-[9px] px-2 py-0.5 rounded animate-pulse font-bold uppercase">
                      ⚠️ CARGA CARA DE RISCO
                    </span>
                  )}
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                  {/* Frete empresa */}
                  <div className="bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/40">
                    <span className="text-gray-550 font-mono block uppercase text-[10px] tracking-wider mb-1 font-bold">FRETE EMPRESA (FRETE EMP.)</span>
                    <span className="text-emerald-400 font-mono font-bold text-lg block leading-none">
                      {entrega.frete_empresa ? `R$ ${Number(entrega.frete_empresa).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00'}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono block mt-1">Receita de Faturamento</span>
                  </div>

                  {/* Frete motorista */}
                  <div className="bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/40">
                    <span className="text-gray-550 font-mono block uppercase text-[10px] tracking-wider mb-1 font-bold">FRETE MOTORISTA (FRETE MOT.)</span>
                    <span className="text-emerald-400 font-mono font-bold text-lg block leading-none">
                      {entrega.frete_motorista ? `R$ ${Number(entrega.frete_motorista).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00'}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono block mt-1">Custo de Operação Repassado</span>
                  </div>
                </div>

                {/* Risk Action Flag */}
                {(() => {
                  const val = entrega.valor_carga || 0;
                  if (val >= 100000) {
                    const grData = val >= 1000000 ? {
                      label: 'PROTOCOLO DIAMANTE ATIVADO',
                      style: 'border-rose-500/20 bg-rose-950/10 text-rose-300',
                      desc: 'Comboio com escolta armada habilitada, redundância de feeds GPRS de dois satélites ativos, parada restrita.'
                    } : val >= 500000 ? {
                      label: 'PROTOCOLO OURO ATIVADO',
                      style: 'border-amber-500/20 bg-amber-950/10 text-amber-300',
                      desc: 'Checklists obrigatórios GR de motorista, telemetria de sensores de baú ativados, paradas permitidas apenas em postos conveniados.'
                    } : {
                      label: 'PROTOCOLO PRATA ATIVADO',
                      style: 'border-indigo-500/20 bg-indigo-950/10 text-indigo-300',
                      desc: 'Carga segurada de alto valor. Escolta móvel e redundância de antenas recomendada nas rotas do plano de viagem.'
                    };

                    return (
                      <div className={`border p-3 rounded-xl flex items-start gap-2.5 text-[11px] leading-relaxed ${grData.style}`}>
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
                        <div>
                          <strong className="font-mono text-xs block font-bold uppercase">{grData.label}</strong>
                          <span className="opacity-85 font-sans block mt-0.5">{grData.desc}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Box Notes */}
              <div className="bg-zinc-950/50 p-4 border border-zinc-900 rounded-xl space-y-1 text-xs sm:col-span-2">
                <span className="text-gray-500 font-mono block uppercase text-[9px]">OBSERVAÇÕES INTERNAS RODOVAR</span>
                <p className="text-gray-300 leading-relaxed font-sans">{entrega.observacoes || 'Nenhuma observação cadastrada no sistema.'}</p>
              </div>

              {/* Box Canhoto check */}
              <div className="bg-zinc-950/50 p-4 border border-zinc-900 rounded-xl flex items-center justify-between sm:col-span-2 text-xs">
                <div className="space-y-1">
                  <span className="text-gray-500 font-mono block uppercase text-[9px]">CANHOTO ASSINADO (COMPROVANTE DE ENTREGA)</span>
                  <p className="text-gray-300 font-sans">
                    Status: {entrega.canhoto_solicitado 
                      ? <strong className="text-emerald-400">✓ Solicitado / Sob Análise</strong> 
                      : <span className="text-gray-500">Pendente de solicitação</span>
                    }
                  </p>
                </div>
                {!entrega.canhoto_solicitado && (
                  <button
                    onClick={handleSolicitarCanhotoClick}
                    className="px-3 py-1 bg-zinc-800 hover:bg-[#FFD600] hover:text-black font-semibold text-[11px] rounded transition-all cursor-pointer text-gray-300"
                    id="details-canhoto-req-inline"
                  >
                    Solicitar via WhatsApp
                  </button>
                )}
              </div>

            </div>

          </div>

          {/* Live Link location assignment field */}
          <div className="bg-[#121212]/90 border-2 border-zinc-800 focus-within:border-[#FFD600] rounded-xl p-5 shadow-sm transition-all">
            <h3 className="font-bold text-sm font-sans text-gray-200 mb-2 flex items-center gap-1">
              <Navigation className="w-4 h-4 text-[#FFD600]" />
              Link de Localização WhatsApp (Pin ao Vivo)
            </h3>
            <p className="text-xs text-gray-400 mb-4 font-sans leading-relaxed">
              Cole abaixo o link obtido da localização em tempo real enviada pelo smartphone do motorista. Salvar recarrega as posições do GPS instantaneamente abaixo.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                placeholder="Ex: https://maps.google.com/?q=-2.53, -44.30 ou link do WhatsApp"
                value={locLinkInput}
                onChange={(e) => setLocLinkInput(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] focus:ring-0 focus:outline-none rounded-lg text-xs p-2.5 text-white font-mono placeholder-gray-600"
                id="details-loc-url-input"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveLocationLink}
                  disabled={isSavingLink}
                  className="px-4 py-2 bg-[#FFD600] hover:bg-[#ffe23b] text-black font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                  id="details-loc-url-save"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSavingLink ? 'Salvando...' : 'Salvar Link'}
                </button>
                {entrega.link_localizacao && (
                  <a
                    href={entrega.link_localizacao}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                    id="details-loc-url-open"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir Ao Vivo
                  </a>
                )}
              </div>
            </div>
            {showSaveSuccess && (
              <p className="text-[11px] text-emerald-400 font-mono mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Link de localização gravado com sucesso! Geolocalização atualizada.
              </p>
            )}
          </div>

          {/* Histórico de Eventos */}
          <div className="bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm" id="details-event-history">
            <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] font-bold flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#FFD600]" />
                Histórico de Eventos da Carga
              </span>
              {entrega.historico && entrega.historico.length > 0 && (
                <span className="text-[10px] font-mono text-gray-500">
                  {entrega.historico.length} {entrega.historico.length === 1 ? 'registro' : 'registros'}
                </span>
              )}
            </div>

            {!entrega.historico || entrega.historico.length === 0 ? (
              <p className="text-zinc-500 font-sans text-xs text-center py-4">
                Aguardando primeiro evento ou alteração para iniciar o registro de histórico desta carga...
              </p>
            ) : (
              <div className="relative pl-5 space-y-5 before:absolute before:inset-y-1 before:left-2 before:w-0.5 before:bg-zinc-800/80">
                {/* We render them in chronological order or reverse chronological order (newest on top) */}
                {[...entrega.historico].reverse().map((evt) => {
                  const isCreate = evt.descricao.includes('Cadastrou') || evt.descricao.includes('Importou');
                  const isStatus = evt.descricao.includes('status');
                  const isLive = evt.descricao.includes('rastreamento') || evt.descricao.includes('localização');
                  const isCanhoto = evt.descricao.includes('canhoto');
                  
                  let dotColor = 'bg-zinc-700 border-zinc-600';
                  if (isCreate) dotColor = 'bg-[#FFD600] border-[#FFD600]/40';
                  else if (isStatus) dotColor = 'bg-blue-500 border-blue-500/40';
                  else if (isLive) dotColor = 'bg-amber-400 border-amber-400/40';
                  else if (isCanhoto) dotColor = 'bg-emerald-500 border-emerald-500/40';

                  let roleColor = 'text-zinc-400 bg-zinc-900 border-zinc-800';
                  const cargo = evt.cargo || '';
                  if (cargo.toLowerCase().includes('gerente')) {
                    roleColor = 'text-[#FFD600] bg-yellow-950/20 border-yellow-900/30';
                  } else if (cargo.toLowerCase().includes('diretor')) {
                    roleColor = 'text-red-400 bg-red-950/20 border-red-900/30';
                  } else if (cargo.toLowerCase().includes('financeiro')) {
                    roleColor = 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30';
                  }

                  return (
                    <div key={evt.id} className="relative text-xs flex flex-col gap-1 pr-1 group">
                      {/* Dotted indicator */}
                      <span className={`absolute -left-[17px] top-[5px] w-2.5 h-2.5 rounded-full border-2 ${dotColor} z-10 transition-transform group-hover:scale-125`} />
                      
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-gray-200">{evt.usuarioNome}</span>
                        <span className={`text-[8px] font-mono uppercase px-1 py-0.2 rounded border font-extrabold tracking-wider ${roleColor}`}>
                          {cargo || 'Operador'}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono ml-auto">
                          {formatTimestamp(evt.timestamp)}
                        </span>
                      </div>
                      
                      <p className="text-gray-400 font-sans leading-relaxed">
                        {evt.descricao}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Pre-made messages to Whatsapp AND Map Pin Preview references */}
        <div className="lg:col-span-4 space-y-6">

          {/* Action block - Jairo's Quick Messages panel */}
          <div className="bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex justify-between items-center border-b border-zinc-950 pb-2">
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] font-bold">
                MENSAGENS DO JAIRO (SCRIPTS WHATSAPP)
              </span>
              {clickedScripts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setClickedScripts([]);
                    localStorage.removeItem(`clicked_scripts_${entregaId}`);
                  }}
                  className="text-[9px] font-mono text-zinc-500 hover:text-red-400 transition cursor-pointer"
                  title="Limpar todos os marcadores de script desta carga"
                >
                  LIMPAR MARCADORES
                </button>
              )}
            </div>
            
            <p className="text-[11px] text-gray-400 font-sans">
              Envie mensagens rápidas clicando nas etapas abaixo. Os scripts enviados mudarão de cor, mas você também pode marcar ou desmarcar clicando no quadrado ao lado do número:
            </p>

            <div className="space-y-2 text-xs animate-fade-in">
              {renderScriptButton('apresentar', '1. Apresentar ao Motorista', entrega.tel_motorista, waTemplates.apresentar, `Olá ${entrega.motorista}! Aqui é o Jairo...`)}
              {renderScriptButton('solicitarLoc', '2. Solicitar Localização', entrega.tel_motorista, waTemplates.solicitarLoc, 'Poderia me enviar sua localização ao vivo?')}
              {renderScriptButton('informarCliente', '3. Informar Cliente', entrega.tel_cliente, waTemplates.informarCliente, `Sua carga está a caminho...`)}
              {renderScriptButton('solicitarCanhoto', '4. Solicitar Canhoto', entrega.tel_motorista, waTemplates.solicitarCanhoto, 'Após a entrega solicite o canhoto assinado...', true)}
              {renderScriptButton('confirmarEntrega', '5. Entrega Confirmada', entrega.tel_cliente, waTemplates.confirmarEntrega, `Confirmamos a entrega pelo motorista ${entrega.motorista}.`)}
              
              {/* New deadline alignment scripts */}
              {renderScriptButton('prazoMotorista', '6. Alinhar Prazo (Motorista)', entrega.tel_motorista, waTemplates.prazoMotorista, `Prazo limite de recebimento: ${entrega.prazo}.`)}
              {renderScriptButton('prazoCliente', '7. Alinhar Prazo (Cliente)', entrega.tel_cliente, waTemplates.prazoCliente, `Confirmando prazo estimado de entrega: ${entrega.prazo}.`)}

              {/* Botão / Suporte Gerencial Genivaldo */}
              {onNavigateToManager && (
                <button
                  type="button"
                  onClick={() => onNavigateToManager(entrega.id)}
                  className="w-full text-left p-3.5 rounded-lg bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 hover:border-red-500/50 transition group cursor-pointer mt-2"
                  id="details-report-manager-btn"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-red-400 text-[11px] uppercase tracking-wider flex items-center gap-1 font-sans">
                      🚨 Relatar ao Gerente Genivaldo
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-red-500 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-relaxed font-sans">
                    Comunique quebras, atrasos na fiscalização, recusas de carga e peça suporte imediato.
                  </p>
                </button>
              )}

            </div>
          </div>

          {/* Map region reference coordinates */}
          <div className="bg-[#121212] border border-zinc-800 rounded-xl p-4 space-y-3 shadow-sm">
            <h4 className="font-bold text-xs uppercase tracking-wider font-mono text-gray-300 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#FFD600]" />
              LOCALIZAÇÃO DA CARGA
            </h4>
            <div className="w-full h-80 rounded-lg overflow-hidden border border-zinc-900">
              {/* SingleView map showing city coordinates */}
              <DeliveryMap 
                entregas={[entrega]} 
                selectedId={entrega.id}
                singleView={true}
              />
            </div>
            <div className="text-[10px] font-mono text-gray-500 flex justify-between px-1">
              <span>LAT: {entrega.lat.toFixed(4)}</span>
              <span>LNG: {entrega.lng.toFixed(4)}</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
