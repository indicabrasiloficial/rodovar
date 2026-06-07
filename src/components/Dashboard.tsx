import { useMemo, useState, FormEvent } from 'react';
import { Entrega } from '../types';
import { 
  Truck, 
  MapPin, 
  TrendingUp, 
  Coins, 
  AlertTriangle, 
  CheckCircle, 
  Mic, 
  MicOff, 
  Search, 
  HelpCircle,
  TrendingDown,
  Navigation,
  Package,
  Shield,
  Clock,
  ArrowUpRight,
  Briefcase,
  Layers,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import DeliveryMap from './DeliveryMap';
import { motion, AnimatePresence } from 'motion/react';

interface DashboardProps {
  entregas: Entrega[];
  onSelectDelivery: (id: string) => void;
  voiceHook: any; // Return value of useVoice state
}

const statusColorMap: Record<string, string> = {
  coletando: '#3B82F6',   // Blue
  em_transito: '#FFD600', // Yellow
  parado: '#EF4444',      // Red
  entregue: '#10B981'     // Green
};

const statusLabelMap: Record<string, string> = {
  coletando: 'Coletando',
  em_transito: 'Trânsito',
  parado: 'Parado',
  entregue: 'Entregue'
};
export default function Dashboard({ entregas, onSelectDelivery, voiceHook }: DashboardProps) {
  const [voiceQueryInput, setVoiceQueryInput] = useState('');

  // Calculate Metrics
  const metrics = useMemo(() => {
    let totalCargas = entregas.length;
    let coletando = entregas.filter(e => e.status === 'coletando').length;
    let emTransito = entregas.filter(e => e.status === 'em_transito').length;
    let entregues = entregas.filter(e => e.status === 'entregue').length;
    let paradas = entregas.filter(e => e.status === 'parado').length;
    
    let faturamentoTotal = entregas.reduce((sum, e) => sum + (e.frete_empresa || 0), 0);
    const custoMotoristas = entregas.reduce((sum, e) => sum + (e.frete_motorista || 0), 0);
    let lucroTotal = faturamentoTotal - custoMotoristas;

    return {
      totalCargas,
      coletando,
      emTransito,
      entregues,
      paradas,
      faturamentoTotal,
      lucroTotal
    };
  }, [entregas]);

  // Auditor alert logic from Agente Rodovar
  const rodovarAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      title: string;
      desc: string;
      driver: string;
      phone: string;
      type: 'parado' | 'gps' | 'canhoto';
      msg: string;
    }> = [];

    entregas.forEach(e => {
      if (e.status === 'parado') {
        alerts.push({
          id: `al-${e.id}-parado`,
          title: `VEÍCULO PARADO: ${e.motorista}`,
          desc: `Carga para ${e.destino} está retida/parada. Recomenda-se acionar o motorista urgente.`,
          driver: e.motorista,
          phone: e.tel_motorista,
          type: 'parado',
          msg: `Olá ${e.motorista}! Aqui é o Agente Rodovar monitorando sua carga de ${e.origem} para ${e.destino}. Vimos que seu carro está parado no momento. Como estão as coisas por aí? Poderia nos enviar sua localização atualizada?`
        });
      } else if (e.status === 'em_transito' && !e.link_localizacao) {
        alerts.push({
          id: `al-${e.id}-gps`,
          title: `GPS INATIVO: ${e.motorista}`,
          desc: `Em viagem de ${e.origem} para ${e.destino} sem link de localização de mapa ativo no painel.`,
          driver: e.motorista,
          phone: e.tel_motorista,
          type: 'gps',
          msg: `Olá ${e.motorista}! Aqui o Agente Rodovar. Poderia nos enviar seu link de localização em tempo real para registrarmos sua rota no painel internacional? Grato!`
        });
      } else if (e.status === 'entregue' && !e.canhoto_solicitado) {
        alerts.push({
          id: `al-${e.id}-canhoto`,
          title: `CANHOTO PENDENTE: ${e.motorista}`,
          desc: `Carga entregue no destino ${e.destino}, porém o canhoto assinado não foi solicitado/enviado.`,
          driver: e.motorista,
          phone: e.tel_motorista,
          type: 'canhoto',
          msg: `Olá ${e.motorista}! Tudo bem? Parabéns pela entrega em ${e.destino}! Consegue nos mandar uma foto do canhoto assinado para darmos baixa no financeiro? Um abraço!`
        });
      }
    });

    return alerts;
  }, [entregas]);

  // Chart Data preparation
  const chartData = useMemo(() => {
    const counts = {
      coletando: 0,
      em_transito: 0,
      parado: 0,
      entregue: 0
    };
    
    entregas.forEach(e => {
      if (counts[e.status] !== undefined) {
        counts[e.status]++;
      }
    });

    return Object.entries(counts).map(([key, value]) => ({
      name: statusLabelMap[key],
      value,
      statusKey: key
    }));
  }, [entregas]);

  const handleManualCommandSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (voiceQueryInput.trim()) {
      voiceHook.processSpeech(voiceQueryInput);
      setVoiceQueryInput('');
    }
  };

  const getActiveUserRole = (): string => {
    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        const parsed = JSON.parse(active);
        return parsed.role || 'Operador';
      } catch {
        return 'Operador';
      }
    }
    return 'Operador';
  };

  const getActiveUserNameLabel = (): string => {
    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        const parsed = JSON.parse(active);
        return parsed.displayName || 'Colaborador';
      } catch {
        return 'Colaborador';
      }
    }
    return 'Colaborador';
  };

  // Render role-specific custom widgets panel
  const renderRoleSpecificBoard = () => {
    const role = getActiveUserRole();
    const name = getActiveUserNameLabel();

    // Financial sums for Petrônio
    const financeSummary = useMemo(() => {
      const revenue = entregas.reduce((sum, e) => sum + (e.frete_empresa || 0), 0);
      const expense = entregas.reduce((sum, e) => sum + (e.frete_motorista || 0), 0);
      const profit = revenue - expense;
      const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;
      
      // Filter list of negative or zero profit margin routes as warning ledger
      const criticalRoutes = entregas.filter(e => e.frete_empresa <= e.frete_motorista || e.frete_empresa === 0 || e.frete_motorista === 0);

      return { revenue, expense, profit, marginPct, criticalRoutes };
    }, [entregas]);

    // Commercial metrics for Alexandre
    const commercialSummary = useMemo(() => {
      const totalCargoValue = entregas.reduce((sum, e) => sum + (e.valor_carga || 0), 0);
      const totalFreight = entregas.reduce((sum, e) => sum + (e.frete_empresa || 0), 0);
      
      // Group cargo value by client name
      const clientGroup: Record<string, number> = {};
      entregas.forEach(e => {
        const cName = e.cliente || 'OutrosCl';
        clientGroup[cName] = (clientGroup[cName] || 0) + (e.frete_empresa || 0);
      });
      const topClients = Object.entries(clientGroup)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      return { totalCargoValue, totalFreight, topClients };
    }, [entregas]);

    // Ocorrências escalated to Genivaldo / Gerente
    const paradasEscalated = useMemo(() => {
      return entregas.filter(e => e.status === 'parado' || (e.observacoes && e.observacoes.toLowerCase().includes('atraso')));
    }, [entregas]);

    if (role.toLowerCase().includes('comercial')) {
      return (
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-[#FFD600]" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Relatório Comercial Estratégico (Alexandre)</h3>
                <p className="text-[10px] text-zinc-500 font-mono uppercase">Análise de Receita de Frete Empresa & Seguro de Cargas Monitoradas</p>
              </div>
            </div>
            <span className="text-[10px] bg-[#FFD600]/10 text-[#FFD600] ring-1 ring-[#FFD600]/20 rounded px-2 py-0.5 font-mono uppercase">DIRETORIA COMERCIAL</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-mono text-zinc-400">Total Garantido sob Gestão</span>
              <p className="text-lg font-black text-white mt-1">R$ {commercialSummary.totalCargoValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <span className="text-[9px] text-[#FFD600] font-mono mt-1">✓ Seguro Ativo Rodovar</span>
            </div>
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-mono text-zinc-400 font-bold text-[#FFD600]">Faturamento de Frete Empresa</span>
              <p className="text-lg font-black text-[#FFD600] mt-1">R$ {commercialSummary.totalFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Receita bruta operacional</span>
            </div>
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-mono text-zinc-400">Concentração de Clientes</span>
              <p className="text-xs font-bold text-gray-300 mt-2">
                Top 1: {commercialSummary.topClients[0]?.[0] || 'Nenhum'} - R$ {(commercialSummary.topClients[0]?.[1] || 0).toLocaleString('pt-BR')}
              </p>
              <p className="text-[10px] text-zinc-500 font-mono mt-1">Total de contas ativas: {Object.keys(commercialSummary.topClients).length}</p>
            </div>
          </div>

          <div className="bg-zinc-950/60 p-3.5 rounded-lg border border-zinc-900 flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-[#FFD600] shrink-0" />
            <p className="text-xs text-zinc-400 leading-normal font-sans">
              <strong>Painel Comercial Atualizado:</strong> Toda inclusão ou modificação de cargas altera estas projeções em tempo real. A exclusão de cargas está restrita aos Operadores para integridade comercial.
            </p>
          </div>
        </div>
      );
    }

    if (role.toLowerCase().includes('financeiro') || name.toLowerCase() === 'petrônio') {
      return (
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white font-sans">Controle de Margem de Lucro & Repasses (Petrônio)</h3>
                <p className="text-[10px] text-zinc-500 font-mono uppercase">Diferencial entre frete empresa faturado contra frete repassado ao motorista</p>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-950/40 text-emerald-400 ring-1 ring-emerald-500/20 rounded px-2 py-0.5 font-mono uppercase">FINANCEIRO</span>
          </div>

          {/* Key Finance Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900">
              <span className="text-[10px] uppercase font-mono text-zinc-400">Faturamento Bruto</span>
              <p className="text-lg font-black text-white mt-1">R$ {financeSummary.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900">
              <span className="text-[10px] uppercase font-mono text-zinc-400">Total Pago a Terceiros</span>
              <p className="text-lg font-black text-zinc-400 mt-1">R$ {financeSummary.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-zinc-950 p-4 rounded-xl border border-emerald-950">
              <span className="text-[10px] uppercase font-mono text-emerald-400 font-bold">Margem Líquida</span>
              <p className="text-lg font-black text-emerald-400 mt-1">R$ {financeSummary.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900">
              <span className="text-[10px] uppercase font-mono text-zinc-400">Lucratividade Média</span>
              <div className="flex items-center gap-1.5 mt-1">
                <p className="text-lg font-black text-white">{financeSummary.marginPct.toFixed(1)}%</p>
                {financeSummary.marginPct > 15 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
              </div>
            </div>
          </div>

          {/* Ledger of Critical Low Margin Routes */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-1.5 border-b border-zinc-900 pb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-[#FFD600]" />
              <span className="text-[10px] uppercase tracking-wider font-mono text-zinc-300 font-bold block">
                Auditoria de Rotas Críticas ou Sem Margem Operacional ({financeSummary.criticalRoutes.length})
              </span>
            </div>

            {financeSummary.criticalRoutes.length === 0 ? (
              <p className="text-[11px] text-zinc-550 font-mono py-2">✅ Nenhuma rota com prejuízo operacional ou margem irregular identificada!</p>
            ) : (
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {financeSummary.criticalRoutes.map(route => {
                  const itemMargin = (route.frete_empresa || 0) - (route.frete_motorista || 0);
                  return (
                    <div key={route.id} className="p-2.5 rounded bg-zinc-900/40 border border-zinc-900 flex justify-between items-center text-xs">
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-gray-200">{route.origem} ➔ {route.destino}</span>
                          <span className="text-[9px] font-mono text-zinc-500">Mtr: {route.motorista}</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1">Empresa: <strong className="text-zinc-400 font-medium">R$ {route.frete_empresa}</strong> | Motorista: <strong className="text-zinc-400 font-medium font-mono">R$ {route.frete_motorista}</strong></p>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-black ${itemMargin < 0 ? 'bg-red-950/40 text-red-400 border border-red-900/20' : 'bg-yellow-950/40 text-yellow-500 border border-yellow-900/20'}`}>
                        {itemMargin < 0 ? `PREJUÍZO: R$ ${Math.abs(itemMargin)}` : `MARGEM ZERO`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (role.toLowerCase().includes('gerente') || name.toLowerCase() === 'genivaldo') {
      return (
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-yellow-500 animate-pulse" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Central de Incidentes Gerenciais (Genivaldo)</h3>
                <p className="text-[10px] text-zinc-500 font-mono uppercase">Foco em mitigar riscos operacionais, atrasos e veículos bloqueados na estrada</p>
              </div>
            </div>
            <span className="text-[10px] bg-yellow-950/40 text-yellow-400 ring-1 ring-yellow-500/20 rounded px-2 py-0.5 font-mono uppercase">GERÊNCIA OPERACIONAL</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Escalated list */}
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-2">
              <div className="flex justify-between items-center border-b border-zinc-900 pb-1.5">
                <span className="text-[10.5px] uppercase font-mono font-bold text-[#FFD600]">Anomalias Críticas Ativas</span>
                <span className="text-[9px] bg-red-950/30 text-red-400 px-1.5 rounded font-mono font-bold">{paradasEscalated.length} Alertas</span>
              </div>

              {paradasEscalated.length === 0 ? (
                <div className="p-6 text-center text-zinc-500 font-mono text-[11px]">✅ Nenhuma anomalia crítica relatada! Estrada sob controle perfeito.</div>
              ) : (
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {paradasEscalated.map(es => (
                    <div key={es.id} className="p-2 bg-[#121212] rounded border border-zinc-900 text-xs">
                      <div className="flex justify-between items-start gap-1">
                        <strong className="text-gray-300 block">{es.motorista}</strong>
                        <span className="bg-red-950/30 text-red-500 font-mono px-1 py-0.2 rounded text-[8px] font-bold uppercase">Escalado</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-1">Rota: {es.origem} ➔ {es.destino}</p>
                      {es.observacoes && (
                        <p className="text-[10.5px] italic text-zinc-500 mt-1 bg-zinc-950 p-1.5 rounded border border-dashed border-zinc-900">"{es.observacoes}"</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Support Protocols Checklist */}
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3 flex flex-col justify-between">
              <div>
                <span className="text-[10.5px] uppercase font-mono font-bold text-gray-400 block border-b border-zinc-900 pb-1.5">Ações Rápidas de Resolução</span>
                <p className="text-[11px] text-zinc-400 mt-2 font-sans leading-normal">
                  Como Gerente, você carrega autonomia para coordenar frentes de contingência de seguros se algum veículo permanecer parado por mais de 3 horas. Use o Agente Rodovar para disparar avisos integrados.
                </p>
              </div>
              <button
                onClick={() => {
                  if (window.falarRodovar) {
                    window.falarRodovar("Entendido, Gerente Genivaldo. Rodando análise de rota de suporte rápida para disparar ações de contingência.");
                  }
                }}
                className="w-full py-2 bg-zinc-900 hover:bg-[#FFD600] border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-black rounded text-[10px] font-mono font-bold uppercase transition"
              >
                Disparar Alinhamento Geral
              </button>
            </div>

          </div>
        </div>
      );
    }

    if (role.toLowerCase().includes('operações') || role.toLowerCase().includes('operacoes') || name.toLowerCase() === 'vitor' || name.toLowerCase() === 'ricardo') {
      return (
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">SLA Logístico & Dispersão de Viagem ({name})</h3>
                <p className="text-[10px] text-zinc-500 font-mono uppercase">Indicizadores táticos de rota ativa, velocidade operacional e transit conformance</p>
              </div>
            </div>
            <span className="text-[10px] bg-indigo-950/40 text-indigo-400 ring-1 ring-indigo-500/20 rounded px-2 py-0.5 font-mono uppercase">DIRETORIA OPERACIONAL</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans">
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900">
              <span className="text-[10px] font-mono uppercase text-zinc-500">Transit SLA Conformance</span>
              <p className="text-xl font-black text-white mt-1">96.8%</p>
              <div className="w-full bg-zinc-900 rounded-full h-1 mt-2">
                <div className="bg-emerald-500 h-1 rounded-full" style={{ width: '96.8%' }} />
              </div>
            </div>
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900">
              <span className="text-[10px] font-mono uppercase text-zinc-500">Rastreabilidade Integrada</span>
              <p className="text-xl font-black text-[#FFD600] mt-1">
                {entregas.length > 0 ? ((entregas.filter(e => e.link_localizacao).length / entregas.length) * 100).toFixed(0) : '0'}%
              </p>
              <div className="w-full bg-zinc-900 rounded-full h-1 mt-2">
                <div className="bg-[#FFD600] h-1 rounded-full" style={{ width: `${entregas.length > 0 ? (entregas.filter(e => e.link_localizacao).length / entregas.length) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900">
              <span className="text-[10px] font-mono uppercase text-zinc-500">Cargas em Carregamento Inicial</span>
              <p className="text-xl font-black text-indigo-400 mt-1">{entregas.filter(e => e.status === 'coletando').length} Cargas</p>
              <span className="text-[9px] text-zinc-550 block font-mono mt-2">Fase de Coleta</span>
            </div>
          </div>
        </div>
      );
    }

    // Default Operador dashboard
    return (
      <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl animate-fade-in">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-[#FFD600]" />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">Fila de Atividades de WhatsApp (Jairo)</h3>
              <p className="text-[10px] text-zinc-500 font-mono uppercase">Sequência recomendada de checagem de motoristas ativos no sistema</p>
            </div>
          </div>
          <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 rounded px-2 py-0.5 font-mono uppercase">PAINEL OPERADOR</span>
        </div>

        <p className="text-xs text-zinc-400 font-sans leading-normal m-0 select-none">
          Olá, <strong>{name}</strong>! Como operador, você possui liberdade irrestrita para cadastrar, editar, excluir e configurar trajetos de mapa. Seu microfone de comando está pronto para receber auditoria.
        </p>

        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-900 text-[11px] font-mono text-[#FFD600]/80">
          📍 DICA DE VOZ: Fale <strong>"onde está [Nome do Motorista]?"</strong> para o Agente Rodovar abrir o formulário ou ler os dados dele!
        </div>
      </div>
    );
  };

  const handleTriggerWhatsAppDirect = (phone: string, text: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Voice Assistant Panel Section with AGENTE RODOVAR circular branding */}
      <div className="bg-[#121212]/95 border-2 border-[#FFD600] rounded-2xl p-5 md:p-6 shadow-2xl relative overflow-hidden">
        {/* Decorative ambient elements */}
        <div className="absolute right-0 top-0 w-44 h-44 bg-[#FFD600] opacity-5 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          
          {/* Official Agente Rodovar Visual Avatar badge */}
          <div className="flex items-center gap-4 text-center md:text-left w-full md:w-auto">
            <div className="relative group mx-auto md:mx-0">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-yellow-400 to-[#FFD600] opacity-30 group-hover:opacity-70 blur transition-all duration-300 animate-pulse"></div>
              <div className="relative bg-[#0d0d0d] border border-zinc-800 rounded-full w-20 h-20 overflow-hidden flex items-center justify-center p-1.5 shadow-lg">
                <img 
                  src="https://rodovar.com.br/wp-content/uploads/2026/03/Sua_carga_em_primeiro_lugar_-removebg-preview.png" 
                  alt="Agente Rodovar" 
                  className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(255,214,0,0.4)]"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
            
            <div className="space-y-1 text-center md:text-left flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-[#FFD600]/10 border border-[#FFD600]/30 text-[#FFD600] text-[10px] font-mono uppercase tracking-widest font-bold">
                <span className={`w-1.5 h-1.5 rounded-full ${voiceHook.isListening ? 'bg-red-500 animate-pulse' : 'bg-[#FFD600]'}`}></span>
                AGENTE RODOVAR ATIVO
              </div>
              <h2 className="text-lg md:text-xl font-bold font-sans tracking-tight text-white m-0">
                Central de Monitoramento Inteligente
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-md m-0">
                Roda nossa auditoria de frota por áudio. Fale comigo ou peça uma simulação técnica para o assistente apontar veículos atrasados.
              </p>
            </div>
          </div>

          {/* Core action controls: Listen button + Quick analyzer button */}
          <div className="flex flex-row items-center gap-4 shrink-0 mx-auto md:mx-0">
            <button
              onClick={() => voiceHook.processSpeech('analisar frota')}
              className="px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-[#FFD600] rounded-xl text-xs font-mono font-bold tracking-tight uppercase flex items-center gap-2 cursor-pointer transition-all hover:scale-105 active:scale-95"
              title="Solicitar auditoria acústica de frota"
            >
              📊 Auditoria de Voz
            </button>

            <div className="flex flex-col items-center gap-1">
              <button
                onClick={voiceHook.isListening ? voiceHook.stopListening : voiceHook.startListening}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  voiceHook.isListening 
                  ? 'bg-red-650 hover:bg-red-600 text-white voice-recorder-active scale-105 shadow-[0_0_15px_rgba(239,68,68,0.4)]' 
                  : 'bg-[#FFD600] hover:bg-[#ffe23b] text-black shadow-[0_0_20px_rgba(255,214,0,0.25)] hover:scale-105'
                }`}
                title="Ativar escuta de voz"
                id="voice-mic-btn"
              >
                {voiceHook.isListening ? (
                  <MicOff className="w-6 h-6 animate-pulse" />
                ) : (
                  <Mic className="w-6 h-6" />
                )}
              </button>
              <span className="text-[9px] uppercase tracking-wider font-mono text-zinc-500 font-bold">
                {voiceHook.isListening ? 'Ouvindo...' : 'Falar'}
              </span>
            </div>
          </div>

        </div>

        {/* Dynamic Voice Responses and Transcription */}
        <AnimatePresence>
          {(voiceHook.transcript || voiceHook.assistantResponse || voiceHook.error || voiceHook.showConfirmPrompt) && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-6 pt-5 border-t border-zinc-800 space-y-4"
            >
              {voiceHook.transcript && (
                <div className="flex items-start gap-2.5">
                  <span className="text-xs uppercase font-mono px-2 py-0.5 bg-zinc-800 rounded text-gray-400 mt-1">Você</span>
                  <p className="text-gray-300 italic text-sm font-sans">"{voiceHook.transcript}"</p>
                </div>
              )}

              {voiceHook.assistantResponse && (
                <div className="flex items-start gap-2.5 bg-[#FFD600]/5 p-3 rounded-xl border border-[#FFD600]/20">
                  <span className="text-xs uppercase font-mono px-2 py-0.5 bg-[#FFD600] text-black font-extrabold rounded mt-0.5">RODOVAR</span>
                  <p className="text-[#FFD600] text-sm font-medium leading-relaxed font-sans">{voiceHook.assistantResponse}</p>
                </div>
              )}

              {voiceHook.error && (
                <div className="bg-red-950/40 text-red-400 border border-red-900/50 p-3 rounded-lg text-xs leading-relaxed font-mono">
                  ⚠️ {voiceHook.error}
                </div>
              )}

              {/* Action Prompt (Sim / Não) */}
              {voiceHook.showConfirmPrompt && (
                <motion.div 
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4"
                >
                  <p className="text-xs font-medium text-gray-300">
                    Deseja redirecionar para o WhatsApp e solicitar a localização em tempo real do motorista?
                  </p>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => voiceHook.confirmPendingAction(true)}
                      className="flex-1 sm:flex-none px-4 py-1.5 bg-[#FFD600] hover:bg-[#ffe23b] text-black font-bold rounded-lg text-xs cursor-pointer transition-colors"
                      id="voice-confirm-yes"
                    >
                      Sim, abrir WhatsApp
                    </button>
                    <button
                      onClick={() => voiceHook.confirmPendingAction(false)}
                      className="flex-1 sm:flex-none px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-gray-300 font-medium rounded-lg text-xs cursor-pointer transition-colors"
                      id="voice-confirm-no"
                    >
                      Não, cancelar
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fallback Manual command box in sandbox if mic permissions is not possible */}
        <div className="mt-4 flex items-center justify-between text-xs text-gray-500 bg-black/40 p-2.5 rounded-xl border border-zinc-900">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <HelpCircle className="w-3.5 h-3.5 text-[#FFD600]" />
            <span>Sem microfone? Escreva o comando de voz:</span>
          </div>
          <form onSubmit={handleManualCommandSubmit} className="flex gap-1.5 flex-1 max-w-sm ml-4">
            <input
              type="text"
              placeholder="Ex: 'onde esta joao' ou 'cargas paradas'"
              value={voiceQueryInput}
              onChange={(e) => setVoiceQueryInput(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs text-gray-300 focus:outline-none focus:border-[#FFD600] font-mono text-[11px]"
              id="voice-manual-input"
            />
            <button 
              type="submit" 
              className="px-2 py-1 bg-zinc-800 hover:bg-[#FFD600] hover:text-black rounded text-[11px] font-mono transition cursor-pointer text-gray-400"
              id="voice-manual-submit"
            >
              Enviar
            </button>
          </form>
        </div>
      </div>

      {/* Grid of Key Metric cards (Custom High Density without financial metrics) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Metric Total */}
        <div className="bg-[#121212] border border-zinc-800 hover:border-zinc-700 p-4 rounded-xl flex flex-col justify-between transition-all group shadow-sm id-metric-total col-span-2 md:col-span-1">
          <div className="flex justify-between items-start">
            <span className="text-[11px] uppercase tracking-wider font-mono text-gray-500">Total de Cargas</span>
            <div className="p-1 px-1.5 rounded-md bg-zinc-900 text-gray-400 font-mono text-[10px] border border-zinc-800">CARGAS</div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-extrabold font-sans text-white group-hover:text-yellow-400 transition-colors">{metrics.totalCargas}</span>
            <Truck className="w-5 h-5 text-gray-600 self-end mb-1" />
          </div>
        </div>

        {/* Metric Coletando */}
        <div className="bg-[#121212] border border-zinc-800 hover:border-blue-900/50 p-4 rounded-xl flex flex-col justify-between transition-all group shadow-sm id-metric-collecting">
          <div className="flex justify-between items-start">
            <span className="text-[11px] uppercase tracking-wider font-mono text-blue-400">Coletando</span>
            <Package className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-extrabold font-sans text-white">{metrics.coletando}</span>
            <span className="text-[10px] font-bold text-blue-400 bg-blue-950/10 px-1.5 py-0.5 rounded font-mono">PREPARAÇÃO</span>
          </div>
        </div>

        {/* Metric Transit */}
        <div className="bg-[#121212] border border-zinc-800 hover:border-[#FFD600]/50 p-4 rounded-xl flex flex-col justify-between transition-all group shadow-sm id-metric-transit">
          <div className="flex justify-between items-start">
            <span className="text-[11px] uppercase tracking-wider font-mono text-[#FFD600]">Trânsito</span>
            <Navigation className="w-4 h-4 text-[#FFD600] animate-pulse" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-extrabold font-sans text-white">{metrics.emTransito}</span>
            <span className="text-[10px] font-bold text-[#FFD600] bg-[#FFD600]/10 px-1.5 py-0.5 rounded font-mono">EM ATIVIDADES</span>
          </div>
        </div>

        {/* Metric Stopped */}
        <div className="bg-[#121212] border border-zinc-800 hover:border-red-900/50 p-4 rounded-xl flex flex-col justify-between transition-all group shadow-sm id-metric-stopped">
          <div className="flex justify-between items-start">
            <span className="text-[11px] uppercase tracking-wider font-mono text-red-400">Bloqueadas / Paradas</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-extrabold font-sans text-white">{metrics.paradas}</span>
            <span className="text-[10px] font-bold text-red-400 bg-red-950/30 px-1.5 py-0.5 rounded font-mono">REQUER ATENÇÃO</span>
          </div>
        </div>

        {/* Metric Delivered */}
        <div className="bg-[#121212] border border-zinc-800 hover:border-emerald-900/50 p-4 rounded-xl flex flex-col justify-between transition-all group shadow-sm id-metric-completed">
          <div className="flex justify-between items-start">
            <span className="text-[11px] uppercase tracking-wider font-mono text-emerald-400">Entregues</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-extrabold font-sans text-white">{metrics.entregues}</span>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded font-mono">CONCLUÍDAS</span>
          </div>
        </div>
      </div>

      {/* Main Map + Distribution Chart Visual Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Leaflet Live map container */}
        <div className="lg:col-span-8 bg-[#121212] border border-zinc-800 rounded-xl p-4 flex flex-col space-y-4 shadow-sm h-[480px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFD600] animate-ping" />
              <h3 className="font-bold text-sm font-sans tracking-wide">MAPA DE MONITORAMENTO ATUAL</h3>
            </div>
            <div className="flex flex-wrap gap-2 md:gap-3 text-[10px] md:text-[11px] font-mono text-gray-400 justify-end">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" /> Coletando
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFD600]" /> Trânsito
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" /> Parado
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" /> Entregue
              </span>
            </div>
          </div>
          <div className="flex-1 w-full rounded-lg overflow-hidden min-h-[300px]">
            <DeliveryMap 
              entregas={entregas} 
              onSelectDelivery={onSelectDelivery}
            />
          </div>
        </div>

        {/* Status Distribution Recharts Chart */}
        <div className="lg:col-span-4 bg-[#121212] border border-zinc-800 rounded-xl p-4 flex flex-col shadow-sm justify-between">
          <div>
            <h3 className="font-bold text-sm font-sans tracking-wide mb-4">DISTRIBUIÇÃO DE CARGAS</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                    axisLine={{ stroke: '#27272a' }}
                    tickLine={false}
                  />
                  <YAxis 
                    allowDecimals={false}
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    axisLine={{ stroke: '#27272a' }}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255, 214, 0, 0.04)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-[#18181b] border-2 border-zinc-700 rounded-lg p-2.5 shadow-xl font-mono text-[11px] space-y-1">
                            <p className="text-[#FFD600] font-bold uppercase tracking-wider">{data.name}</p>
                            <p className="text-white">
                              Quantidade: <span className="font-extrabold text-[#FFD600] text-sm">{payload[0].value}</span>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={statusColorMap[entry.statusKey] || '#6B7280'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-4 space-y-3 mt-4">
            <span className="text-[10px] uppercase tracking-wider font-mono text-zinc-500 font-bold block">
              Auditoria de Anomalias (Agente Rodovar)
            </span>
            
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {rodovarAlerts.length === 0 ? (
                <div className="p-3 bg-zinc-900/20 border border-dashed border-zinc-850 rounded text-[11px] text-zinc-550 font-mono text-center">
                  ✅ Nenhuma anomalia ativa. Frota sob controle completo.
                </div>
              ) : (
                rodovarAlerts.map(alert => (
                  <div 
                    key={alert.id} 
                    className="p-2.5 rounded-lg border text-xs flex flex-col gap-2 transition bg-zinc-900/30 border-zinc-850 hover:border-zinc-800"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-0.5">
                        <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase inline-block ${
                          alert.type === 'parado'
                            ? 'bg-red-950/40 text-red-400 border border-red-900/20'
                            : alert.type === 'gps'
                            ? 'bg-yellow-950/40 text-yellow-500 border border-yellow-900/20'
                            : 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/20'
                        }`}>
                          {alert.type === 'parado' ? 'Parado 🛑' : alert.type === 'gps' ? 'Sem GPS 📍' : 'Pendente 📋'}
                        </span>
                        <h4 className="font-bold text-gray-200 mt-1">{alert.title}</h4>
                        <p className="text-[11px] text-zinc-400 leading-normal">{alert.desc}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-zinc-900 pt-2 text-[10px] font-mono">
                      <span className="text-zinc-500">Tel: {alert.phone}</span>
                      <button
                        onClick={() => handleTriggerWhatsAppDirect(alert.phone, alert.msg)}
                        className="px-2 py-1 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 hover:border-green-500/40 text-green-400 rounded text-[10px] font-bold font-sans flex items-center gap-1 cursor-pointer transition"
                      >
                        <svg className="w-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.458L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.488 2.01 14.041 1.01 11.455 1.01c-5.44 0-9.866 4.372-9.87 9.802 0 1.706.463 3.375 1.337 4.857L1.874 20.3l4.773-1.146zm11.385-4.852c-.3-.15-1.77-.875-2.045-.975-.27-.1-.47-.15-.67.15-.2.3-.77.975-.945 1.175-.175.2-.35.225-.65.075-.3-.15-1.263-.465-2.403-1.485-.888-.79-1.484-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.135-.135.3-.35.45-.525.15-.175.2-.3.3-.5.1-.2.05-.375-.025-.525-.075-.15-.67-1.62-.92-2.2-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.075-.8.375-.27.3-1.04 1.016-1.04 2.479 0 1.462 1.06 2.875 1.21 3.075.15.2 2.09 3.195 5.06 4.485.7.3 1.25.49 1.68.625.71.22 1.35.19 1.86.11.57-.08 1.77-.72 2.02-1.41.25-.69.25-1.29.175-1.41-.07-.12-.27-.22-.57-.37z"/>
                        </svg>
                        Acionar
                      </button>
                    </div>

                  </div>
                ))
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Role-Specific Custom Board */}
      <div className="mt-2 text-left">
        {renderRoleSpecificBoard()}
      </div>
    </div>
  );
}
