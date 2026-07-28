import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  AlertTriangle, 
  ShieldAlert, 
  RefreshCw, 
  Loader2, 
  Calendar, 
  RotateCcw,
  MapPin,
  Navigation,
  ArrowRight,
  Building2,
  User,
  Truck,
  UserCheck,
  Clock,
  MessageSquare,
  Lock
} from 'lucide-react';
import { 
  fetchFretesPainel, 
  adicionarComentarioVisitante, 
  FretePainelVisitante 
} from '../utils/painelFretesService';
import { formatDateBR, formatDateTimeBR } from '../utils/date';

interface PainelFretesVisitantesProps {
  currentUser?: {
    uid?: string;
    username?: string;
    nome?: string;
    cargo?: string;
    role?: string;
  } | null;
  onNavigateHome?: () => void;
}

export const PainelFretesVisitantes: React.FC<PainelFretesVisitantesProps> = ({
  currentUser,
  onNavigateHome
}) => {
  // ----------------------------------------------------
  // 1. GUARD DE ACESSO POR ROLE
  // ----------------------------------------------------
  const activeUser = useMemo(() => {
    if (currentUser) return currentUser;
    const stored = localStorage.getItem('rodovar_active_login_v2');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {}
    }
    return null;
  }, [currentUser]);

  const userRole = (activeUser?.cargo || activeUser?.role || activeUser?.username || 'visitante').toString();
  const userName = activeUser?.nome || activeUser?.username || 'Usuário';
  const userId = activeUser?.uid || activeUser?.username || 'usr_' + userName.toLowerCase().replace(/\s+/g, '_');

  // Roles autorizadas para esta rota
  const ROLES_PERMITIDAS = ['Comercial', 'Expedição', 'Expedicao', 'Gerente', 'Master', 'Admin', 'admin', 'master'];
  
  const hasPermission = useMemo(() => {
    if (!activeUser) return false;
    const roleNormalized = userRole.trim();
    return ROLES_PERMITIDAS.some(r => r.toLowerCase() === roleNormalized.toLowerCase());
  }, [activeUser, userRole]);

  // Today ISO YYYY-MM-DD
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);

  // States
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [fretes, setFretes] = useState<FretePainelVisitante[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Filter & Search states
  const [filterTab, setFilterTab] = useState<'todos' | 'no_prazo' | 'prazo_hoje' | 'atrasados'>('todos');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Draft comments per freteId
  const [draftComments, setDraftComments] = useState<Record<string, string>>({});
  const [submittingMap, setSubmittingMap] = useState<Record<string, boolean>>({});
  const [toastErrorMap, setToastErrorMap] = useState<Record<string, string>>({});

  // ----------------------------------------------------
  // 2. CAMADA DE LEITURA OTIMIZADA POR DATA
  // ----------------------------------------------------
  const loadData = async (isBackground = false, forceServer = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);
    
    setErrorMsg(null);
    try {
      const data = await fetchFretesPainel(selectedDate, forceServer);
      setFretes(data);
    } catch (err: any) {
      console.error('Erro ao carregar dados do Painel de Fretes:', err);
      if (!isBackground) {
        setErrorMsg('Não foi possível carregar os fretes do servidor. Verifique sua conexão.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Re-fetch whenever selectedDate changes
  useEffect(() => {
    if (hasPermission) {
      loadData(false, false);
    }
  }, [hasPermission, selectedDate]);

  // Polling a cada 30s apenas em background sem desatar a UI
  useEffect(() => {
    if (!hasPermission) return;
    const interval = setInterval(() => {
      loadData(true, true);
    }, 30000);
    return () => clearInterval(interval);
  }, [hasPermission, selectedDate]);

  // Helper para calcular situação de prazo (no prazo / prazo hoje / atrasado)
  const getPrazoSituation = (frete: FretePainelVisitante) => {
    if (frete.status === 'entregue') {
      return { label: 'ENTREGUE', color: 'bg-emerald-950/60 border-emerald-600/60 text-emerald-400', key: 'entregue' };
    }
    if (!frete.prazo) {
      return { label: 'NO PRAZO', color: 'bg-amber-950/40 border-amber-600/40 text-[#FFD600]', key: 'no_prazo' };
    }

    const prazoStr = frete.prazo;

    if (prazoStr === todayIso) {
      return { label: 'PRAZO HOJE', color: 'bg-amber-950/80 border-amber-500 text-[#FFD600] font-black shadow-[0_0_10px_rgba(255,214,0,0.25)]', key: 'prazo_hoje' };
    } else if (prazoStr < todayIso) {
      return { label: 'ATRASADO', color: 'bg-red-950/80 border-red-500 text-red-400 font-black shadow-[0_0_10px_rgba(239,68,68,0.25)]', key: 'atrasado' };
    } else {
      return { label: 'NO PRAZO', color: 'bg-amber-950/40 border-amber-600/40 text-[#FFD600]', key: 'no_prazo' };
    }
  };

  // Helper para tempo relativo
  const getRelativeTime = (dateIso: string) => {
    if (!dateIso) return 'agora';
    const diffMs = Date.now() - new Date(dateIso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `há ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `há ${hours} h`;
    return `há ${Math.floor(hours / 24)} d`;
  };

  // Contadores para abas
  const counts = useMemo(() => {
    let noPrazo = 0;
    let prazoHoje = 0;
    let atrasados = 0;

    fretes.forEach(f => {
      const sit = getPrazoSituation(f);
      if (sit.key === 'prazo_hoje') prazoHoje++;
      else if (sit.key === 'atrasado') atrasados++;
      else noPrazo++;
    });

    return { noPrazo, prazoHoje, atrasados, total: fretes.length };
  }, [fretes]);

  // Lista filtrada no cliente
  const filteredFretes = useMemo(() => {
    return fretes.filter(f => {
      const sit = getPrazoSituation(f);
      if (filterTab === 'no_prazo' && sit.key !== 'no_prazo') return false;
      if (filterTab === 'prazo_hoje' && sit.key !== 'prazo_hoje') return false;
      if (filterTab === 'atrasados' && sit.key !== 'atrasado') return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchRota = `${f.origem} ${f.destino}`.toLowerCase().includes(term);
        const matchCliente = f.cliente.toLowerCase().includes(term);
        const matchMotorista = f.motorista.toLowerCase().includes(term);
        const matchAtendente = f.vendedor.toLowerCase().includes(term);
        return matchRota || matchCliente || matchMotorista || matchAtendente;
      }

      return true;
    });
  }, [fretes, filterTab, searchTerm]);

  // Paginação de 20 por vez para otimização de cota
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [filterTab, searchTerm, selectedDate]);

  const totalPages = Math.max(1, Math.ceil(filteredFretes.length / ITEMS_PER_PAGE));
  const paginatedFretes = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredFretes.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredFretes, currentPage]);

  // ----------------------------------------------------
  // 3. CAMADA DE ESCRITA — COMENTÁRIO DO VISITANTE
  // ----------------------------------------------------
  const handleRegistrarComentario = async (freteId: string) => {
    const targetFrete = fretes.find(f => f.id === freteId);
    if (targetFrete && (targetFrete.status || '').toLowerCase() === 'entregue') {
      setToastErrorMap(prev => ({ ...prev, [freteId]: 'Comentários bloqueados para fretes com status ENTREGUE.' }));
      return;
    }

    const texto = draftComments[freteId] || '';
    if (!texto.trim()) return;

    setSubmittingMap(prev => ({ ...prev, [freteId]: true }));
    setToastErrorMap(prev => ({ ...prev, [freteId]: '' }));

    try {
      const novoComentario = await adicionarComentarioVisitante(freteId, texto, {
        uid: userId,
        nome: userName,
        role: userRole
      });

      // Atualiza estado local imediatamente
      setFretes(prev => prev.map(f => {
        if (f.id === freteId) {
          return {
            ...f,
            comentarios_visitantes: [...(f.comentarios_visitantes || []), novoComentario]
          };
        }
        return f;
      }));

      // Limpa rascunho após sucesso
      setDraftComments(prev => ({ ...prev, [freteId]: '' }));
    } catch (err: any) {
      console.error('Erro ao registrar comentário:', err);
      setToastErrorMap(prev => ({ 
        ...prev, 
        [freteId]: err.message || 'Erro ao enviar comentário. Tente novamente.' 
      }));
      setTimeout(() => {
        setToastErrorMap(prev => ({ ...prev, [freteId]: '' }));
      }, 5000);
    } finally {
      setSubmittingMap(prev => ({ ...prev, [freteId]: false }));
    }
  };

  // Redireciona se não tiver permissão
  if (!hasPermission) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-white flex flex-col items-center justify-center p-6 font-mono">
        <div className="bg-zinc-950 border border-red-900/60 rounded-2xl p-8 max-w-md text-center space-y-4 shadow-2xl">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
          <h2 className="text-xl font-bold text-red-400 uppercase tracking-widest">Acesso Restrito</h2>
          <p className="text-xs text-zinc-400 leading-relaxed font-sans">
            A rota <code className="text-[#FFD600]">/painel-fretes</code> é destinada exclusivamente aos perfis <strong className="text-white">Comercial</strong>, <strong className="text-white">Expedição</strong>, <strong className="text-white">Gerente</strong> e <strong className="text-white">Master</strong>.
          </p>
          <div className="text-[10px] bg-zinc-900 p-3 rounded-lg border border-zinc-800 text-zinc-400">
            Seu perfil atual: <span className="text-[#FFD600] font-bold">{userRole}</span> ({userName})
          </div>
          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="w-full py-2.5 bg-[#FFD600] text-black font-black uppercase text-xs rounded-xl hover:bg-[#ffe23b] transition-all cursor-pointer shadow-lg"
            >
              Voltar ao Início
            </button>
          )}
        </div>
      </div>
    );
  }

  const currentDateFormatted = new Date().toLocaleDateString('pt-BR');
  const currentTimeFormatted = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-200 font-sans select-none pb-16">
      {/* Stripe de Atenção */}
      <div className="h-2.5 w-full bg-[repeating-linear-gradient(45deg,#000,#000_15px,#FFD600_15px,#FFD600_30px)] shadow-md"></div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-zinc-900">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-black font-sans uppercase tracking-tight text-white">
                PAINEL DE <span className="text-[#FFD600]">FRETES</span>
              </h1>
              {refreshing && (
                <Loader2 className="w-4 h-4 text-[#FFD600] animate-spin" title="Sincronizando..." />
              )}
            </div>
            <p className="text-xs font-mono text-zinc-400 mt-1">
              RODOVAR • Comercial & Expedição • logado como <strong className="text-[#FFD600]">{userRole} — {userName}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono shrink-0 flex-wrap">
            <button
              onClick={() => loadData(false, true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-bold transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#FFD600] ${refreshing ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>

            <div className="inline-flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 px-3 py-1.5 rounded-lg font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>AO VIVO</span>
              <span className="text-zinc-500 font-normal">
                {currentDateFormatted} • {currentTimeFormatted}
              </span>
            </div>
          </div>
        </div>

        {/* Filter Controls Bar (Status Tabs + Date Selector + Search) */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-zinc-950/60 p-3 rounded-2xl border border-zinc-900">
          
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <button
              onClick={() => setFilterTab('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer border shrink-0 ${
                filterTab === 'todos'
                  ? 'bg-[#FFD600] text-black border-[#FFD600] shadow-[0_0_12px_rgba(255,214,0,0.25)]'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              TODOS <span className="opacity-75">{counts.total}</span>
            </button>

            <button
              onClick={() => setFilterTab('no_prazo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer border shrink-0 ${
                filterTab === 'no_prazo'
                  ? 'bg-amber-950 text-[#FFD600] border-amber-500'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              NO PRAZO <span className="opacity-75">{counts.noPrazo}</span>
            </button>

            <button
              onClick={() => setFilterTab('prazo_hoje')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer border shrink-0 ${
                filterTab === 'prazo_hoje'
                  ? 'bg-amber-950 text-[#FFD600] border-amber-500 shadow-[0_0_10px_rgba(255,214,0,0.3)]'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              PRAZO HOJE <span className="text-[#FFD600] font-extrabold">{counts.prazoHoje}</span>
            </button>

            <button
              onClick={() => setFilterTab('atrasados')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer border shrink-0 ${
                filterTab === 'atrasados'
                  ? 'bg-red-950 text-red-400 border-red-600 shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              ATRASADOS <span className="text-red-400 font-extrabold">{counts.atrasados}</span>
            </button>
          </div>

          {/* Date Selector (Calendário) */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative inline-flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs font-mono text-zinc-200">
              <Calendar className="w-3.5 h-3.5 text-[#FFD600] mr-2 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDate(e.target.value);
                  }
                }}
                className="bg-transparent text-zinc-200 font-mono text-xs focus:outline-none cursor-pointer [color-scheme:dark]"
              />
            </div>

            {selectedDate !== todayIso && (
              <button
                type="button"
                onClick={() => setSelectedDate(todayIso)}
                title="Voltar para a data de Hoje"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-950/60 border border-amber-500/60 text-[#FFD600] rounded-xl text-xs font-mono font-bold hover:bg-amber-900 transition-all cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Hoje</span>
              </button>
            )}
          </div>

          {/* Search Bar */}
          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por rota ou cliente..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:border-[#FFD600] focus:ring-0 focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Global Error Message */}
        {errorMsg && (
          <div className="p-4 bg-red-950/40 border border-red-900/80 rounded-xl text-red-300 text-xs font-mono flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => loadData(false, true)} className="underline text-red-200 hover:text-white cursor-pointer font-bold">Tentar novamente</button>
          </div>
        )}

        {/* Skeleton Row Loading State while switching dates */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-zinc-950/80 border border-zinc-900 rounded-2xl p-5 space-y-4 animate-pulse">
                <div className="flex items-center justify-between border-b border-zinc-900/80 pb-3">
                  <div className="h-5 w-64 bg-zinc-800/80 rounded-md"></div>
                  <div className="h-5 w-24 bg-zinc-800/80 rounded-md"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-20 bg-zinc-900/60 rounded-xl"></div>
                  <div className="h-20 bg-zinc-900/60 rounded-xl"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredFretes.length === 0 ? (
          <div className="py-16 text-center bg-zinc-950/50 border border-zinc-900 rounded-2xl space-y-2 font-mono">
            <p className="text-sm font-bold text-zinc-400">Nenhum frete localizado para esta data ({selectedDate.split('-').reverse().join('/')}).</p>
            <p className="text-xs text-zinc-600">Selecione outra data no calendário acima ou clique em "Hoje".</p>
          </div>
        ) : (
          /* Cards List */
          <div className="space-y-4">
            {paginatedFretes.map((frete) => {
              const prazoSit = getPrazoSituation(frete);
              const draftText = draftComments[frete.id] || '';
              const isSubmitting = Boolean(submittingMap[frete.id]);
              const toastError = toastErrorMap[frete.id];

              return (
                <div 
                  key={frete.id} 
                  className="bg-zinc-950/90 border border-zinc-900 rounded-2xl p-5 shadow-xl space-y-4 hover:border-zinc-800 transition-all"
                >
                  {/* Top Row: Rota + Cliente & Motorista + Status Badge */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 border-b border-zinc-900/80 pb-4">
                    
                    {/* Column 1: ORIGEM ➔ DESTINO (lg:col-span-5) */}
                    <div className="lg:col-span-5 space-y-2">
                      <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between gap-3 shadow-inner">
                        {/* ORIGEM */}
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-[#FFD600] uppercase tracking-wider">
                            <MapPin className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                            <span>ORIGEM</span>
                          </div>
                          <p className="text-sm font-black text-white uppercase tracking-wide truncate" title={frete.origem}>
                            {frete.origem}
                          </p>
                        </div>

                        {/* Rota Icon Connector */}
                        <div className="flex flex-col items-center justify-center shrink-0 px-1">
                          <div className="w-7 h-7 rounded-full bg-zinc-800/90 border border-zinc-700 flex items-center justify-center shadow-sm">
                            <ArrowRight className="w-3.5 h-3.5 text-[#FFD600]" />
                          </div>
                        </div>

                        {/* DESTINO */}
                        <div className="space-y-0.5 min-w-0 flex-1 text-right">
                          <div className="flex items-center justify-end gap-1 text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                            <span>DESTINO</span>
                            <Navigation className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          </div>
                          <p className="text-sm font-black text-white uppercase tracking-wide truncate" title={frete.destino}>
                            {frete.destino}
                          </p>
                        </div>
                      </div>

                      {/* Metadata Pills */}
                      <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono text-zinc-400">
                        {frete.km ? (
                          <span className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-md text-zinc-300">
                            <Truck className="w-3 h-3 text-zinc-500" />
                            <span>{frete.km} km</span>
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-md text-zinc-300">
                          <Calendar className="w-3 h-3 text-[#FFD600]" />
                          <span>Coleta: <strong className="text-white">{formatDateBR(frete.data_coleta)}</strong></span>
                        </span>
                        <span className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-md text-zinc-300">
                          <UserCheck className="w-3 h-3 text-amber-400" />
                          <span>Aten: <strong className="text-white">{frete.vendedor}</strong></span>
                        </span>
                      </div>
                    </div>

                    {/* Column 2: CLIENTE & MOTORISTA (lg:col-span-4) */}
                    <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* Cliente */}
                      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-2.5 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                          <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>CLIENTE / EMPRESA</span>
                        </div>
                        <p className="text-xs font-bold text-white uppercase tracking-wide mt-1 line-clamp-2" title={frete.cliente}>
                          {frete.cliente || 'NÃO INFORMADO'}
                        </p>
                      </div>

                      {/* Motorista */}
                      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-2.5 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-blue-400 uppercase tracking-wider">
                          <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>MOTORISTA</span>
                        </div>
                        <p className="text-xs font-bold text-zinc-200 uppercase tracking-wide mt-1 line-clamp-2" title={frete.motorista}>
                          {frete.motorista || 'NÃO INFORMADO'}
                        </p>
                      </div>
                    </div>

                    {/* Column 3: PRAZO & STATUS BADGE (lg:col-span-3) */}
                    <div className="lg:col-span-3 flex flex-col justify-between items-start lg:items-end gap-2">
                      <div className="text-left lg:text-right w-full">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-black border ${prazoSit.color}`}>
                          <Clock className="w-3.5 h-3.5" />
                          {prazoSit.label}
                        </span>
                      </div>
                      <div className="text-left lg:text-right font-mono text-[10px] text-zinc-500 space-y-0.5 w-full">
                        <p>Prazo: <strong className="text-zinc-300">{formatDateBR(frete.prazo)}</strong></p>
                        <p>Atualizado em {formatDateTimeBR(frete.updated_at)}</p>
                      </div>
                    </div>

                  </div>

                  {/* Bottom Grid: 2 Comment Columns */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    
                    {/* Left Column: Comentários do Cadastro */}
                    <div className="space-y-1.5">
                      <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                        COMENTÁRIOS DO CADASTRO
                      </h4>
                      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3 min-h-[70px] text-xs font-sans text-zinc-300 leading-relaxed">
                        {frete.observacoes ? (
                          frete.observacoes
                        ) : (
                          <span className="text-zinc-600 font-mono text-[11px] italic">
                            Nenhum comentário registrado no cadastro.
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Comentários Comercial / Expedição */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                        COMENTÁRIOS — COMERCIAL / EXPEDIÇÃO
                      </h4>

                      {/* Previous Visitor Comments */}
                      {frete.comentarios_visitantes && frete.comentarios_visitantes.length > 0 ? (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {frete.comentarios_visitantes.map((c, i) => (
                            <div key={c.id || i} className="bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-2.5 text-xs font-sans">
                              <p className="text-zinc-200 font-mono text-xs">{c.texto}</p>
                              <p className="text-[9px] font-mono text-[#FFD600] mt-1">
                                {c.autorRole} — {c.autorNome} • {formatDateTimeBR(c.criadoEm)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {/* Comment Input Box or Locked State after delivery */}
                      {((frete.status || '').toLowerCase() === 'entregue' || (prazoSit?.label || '').toLowerCase().includes('entregue')) ? (
                        <div className="bg-zinc-900/80 border border-amber-900/50 rounded-xl p-3 flex items-center justify-between gap-2 text-xs font-mono text-zinc-400 shadow-inner">
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                            <span className="text-zinc-300 font-bold">Comentários bloqueados após entrega</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-950 text-emerald-400 border border-emerald-800">
                            ENTREGUE
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <textarea
                            value={draftText}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDraftComments(prev => ({ ...prev, [frete.id]: val }));
                            }}
                            placeholder="Escreva uma observação sobre esse frete..."
                            maxLength={500}
                            disabled={isSubmitting}
                            rows={2}
                            className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 text-xs font-sans text-zinc-200 placeholder-zinc-600 focus:border-[#FFD600] focus:ring-0 focus:outline-none resize-none transition-colors"
                          />

                          {/* Error Toast if submit failed */}
                          {toastError && (
                            <div className="text-[10px] font-mono text-red-400 bg-red-950/50 p-2 rounded-lg border border-red-900/60">
                              {toastError}
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-mono text-zinc-600">
                              {draftText.length}/500 caracteres
                            </span>

                            <button
                              type="button"
                              onClick={() => handleRegistrarComentario(frete.id)}
                              disabled={isSubmitting || !draftText.trim()}
                              className={`px-4 py-1.5 rounded-lg text-xs font-mono font-black uppercase tracking-wider transition-all cursor-pointer border ${
                                draftText.trim() && !isSubmitting
                                  ? 'bg-amber-950 border-amber-500 text-[#FFD600] hover:bg-amber-900 shadow-[0_0_10px_rgba(255,214,0,0.2)]'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed'
                              }`}
                            >
                              {isSubmitting ? (
                                <span className="inline-flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin text-[#FFD600]" />
                                  Enviando...
                                </span>
                              ) : (
                                'REGISTRAR'
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PAGINAÇÃO DO PAINEL COMERCIAL (20 VISUALIZAÇÕES POR VEZ PARA PROTEGER COTA) */}
        {filteredFretes.length > ITEMS_PER_PAGE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-950 border border-zinc-900 rounded-2xl p-4 mt-6 text-xs font-mono">
            <div className="text-zinc-400">
              Exibindo <strong className="text-white">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> a <strong className="text-white">{Math.min(currentPage * ITEMS_PER_PAGE, filteredFretes.length)}</strong> de <strong className="text-[#FFD600]">{filteredFretes.length}</strong> fretes (20 por vez)
            </div>
            
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-3.5 py-2 bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] disabled:opacity-40 text-zinc-200 font-bold rounded-xl transition-all disabled:cursor-not-allowed cursor-pointer"
              >
                Anterior
              </button>

              <span className="px-3 py-2 bg-zinc-900 text-[#FFD600] font-black rounded-xl border border-zinc-800">
                Pág {currentPage} de {totalPages}
              </span>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-3.5 py-2 bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] disabled:opacity-40 text-zinc-200 font-bold rounded-xl transition-all disabled:cursor-not-allowed cursor-pointer"
              >
                Próxima
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default PainelFretesVisitantes;
