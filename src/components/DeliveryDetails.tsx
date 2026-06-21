import React, { useState, useEffect } from 'react';
import { Entrega, DeliveryStatus } from '../types';
import { saveEntrega, getEntregaById, getDriverRatingStats, getClientRatingStats } from '../db/storage';
import { getDeliveryKm } from '../utils/distance';
import { formatDateBR } from '../utils/date';
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
  Coins,
  Paperclip,
  Share2,
  Plus,
  Truck
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
  descarregando: 'Descarregando 🏢',
  entregue: 'Entregue ✅'
};

const statusColors: Record<DeliveryStatus, string> = {
  coletando: 'text-blue-400 bg-blue-950/40 border-blue-950',
  em_transito: 'text-[#FFD600] bg-yellow-950/40 border-yellow-900/30',
  parado: 'text-red-400 bg-red-950/40 border-red-900/30',
  descarregando: 'text-purple-400 bg-purple-950/40 border-purple-900/30',
  entregue: 'text-emerald-400 bg-emerald-950/40 border-emerald-900/30'
};

export default function DeliveryDetails({ entregaId, onBack, onEdit, onDeleted, onNavigateToManager }: DeliveryDetailsProps) {
  const getActiveUserFullName = (): string => {
    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        const parsed = JSON.parse(active);
        if (parsed && parsed.displayName) {
          return parsed.displayName;
        }
      } catch {
        // Ignored
      }
    }
    return 'Jairo Bahia';
  };

  const getActiveUserName = (): string => {
    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        const parsed = JSON.parse(active);
        if (parsed && parsed.displayName) {
          return parsed.displayName.split(' ')[0];
        }
      } catch {
        // Ignored
      }
    }
    return 'Jairo';
  };

  const isUserJairo = (): boolean => {
    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        const parsed = JSON.parse(active);
        // Deixar somente para JairoBahia (username = 'jairobahia')
        return parsed && parsed.username === 'jairobahia';
      } catch {
        return false;
      }
    }
    return false;
  };

  const getActiveUserRole = (): string => {
    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        const parsed = JSON.parse(active);
        if (parsed && parsed.role) {
          return parsed.role;
        }
      } catch {
        // Ignored
      }
    }
    return 'Operador';
  };

  const [entrega, setEntrega] = useState<Entrega | null>(null);
  const [locLinkInput, setLocLinkInput] = useState('');
  const [showDetailsLocModal, setShowDetailsLocModal] = useState(false);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [clickedScripts, setClickedScripts] = useState<string[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);

  const copyTrackingToClipboard = () => {
    if (!entrega?.trackingCode) return;
    navigator.clipboard.writeText(entrega.trackingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    if (window.falarRodovar) {
      window.falarRodovar("Código de rastreamento copiado com sucesso!");
    }
  };

  // Document attachment states and methods
  const [newDocType, setNewDocType] = useState<'MDFE' | 'CTE' | 'CANHOTO' | 'OUTROS'>('MDFE');
  const [docUploadError, setDocUploadError] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!entrega) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      setDocUploadError('Arquivo excedeu o limite! Escolha fotos/documentos de no máximo 4 MB.');
      return;
    }

    setDocUploadError('');
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const sizeStr = (file.size / 1024).toFixed(1) + ' KB';
      
      const novoDoc = {
        id: 'doc-' + Math.random().toString(36).substring(2, 11),
        nome: file.name,
        tipo: newDocType,
        dataAnexado: new Date().toISOString(),
        tamanho: sizeStr,
        conteudoBase64: base64
      };

      const updatedDocs = [...(entrega.documentos || []), novoDoc];
      const updated = saveEntrega({
        id: entrega.id,
        documentos: updatedDocs
      });

      setEntrega(updated);
      if (window.falarRodovar) {
        window.falarRodovar(`Documento ${newDocType} anexado com sucesso total!`);
      }
      
      // Clear input
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteDocument = (docId: string) => {
    if (!entrega || !confirm('Deseja realmente remover este documento anexado desta carga?')) return;

    const updatedDocs = (entrega.documentos || []).filter(d => d.id !== docId);
    const updated = saveEntrega({
      id: entrega.id,
      documentos: updatedDocs
    });

    setEntrega(updated);
    if (window.falarRodovar) {
      window.falarRodovar('Documento removido da carga.');
    }
  };

  const handleShareDocument = (doc: any, targetType: 'motorista' | 'cliente' | 'outro') => {
    if (!entrega) return;
    
    let phone = '';
    if (targetType === 'motorista') {
      phone = entrega.tel_motorista;
    } else if (targetType === 'cliente') {
      phone = entrega.tel_cliente;
    } else {
      const input = prompt('Digite o número de WhatsApp completo com DDD (ex: 11999999999):');
      if (!input) return;
      phone = input;
    }

    const docTypeLabel: Record<string, string> = {
      MDFE: 'MDF-e (Manifesto Eletrônico)',
      CTE: 'CT-e (Conhecimento de Transporte)',
      CANHOTO: 'Canhoto Recebido',
      OUTROS: 'Documento Operacional'
    };

    const docMsg = `🚚 *RODOVAR DOCUMENTO COMPARTILHADO* 🚚\n\n` +
      `📂 *Carga:* ${entrega.origem} ➔ ${entrega.destino}\n` +
      `👤 *Motorista:* ${entrega.motorista} (${entrega.tel_motorista})\n` +
      `📋 *Tipo de Documento:* *${docTypeLabel[doc.tipo] || doc.tipo}*\n` +
      `📎 *Nome do Arquivo:* \`${doc.nome}\`\n` +
      `📏 *Tamanho:* ${doc.tamanho || 'Visualização Direta'}\n` +
      `📅 *Gravado em:* ${formatTimestamp(doc.dataAnexado)}\n\n` +
      `Acesse a central Rodovar para auditar o documento ou emitir o PDF/Imprimir.\n` +
      `_Auditado com êxito pela Central Rodovar IA._`;

    clickWhatsApp(phone, docMsg);
  };

  // Calculate driver travel rating score
  const ratingStats = React.useMemo(() => {
    return getDriverRatingStats(entrega?.motorista || '');
  }, [entrega]);

  // Calculate client travel rating score
  const clientRatingStats = React.useMemo(() => {
    return getClientRatingStats(entrega?.cliente || '');
  }, [entrega]);

  const handleRateViagem = (rating: 'boa' | 'ruim') => {
    if (!entrega) return;
    try {
      const updated = saveEntrega({
        id: entrega.id,
        avaliacao_viagem: rating
      });
      setEntrega(updated);
      if (window.falarRodovar) {
        window.falarRodovar(`Avaliação registrada com sucesso! Viagem do motorista classificada como ${rating === 'boa' ? 'boa' : 'ruim'}.`);
      }
    } catch (e: any) {
      console.error('Error saving trip rating:', e);
    }
  };

  const handleRateCliente = (rating: 'boa' | 'ruim') => {
    if (!entrega) return;
    try {
      const updated = saveEntrega({
        id: entrega.id,
        avaliacao_cliente: rating
      });
      setEntrega(updated);
      if (window.falarRodovar) {
        window.falarRodovar(`Avaliação registrada com sucesso! Desempenho do cliente classificado como ${rating === 'boa' ? 'boa' : 'ruim'}.`);
      }
    } catch (e: any) {
      console.error('Error saving client rating:', e);
    }
  };

  // Load latest values with live subscription
  useEffect(() => {
    const handleSyncChange = () => {
      const details = getEntregaById(entregaId);
      if (details) {
        if (!details.trackingCode) {
          // Enforce auto-generation and immediately save the newly stamped object
          const healed = saveEntrega(details);
          setEntrega(healed);
          setLocLinkInput(healed.link_localizacao || '');
        } else {
          setEntrega(details);
          setLocLinkInput(details.link_localizacao || '');
        }
      }
    };

    handleSyncChange();
    window.addEventListener('rodovar_realtime_event', handleSyncChange);

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

    return () => {
      window.removeEventListener('rodovar_realtime_event', handleSyncChange);
    };
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

    if (newStatus === 'coletando' && (!updated.link_localizacao || !updated.link_localizacao.trim().startsWith('http'))) {
      setShowDetailsLocModal(true);
    }

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

  const getGreetingText = (): string => {
    const hr = new Date().getHours();
    if (hr >= 5 && hr < 12) return 'Bom dia';
    if (hr >= 12 && hr < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  // Preset WhatsApp templates (humanized, short, natural and popular phrasing to avoid spam flags and feel trustful)
  const waTemplates = {
    apresentar: `${getGreetingText()}, ${entrega.motorista}! Tudo bem? Aqui é o ${getActiveUserFullName()} da Rodovar. Vim desejar uma excelente viagem até ${entrega.destino} e informar que sua carga já foi registrada como Coletando no nosso sistema. Tamo junto!`,
    solicitarLoc: `${getGreetingText()}, ${entrega.motorista}! Tudo bem? Por gentileza, quando puder, nos envie sua localização atualizada para realizarmos o acompanhamento da viagem. Muito obrigado!`,
    informarCliente: `${getGreetingText()}, tudo bem? Aqui é o ${getActiveUserFullName()} da Rodovar. Passando para informar de maneira respeitosa que sua carga já está em trânsito com o motorista ${entrega.motorista}. A previsão estimada de entrega é para o dia ${formatDateBR(entrega.prazo)}. Qualquer dúvida estou à inteira disposição!`,
    solicitarCanhoto: `${getGreetingText()}, ${entrega.motorista}! Tudo bem? Assim que você finalizar o descarrego, por gentileza nos envie uma foto nítida do canhoto assinado para darmos baixa no sistema. Excelente trabalho!`,
    confirmarEntrega: `${getGreetingText()}, tudo bem? Confirmamos que a entrega da sua carga foi realizada com sucesso pelo motorista ${entrega.motorista} na data de hoje. Agradecemos imensamente pela parceria de sempre! Rodovar.`,
    prazoMotorista: `${getGreetingText()}, ${entrega.motorista}! Tudo bem? Só para alinhar de forma organizada, a previsão limite para entrega de sua carga em ${entrega.destino} é até o dia ${formatDateBR(entrega.prazo)}. Está tudo sob controle para cumprirmos essa data? Agradeço o retorno!`,
    prazoCliente: `${getGreetingText()}, tudo bem? Aqui é o ${getActiveUserFullName()} da Rodovar. Passando de forma educada para confirmar que a previsão para a entrega de sua mercadoria é o dia ${formatDateBR(entrega.prazo)}. O motorista ${entrega.motorista} segue viagem em conformidade e avisaremos qualquer novidade!`
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

      {/* Bloco de Rastreamento Público (Alteração 2) */}
      <div 
        className="bg-[#121212] border border-[#FFD700]/30 rounded-xl p-4.5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-[0_0_15px_rgba(255,215,0,0.05)]"
        id="tracking-public-block"
      >
        <div className="flex items-center gap-3">
          <div className="bg-[#FFD700]/10 border border-[#FFD700]/20 p-2 rounded-xl text-[#FFD700]">
            <Globe className="w-4 h-4 animate-pulse shrink-0" />
          </div>
          <div>
            <h3 className="text-[10px] uppercase font-mono tracking-widest text-[#FFD700]/80 font-bold leading-none">Rastreio do Cliente</h3>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-sm font-black font-mono text-[#FFD700] tracking-tight bg-black px-2 py-0.5 rounded border border-zinc-900 shadow-inner">
                {entrega.trackingCode || 'Mapeando...'}
              </span>
              <span className="text-[10px] text-zinc-500 font-medium">Link público gerado para compartilhamento</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto" id="tracking-actions-wrap">
          <button
            type="button"
            onClick={copyTrackingToClipboard}
            className="flex-1 md:flex-none px-4 py-2 bg-zinc-950 border border-zinc-800 hover:border-[#FFD700]/35 hover:text-white text-zinc-300 text-xs font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
            id="copy-tracking-code-btn"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-extrabold">Copiado!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>Copiar Código</span>
              </>
            )}
          </button>

          <a
            href={`/rastrear?code=${entrega.trackingCode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 md:flex-none px-4 py-2 bg-[#FFD700] hover:bg-[#FFE042] text-[#0a0a0a] text-xs font-black uppercase rounded-lg transition-all transform hover:scale-[1.02] cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
            id="open-client-tracking-link"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span>Abrir Link do Cliente</span>
          </a>
        </div>
      </div>

      {/* ALERTA AUTOMÁTICO CRÍTICO: FALTA LOCALIZAÇÃO NA COLETA */}
      {entrega.status === 'coletando' && (!entrega.link_localizacao || !entrega.link_localizacao.trim().startsWith('http')) && (
        <div 
          className="bg-red-950/25 border-2 border-red-500/40 rounded-xl p-5 shadow-[0_0_20px_rgba(239,68,68,0.08)] relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-5"
          id="operator-loc-coleta-alert-box"
        >
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-red-500/10 blur-2xl rounded-full pointer-events-none" />
          
          <div className="flex items-start gap-4 z-10 w-full md:w-auto" id="alert-text-wrapper-coleta">
            <div className="bg-red-500/20 border border-red-500/35 p-2.5 rounded-xl text-red-500 shrink-0 flex items-center justify-center shadow-lg">
              <AlertTriangle className="w-5 h-5 shrink-0 animate-bounce text-red-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs uppercase font-mono tracking-widest text-[#FFD600] font-black leading-none flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                ⚠️ ALERTA DE QUALIDADE: PEDIR LOCALIZAÇÃO AO CLIENTE!
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed max-w-xl font-sans">
                O motorista <strong className="text-white font-black">{entrega.motorista}</strong> está coletando a carga, mas você ainda <strong>não registrou a localização exata de entrega</strong> do cliente <strong className="text-[#FFD600] font-black">{entrega.cliente}</strong>. Solicite agora via WhatsApp!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const cleanPhone = (entrega.tel_cliente || '').replace(/\D/g, '');
              const clientName = entrega.cliente || 'Parceiro';
              const msg = `Olá ${clientName}! Sou o ${getActiveUserFullName()} da Rodovar. Nosso motorista ${entrega.motorista} já está iniciando a coleta da sua mercadoria com destino a ${entrega.destino}. Por favor, envie-nos o link exato da sua localização de entrega no Google de forma a garantir que o motorista faça a entrega com máxima precisão e rapidez. Muito obrigado!`;
              const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`;
              window.open(url, '_blank', 'noreferrer,noopener');
            }}
            className="w-full md:w-auto px-5 py-3 bg-[#FFD600] hover:bg-[#ffe23b] text-black text-xs font-black uppercase rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(255,214,0,0.25)] z-10 shrink-0 font-mono"
            id="notify-coleta-request-btn"
          >
            <MessageSquare className="w-4 h-4 text-black" />
            <span>COBRAR VIA WHATSAPP</span>
          </button>
        </div>
      )}

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
                  <option value="descarregando" className="bg-zinc-950 text-purple-400">Descarregando 🏢</option>
                  <option value="entregue" className="bg-zinc-950 text-emerald-400">Entregue ✅</option>
                </select>
              </div>
            </div>

            {/* Grid structure for details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              
              {/* Box Driver */}
              <div className="bg-zinc-950/50 p-4 border border-zinc-900 rounded-xl space-y-4">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] flex items-center gap-1.5 font-bold">
                  <User className="w-4 h-4" />
                  Motorista Credenciado
                </span>
                
                <div className="space-y-1 font-sans pb-2 border-b border-zinc-900/40">
                  <p className="text-sm font-bold text-gray-200">{entrega.motorista}</p>
                  {entrega.cpf_motorista && (
                    <p className="text-[10px] font-mono text-zinc-500">
                      CPF: <span className="text-zinc-400">{entrega.cpf_motorista}</span>
                    </p>
                  )}
                  <p className="text-xs text-gray-400 font-mono flex items-center gap-1 mt-1">
                    <Phone className="w-3.5 h-3.5 text-gray-500" />
                    +55 {entrega.tel_motorista}
                  </p>
                </div>

                {/* Índice de Competência do Motorista - Model Rodovar */}
                <div className="space-y-2 font-sans pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-zinc-550 uppercase font-bold text-[9px]">Índice de Competência</span>
                    <span className={`font-mono font-black ${
                      ratingStats.indice >= 80 ? 'text-emerald-400' : ratingStats.indice >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {ratingStats.total === 0 ? 'SEM HISTÓRICO' : `${ratingStats.indice}% BOA`}
                    </span>
                  </div>

                  {/* Rating indicator progress bar */}
                  <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-350 ${
                        ratingStats.indice >= 80 ? 'bg-emerald-500' : ratingStats.indice >= 50 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${ratingStats.indice}%` }}
                    />
                  </div>

                  {ratingStats.total > 0 && (
                    <div className="text-[9px] text-zinc-500 font-mono flex justify-between">
                      <span>{ratingStats.boas} viagem(ns) boa(s)</span>
                      <span>{ratingStats.ruins} viagem(ns) ruim(ns)</span>
                    </div>
                  )}

                  {/* Rating Selector buttons */}
                  <div className="pt-2 space-y-1">
                    <span className="text-[9px] uppercase font-mono font-extrabold text-zinc-500 block">Julgar Desempenho:</span>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => handleRateViagem('boa')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold font-mono tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1 border ${
                          entrega.avaliacao_viagem === 'boa'
                            ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400 font-black'
                            : 'bg-zinc-900/35 border-zinc-850 text-zinc-400 hover:text-white hover:border-zinc-700'
                        }`}
                        id={`btn-rate-boa-${entrega.id}`}
                      >
                        👍 Viagem Boa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRateViagem('ruim')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold font-mono tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1 border ${
                          entrega.avaliacao_viagem === 'ruim'
                            ? 'bg-red-950/40 border-red-500 text-red-500 font-black'
                            : 'bg-zinc-900/35 border-zinc-850 text-zinc-400 hover:text-white hover:border-zinc-700'
                        }`}
                        id={`btn-rate-ruim-${entrega.id}`}
                      >
                        👎 Viagem Ruim
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Box Client */}
              <div className="bg-zinc-950/50 p-4 border border-zinc-900 rounded-xl space-y-3">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] flex items-center gap-1.5 font-bold">
                  <ShoppingBag className="w-4 h-4" />
                  Cliente Destinatário
                </span>
                
                <div className="space-y-1 font-sans pb-2 border-b border-zinc-900/40">
                  <p className="text-sm font-bold text-gray-200">{entrega.cliente}</p>
                  {entrega.cpf_cnpj_cliente && (
                    <p className="text-[10px] font-mono text-zinc-500">
                      CPF/CNPJ: <span className="text-zinc-400">{entrega.cpf_cnpj_cliente}</span>
                    </p>
                  )}
                  <p className="text-xs text-gray-400 font-mono flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-gray-500" />
                    +55 {entrega.tel_cliente}
                  </p>
                </div>

                {/* Índice de Competência do Cliente */}
                <div className="space-y-2 font-sans pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-zinc-500 uppercase font-bold text-[9px]">Índice de Competência</span>
                    <span className={`font-mono font-black ${
                      clientRatingStats.indice >= 80 ? 'text-emerald-400' : clientRatingStats.indice >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {clientRatingStats.total === 0 ? 'SEM HISTÓRICO' : `${clientRatingStats.indice}% BOA`}
                    </span>
                  </div>

                  {/* Rating indicator progress bar */}
                  <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-350 ${
                        clientRatingStats.indice >= 80 ? 'bg-emerald-500' : clientRatingStats.indice >= 50 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${clientRatingStats.indice}%` }}
                    />
                  </div>

                  {clientRatingStats.total > 0 && (
                    <div className="text-[9px] text-zinc-500 font-mono flex justify-between">
                      <span>{clientRatingStats.boas} viagem(ns) boa(s)</span>
                      <span>{clientRatingStats.ruins} viagem(ns) ruim(ns)</span>
                    </div>
                  )}

                  {/* Rating Selector buttons */}
                  <div className="pt-2 space-y-1">
                    <span className="text-[9px] uppercase font-mono font-extrabold text-zinc-500 block">Julgar Desempenho:</span>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => handleRateCliente('boa')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold font-mono tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1 border ${
                          entrega.avaliacao_cliente === 'boa'
                            ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400 font-black'
                            : 'bg-zinc-900/35 border-zinc-850 text-zinc-400 hover:text-white hover:border-zinc-700'
                        }`}
                        id={`btn-rate-client-boa-${entrega.id}`}
                      >
                        👍 Cliente Bom
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRateCliente('ruim')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold font-mono tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1 border ${
                          entrega.avaliacao_cliente === 'ruim'
                            ? 'bg-red-950/40 border-red-500 text-red-500 font-black'
                            : 'bg-zinc-900/35 border-zinc-850 text-zinc-400 hover:text-white hover:border-zinc-700'
                        }`}
                        id={`btn-rate-client-ruim-${entrega.id}`}
                      >
                        👎 Cliente Ruim
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Box Dates */}
              <div className="bg-zinc-950/55 p-4 border border-zinc-900 rounded-xl space-y-3">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] flex items-center gap-1.5 font-bold">
                  <Calendar className="w-4 h-4" />
                  Datas e Agendamento
                </span>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-gray-400 font-mono block uppercase text-[9.5px] font-bold">DATA COLETA</span>
                    <span className="text-gray-200 font-mono font-bold text-[16px] block mt-1 bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-xl w-fit">
                      {formatDateBR(entrega.data_coleta)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#FFD600] font-mono block uppercase text-[9.5px] font-black">PRAZO LIMITE</span>
                    <span className="text-[#FFD600] font-mono font-black text-[18px] block mt-1 bg-[#FFD600]/15 border-2 border-[#FFD600] px-3 py-1 rounded-xl w-fit shadow-[0_0_15px_rgba(255,214,0,0.15)] animate-pulse">
                      {formatDateBR(entrega.prazo)}
                    </span>
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
              {/* Box Valores e Custos de Frete */}
              <div className="bg-zinc-950/50 p-5 border border-zinc-900 rounded-xl space-y-4 sm:col-span-2">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-[#FFD600]" />
                    Valores e Custos do Frete
                  </span>
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                  {/* Frete empresa */}
                  <div className="bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/40">
                    <span className="text-zinc-500 font-mono block uppercase text-[10px] tracking-wider mb-1 font-bold">FRETE EMPRESA (FRETE EMP.)</span>
                    <span className="text-emerald-400 font-mono font-bold text-lg block leading-none">
                      {entrega.frete_empresa ? `R$ ${Number(entrega.frete_empresa).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00'}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono block mt-1">Receita de Faturamento</span>
                  </div>

                  {/* Frete motorista */}
                  <div className="bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/40">
                    <span className="text-zinc-500 font-mono block uppercase text-[10px] tracking-wider mb-1 font-bold">FRETE MOTORISTA (FRETE MOT.)</span>
                    <span className="text-orange-400 font-mono font-bold text-lg block leading-none">
                      {entrega.frete_motorista ? `R$ ${Number(entrega.frete_motorista).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00'}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono block mt-1">Custo de Operação Repassado</span>
                  </div>
                </div>
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

              {/* Painel Profissional de Documentos da Ficha do Motorista */}
              <div className="bg-zinc-950/50 p-5 border border-zinc-900 rounded-xl space-y-4 sm:col-span-2 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-900 pb-3">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] flex items-center gap-1.5 font-bold">
                      <Paperclip className="w-4 h-4 text-[#FFD600]" />
                      Documentos Anexados nesta Ficha (MDF-e, CT-e, Canhoto)
                    </span>
                    <p className="text-[10px] text-zinc-500 font-sans">Controle e rastreabilidade total de documentos por rota</p>
                  </div>
                  
                  {/* Selector of Type & File Input */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={newDocType}
                      onChange={(e) => setNewDocType(e.target.value as any)}
                      className="bg-zinc-900 border border-zinc-800 text-white rounded px-2.5 py-1 text-xs focus:border-[#FFD600] focus:ring-1 focus:ring-[#FFD600] outline-none"
                    >
                      <option value="MDFE">MDF-e</option>
                      <option value="CTE">CT-e</option>
                      <option value="CANHOTO">Canhoto</option>
                      <option value="OUTROS">Outros</option>
                    </select>

                    <label className="flex items-center gap-1 bg-[#FFD600] text-black px-2.5 py-1 text-xs font-bold rounded cursor-pointer hover:bg-yellow-400 select-none transition-all">
                      <Plus className="w-3.5 h-3.5" />
                      Anexar Arquivo
                      <input
                        type="file"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>
                </div>

                {docUploadError && (
                  <p className="text-[10px] text-red-500 font-mono font-bold">{docUploadError}</p>
                )}

                {/* Document List */}
                {!entrega.documentos || entrega.documentos.length === 0 ? (
                  <div className="text-center py-6 text-zinc-650 bg-zinc-900/10 border border-dashed border-zinc-850 rounded-lg">
                    <p className="font-sans text-[11px]">Nenhum documento (MDF-e, CT-e ou Canhoto) anexado a esta ficha de motorista.</p>
                    <p className="text-[9px] font-mono mt-0.5 text-zinc-600">Selecione o tipo ao lado e clique em "Anexar Arquivo" para anexar documentos reais.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {entrega.documentos.map((doc) => {
                      const badgeColors: Record<string, string> = {
                        MDFE: 'text-amber-400 bg-amber-950/40 border-amber-900/30',
                        CTE: 'text-indigo-400 bg-indigo-950/40 border-indigo-900/30',
                        CANHOTO: 'text-emerald-400 bg-emerald-950/40 border-emerald-900/30',
                        OUTROS: 'text-zinc-400 bg-zinc-900 border-zinc-800'
                      };

                      return (
                        <div key={doc.id} className="bg-zinc-900/40 border border-zinc-850 p-3 rounded-lg flex flex-col justify-between gap-3 hover:border-zinc-700 transition-all">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[8px] font-mono uppercase px-1 py-0.2 rounded border font-black ${badgeColors[doc.tipo] || badgeColors.OUTROS}`}>
                                  {doc.tipo}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-500">{doc.tamanho || 'Visualizar'}</span>
                              </div>
                              <p className="text-xs font-bold text-gray-200 line-clamp-1" title={doc.nome}>
                                {doc.nome}
                              </p>
                              <span className="text-[9px] text-zinc-500 font-mono block">
                                Anexado {formatTimestamp(doc.dataAnexado)}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="text-zinc-600 hover:text-red-400 transition p-1 rounded hover:bg-red-950/10 cursor-pointer"
                              title="Remover anexo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="border-t border-zinc-800/40 pt-2 flex items-center justify-between gap-1 flex-wrap">
                            {doc.conteudoBase64 ? (
                              <a
                                href={doc.conteudoBase64}
                                download={doc.nome}
                                className="text-[10px] font-bold text-gray-400 hover:text-[#FFD600] flex items-center gap-1 transition-colors"
                              >
                                📥 Baixar Arquivo
                              </a>
                            ) : (
                              <span className="text-[9px] text-zinc-650 font-mono">Download indisponível</span>
                            )}

                            {/* Compartilhar WhatsApp Dropdown options */}
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[9px] text-zinc-500 font-mono mr-0.5">Compartilhar:</span>
                              <button
                                type="button"
                                onClick={() => handleShareDocument(doc, 'motorista')}
                                className="px-1.5 py-0.5 bg-zinc-800 hover:bg-[#FFD600] text-gray-400 hover:text-black font-semibold text-[9px] rounded uppercase font-mono tracking-wider transition-colors cursor-pointer"
                                title="Enviar para o Motorista"
                              >
                                MOT
                              </button>
                              <button
                                type="button"
                                onClick={() => handleShareDocument(doc, 'cliente')}
                                className="px-1.5 py-0.5 bg-zinc-800 hover:bg-[#FFD600] text-gray-400 hover:text-black font-semibold text-[9px] rounded uppercase font-mono tracking-wider transition-colors cursor-pointer"
                                title="Enviar para o Cliente"
                              >
                                CLI
                              </button>
                              <button
                                type="button"
                                onClick={() => handleShareDocument(doc, 'outro')}
                                className="px-1.5 py-0.5 bg-zinc-800 hover:bg-[#FFD600] text-gray-300 hover:text-black font-bold text-[9px] rounded transition-colors cursor-pointer"
                                title="Digitar outro número de destino"
                              >
                                <Share2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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

          {/* Action block - Jairo's Quick Messages panel (Only for jairobahia!) */}
          {isUserJairo() ? (
            <div className="bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm animate-fade-in">
              <div className="flex justify-between items-center border-b border-zinc-950 pb-2">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] font-bold">
                  MENSAGENS DE JAIRO (SCRIPTS WHATSAPP)
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

              <div className="space-y-2 text-xs max-h-[550px] overflow-y-auto pr-1">
                {renderScriptButton('apresentar', '1. Apresentar ao Motorista', entrega.tel_motorista, waTemplates.apresentar, `Olá ${entrega.motorista}! Aqui é o ${getActiveUserName()}...`)}
                {renderScriptButton('solicitarLoc', '2. Solicitar Localização', entrega.tel_motorista, waTemplates.solicitarLoc, 'Poderia me enviar sua localização ao vivo?')}
                {renderScriptButton('informarCliente', '3. Informar Cliente', entrega.tel_cliente, waTemplates.informarCliente, `Sua carga está a caminho...`)}
                {renderScriptButton('solicitarCanhoto', '4. Solicitar Canhoto', entrega.tel_motorista, waTemplates.solicitarCanhoto, 'Após a entrega solicite o canhoto assinado...', true)}
                {renderScriptButton('confirmarEntrega', '5. Entrega Confirmada', entrega.tel_cliente, waTemplates.confirmarEntrega, `Confirmamos a entrega pelo motorista ${entrega.motorista}.`)}
                
                {/* New deadline alignment scripts */}
                {renderScriptButton('prazoMotorista', '6. Alinhar Prazo (Motorista)', entrega.tel_motorista, waTemplates.prazoMotorista, `Prazo limite de recebimento: ${formatDateBR(entrega.prazo)}.`)}
                {renderScriptButton('prazoCliente', '7. Alinhar Prazo (Cliente)', entrega.tel_cliente, waTemplates.prazoCliente, `Confirmando prazo estimado de entrega: ${formatDateBR(entrega.prazo)}.`)}
              </div>
            </div>
          ) : (
            <div className="bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-3 shadow-sm text-center">
              <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-550 font-bold block border-b border-zinc-900 pb-2">
                SCRIPTS WHATSAPP INDISPONÍVEIS
              </span>
              <p className="text-[10px] text-zinc-500 font-sans leading-relaxed m-0 text-left">
                Os scripts pré-definidos de conversa do WhatsApp são ferramentas exclusivas de controle para a equipe de <strong>Operadores</strong> (Jairo Bahia).
              </p>
              <div className="bg-zinc-950 p-2.5 rounded border border-zinc-900 text-left text-[11px]">
                <p className="font-mono text-zinc-400 m-0">Perfil logado:</p>
                <p className="font-bold text-[#FFD600] uppercase font-sans mt-0.5 m-0">{getActiveUserName()} ({getActiveUserRole()})</p>
              </div>
            </div>
          )}

          {/* Botão Support / Escalabilidade para todos os cargos relevantes */}
          {onNavigateToManager && (
            <button
              type="button"
              onClick={() => onNavigateToManager(entrega.id)}
              className="w-full text-left p-3.5 rounded-lg bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 hover:border-red-500/50 transition group cursor-pointer"
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

      {showDetailsLocModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in" id="details-loc-reminder-overlay">
          <div className="bg-[#0c0c0c] border-2 border-amber-500/50 rounded-2xl max-w-md w-full p-6 shadow-[0_0_50px_rgba(245,158,11,0.2)] space-y-6 relative overflow-hidden" id="details-loc-reminder-container">
            <div className="absolute -top-16 -right-16 w-32 h-32 bg-amber-500/10 blur-2xl rounded-full pointer-events-none" />
            
            <div className="flex items-start gap-4">
              <div className="bg-amber-500/20 border border-amber-500/40 p-3 rounded-xl text-[#FFD600] shrink-0 animate-bounce">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1.5 flex-1">
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-black block">
                  🛡️ CONTROLE DE FLUXO RODOVAR
                </span>
                <h3 className="text-sm font-black uppercase text-white font-mono tracking-wide leading-tight">
                  PEDIR LOGÍSTICA DE LOCALIZAÇÃO!
                </h3>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 space-y-3.5 text-xs text-zinc-300 font-sans">
              <p className="leading-relaxed">
                Você definiu a carga como <strong>"Coletando"</strong>. Quando o motorista inicia a coleta, é o momento perfeito para cobrar a localização de entrega do cliente para que o sistema trace a rota automaticamente.
              </p>
              <div className="border-t border-zinc-900 pt-3 flex flex-col gap-2 font-mono text-[11px]">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-zinc-500 font-bold uppercase text-[9px]">Cliente:</span>
                  <span className="text-[#FFD600] font-black truncate max-w-[200px]">{entrega.cliente}</span>
                </div>
                {entrega.tel_cliente && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-zinc-500 font-bold uppercase text-[9px]">Telefone:</span>
                    <span className="text-zinc-300 font-semibold">{entrega.tel_cliente}</span>
                  </div>
                )}
                <div className="flex justify-between items-center gap-2">
                  <span className="text-zinc-500 font-bold uppercase text-[9px]">Entrega Destino:</span>
                  <span className="text-zinc-350 truncate max-w-[200px]">{entrega.destino}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] text-zinc-400 font-medium leading-relaxed font-sans">
                Clique abaixo para enviar agora no WhatsApp do cliente o pedido formal de link de localização do estabelecimento.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDetailsLocModal(false)}
                  className="w-full sm:flex-1 py-3 px-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-white transition rounded-xl font-mono text-xs font-black uppercase cursor-pointer text-center"
                  id="details-reminder-proceed-without-btn"
                >
                  Fechar alerta
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    const cleanPhone = (entrega.tel_cliente || '').replace(/\D/g, '');
                    const clientName = entrega.cliente || 'Parceiro';
                    const msg = `Olá ${clientName}! Sou o ${getActiveUserFullName()} da Rodovar. Nosso motorista ${entrega.motorista} já está iniciando a coleta da sua mercadoria com destino a ${entrega.destino}. Por favor, envie-nos o link exato da sua localização de entrega no Google de forma a garantir que o motorista faça a entrega com máxima precisão e rapidez. Muito obrigado!`;
                    const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`;
                    window.open(url, '_blank', 'noreferrer,noopener');
                    setShowDetailsLocModal(false);
                  }}
                  className="w-full sm:flex-1 py-3 px-4 bg-[#FFD600] hover:bg-[#ffe23b] text-black transition rounded-xl font-mono text-xs font-black uppercase cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(255,214,0,0.25)]"
                  id="details-reminder-whatsapp-request-btn"
                >
                  <MessageSquare className="w-4 h-4 shrink-0 text-black" />
                  <span>Pedir via WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
