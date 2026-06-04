import { useState, useEffect } from 'react';
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
  Lock
} from 'lucide-react';
import DeliveryMap from './DeliveryMap';

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

  // Load latest values
  useEffect(() => {
    const details = getEntregaById(entregaId);
    if (details) {
      setEntrega(details);
      setLocLinkInput(details.link_localizacao || '');
    }
  }, [entregaId]);

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
      setTimeout(() => setShowSaveSuccess(false), 3000);
    }, 450);
  };

  const handleUpdateStatus = (newStatus: DeliveryStatus) => {
    const updated = saveEntrega({
      id: entrega.id,
      status: newStatus
    });
    setEntrega(updated);
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
    confirmarEntrega: `Olá! Confirmamos a entrega da sua carga realizada pelo motorista ${entrega.motorista}. Foi um prazer atendê-lo! Rodovar Transportadora.`
  };

  const handleSolicitarCanhotoClick = () => {
    // 1. Update database flag
    const updated = saveEntrega({
      id: entrega.id,
      canhoto_solicitado: true
    });
    setEntrega(updated);
    
    // 2. Fire WhatsApp template
    clickWhatsApp(entrega.tel_motorista, waTemplates.solicitarCanhoto);
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

        {/* Editar Dados button removed */}
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
                <span className="text-[10px] font-mono text-gray-500 flex items-center gap-1.5 uppercase font-bold">
                  <Lock className="w-3 h-3 text-[#FFD600]" />
                  STATUS DA CARGA (Bloqueado)
                </span>
                <select
                  value={entrega.status}
                  onChange={(e) => handleUpdateStatus(e.target.value as DeliveryStatus)}
                  disabled={true}
                  className={`px-3 py-1.5 text-xs font-bold font-sans rounded-lg border-2 focus:ring-0 focus:outline-none opacity-80 cursor-not-allowed ${statusColors[entrega.status]}`}
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

        </div>

        {/* Right Column: Pre-made messages to Whatsapp AND Map Pin Preview references */}
        <div className="lg:col-span-4 space-y-6">

          {/* Action block - Jairo's Quick Messages panel */}
          <div className="bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
            <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFD600] font-bold block border-b border-zinc-950 pb-2">
              MENSARENS DO JAIRO (WHATSAPP ESPELHADAS)
            </span>
            
            <p className="text-[11px] text-gray-500 font-sans">
              Envie mensagens rápidas de status direto para o WhatsApp dos contatos envolvidos na rota:
            </p>

            <div className="space-y-2 text-xs">
              
              {/* Botão 1 */}
              <button
                onClick={() => clickWhatsApp(entrega.tel_motorista, waTemplates.apresentar)}
                className="w-full text-left p-3 rounded-lg bg-zinc-950/40 hover:bg-[#FFD600]/10 border border-zinc-900 hover:border-[#FFD600]/40 transition group cursor-pointer"
                id="details-wa-btn-1"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-[#FFD600] text-[11px]">1. Apresentar ao Motorista</span>
                  <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-[#FFD600]" />
                </div>
                <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
                  "Olá {entrega.motorista}! Aqui é o Jairo..."
                </p>
              </button>

              {/* Botão 2 */}
              <button
                onClick={() => clickWhatsApp(entrega.tel_motorista, waTemplates.solicitarLoc)}
                className="w-full text-left p-3 rounded-lg bg-zinc-950/40 hover:bg-[#FFD600]/10 border border-zinc-900 hover:border-[#FFD600]/40 transition group cursor-pointer"
                id="details-wa-btn-2"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-[#FFD600] text-[11px]">2. Solicitar Localização</span>
                  <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-[#FFD600]" />
                </div>
                <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
                  "Poderia me enviar sua localização ao vivo?"
                </p>
              </button>

              {/* Botão 3 */}
              <button
                onClick={() => clickWhatsApp(entrega.tel_cliente, waTemplates.informarCliente)}
                className="w-full text-left p-3 rounded-lg bg-zinc-950/40 hover:bg-[#FFD600]/10 border border-zinc-900 hover:border-[#FFD600]/40 transition group cursor-pointer"
                id="details-wa-btn-3"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-[#FFD600] text-[11px]">3. Informar Cliente</span>
                  <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-[#FFD600]" />
                </div>
                <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
                  "Sua carga está a caminho de {entrega.destino}..."
                </p>
              </button>

              {/* Botão 4 */}
              <button
                onClick={handleSolicitarCanhotoClick}
                className={`w-full text-left p-3 rounded-lg border transition group cursor-pointer ${
                  entrega.canhoto_solicitado 
                  ? 'bg-zinc-900 border-emerald-950 text-emerald-400 grayscale-35' 
                  : 'bg-zinc-950/40 hover:bg-[#FFD600]/10 border-zinc-900 hover:border-[#FFD600]/40 text-white'
                }`}
                id="details-wa-btn-4"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className={`font-bold text-[11px] ${entrega.canhoto_solicitado ? 'text-emerald-400' : 'text-[#FFD600]'}`}>
                    4. Solicitar Canhoto {entrega.canhoto_solicitado ? '✓' : ''}
                  </span>
                  <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-[#FFD600]" />
                </div>
                <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
                  "Após a entrega solicite o canhoto assinado..."
                </p>
              </button>

              {/* Botão 5 */}
              <button
                onClick={() => clickWhatsApp(entrega.tel_cliente, waTemplates.confirmarEntrega)}
                className="w-full text-left p-3 rounded-lg bg-zinc-950/40 hover:bg-[#FFD600]/10 border border-zinc-900 hover:border-[#FFD600]/40 transition group cursor-pointer"
                id="details-wa-btn-5"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-[#FFD600] text-[11px]">5. Entrega Confirmada</span>
                  <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-[#FFD600]" />
                </div>
                <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
                  "Confirmamos a entrega pelo motorista {entrega.motorista}."
                </p>
              </button>

              {/* Botão 6 / Suporte Gerencial Genivaldo */}
              {onNavigateToManager && (
                <button
                  type="button"
                  onClick={() => onNavigateToManager(entrega.id)}
                  className="w-full text-left p-3.5 rounded-lg bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 hover:border-red-500/50 transition group cursor-pointer mt-2"
                  id="details-report-manager-btn"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-red-400 text-[11px] uppercase tracking-wider flex items-center gap-1">
                      🚨 Relatar ao Gerente Genivaldo
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-red-500 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
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
