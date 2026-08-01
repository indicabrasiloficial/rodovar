import { useState, useMemo } from 'react';
import { Entrega } from '../types';
import { getDeliveryKm } from '../utils/distance';
import { getNormalizedAtendente } from '../db/storage';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  AreaChart, 
  Area, 
  Legend 
} from 'recharts';
import { 
  Users, 
  Navigation, 
  Calendar, 
  Gauge, 
  Activity,
  CheckCircle,
  FileCheck,
  Package,
  Trophy,
  Medal,
  Award,
  TrendingUp,
  DollarSign,
  User,
  Filter,
  ArrowUpRight,
  ShieldAlert,
  Sparkles,
  PieChart,
  BarChart3,
  Wallet,
  Percent,
  Star,
  UserCheck,
  ChevronRight,
  Truck
} from 'lucide-react';

interface StatisticsProps {
  entregas: Entrega[];
  currentUser?: any;
}

type PeriodoFilter = 'hoje' | 'semana' | 'quinzena' | 'mes' | 'ano' | 'tudo';
type MetricFilter = 'faturamento' | 'cargas' | 'margem';

function parseEntregaDate(entrega: Entrega): Date | null {
  const dateStr = entrega.data_coleta || entrega.created_at || entrega.data;
  if (!dateStr) return null;

  const currentYear = new Date().getFullYear();
  const str = String(dateStr).trim();

  // 1. ISO format or includes T
  if (str.includes('T')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }

  // 2. YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.substring(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // 3. DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    const [d, m, y] = str.substring(0, 10).split('/').map(Number);
    return new Date(y, m - 1, d);
  }

  // 4. MM/DD/YYYY or DD/MM/YYYY flex
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) {
    const parts = str.substring(0, 10).split('/').map(Number);
    if (parts[0] > 12) {
      return new Date(parts[2], parts[1] - 1, parts[0]);
    } else {
      return new Date(parts[2], parts[0] - 1, parts[1]);
    }
  }

  // 5. MM-DD or DD-MM format without year (e.g. "07-28" or "08-01")
  if (/^\d{2}[-\/]\d{2}$/.test(str)) {
    const [p1, p2] = str.split(/[-\/]/).map(Number);
    let month = p1;
    let day = p2;
    if (p1 > 12 && p2 <= 12) {
      day = p1;
      month = p2;
    }
    return new Date(currentYear, month - 1, day);
  }

  const timestamp = Date.parse(str);
  if (!isNaN(timestamp)) return new Date(timestamp);
  return null;
}

function isEntregaInPeriod(entrega: Entrega, period: PeriodoFilter): boolean {
  if (period === 'tudo') return true;

  const date = parseEntregaDate(entrega);
  if (!date) return true;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'hoje') {
    return date >= startOfToday;
  }

  if (period === 'semana') {
    const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    return date >= sevenDaysAgo;
  }

  if (period === 'quinzena') {
    const fifteenDaysAgo = new Date(startOfToday.getTime() - 15 * 24 * 60 * 60 * 1000);
    return date >= fifteenDaysAgo;
  }

  if (period === 'mes') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
    return date >= thirtyDaysAgo || date >= startOfMonth;
  }

  if (period === 'ano') {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    return date >= startOfYear;
  }

  return true;
}

export default function Statistics({ entregas, currentUser }: StatisticsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodoFilter>('tudo');
  const [selectedMetric, setSelectedMetric] = useState<MetricFilter>('faturamento');
  const [selectedAtendente, setSelectedAtendente] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'ranking' | 'individual'>('ranking');

  const getActiveUserFullName = (): string => {
    if (currentUser && currentUser.displayName) return currentUser.displayName;
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

  // Check access permissions for Atendente analytics: Master, Gerente, Operador
  const canViewAtendenteAnalytics = useMemo(() => {
    if (!currentUser) return true;
    const role = (currentUser.role || '').toLowerCase();
    const username = (currentUser.username || '').toLowerCase();
    return (
      username === 'master' ||
      role.includes('master') ||
      role.includes('gerente') ||
      role.includes('operador') ||
      role.includes('admin') ||
      role.includes('diretor')
    );
  }, [currentUser]);

  // 1. Operational Overview Calculations
  const statsSummary = useMemo(() => {
    const count = entregas.length;
    if (count === 0) {
      return { 
        totalCargas: 0, 
        successRate: 0, 
        pendingCanhoto: 0, 
        leadTime: 0, 
        totalKm: 0, 
        avgKm: 0,
        totalFreteEmpresa: 0,
        totalFreteMotorista: 0,
        totalMargem: 0
      };
    }

    const entregues = entregas.filter(e => e.status === 'entregue').length;
    const successRate = (entregues / count) * 100;
    const pendingCanhoto = entregas.filter(e => !e.canhoto_solicitado).length;

    let totalKm = 0;
    let totalFreteEmpresa = 0;
    let totalFreteMotorista = 0;

    entregas.forEach(e => {
      totalKm += getDeliveryKm(e);
      totalFreteEmpresa += Number(e.frete_empresa) || 0;
      totalFreteMotorista += Number(e.frete_motorista) || 0;
    });

    const avgKm = count > 0 ? (totalKm / count) : 0;
    const totalMargem = totalFreteEmpresa - totalFreteMotorista;

    return {
      totalCargas: count,
      successRate,
      pendingCanhoto,
      leadTime: 3.2,
      totalKm,
      avgKm,
      totalFreteEmpresa,
      totalFreteMotorista,
      totalMargem
    };
  }, [entregas]);

  // 2. Collection Volume Timeline Chart (Chronological)
  const cronologiaData = useMemo(() => {
    const map: Record<string, number> = {};
    const sorted = [...entregas].sort((a, b) => (a.data_coleta || '').localeCompare(b.data_coleta || ''));

    sorted.forEach(e => {
      const date = e.data_coleta || 'Indefinido';
      map[date] = (map[date] || 0) + 1;
    });

    return Object.entries(map).map(([date, val]) => ({
      date: date.length > 5 ? date.substring(5) : date,
      'Cargas Coletadas': val
    }));
  }, [entregas]);

  // 3. Extract list of all unique Atendentes (vendedores)
  const atendentesList = useMemo(() => {
    const set = new Set<string>();
    entregas.forEach(e => {
      const norm = getNormalizedAtendente(e.vendedor);
      if (norm) set.add(norm);
    });
    const result = Array.from(set).sort();
    if (result.length > 0 && (!selectedAtendente || !result.includes(selectedAtendente))) {
      setSelectedAtendente(result[0]);
    }
    return result;
  }, [entregas, selectedAtendente]);

  // 4. Calculate Ranking and Atendente performance stats across selected period
  const atendenteRankingData = useMemo(() => {
    const filteredEntregas = entregas.filter(e => isEntregaInPeriod(e, selectedPeriod));

    const map: Record<string, {
      name: string;
      cargas: number;
      freteEmpresa: number;
      freteMotorista: number;
      margem: number;
      entregues: number;
      ticketMedio: number;
      percentMargem: number;
    }> = {};

    filteredEntregas.forEach(e => {
      const name = getNormalizedAtendente(e.vendedor);
      if (!name) return; // Skip removed ones (Aranda, Suellen)

      if (!map[name]) {
        map[name] = {
          name,
          cargas: 0,
          freteEmpresa: 0,
          freteMotorista: 0,
          margem: 0,
          entregues: 0,
          ticketMedio: 0,
          percentMargem: 0
        };
      }

      const fEmpresa = Number(e.frete_empresa) || 0;
      const fMotorista = Number(e.frete_motorista) || 0;

      map[name].cargas += 1;
      map[name].freteEmpresa += fEmpresa;
      map[name].freteMotorista += fMotorista;
      map[name].margem += (fEmpresa - fMotorista);
      if (e.status === 'entregue') {
        map[name].entregues += 1;
      }
    });

    // Compute averages & percentages
    const totalEmpresaAll = Object.values(map).reduce((acc, curr) => acc + curr.freteEmpresa, 0);

    const list = Object.values(map).map(item => {
      const ticketMedio = item.cargas > 0 ? item.freteEmpresa / item.cargas : 0;
      const percentMargem = item.freteEmpresa > 0 ? (item.margem / item.freteEmpresa) * 100 : 0;
      const shareFaturamento = totalEmpresaAll > 0 ? (item.freteEmpresa / totalEmpresaAll) * 100 : 0;

      return {
        ...item,
        ticketMedio,
        percentMargem,
        shareFaturamento
      };
    });

    // Sort based on selected metric
    if (selectedMetric === 'faturamento') {
      list.sort((a, b) => b.freteEmpresa - a.freteEmpresa);
    } else if (selectedMetric === 'cargas') {
      list.sort((a, b) => b.cargas - a.cargas);
    } else {
      list.sort((a, b) => b.margem - a.margem);
    }

    return {
      list,
      totalEmpresaAll,
      totalCargasAll: filteredEntregas.length
    };
  }, [entregas, selectedPeriod, selectedMetric]);

  // 5. Individual Atendente Deep Dive Calculations
  const individualStats = useMemo(() => {
    if (!selectedAtendente) return null;

    const filteredEntregas = entregas.filter(e => {
      const norm = getNormalizedAtendente(e.vendedor);
      const matchName = norm === selectedAtendente;
      return matchName && isEntregaInPeriod(e, selectedPeriod);
    });

    let totalFreteEmpresa = 0;
    let totalFreteMotorista = 0;
    let cargasEntregues = 0;
    let totalKm = 0;
    const clientesMap: Record<string, { cargas: number; totalFrete: number }> = {};
    const cronologiaMap: Record<string, number> = {};

    filteredEntregas.forEach(e => {
      const fEmpresa = Number(e.frete_empresa) || 0;
      const fMotorista = Number(e.frete_motorista) || 0;
      totalFreteEmpresa += fEmpresa;
      totalFreteMotorista += fMotorista;
      if (e.status === 'entregue') cargasEntregues++;
      totalKm += getDeliveryKm(e);

      // Client breakdown
      const cliente = (e.cliente || 'Outros').trim();
      if (!clientesMap[cliente]) clientesMap[cliente] = { cargas: 0, totalFrete: 0 };
      clientesMap[cliente].cargas += 1;
      clientesMap[cliente].totalFrete += fEmpresa;

      // Date timeline
      const d = e.data_coleta || 'S/D';
      cronologiaMap[d] = (cronologiaMap[d] || 0) + fEmpresa;
    });

    const totalMargem = totalFreteEmpresa - totalFreteMotorista;
    const totalCargas = filteredEntregas.length;
    const ticketMedio = totalCargas > 0 ? totalFreteEmpresa / totalCargas : 0;
    const percentMargem = totalFreteEmpresa > 0 ? (totalMargem / totalFreteEmpresa) * 100 : 0;
    const taxaConclusao = totalCargas > 0 ? (cargasEntregues / totalCargas) * 100 : 0;

    // Rank position overall
    const allAtendentesSorted = [...atendenteRankingData.list].sort((a, b) => b.freteEmpresa - a.freteEmpresa);
    const posIndex = allAtendentesSorted.findIndex(item => item.name.toLowerCase() === selectedAtendente.trim().toLowerCase());
    const rankPos = posIndex >= 0 ? posIndex + 1 : '-';

    // Top clients array
    const topClientes = Object.entries(clientesMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalFrete - a.totalFrete)
      .slice(0, 5);

    // Chart timeline
    const timelineChartData = Object.entries(cronologiaMap)
      .map(([date, valor]) => ({ date: date.length > 5 ? date.substring(5) : date, 'Frete (R$)': valor }))
      .slice(-15);

    return {
      name: selectedAtendente,
      totalCargas,
      cargasEntregues,
      taxaConclusao,
      totalFreteEmpresa,
      totalFreteMotorista,
      totalMargem,
      percentMargem,
      ticketMedio,
      totalKm,
      rankPos,
      topClientes,
      timelineChartData,
      cargasList: filteredEntregas
    };
  }, [entregas, selectedAtendente, selectedPeriod, atendenteRankingData]);

  // Existing standard analytics lists for lower charts
  const rotasData = useMemo(() => {
    const data: Record<string, number> = {};
    entregas.forEach(e => {
      const route = `${e.origem.split('-')[0]} ➔ ${e.destino.split('-')[0]}`;
      data[route] = (data[route] || 0) + 1;
    });

    return Object.entries(data).map(([name, value]) => ({
      name,
      Viagens: value
    })).sort((a, b) => b.Viagens - a.Viagens).slice(0, 5);
  }, [entregas]);

  const motoristasData = useMemo(() => {
    const data: Record<string, number> = {};
    entregas.forEach(e => {
      const driver = e.motorista || 'Desconhecido';
      data[driver] = (data[driver] || 0) + 1;
    });

    return Object.entries(data).map(([name, value]) => ({
      name,
      Viagens: value
    })).sort((a, b) => b.Viagens - a.Viagens).slice(0, 5);
  }, [entregas]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Title & Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-850 pb-4">
        <div>
          <h2 className="text-xl font-extrabold font-sans tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#FFD600]" />
            DESEMPENHO OPERACIONAL & RANKING DE ATENDENTES
          </h2>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            Consolidado financeiro e de fretes monitorados sob gestão de <strong className="text-[#FFD600]">{getActiveUserFullName()}</strong>
          </p>
        </div>

        {/* Global Operational Quick Badge */}
        <div className="flex items-center gap-2 bg-zinc-900/80 p-2 px-3 rounded-xl border border-zinc-800 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-zinc-400">FRETE TOTAL ACUMULADO:</span>
          <span className="text-[#FFD600] font-black font-mono">
            R$ {statsSummary.totalFreteEmpresa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Primary Analytical KPI Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* KPI 1: Monitored Loads */}
        <div className="bg-[#121212] border border-zinc-800 p-4 rounded-xl shadow-xs space-y-1 hover:border-zinc-700 transition-all">
          <span className="text-[10px] uppercase font-mono text-gray-500 flex items-center gap-1">
            <Package className="w-3.5 h-3.5 text-gray-400" />
            Cargas Monitoradas
          </span>
          <span className="text-2xl font-black font-mono text-white block">
            {statsSummary.totalCargas}
          </span>
          <span className="text-[9px] font-mono text-gray-500 block">Total de romaneios</span>
        </div>

        {/* KPI 2: Total Kilometers */}
        <div className="bg-[#121212] border border-zinc-850 p-4 rounded-xl shadow-xs space-y-1 hover:border-[#FFD600]/40 transition-all">
          <span className="text-[10px] uppercase font-mono text-[#FFD600] font-bold flex items-center gap-1">
            <Navigation className="w-3.5 h-3.5 text-[#FFD600]" />
            Km Monitorados
          </span>
          <span className="text-2xl font-black font-mono text-[#FFD600] block">
            {statsSummary.totalKm.toLocaleString('pt-BR')} <span className="text-[10px] font-normal uppercase text-zinc-500">km</span>
          </span>
          <span className="text-[9px] font-mono text-gray-400 block font-medium">Distância acumulada</span>
        </div>

        {/* KPI 3: Total Frete Empresa */}
        <div className="bg-[#121212] border border-zinc-800 p-4 rounded-xl shadow-xs space-y-1 hover:border-emerald-500/40 transition-all">
          <span className="text-[10px] uppercase font-mono text-emerald-400 font-bold flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            Faturamento Bruto
          </span>
          <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400 block tracking-tight">
            R$ {(statsSummary.totalFreteEmpresa / 1000).toFixed(1)}k
          </span>
          <span className="text-[9px] font-mono text-gray-400 block">Frete Empresa total</span>
        </div>

        {/* KPI 4: Margem Operacional */}
        <div className="bg-[#121212] border border-zinc-800 p-4 rounded-xl shadow-xs space-y-1 hover:border-purple-500/40 transition-all">
          <span className="text-[10px] uppercase font-mono text-purple-400 font-bold flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
            Resultado / Margem
          </span>
          <span className="text-xl sm:text-2xl font-black font-mono text-purple-300 block tracking-tight">
            R$ {(statsSummary.totalMargem / 1000).toFixed(1)}k
          </span>
          <span className="text-[9px] font-mono text-gray-400 block">
            {statsSummary.totalFreteEmpresa > 0 
              ? `${((statsSummary.totalMargem / statsSummary.totalFreteEmpresa) * 100).toFixed(1)}% de margem` 
              : '0%'}
          </span>
        </div>

        {/* KPI 5: Delivery Success Rate */}
        <div className="bg-[#121212] border border-zinc-800 p-4 rounded-xl shadow-xs space-y-1 hover:border-cyan-500/40 transition-all">
          <span className="text-[10px] uppercase font-mono text-gray-500 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
            Taxa Conclusão
          </span>
          <span className="text-2xl font-black font-mono text-cyan-400 block">
            {statsSummary.successRate.toFixed(1)}%
          </span>
          <span className="text-[9px] font-mono text-gray-500 block">Cargas finalizadas</span>
        </div>
      </div>

      {/* ========================================================================================= */}
      {/* NOVO MÓDULO: SEÇÃO DE DESEMPENHO POR ATENDENTE E RANKING DE VENDAS                        */}
      {/* ========================================================================================= */}
      <div className="bg-[#0f0f11] border-2 border-[#FFD600]/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden space-y-6">
        {/* Glow Header Accent */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#FFD600]/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        {/* Access Restriction Notice if lower role */}
        {!canViewAtendenteAnalytics ? (
          <div className="p-8 text-center space-y-3 bg-zinc-950/80 rounded-xl border border-red-900/50 text-red-400">
            <ShieldAlert className="w-10 h-10 text-red-500 mx-auto animate-bounce" />
            <h3 className="text-base font-bold uppercase font-mono">Acesso Restrito ao Painel de Atendentes</h3>
            <p className="text-xs text-zinc-400 max-w-lg mx-auto font-sans">
              As informações financeiras e de faturamento por funcionário são exclusivas para os cargos de <strong>Master, Gerente e Operador</strong>.
            </p>
          </div>
        ) : (
          <>
            {/* Top Toolbar: Module Title, Period Filters & View Tabs */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FFD600] flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#FFD600]" />
                  MÓDULO DE GESTÃO DE ATENDENTES
                </span>
                <h3 className="text-lg font-black font-sans text-white uppercase tracking-tight mt-0.5">
                  Faturamento & Ranking de Funcionários
                </h3>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                {/* View Switcher Tabs */}
                <div className="bg-zinc-950 p-1 rounded-xl border border-zinc-800 flex items-center">
                  <button
                    onClick={() => setActiveTab('ranking')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'ranking'
                        ? 'bg-[#FFD600] text-black shadow-md font-extrabold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    <span>Ranking Geral</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('individual')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'individual'
                        ? 'bg-[#FFD600] text-black shadow-md font-extrabold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Ficha Individual</span>
                  </button>
                </div>

                {/* Period Selector Filter */}
                <div className="bg-zinc-950 p-1 rounded-xl border border-zinc-800 flex items-center gap-1 overflow-x-auto text-[11px] font-mono">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase px-2 hidden xl:inline">Período:</span>
                  {(['hoje', 'semana', 'quinzena', 'mes', 'ano', 'tudo'] as PeriodoFilter[]).map((period) => {
                    const labelMap: Record<PeriodoFilter, string> = {
                      hoje: 'Hoje',
                      semana: '7 Dias',
                      quinzena: '15 Dias',
                      mes: 'Mês',
                      ano: 'Ano',
                      tudo: 'Início até Hoje'
                    };
                    return (
                      <button
                        key={period}
                        onClick={() => setSelectedPeriod(period)}
                        className={`px-2.5 py-1 rounded-lg font-bold uppercase transition-all cursor-pointer whitespace-nowrap ${
                          selectedPeriod === period
                            ? 'bg-zinc-800 text-[#FFD600] border border-[#FFD600]/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {labelMap[period]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* TAB 1: RANKING GERAL DOS ATENDENTES */}
            {activeTab === 'ranking' && (
              <div className="space-y-6">
                {/* Ranking Period & Metric Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/90 p-3 rounded-xl border border-zinc-850">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-zinc-400 uppercase font-bold">Filtrar Ranking por:</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {([
                        { id: 'hoje', label: 'Hoje' },
                        { id: 'semana', label: 'Semanal (7d)' },
                        { id: 'quinzena', label: '15 Dias' },
                        { id: 'mes', label: 'Mensal' },
                        { id: 'ano', label: 'Anual' },
                        { id: 'tudo', label: 'Geral (Todos)' }
                      ] as const).map(p => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedPeriod(p.id)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase transition-all cursor-pointer ${
                            selectedPeriod === p.id
                              ? 'bg-[#FFD600]/20 text-[#FFD600] border border-[#FFD600]/50 font-black'
                              : 'bg-zinc-900 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Metric Switcher */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold">Métrica:</span>
                    <button
                      onClick={() => setSelectedMetric('faturamento')}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase cursor-pointer transition-all ${
                        selectedMetric === 'faturamento'
                          ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-500/50'
                          : 'bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      💰 Faturamento (R$)
                    </button>
                    <button
                      onClick={() => setSelectedMetric('cargas')}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase cursor-pointer transition-all ${
                        selectedMetric === 'cargas'
                          ? 'bg-[#FFD600]/20 text-[#FFD600] border border-[#FFD600]/50'
                          : 'bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      📦 Total Cargas
                    </button>
                    <button
                      onClick={() => setSelectedMetric('margem')}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase cursor-pointer transition-all ${
                        selectedMetric === 'margem'
                          ? 'bg-purple-950/50 text-purple-300 border border-purple-500/50'
                          : 'bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      📈 Margem (R$)
                    </button>
                  </div>
                </div>

                {/* PODIUM SHOWCASE (TOP 3 ATENDENTES) */}
                {atendenteRankingData.list.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    {/* 2º LUGAR (PRATA) */}
                    {atendenteRankingData.list[1] ? (
                      <div 
                        onClick={() => {
                          setSelectedAtendente(atendenteRankingData.list[1].name);
                          setActiveTab('individual');
                        }}
                        className="bg-zinc-900/80 border border-zinc-400/30 hover:border-zinc-300 p-4 rounded-2xl shadow-lg relative flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.02] order-2 md:order-1"
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                          <span className="flex items-center gap-1.5 bg-zinc-800 text-zinc-300 border border-zinc-500/40 text-[10px] font-mono font-black px-2.5 py-1 rounded-full uppercase">
                            <Medal className="w-3.5 h-3.5 text-zinc-300" /> 2º LUGAR
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            {atendenteRankingData.list[1].shareFaturamento.toFixed(1)}% do total
                          </span>
                        </div>

                        <div>
                          <h4 className="text-base font-black text-white uppercase font-sans tracking-wide">
                            {atendenteRankingData.list[1].name}
                          </h4>
                          <span className="text-xs text-zinc-400 font-mono block mt-0.5">
                            {atendenteRankingData.list[1].cargas} cargas operadas
                          </span>

                          <div className="mt-4 p-3 bg-zinc-950 rounded-xl border border-zinc-850">
                            <span className="text-[10px] font-mono text-zinc-500 block uppercase">Faturamento Frete:</span>
                            <span className="text-xl font-black font-mono text-zinc-200 block">
                              R$ {atendenteRankingData.list[1].freteEmpresa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 pt-2 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                          <span>Margem: R$ {atendenteRankingData.list[1].margem.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                          <span className="text-[#FFD600] font-bold flex items-center gap-1">Ver Detalhes <ChevronRight className="w-3 h-3" /></span>
                        </div>
                      </div>
                    ) : (
                      <div className="hidden md:block"></div>
                    )}

                    {/* 1º LUGAR (OURO) */}
                    {atendenteRankingData.list[0] && (
                      <div 
                        onClick={() => {
                          setSelectedAtendente(atendenteRankingData.list[0].name);
                          setActiveTab('individual');
                        }}
                        className="bg-gradient-to-b from-amber-950/40 to-zinc-900 border-2 border-[#FFD600] p-5 rounded-2xl shadow-[0_0_30px_rgba(255,214,0,0.15)] relative flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.02] order-1 md:order-2"
                      >
                        <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2 bg-[#FFD600] text-black font-mono font-black text-[10px] px-4 py-0.5 rounded-full uppercase tracking-wider shadow-md flex items-center gap-1">
                          <Trophy className="w-3.5 h-3.5 fill-black" /> TOP CAMPEÃO DE VENDAS
                        </div>

                        <div className="flex items-center justify-between border-b border-amber-500/30 pb-2 mb-3 mt-1">
                          <span className="flex items-center gap-1.5 bg-[#FFD600] text-black font-mono font-black text-xs px-3 py-1 rounded-full uppercase">
                            🥇 1º LUGAR
                          </span>
                          <span className="text-xs font-mono font-bold text-[#FFD600]">
                            {atendenteRankingData.list[0].shareFaturamento.toFixed(1)}% do total
                          </span>
                        </div>

                        <div>
                          <h4 className="text-lg font-black text-white uppercase font-sans tracking-wide flex items-center gap-2">
                            {atendenteRankingData.list[0].name}
                            <Sparkles className="w-4 h-4 text-[#FFD600]" />
                          </h4>
                          <span className="text-xs text-amber-200/80 font-mono block mt-0.5 font-bold">
                            {atendenteRankingData.list[0].cargas} cargas operadas no período
                          </span>

                          <div className="mt-4 p-3.5 bg-zinc-950/90 rounded-xl border border-amber-500/40">
                            <span className="text-[10px] font-mono text-amber-400 block uppercase font-bold">Faturamento Frete Empresa:</span>
                            <span className="text-2xl font-black font-mono text-[#FFD600] block tracking-tight">
                              R$ {atendenteRankingData.list[0].freteEmpresa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-amber-500/20 flex items-center justify-between text-xs font-mono">
                          <span className="text-emerald-400 font-bold">Margem: R$ {atendenteRankingData.list[0].margem.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                          <span className="text-[#FFD600] font-black uppercase flex items-center gap-1 bg-[#FFD600]/10 px-2 py-1 rounded">Ver Ficha completa →</span>
                        </div>
                      </div>
                    )}

                    {/* 3º LUGAR (BRONZE) */}
                    {atendenteRankingData.list[2] ? (
                      <div 
                        onClick={() => {
                          setSelectedAtendente(atendenteRankingData.list[2].name);
                          setActiveTab('individual');
                        }}
                        className="bg-zinc-900/80 border border-amber-700/30 hover:border-amber-600 p-4 rounded-2xl shadow-lg relative flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.02] order-3"
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                          <span className="flex items-center gap-1.5 bg-amber-950/60 text-amber-500 border border-amber-700/50 text-[10px] font-mono font-black px-2.5 py-1 rounded-full uppercase">
                            <Award className="w-3.5 h-3.5 text-amber-500" /> 3º LUGAR
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            {atendenteRankingData.list[2].shareFaturamento.toFixed(1)}% do total
                          </span>
                        </div>

                        <div>
                          <h4 className="text-base font-black text-white uppercase font-sans tracking-wide">
                            {atendenteRankingData.list[2].name}
                          </h4>
                          <span className="text-xs text-zinc-400 font-mono block mt-0.5">
                            {atendenteRankingData.list[2].cargas} cargas operadas
                          </span>

                          <div className="mt-4 p-3 bg-zinc-950 rounded-xl border border-zinc-850">
                            <span className="text-[10px] font-mono text-zinc-500 block uppercase">Faturamento Frete:</span>
                            <span className="text-xl font-black font-mono text-zinc-200 block">
                              R$ {atendenteRankingData.list[2].freteEmpresa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 pt-2 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                          <span>Margem: R$ {atendenteRankingData.list[2].margem.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                          <span className="text-[#FFD600] font-bold flex items-center gap-1">Ver Detalhes <ChevronRight className="w-3 h-3" /></span>
                        </div>
                      </div>
                    ) : (
                      <div className="hidden md:block"></div>
                    )}
                  </div>
                )}

                {/* FULL RANKING TABLE */}
                <div className="bg-zinc-950 border border-zinc-850 rounded-2xl overflow-hidden">
                  <div className="p-4 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-[#FFD600]" />
                      Tabela Classificatória de Atendentes ({atendenteRankingData.list.length} funcionários no período)
                    </h4>
                    <span className="text-[10px] font-mono text-zinc-500">Clique em qualquer atendente para ver a ficha completa</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="bg-zinc-950 text-zinc-500 uppercase text-[10px] border-b border-zinc-850">
                        <tr>
                          <th className="py-3 px-4 text-center">POS</th>
                          <th className="py-3 px-4">ATENDENTE / FUNCIONÁRIO</th>
                          <th className="py-3 px-4 text-center">CARGAS</th>
                          <th className="py-3 px-4 text-right">FRETE EMPRESA (R$)</th>
                          <th className="py-3 px-4 text-right">REPASSE MOTORISTA</th>
                          <th className="py-3 px-4 text-right">MARGEM (R$)</th>
                          <th className="py-3 px-4 text-center">MARGEM %</th>
                          <th className="py-3 px-4 text-center">AÇÃO</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900 text-zinc-300">
                        {atendenteRankingData.list.map((item, idx) => {
                          const isTop3 = idx < 3;
                          const posBadge = idx === 0 ? '🥇 1º' : idx === 1 ? '🥈 2º' : idx === 2 ? '🥉 3º' : `#${idx + 1}`;
                          return (
                            <tr 
                              key={item.name}
                              onClick={() => {
                                setSelectedAtendente(item.name);
                                setActiveTab('individual');
                              }}
                              className="hover:bg-zinc-900/80 transition-colors cursor-pointer group"
                            >
                              <td className="py-3.5 px-4 text-center">
                                <span className={`inline-block px-2.5 py-0.5 rounded font-bold text-xs ${
                                  idx === 0 
                                    ? 'bg-[#FFD600] text-black font-black' 
                                    : idx === 1 
                                    ? 'bg-zinc-300 text-black font-black' 
                                    : idx === 2 
                                    ? 'bg-amber-800 text-white font-bold' 
                                    : 'bg-zinc-900 text-zinc-400'
                                }`}>
                                  {posBadge}
                                </span>
                              </td>
                              <td className="py-3.5 px-4">
                                <span className="font-extrabold text-white text-sm uppercase group-hover:text-[#FFD600] transition-colors">
                                  {item.name}
                                </span>
                                <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-1.5 overflow-hidden max-w-[140px]">
                                  <div 
                                    className="bg-[#FFD600] h-full rounded-full" 
                                    style={{ width: `${Math.min(100, item.shareFaturamento)}%` }}
                                  ></div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-center font-bold text-white">
                                {item.cargas}
                              </td>
                              <td className="py-3.5 px-4 text-right font-black text-emerald-400">
                                R$ {item.freteEmpresa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono text-zinc-400">
                                R$ {item.freteMotorista.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3.5 px-4 text-right font-black text-purple-300">
                                R$ {item.margem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <span className="px-2 py-0.5 bg-purple-950/60 border border-purple-500/40 text-purple-300 rounded font-bold text-[10px]">
                                  {item.percentMargem.toFixed(1)}%
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <button className="px-3 py-1 bg-zinc-800 group-hover:bg-[#FFD600] group-hover:text-black text-zinc-300 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer">
                                  Ver Ficha →
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: FICHA INDIVIDUAL DO ATENDENTE SELECIONADO */}
            {activeTab === 'individual' && (
              <div className="space-y-6">
                {/* Atendente Selection Bar */}
                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <User className="w-5 h-5 text-[#FFD600]" />
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold block">SELECIONAR FUNCIONÁRIO PARA ANÁLISE COMPLETA:</span>
                      <select
                        value={selectedAtendente}
                        onChange={(e) => setSelectedAtendente(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 text-white font-mono font-bold text-sm rounded-lg px-3 py-1.5 focus:border-[#FFD600] focus:ring-0 focus:outline-none cursor-pointer mt-1 uppercase"
                      >
                        {atendentesList.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Period indicator */}
                  <div className="text-right font-mono text-xs">
                    <span className="text-zinc-500 block">FILTRO TEMPORAL ATIVO:</span>
                    <span className="text-[#FFD600] font-bold uppercase">
                      {selectedPeriod === 'hoje' ? 'HOJE (DIA)' : selectedPeriod === 'semana' ? '7 DIAS (SEMANA)' : selectedPeriod === 'quinzena' ? '15 DIAS' : selectedPeriod === 'mes' ? 'MÊS ATUAL' : selectedPeriod === 'ano' ? 'ANO ATUAL' : 'TODO O HISTÓRICO'}
                    </span>
                  </div>
                </div>

                {individualStats ? (
                  <div className="space-y-6">
                    {/* Individual Header Card */}
                    <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-800 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-gradient-to-br from-[#FFD600] to-amber-600 text-black font-black text-xl rounded-2xl flex items-center justify-center font-mono shadow-lg shrink-0">
                          {individualStats.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">{individualStats.name}</h3>
                            <span className="bg-[#FFD600]/20 text-[#FFD600] border border-[#FFD600]/40 text-[10px] font-mono font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                              {individualStats.rankPos}º NO RANKING GERAL
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 font-mono mt-0.5">
                            Atendente Comercial & Operador Logístico RODOVAR
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800 text-center flex-1 md:flex-initial min-w-[120px]">
                          <span className="text-[9px] font-mono text-zinc-500 block uppercase font-bold">CARGAS ATENDIDAS</span>
                          <span className="text-xl font-black font-mono text-white">{individualStats.totalCargas}</span>
                        </div>
                        <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800 text-center flex-1 md:flex-initial min-w-[120px]">
                          <span className="text-[9px] font-mono text-zinc-500 block uppercase font-bold">TAXA CONCLUSÃO</span>
                          <span className="text-xl font-black font-mono text-cyan-400">{individualStats.taxaConclusao.toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* 4 Financial KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Card 1: Frete Empresa */}
                      <div className="bg-zinc-950 border border-emerald-900/50 p-4 rounded-xl space-y-1 shadow-sm">
                        <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                          Faturamento Frete Empresa
                        </span>
                        <span className="text-2xl font-black font-mono text-emerald-400 block tracking-tight">
                          R$ {individualStats.totalFreteEmpresa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] font-mono text-zinc-500 block">Soma de fretes do funcionário</span>
                      </div>

                      {/* Card 2: Repasse Motorista */}
                      <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl space-y-1 shadow-sm">
                        <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold flex items-center gap-1">
                          <Wallet className="w-3.5 h-3.5 text-zinc-400" />
                          Repasse aos Motoristas
                        </span>
                        <span className="text-2xl font-black font-mono text-zinc-200 block tracking-tight">
                          R$ {individualStats.totalFreteMotorista.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] font-mono text-zinc-500 block">Custo total de terceiros</span>
                      </div>

                      {/* Card 3: Margem Operacional */}
                      <div className="bg-zinc-950 border border-purple-900/50 p-4 rounded-xl space-y-1 shadow-sm">
                        <span className="text-[10px] font-mono uppercase text-purple-300 font-bold flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5 text-purple-300" />
                          Resultado Operacional (Lucro)
                        </span>
                        <span className="text-2xl font-black font-mono text-purple-300 block tracking-tight">
                          R$ {individualStats.totalMargem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] font-mono text-purple-400 block font-bold">
                          Margem líquida: {individualStats.percentMargem.toFixed(1)}%
                        </span>
                      </div>

                      {/* Card 4: Total Cargas */}
                      <div className="bg-zinc-950 border border-blue-900/50 p-4 rounded-xl space-y-1 shadow-sm">
                        <span className="text-[10px] font-mono uppercase text-blue-400 font-bold flex items-center gap-1">
                          <Package className="w-3.5 h-3.5 text-blue-400" />
                          Volume de Cargas Operadas
                        </span>
                        <span className="text-2xl font-black font-mono text-blue-400 block tracking-tight">
                          {individualStats.totalCargas} <span className="text-xs font-normal text-zinc-500">cargas</span>
                        </span>
                        <span className="text-[9px] font-mono text-zinc-500 block">Total de romaneios no período</span>
                      </div>
                    </div>

                    {/* Breakdown Grid: Chart Timeline & Top Clients */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Timeline Chart */}
                      <div className="lg:col-span-2 bg-zinc-950 border border-zinc-850 p-5 rounded-2xl">
                        <h4 className="text-xs font-mono font-bold uppercase text-zinc-200 mb-4 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-[#FFD600]" />
                          Evolução de Fretes Operados por {individualStats.name} (R$)
                        </h4>
                        <div className="h-64 w-full">
                          {individualStats.timelineChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={individualStats.timelineChartData}>
                                <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} />
                                <YAxis tick={{ fill: '#71717a', fontSize: 10 }} />
                                <Tooltip 
                                  formatter={(val: any) => [`R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Frete']}
                                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a' }} 
                                />
                                <Bar dataKey="Frete (R$)" fill="#FFD600" radius={[4, 4, 0, 0]} barSize={28} />
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-full flex items-center justify-center text-zinc-600 font-mono text-xs">
                              Nenhum movimento registrado no período selecionado.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Top Clients for this Atendente */}
                      <div className="bg-zinc-950 border border-zinc-850 p-5 rounded-2xl flex flex-col justify-between">
                        <div>
                          <h4 className="text-xs font-mono font-bold uppercase text-zinc-200 mb-4 flex items-center gap-2">
                            <Star className="w-4 h-4 text-[#FFD600]" />
                            Top Clientes Atendidos por {individualStats.name.split(' ')[0]}
                          </h4>

                          <div className="space-y-3">
                            {individualStats.topClientes.map((c, i) => (
                              <div key={c.name} className="flex items-center justify-between p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-850 font-mono text-xs">
                                <div>
                                  <span className="font-bold text-white block uppercase text-[11px]">{c.name}</span>
                                  <span className="text-[10px] text-zinc-500">{c.cargas} carga(s)</span>
                                </div>
                                <span className="font-extrabold text-emerald-400">
                                  R$ {c.totalFrete.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                                </span>
                              </div>
                            ))}
                            {individualStats.topClientes.length === 0 && (
                              <p className="text-zinc-600 font-mono text-xs text-center py-6">Sem registros de cliente.</p>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-zinc-850 text-[10px] font-mono text-zinc-500 text-center">
                          Total de Clientes Atendidos: {individualStats.topClientes.length}
                        </div>
                      </div>
                    </div>

                    {/* Table of Cargas for this Atendente */}
                    <div className="bg-zinc-950 border border-zinc-850 rounded-2xl overflow-hidden">
                      <div className="p-4 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
                        <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                          <Truck className="w-4 h-4 text-[#FFD600]" />
                          Histórico de Cargas do Atendente ({individualStats.cargasList.length} romaneios)
                        </h4>
                      </div>

                      <div className="overflow-x-auto max-h-80 overflow-y-auto">
                        <table className="w-full text-left font-mono text-xs">
                          <thead className="bg-zinc-950 text-zinc-500 uppercase text-[10px] border-b border-zinc-850 sticky top-0">
                            <tr>
                              <th className="py-2.5 px-3">DATA</th>
                              <th className="py-2.5 px-3">CLIENTE</th>
                              <th className="py-2.5 px-3">MOTORISTA</th>
                              <th className="py-2.5 px-3">ROTA (ORIGEM ➔ DESTINO)</th>
                              <th className="py-2.5 px-3 text-right">FRETE EMPRESA</th>
                              <th className="py-2.5 px-3 text-right">FRETE MOTORISTA</th>
                              <th className="py-2.5 px-3 text-right">MARGEM</th>
                              <th className="py-2.5 px-3 text-center">STATUS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900 text-zinc-300 text-[11px]">
                            {individualStats.cargasList.map(e => {
                              const fEmpresa = Number(e.frete_empresa) || 0;
                              const fMotorista = Number(e.frete_motorista) || 0;
                              const margem = fEmpresa - fMotorista;
                              return (
                                <tr key={e.id} className="hover:bg-zinc-900/50">
                                  <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">{e.data_coleta || e.created_at?.substring(0, 10)}</td>
                                  <td className="py-2.5 px-3 font-bold text-white uppercase">{e.cliente}</td>
                                  <td className="py-2.5 px-3 text-zinc-300 uppercase">{e.motorista}</td>
                                  <td className="py-2.5 px-3 text-zinc-400">{e.origem.split('-')[0]} ➔ {e.destino.split('-')[0]}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-emerald-400">R$ {fEmpresa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  <td className="py-2.5 px-3 text-right text-zinc-400">R$ {fMotorista.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-purple-300">R$ {margem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                      e.status === 'entregue'
                                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                        : 'bg-amber-950 text-amber-400 border border-amber-800'
                                    }`}>
                                      {e.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center text-zinc-500 font-mono text-xs bg-zinc-950 rounded-2xl border border-zinc-850">
                    Nenhum atendente selecionado ou sem dados de frete registrados no período.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Grid: Bar charts for Routes & Drivers (Lower operational section) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        {/* Rotas Mais Utilizadas */}
        <div className="bg-[#121212] border border-zinc-800 p-5 rounded-2xl shadow-sm">
          <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#FFD600] flex items-center gap-1.5 mb-4">
            <Navigation className="w-4 h-4 text-[#FFD600]" />
            Densidade de Rotas Atendidas (Top 5)
          </span>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rotasData} layout="vertical" margin={{ left: 15, right: 10 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fill: '#ffffff', fontSize: 9, fontWeight: 500 }} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a' }} />
                <Bar dataKey="Viagens" fill="#FFD600" radius={[0, 4, 4, 0]} barSize={16}>
                  {rotasData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#FFD600' : '#ffffff'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Motoristas Ativos Volume Panel */}
        <div className="bg-[#121212] border border-zinc-800 p-5 rounded-2xl shadow-sm">
          <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-zinc-300 flex items-center gap-1.5 mb-4">
            <Gauge className="w-4 h-4 text-[#FFD600]" />
            Ranking de Viagens por Motorista (Top 5)
          </span>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={motoristasData}>
                <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a' }} />
                <Bar dataKey="Viagens" fill="#ffffff" radius={[4, 4, 0, 0]} barSize={26}>
                  {motoristasData.map((e, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#FFD600' : '#ffffff'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
