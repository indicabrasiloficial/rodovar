import { useMemo } from 'react';
import { Entrega } from '../types';
import { getDeliveryKm } from '../utils/distance';
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
  Package
} from 'lucide-react';

interface StatisticsProps {
  entregas: Entrega[];
}

export default function Statistics({ entregas }: StatisticsProps) {
  
  // 1. Calculations: Vendedor operational activity (number of loads)
  const vendedorData = useMemo(() => {
    const data: Record<string, number> = {};
    entregas.forEach(e => {
      const sellerName = e.vendedor || 'Indefinido';
      data[sellerName] = (data[sellerName] || 0) + 1;
    });

    return Object.entries(data).map(([name, val]) => ({
      name,
      'Cargas Monitoradas': val
    })).sort((a, b) => b['Cargas Monitoradas'] - a['Cargas Monitoradas']);
  }, [entregas]);

  // 2. Calculations: Most frequent routes
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

  // 3. Calculations: Driver ranking (number of trips)
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

  // 4. Calculations: Collection volume timeline
  const cronologiaData = useMemo(() => {
    const map: Record<string, number> = {};
    // Sort all records chronologically
    const sorted = [...entregas].sort((a, b) => a.data_coleta.localeCompare(b.data_coleta));
    
    sorted.forEach(e => {
      const date = e.data_coleta;
      map[date] = (map[date] || 0) + 1;
    });

    return Object.entries(map).map(([date, val]) => ({
      date: date.substring(5), // Show MM-DD for cleaner chart layout
      'Cargas Coletadas': val
    }));
  }, [entregas]);

  // 5. Calculations: Driver total kilometers ranking
  const motoristasKmData = useMemo(() => {
    const data: Record<string, number> = {};
    entregas.forEach(e => {
      const driver = e.motorista || 'Desconhecido';
      const km = getDeliveryKm(e);
      data[driver] = (data[driver] || 0) + km;
    });

    return Object.entries(data).map(([name, value]) => ({
      name,
      'Quilometros': value
    })).sort((a, b) => b['Quilometros'] - a['Quilometros']).slice(0, 5);
  }, [entregas]);

  // General calculated operational indices
  const statsSummary = useMemo(() => {
    const count = entregas.length;
    if (count === 0) return { totalCargas: 0, successRate: 0, pendingCanhoto: 0, leadTime: 0, totalKm: 0, avgKm: 0 };

    const entregues = entregas.filter(e => e.status === 'entregue').length;
    const successRate = (entregues / count) * 100;
    const pendingCanhoto = entregas.filter(e => !e.canhoto_solicitado).length;

    // Simulated average transit time based on delivery size
    const leadTime = 3.2 + (count % 3) * 0.3; 

    // Sum up real kilometers
    let totalKm = 0;
    entregas.forEach(e => {
      totalKm += getDeliveryKm(e);
    });
    const avgKm = count > 0 ? (totalKm / count) : 0;

    return {
      totalCargas: count,
      successRate,
      pendingCanhoto,
      leadTime,
      totalKm,
      avgKm
    };
  }, [entregas]);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold font-sans tracking-tight">📊 DESEMPENHO OPERACIONAL RODOVAR</h2>
        <p className="text-xs text-gray-400 font-mono">Consolidado e análises logísticas sob gerência de Jairo Bahia</p>
      </div>

      {/* Analytical KPI Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* KPI 1: Monitored Loads */}
        <div className="bg-[#121212] border border-zinc-800 p-4 rounded-xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-mono text-gray-500 flex items-center gap-1">
            <Package className="w-3.5 h-3.5 text-gray-400" />
            Cargas Monitoradas
          </span>
          <span className="text-2xl font-extrabold font-mono text-white block">
            {statsSummary.totalCargas}
          </span>
          <span className="text-[9px] font-mono text-gray-500 block">Total histórico no sistema</span>
        </div>

        {/* KPI 2: Total Kilometers */}
        <div className="bg-[#121212] border border-zinc-850 p-4 rounded-xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-mono text-[#FFD600] font-bold flex items-center gap-1">
            <Navigation className="w-3.5 h-3.5 text-[#FFD600]" />
            Km Monitorados
          </span>
          <span className="text-2xl font-extrabold font-mono text-[#FFD600] block">
            {statsSummary.totalKm.toLocaleString('pt-BR')} <span className="text-[10px] font-normal uppercase text-zinc-500">km</span>
          </span>
          <span className="text-[9px] font-mono text-gray-400 block font-medium">Acumulado de rotas</span>
        </div>

        {/* KPI 3: Average Distance */}
        <div className="bg-[#121212] border border-zinc-800 p-4 rounded-xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-mono text-gray-500 flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5 text-gray-400" />
            Média p/ Viagem
          </span>
          <span className="text-2xl font-extrabold font-mono text-white block">
            {statsSummary.avgKm.toFixed(0)} <span className="text-[10px] font-normal uppercase text-zinc-500">km</span>
          </span>
          <span className="text-[9px] font-mono text-gray-400 block">Distância por romaneio</span>
        </div>

        {/* KPI 4: Delivery Success Rate */}
        <div className="bg-[#121212] border border-zinc-800 p-4 rounded-xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-mono text-gray-500 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            Taxa de Conclusão
          </span>
          <span className="text-2xl font-extrabold font-mono text-emerald-400 block">
            {statsSummary.successRate.toFixed(1)}%
          </span>
          <span className="text-[9px] font-mono text-gray-555 block">Percentual concluído</span>
        </div>

        {/* KPI 5: Pending Receivers */}
        <div className="bg-[#121212] border border-zinc-800 p-4 rounded-xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-mono text-gray-500 flex items-center gap-1">
            <FileCheck className="w-3.5 h-3.5 text-orange-400" />
            Pendente de Canhoto
          </span>
          <span className="text-2xl font-extrabold font-mono text-orange-400 block">
            {statsSummary.pendingCanhoto}
          </span>
          <span className="text-[9px] font-mono text-gray-500 block">Aguardando anexação</span>
        </div>
      </div>

      {/* Trajectory Area Chronology Charts */}
      <div className="bg-[#121212] border border-zinc-800 p-5 rounded-2xl shadow-sm">
        <h3 className="text-xs font-bold font-sans uppercase tracking-wider text-gray-200 mb-4 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-[#FFD600]" />
          Volumetria de Coletas Diárias (Movimento Cronológico)
        </h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cronologiaData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
              <defs>
                <linearGradient id="colorChronology" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FFD600" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#FFD600" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={{ stroke: '#27272a' }} />
              <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={{ stroke: '#27272a' }} allowDecimals={false} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#18181b', 
                  borderColor: '#2d2d30',
                  borderRadius: '10px'
                }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
              <Area type="monotone" dataKey="Cargas Coletadas" stroke="#FFD600" strokeWidth={2.5} fillOpacity={1} fill="url(#colorChronology)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grid: Bar charts for Sellers & Horizontal charts for Routes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Vendedor Performance */}
        <div className="bg-[#121212] border border-zinc-800 p-5 rounded-2xl shadow-sm">
          <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#FFD600] flex items-center gap-1 mb-4">
            <Users className="w-4 h-4 text-[#FFD600]" />
            Cargas Atribuídas por Vendedor Comissionado
          </span>
          
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vendedorData}>
                <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a' }} />
                <Bar dataKey="Cargas Monitoradas" fill="#FFD600" radius={[4, 4, 0, 0]} barSize={34}>
                  {vendedorData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#FFD600' : '#ffffff'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rotas Mais Utilizadas */}
        <div className="bg-[#121212] border border-zinc-800 p-5 rounded-2xl shadow-sm">
          <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#FFD600] flex items-center gap-1 mb-4">
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

          <div className="h-56 w-full">
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

        {/* Motoristas Ativos KM Panel */}
        <div className="bg-[#121212] border border-zinc-800 p-5 rounded-2xl shadow-sm">
          <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#FFD600] flex items-center gap-1.5 mb-4">
            <Navigation className="w-4 h-4 text-[#FFD600]" />
            Km Acumulados por Motorista (Top 5)
          </span>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={motoristasKmData}>
                <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} />
                <YAxis tick={{ fill: '#71717a', fontSize: 10 }} />
                <Tooltip 
                  formatter={(value: any) => [`${value.toLocaleString('pt-BR')} km`, 'Quilômetros']}
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a' }} 
                />
                <Bar dataKey="Quilometros" fill="#FFD600" radius={[4, 4, 0, 0]} barSize={26}>
                  {motoristasKmData.map((e, index) => (
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
