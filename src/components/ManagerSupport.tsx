import { useState, useMemo, useEffect } from 'react';
import { Entrega } from '../types';
import { 
  User, 
  Truck, 
  AlertTriangle, 
  MessageSquare, 
  Send,
  CheckCircle,
  MapPin,
  Clock,
  Phone,
  Shield,
  Search,
  ChevronRight
} from 'lucide-react';
import { motion } from 'motion/react';

interface ManagerSupportProps {
  entregas: Entrega[];
  initialEntregaId?: string;
}

const COMMON_ISSUES = [
  {
    id: 'atraso_coleta',
    title: 'Atraso na Coleta',
    description: 'Veículo aguardando há muito tempo para coletar ou mercadoria sem liberação.',
    template: 'Atraso crítico na coleta da carga. O motorista está aguardando liberação no local e precisa de agilidade.'
  },
  {
    id: 'posto_fiscal',
    title: 'Parada em Posto Fiscal',
    description: 'Nota fiscal travada, problemas tributários ou retenção pela fiscalização.',
    template: 'Carga retida ou parada no Posto Fiscal. Há necessidade de checagem tributária ou envio de novos documentos.'
  },
  {
    id: 'problema_mecanico',
    title: 'Quebra Mecânica / Acidente',
    description: 'Problemas de motor, pneu, falhas de tração ou ocorrências de estrada.',
    template: 'O veículo sofreu uma quebra mecânica na rota. O motorista precisa de suporte emergencial ou auxílio para guincho/socorro.'
  },
  {
    id: 'motorista_sumiu',
    title: 'Incomunicável / Sem sinal',
    description: 'Rastreador inativo, celular desligado ou sem atualização de status na rota.',
    template: 'Motorista está sem sinal de celular ou rastreador há horas. Não conseguimos contato para atualização do status.'
  },
  {
    id: 'recusa_carga',
    title: 'Recusa no Destinatário',
    description: 'Cliente se recusa a receber o material por avaria, atraso ou falta de NF.',
    template: 'Dificuldade na entrega! O destinatário apresentou recusa de recebimento. Precisamos de orientação urgente com a gerência.'
  },
  {
    id: 'ajuste_pix',
    title: 'Pix / Adiantamento Pendente',
    description: 'Motorista aguardando liberação de valores de pedágio ou diesel para seguir rota.',
    template: 'Motorista solicitou atualização ou adiantamento financeiro emergencial (Pix/Pedágio) para seguir viagem.'
  }
];

export default function ManagerSupport({ entregas, initialEntregaId }: ManagerSupportProps) {
  const [selectedEntregaId, setSelectedEntregaId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIssueId, setSelectedIssueId] = useState<string>('');
  const [customProblemText, setCustomProblemText] = useState<string>('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-select initial delivery if provided
  useEffect(() => {
    if (initialEntregaId) {
      setSelectedEntregaId(initialEntregaId);
    }
  }, [initialEntregaId]);

  // Find currently selected cargo object
  const activeEntrega = useMemo(() => {
    return entregas.find(e => e.id === selectedEntregaId) || null;
  }, [selectedEntregaId, entregas]);

  // Filter list of deliveries in dropdown
  const filteredDeliveries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return entregas.filter(e => e.status !== 'entregue').slice(0, 5); // Default to recent undelivered items
    return entregas.filter(e => 
      e.cliente.toLowerCase().includes(q) ||
      e.motorista.toLowerCase().includes(q) ||
      e.destino.toLowerCase().includes(q) ||
      e.vendedor.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [entregas, searchQuery]);

  // Trigger when a preset issue card is clicked
  const handleSelectIssue = (issueId: string, templateText: string) => {
    setSelectedIssueId(issueId);
    setCustomProblemText(templateText);
  };

  // Compile final message preview formatted beautifully for Genivaldo
  const compiledMessage = useMemo(() => {
    let msg = `*RÁPIDA OPERACIONAL - RO DOVAR MONITORA*\n`;
    msg += `*FALAR COM GERENTE GENIVALDO*\n`;
    msg += `-------------------------------------------\n\n`;
    
    if (activeEntrega) {
      msg += `Route Details:\n`;
      msg += `👤 *Cliente:* ${activeEntrega.cliente} (Atendente: ${activeEntrega.vendedor})\n`;
      msg += `📞 *Tel Cliente:* ${activeEntrega.tel_cliente || 'Não cadastrado'}\n`;
      msg += `🚚 *Motorista:* ${activeEntrega.motorista}\n`;
      msg += `📱 *Tel Motorista:* ${activeEntrega.tel_motorista || 'Não cadastrado'}\n`;
      msg += `📍 *Trajeto:* ${activeEntrega.origem} ➔ ${activeEntrega.destino}\n`;
      msg += `⏰ *Prazo Limite:* ${activeEntrega.prazo}\n`;
      msg += `📦 *Status Atual:* ${
        activeEntrega.status === 'em_transito' ? 'TRÂNSITO 🚚' :
        activeEntrega.status === 'parado' ? 'PARADO 🛑' :
        activeEntrega.status === 'coletando' ? 'COLETANDO 📦' : 'ENTREGUE ✅'
      }\n`;
      if (activeEntrega.link_localizacao) {
        msg += `🔗 *Localização:* ${activeEntrega.link_localizacao}\n`;
      }
      msg += `\n`;
    } else {
      msg += `⚠️ _Nenhuma carga associada (problema geral ou pendência fora de rota específica)._\n\n`;
    }

    const selectedIssueObj = COMMON_ISSUES.find(i => i.id === selectedIssueId);
    if (selectedIssueObj) {
      msg += `🚨 *Tipo de Problema:* ${selectedIssueObj.title}\n`;
    }

    msg += `📝 *Relato da Situação:*\n`;
    msg += `"${customProblemText || 'Aguardando detalhamento do operador...'}"\n\n`;
    msg += `-------------------------------------------\n`;
    msg += `_Solicitado auxílio imediato para tomada de decisão._\n`;
    msg += `_Painel Rodovar Monitora - ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}_`;

    return msg;
  }, [activeEntrega, selectedIssueId, customProblemText]);

  // Handle Dispatch to WhatsApp
  const handleSendWhatsApp = () => {
    if (!customProblemText.trim()) {
      setFeedbackMsg({
        type: 'error',
        text: 'Por favor, selecione uma categoria de problema ou digite a descrição do caso antes de enviar.'
      });
      return;
    }

    // Number requested by user: 7199175428 -> country code 55 inserted automatically
    const targetPhone = '557199175428';
    const encodedMessage = encodeURIComponent(compiledMessage);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodedMessage}`;

    // Open WhatsApp in a new window/tab safely bypassing popup blockers
    window.open(whatsappUrl, 'whatsapp');

    setFeedbackMsg({
      type: 'success',
      text: 'Mensagem formatada com sucesso! O redirecionamento para o WhatsApp do Gerente Genivaldo foi iniciado.'
    });

    setTimeout(() => {
      setFeedbackMsg(null);
    }, 4000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans text-white pb-12">
      
      {/* Banner / Header Title */}
      <div className="bg-gradient-to-r from-red-950/20 via-[#161616] to-zinc-950/50 border border-red-500/10 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-center sm:text-left">
          <div className="w-14 h-14 rounded-2xl bg-red-950/40 border border-red-800/40 flex items-center justify-center text-red-400">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black text-[#FFD600] tracking-tight flex items-center gap-2 justify-center sm:justify-start">
              FALAR COM GERENTE: GENIVALDO
            </h2>
            <p className="text-xs text-zinc-400 leading-normal max-w-xl font-sans text-justify mt-1">
              Painel operacional de contingência direto. Relate anomalias, quebras, atrasos fiscais ou recusas imediatamente para a gerência de transporte.
            </p>
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <Phone className="w-4 h-4 text-emerald-400" />
          <div className="text-right">
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Contato Gerência</p>
            <p className="text-xs font-black font-mono text-zinc-100">(71) 99175-4284</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Form Selector (Left Panel) - Column Span 7 */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* STEP 1: SELECT DELIVERIES */}
          <div className="bg-[#121212] border border-zinc-850 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#FFD600] text-black font-mono font-bold flex items-center justify-center text-[10px]">1</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 font-sans">Selecione a Carga Problemática</h3>
              </div>
              {activeEntrega && (
                <button 
                  onClick={() => {
                    setSelectedEntregaId('');
                    setSearchQuery('');
                  }}
                  className="text-[10px] text-zinc-400 hover:text-red-400 font-mono uppercase font-bold"
                >
                  ✖ Desmarcar Carga
                </button>
              )}
            </div>

            {/* Live Search inside dropdown */}
            {!activeEntrega ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Selecione ou busque por Cliente, Motorista ou Cidade..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 pl-10 text-xs font-sans text-zinc-200 placeholder-zinc-500 focus:border-[#FFD600] focus:ring-1 focus:ring-[#FFD600] focus:outline-none transition-all"
                  />
                </div>

                <div className="border border-zinc-900 rounded-xl divide-y divide-zinc-900 overflow-hidden bg-zinc-950/40">
                  {filteredDeliveries.length > 0 ? (
                    filteredDeliveries.map((ent) => (
                      <button
                        key={ent.id}
                        type="button"
                        onClick={() => setSelectedEntregaId(ent.id)}
                        className="w-full text-left p-3 hover:bg-zinc-900/60 transition-colors flex items-center justify-between group cursor-pointer text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-white group-hover:text-[#FFD600] transition-colors">{ent.cliente}</span>
                            <span className="text-[10px] text-zinc-500 font-mono">({ent.motorista})</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
                            <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {ent.destino}</span>
                            <span>•</span>
                            <span className={`px-1 rounded text-[9px] ${
                              ent.status === 'em_transito' ? 'bg-[#FFD600]/10 text-[#FFD600]' :
                              ent.status === 'parado' ? 'bg-red-500/10 text-red-400' :
                              'bg-blue-500/10 text-blue-400'
                            }`}>{ent.status.toUpperCase()}</span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-650 group-hover:translate-x-1 transition-transform" />
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-zinc-500 text-xs">
                      Nenhuma carga encontrada para "{searchQuery}". Você ainda pode relatar pendências gerais abaixo.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Selected Cargo Info Card (High density dashboard block) */
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-mono text-[#FFD600] font-black tracking-widest">Informações Carregadas:</div>
                  <div className="text-sm font-black text-white">{activeEntrega.cliente}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400 font-sans">
                    <span className="flex items-center gap-1">👤 Mot: <strong>{activeEntrega.motorista}</strong></span>
                    <span className="flex items-center gap-1">📍 Destino: <strong>{activeEntrega.destino}</strong></span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500 font-mono">
                    <span>📱 Tel Mot: {activeEntrega.tel_motorista || 'Sem número'}</span>
                    <span>•</span>
                    <span>📱 Tel Cli: {activeEntrega.tel_cliente || 'Sem número'}</span>
                  </div>
                </div>

                <div className="flex sm:flex-col items-end gap-2 shrink-0">
                  <span className={`px-2.5 py-1 text-[10px] font-mono rounded font-bold uppercase border ${
                    activeEntrega.status === 'em_transito' ? 'bg-yellow-950/40 text-[#FFD600] border-yellow-900/30' :
                    activeEntrega.status === 'parado' ? 'bg-red-950/40 text-red-400 border-red-900/30' :
                    'bg-blue-950/40 text-blue-400 border-blue-900/30'
                  }`}>
                    {activeEntrega.status === 'em_transito' ? 'Trânsito 🚚' :
                     activeEntrega.status === 'parado' ? 'Parado 🛑' : 'Coletando 📦'}
                  </span>
                  <div className="text-[10px] text-zinc-500 font-mono">Limite: {activeEntrega.prazo}</div>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: CHOOSE COMMON ISSUES */}
          <div className="bg-[#121212] border border-zinc-850 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#FFD600] text-black font-mono font-bold flex items-center justify-center text-[10px]">2</span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 font-sans">Escolha o Problema de Logística</h3>
            </div>

            {/* Configured Grid issues from specifications */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {COMMON_ISSUES.map((issue) => {
                const isSelected = selectedIssueId === issue.id;
                return (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => handleSelectIssue(issue.id, issue.template)}
                    className={`text-left p-3.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isSelected 
                      ? 'bg-red-950/10 border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.1)]' 
                      : 'bg-zinc-950 hover:bg-zinc-900 border-zinc-850 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className={`text-xs font-bold tracking-tight ${isSelected ? 'text-[#FFD600]' : 'text-zinc-200'}`}>
                        {issue.title}
                      </span>
                      <AlertTriangle className={`w-3.5 h-3.5 ${isSelected ? 'text-red-500' : 'text-zinc-650'}`} />
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1 leading-normal font-sans">
                      {issue.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 3: MESSAGE EXPLANATION */}
          <div className="bg-[#121212] border border-zinc-850 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#FFD600] text-black font-mono font-bold flex items-center justify-center text-[10px]">3</span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 font-sans">Informe Outros Detalhes Sobre O Problema</h3>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Relato da Ocorrência para Solução:</label>
              <textarea
                value={customProblemText}
                onChange={(e) => setCustomProblemText(e.target.value)}
                placeholder="Insira os detalhes do empasse. Descreva o que está travado, o que o motorista reportou, valores de adiantamento ou respostas do cliente, para que Genivaldo possa avaliar e agir."
                className="w-full h-36 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs font-sans text-zinc-100 placeholder-zinc-600 focus:border-[#FFD600] focus:ring-0 focus:outline-none resize-none transition-colors"
              />
            </div>
          </div>

        </div>

        {/* Live Message Preview Panel & Send (Right Panel) - Column Span 5 */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* LIVE PREVIEW CONTAINER */}
          <div className="bg-[#121212] border border-zinc-850 rounded-2xl p-6 flex flex-col h-full space-y-4 relative sticky top-24">
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#FFD600]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 font-sans">Pré-visualização do Zap</h3>
              </div>
              <span className="text-[8px] bg-emerald-500/10 text-emerald-400 font-mono tracking-wide px-1.5 py-0.5 rounded uppercase border border-emerald-500/20">
                Via WhatsApp Web
              </span>
            </div>

            <p className="text-[10px] text-zinc-500 leading-normal font-sans">
              Assim que clicar em disparar, a mensagem abaixo será estruturada e enviada diretamente para o gerente Genivaldo iniciar a negociação ou reverter a contingência:
            </p>

            {/* Simulated Chat Bubble UI */}
            <div className="flex-1 bg-zinc-950 border border-zinc-900 rounded-xl p-4 font-mono text-[10px] text-zinc-300 overflow-y-auto whitespace-pre-wrap max-h-96 leading-relaxed relative selection:bg-yellow-500/20">
              {compiledMessage}
            </div>

            {feedbackMsg && (
              <div className={`p-3 rounded-lg text-xs font-semibold border ${
                feedbackMsg.type === 'success' 
                ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-400' 
                : 'bg-red-950/20 border-red-900/50 text-red-400'
              }`}>
                {feedbackMsg.text}
              </div>
            )}

            {/* SEND CTA ACTION BUTTON */}
            <button
              onClick={handleSendWhatsApp}
              className="w-full bg-[#FFD600] hover:bg-[#ffe23b] text-[#0a0a0a] font-extrabold uppercase text-xs tracking-wider py-3.5 px-4 rounded-xl shadow-lg shadow-yellow-500/5 transition-all flex items-center justify-center gap-2.5 cursor-pointer hover:scale-[1.01] active:scale-[0.99] border-0 outline-none"
            >
              <Send className="w-4 h-4 text-black" />
              Enviar para o Gerente Genivaldo
            </button>

            <div className="border-t border-zinc-900 pt-3.5 flex items-center justify-between gap-2 text-[9px] text-zinc-550 uppercase font-mono">
              <span>Destinatário: (71) 99175-4284</span>
              <span className="flex items-center gap-1 text-zinc-600">
                <span className="w-1 h-1 bg-green-500 rounded-full"></span> Conexão segura
              </span>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
